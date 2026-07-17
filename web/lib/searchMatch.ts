import { Link } from '@/lib/types';

/**
 * Machina search — rebuilt from the ground up (2026-07-17), deliberately simple.
 *
 * One rule: a card matches when EVERY word of the query appears (as a
 * substring) in its TITLE or SUMMARY, after normalization. No vector search,
 * no server round-trip, no score fusion, no thresholds to tune — matching is
 * literal and predictable, and it runs locally on every keystroke.
 *
 * Normalization folds away everything a person shouldn't have to type
 * exactly: case, combining marks ("café" matches "cafe", "שָׁלוֹם" matches
 * "שלום"), apostrophes and Hebrew geresh/gershayim ("ציפס" matches "צ׳יפס",
 * "dont" matches "don't"), and Hebrew final letters (a word ending in ם
 * matches its מ form). English query words also tolerate plural/singular
 * ("muffins" finds "muffin"). Deliberately NO typo/fuzzy matching — a result
 * must always be explainable by the literal words on the card.
 *
 * Ranking is two tiers: cards whose title contains every query word rank
 * above cards that needed the summary; recency breaks ties (see useFeedFilters).
 */

/** Apostrophe-like marks folded out entirely, so quoted/elided forms match
 *  their bare spelling: ASCII '/’‘, Hebrew geresh ׳ gershayim ״, and the
 *  double-quote forms sometimes used in Hebrew acronyms. */
const APOSTROPHES = /['’‘׳״"]/g;

/** Lowercase + strip combining marks (accents, niqqud, cantillation) +
 *  fold apostrophes and Hebrew final letters. */
export function normalizeSearchText(s: string): string {
    return s
        .toLowerCase()
        // NFKD splits accented letters and pointed Hebrew into base + combining
        // marks; stripping \p{M} then covers é→e and ָ ׁ →∅ in one rule.
        .normalize('NFKD')
        .replace(/\p{M}+/gu, '')
        .replace(APOSTROPHES, '')
        .replace(/ך/g, 'כ')
        .replace(/ם/g, 'מ')
        .replace(/ן/g, 'נ')
        .replace(/ף/g, 'פ')
        .replace(/ץ/g, 'צ');
}

/** Split a query into normalized match tokens (Unicode-aware, so Hebrew and
 *  numbers tokenize intact). Empty/whitespace queries yield []. */
export function tokenizeSearch(query: string): string[] {
    return normalizeSearchText(query).match(/[\p{L}\p{N}]+/gu) ?? [];
}

// Per-card normalized text, built once per card object and reused across
// keystrokes. A Firestore update produces a new Link object → fresh entry.
const textCache = new WeakMap<Link, { title: string; summary: string }>();

function getSearchText(link: Link): { title: string; summary: string } {
    let text = textCache.get(link);
    if (!text) {
        text = {
            title: normalizeSearchText(link.title || ''),
            summary: normalizeSearchText(link.summary || ''),
        };
        textCache.set(link, text);
    }
    return text;
}

export interface SearchMatch {
    /** True when every query token hit the title — those cards rank first. */
    titleHit: boolean;
}

/** The forms a query word may match under: itself, plus (for Latin words) its
 *  English singular — so "muffins" still finds a card that says "muffin".
 *  The reverse direction ("muffin" → "muffins") is already substring-covered.
 *  Never applied to Hebrew: a final ס is part of the word, not a plural s. */
function tokenVariants(token: string): string[] {
    if (!/^[a-z0-9]+$/.test(token)) return [token];
    const variants = [token];
    if (token.length > 4 && token.endsWith('es')) variants.push(token.slice(0, -2));
    if (token.length > 3 && token.endsWith('s')) variants.push(token.slice(0, -1));
    return variants;
}

const containsAny = (field: string, variants: string[]) =>
    variants.some((v) => field.includes(v));

/**
 * Match one card against pre-tokenized query words.
 * Returns null when any token appears in neither the title nor the summary
 * (AND semantics), otherwise whether the title alone covered every token.
 */
export function matchCard(link: Link, tokens: string[]): SearchMatch | null {
    if (tokens.length === 0) return null;
    const { title, summary } = getSearchText(link);
    let titleHit = true;
    for (const token of tokens) {
        const variants = tokenVariants(token);
        if (containsAny(title, variants)) continue;
        titleHit = false;
        if (!containsAny(summary, variants)) return null;
    }
    return { titleHit };
}
