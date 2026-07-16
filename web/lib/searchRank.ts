import { Link } from '@/lib/types';
import { getNotesText } from '@/lib/notes';
import { getTimestampNumber } from '@/lib/feedUtils';

/**
 * Client-side search ranking (the instant half of hybrid search).
 *
 * Replaces the old binary keyword filter (match/no-match, then date order) with
 * a scored, field-weighted ranking that runs on EVERY keystroke — no debounce —
 * over the loaded feed. The server's hybrid results (vector + lexical scan,
 * already quality-gated and reranked server-side) arrive ~400ms later and are
 * FUSED with the local ranking via reciprocal-rank fusion, so a card that both
 * halves agree on rises to the top and neither half can bury the other's clear
 * hit.
 *
 * Everything here is pure and allocation-light: tokenization is Unicode-aware
 * (Hebrew tokenizes intact), matching normalizes niqqud + final letters and
 * tolerates English plurals and Hebrew prefix particles (ו/ה/ב/ל/מ/ש/כ), and a
 * card must still contain EVERY query token (AND semantics — precision first).
 */

// Filler words dropped from queries so they don't force spurious AND-constraints.
// All Latin/ASCII — non-Latin tokens are never stripped.
const STOPWORDS = new Set([
    'a', 'an', 'the', 'of', 'in', 'on', 'for', 'to', 'my', 'i', 'that', 'about',
]);

/** Lowercase + strip Hebrew niqqud/cantillation + fold final letters, so
 *  "שָׁלוֹם" matches "שלום" and a word ending in ם matches its מ form. */
export function normalizeSearchText(s: string): string {
    return s
        .toLowerCase()
        .normalize('NFKC')
        .replace(/[֑-ׇ]/g, '') // niqqud + te'amim
        .replace(/ך/g, 'כ')
        .replace(/ם/g, 'מ')
        .replace(/ן/g, 'נ')
        .replace(/ף/g, 'פ')
        .replace(/ץ/g, 'צ');
}

/** Split a query into normalized match tokens. Falls back to the raw tokens if
 *  stopword-stripping would leave nothing (query was all filler). */
export function tokenizeSearch(query: string): string[] {
    const raw = normalizeSearchText(query).match(/[\p{L}\p{N}]+/gu) ?? [];
    if (raw.length === 0) return [];
    const kept = raw.filter((t) => !STOPWORDS.has(t));
    return kept.length > 0 ? kept : raw;
}

/** Hebrew single-letter prefix particles (and ,the ,in ,to ,from ,that ,as). */
const HEBREW_PREFIXES = /^[והבלמשכ]/;

/** All the forms a query token may match under: itself, its English singular,
 *  and (for Hebrew) itself minus a leading prefix particle — so "והמתכון"
 *  still finds a card that says "מתכון". */
function tokenVariants(token: string): string[] {
    const variants = [token];
    if (token.length > 4 && token.endsWith('es')) variants.push(token.slice(0, -2));
    if (token.length > 3 && token.endsWith('s')) variants.push(token.slice(0, -1));
    if (token.length > 2 && HEBREW_PREFIXES.test(token)) {
        variants.push(token.slice(1));
        // Double particle ("ו" + "ה"): strip one more.
        if (token.length > 3 && HEBREW_PREFIXES.test(token.slice(1))) {
            variants.push(token.slice(2));
        }
    }
    return variants;
}

/** The normalized, per-field searchable text of a card — built once per card
 *  per query pass, matched many times (once per token). */
export interface CardSearchFields {
    title: string;
    tags: string;
    source: string;
    category: string;
    concepts: string;
    summary: string;
    notes: string;
    detailed: string;
}

// Per-card field cache: scoring runs on every keystroke, but a card's text only
// changes when its Firestore doc does (new snapshot → new object → fresh entry).
const fieldsCache = new WeakMap<Link, CardSearchFields>();

export function getCardFields(link: Link): CardSearchFields {
    let fields = fieldsCache.get(link);
    if (!fields) {
        fields = buildCardFields(link);
        fieldsCache.set(link, fields);
    }
    return fields;
}

export function buildCardFields(link: Link): CardSearchFields {
    return {
        title: normalizeSearchText(link.title || ''),
        tags: normalizeSearchText(link.tags.join(' ')),
        source: normalizeSearchText(link.sourceName ?? ''),
        category: normalizeSearchText(link.category || ''),
        concepts: normalizeSearchText((link.concepts ?? []).join(' ')),
        summary: normalizeSearchText(link.summary || ''),
        notes: normalizeSearchText(getNotesText(link)),
        detailed: normalizeSearchText(link.detailedSummary ?? ''),
    };
}

// Field weights: where a token hits determines how much it counts. A title hit
// dominates; body-text hits still match but rank lower. Tuned so N title hits
// always beat N summary hits regardless of card length (scores are per-token
// maxima, not term frequencies — a long detailedSummary can't spam its way up).
const FIELD_WEIGHTS: [keyof CardSearchFields, number][] = [
    ['title', 5],
    ['tags', 3.5],
    ['source', 3],
    ['category', 3],
    ['concepts', 2.5],
    ['summary', 2],
    ['notes', 2],
    ['detailed', 1],
];

// A token that starts a word (vs. buried mid-word) is a stronger signal:
// query "cross" → "CrossFit workout" over "across the alps".
function hitsWordStart(field: string, variant: string): boolean {
    return field.startsWith(variant) || field.includes(' ' + variant);
}

/**
 * Relevance score of one card for pre-tokenized `tokens` (+ the normalized
 * whole query for the phrase bonus). 0 = no match (some token appears nowhere).
 *
 * Per token: the highest field weight it hits (+1 word-start bonus in that
 * field). Whole-query phrase inside the title adds a decisive bonus, so typing
 * an exact title puts that card first, ahead of any accumulation of partial hits.
 */
export function scoreCard(fields: CardSearchFields, tokens: string[], phrase: string): number {
    if (tokens.length === 0) return 0;
    let score = 0;
    for (const token of tokens) {
        const variants = tokenVariants(token);
        let best = 0;
        for (const [key, weight] of FIELD_WEIGHTS) {
            const field = fields[key];
            if (!field) continue;
            for (const v of variants) {
                if (field.includes(v)) {
                    const bonus = hitsWordStart(field, v) ? 1 : 0;
                    if (weight + bonus > best) best = weight + bonus;
                    break; // this field matched; heavier fields were already tried
                }
            }
            if (best >= weight + 1) break; // can't do better than the top remaining weight
        }
        if (best === 0) return 0; // AND semantics: every token must land somewhere
        score += best;
    }
    if (tokens.length > 1 && phrase && fields.title.includes(phrase)) score += 8;
    return score;
}

/**
 * Reciprocal-rank fusion of the LOCAL keyword ranking and the SERVER hybrid
 * ranking. Standard RRF: each list contributes 1/(K + rank); a card on both
 * lists sums both terms and naturally rises above single-list hits. K is small
 * because both lists are short (≤ a few dozen) and already high-precision.
 *
 * Returns a Map id → fused score; ids missing from both maps score 0.
 */
const RRF_K = 8;

export function fuseRankings(localRank: Map<string, number>, serverRank: Map<string, number>): Map<string, number> {
    const fused = new Map<string, number>();
    localRank.forEach((rank, id) => {
        fused.set(id, (fused.get(id) ?? 0) + 1 / (RRF_K + rank));
    });
    serverRank.forEach((rank, id) => {
        fused.set(id, (fused.get(id) ?? 0) + 1 / (RRF_K + rank));
    });
    return fused;
}

/** Rank positions (0-based) from a list of [id, score], best score first.
 *  Ties keep the given order (stable). */
export function ranksFromScores(scored: [string, number][]): Map<string, number> {
    const sorted = [...scored].sort((a, b) => b[1] - a[1]);
    const ranks = new Map<string, number>();
    sorted.forEach(([id], i) => ranks.set(id, i));
    return ranks;
}

/** Recency in unix-ms for the relevance tiebreak. */
export function recencyOf(link: Link): number {
    return getTimestampNumber(link.createdAt);
}
