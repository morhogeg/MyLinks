import { Link } from '@/lib/types';

/**
 * Machina search — rebuilt from the ground up (2026-07-17), deliberately simple.
 *
 * One rule: a card matches when EVERY word of the query appears (as a
 * substring) in its TITLE, TAGS, or SUMMARY, after normalization. No vector search,
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
 * Ranking is two tiers: cards whose title/tags contain every query word rank
 * above cards that needed the summary; recency breaks ties (see useFeedFilters).
 * Tags rank with the title because they're curated labels — a user searching
 * a tag word typed exactly the thing they put on the card.
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

/** Words that never DECIDE a match: question openers, function words, quality
 *  adjectives and generic descriptors ("tips", "guide", "ideas"). "Latching
 *  tips" is a lookup for "latching"; "Best breastfeeding positions" for
 *  "breastfeeding positions". Under AND matching these words were exactly what
 *  turned real cards into "No matches" (owner, 2026-09-19, three times in one
 *  day), because no card says "tips" or "best". They are dropped WHEREVER they
 *  sit in the query, never only at the front; a query made only of such words
 *  keeps them (it is a lookup for those words). Mirrors `_TOPIC_FRAME_WORDS`
 *  in functions/search.py. */
const SEARCH_FRAMING_WORDS = [
    'what', 'whats', 'how', 'why', 'when', 'where', 'who', 'which', 'is', 'are',
    'can', 'should', 'do', 'does', 'did', 'was', 'were', 'will', 'would', 'could',
    'the', 'a', 'an', 'of', 'to', 'in', 'on', 'at', 'by', 'for', 'and', 'or',
    'i', 'me', 'my', 'you', 'your', 'it', 'its', 'this', 'that', 'there', 'any',
    'some', 'about', 'with', 'from', 'have', 'has', 'best', 'good', 'better',
    'great', 'top', 'way', 'ways', 'tips', 'tip', 'tricks', 'trick', 'hacks',
    'guide', 'guides', 'ideas', 'idea', 'advice', 'tutorial', 'examples',
    'example', 'list', 'help', 'info', 'article', 'video', 'post', 'thing',
    'things', 'stuff', 'know', 'learn', 'learned', 'saved', 'save', 'find',
    'get', 'tell', 'recommend', 'recommended', 'most', 'right', 'proper',
    'correct', 'kind', 'sort', 'type', 'one',
    'מה', 'איך', 'למה', 'מדוע', 'מתי', 'איפה', 'מי', 'איזה', 'איזו', 'האם', 'כמה',
    'הכי', 'טוב', 'טובה', 'טובים', 'דרך', 'כדאי', 'צריך', 'אפשר', 'יש', 'את', 'של',
    'על', 'עם', 'זה', 'זו', 'יודע', 'יודעת', 'למדתי', 'שמרתי', 'לי', 'שלי',
    'טיפים', 'טיפ', 'מדריך', 'רעיונות', 'רעיון', 'עצות', 'עצה', 'טריקים', 'דוגמאות',
];

/** The set is built through the SAME normalization as the query tokens, so a
 *  Hebrew entry with a final letter ("טיפים" → "טיפימ") still matches. */
const SEARCH_FRAMING = new Set(SEARCH_FRAMING_WORDS.map(normalizeSearchText));

/** Drop the framing words wherever they sit; keep the original when that
 *  would leave nothing. */
export function stripSearchFraming(tokens: string[]): string[] {
    const content = tokens.filter((t) => !SEARCH_FRAMING.has(t));
    return content.length === 0 ? tokens : content;
}

/** Split a query into normalized match tokens (Unicode-aware, so Hebrew and
 *  numbers tokenize intact), minus the framing words. Empty/whitespace queries
 *  yield []. */
export function tokenizeSearch(query: string): string[] {
    return stripSearchFraming(normalizeSearchText(query).match(/[\p{L}\p{N}]+/gu) ?? []);
}

// Per-card normalized text, built once per card object and reused across
// keystrokes. A Firestore update produces a new Link object → fresh entry.
const textCache = new WeakMap<Link, { title: string; tags: string; summary: string }>();

function getSearchText(link: Link): { title: string; tags: string; summary: string } {
    let text = textCache.get(link);
    if (!text) {
        text = {
            title: normalizeSearchText(link.title || ''),
            // Joined with a space so a token can't straddle two tags.
            tags: normalizeSearchText((link.tags || []).join(' ')),
            summary: normalizeSearchText(link.summary || ''),
        };
        textCache.set(link, text);
    }
    return text;
}

export interface SearchMatch {
    /** True when every query token hit the title or a tag — those cards rank first. */
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
    if (token.length > 4 && token.endsWith('ies')) variants.push(token.slice(0, -3) + 'y');
    // Light stemming for the common English inflections, matched as substrings
    // so the stem reaches every form on the card: "latching" → "latch" finds
    // "latch", "latches" and "latched"; "positioned" → "position" finds
    // "positioning". A doubled final consonant is folded too ("running" →
    // "run"). Only for words long enough that the stem still means something.
    if (token.length > 5 && token.endsWith('ing')) {
        const stem = token.slice(0, -3);
        variants.push(stem);
        if (stem.length > 3 && stem[stem.length - 1] === stem[stem.length - 2]) variants.push(stem.slice(0, -1));
    } else if (token.length > 4 && token.endsWith('ed')) {
        const stem = token.slice(0, -2);
        variants.push(stem);
        if (stem.length > 3 && stem[stem.length - 1] === stem[stem.length - 2]) variants.push(stem.slice(0, -1));
    }
    return variants;
}

const containsAny = (field: string, variants: string[]) =>
    variants.some((v) => field.includes(v));

/**
 * Match one card against pre-tokenized query words.
 * Returns null when any token appears in none of title/tags/summary
 * (AND semantics), otherwise whether title+tags alone covered every token.
 */
export function matchCard(link: Link, tokens: string[]): SearchMatch | null {
    if (tokens.length === 0) return null;
    const { title, tags, summary } = getSearchText(link);
    let titleHit = true;
    for (const token of tokens) {
        const variants = tokenVariants(token);
        if (containsAny(title, variants) || containsAny(tags, variants)) continue;
        titleHit = false;
        if (!containsAny(summary, variants)) return null;
    }
    return { titleHit };
}


/**
 * Partial match: how many of the query's words hit the card's TITLE or TAGS
 * (the curated fields, never the summary). Used only when the strict AND
 * match finds nothing, so a two-word query where one word is missing from
 * the library ("breastfeeding cradle") still surfaces the cards about the
 * word it does have, ranked by how many words they cover, instead of a dead
 * end. 0 when no word hits.
 */
export function partialMatchCount(link: Link, tokens: string[]): number {
    if (tokens.length < 2) return 0;
    const { title, tags } = getSearchText(link);
    let n = 0;
    for (const token of tokens) {
        const variants = tokenVariants(token);
        if (containsAny(title, variants) || containsAny(tags, variants)) n++;
    }
    return n;
}
