import { Link } from '@/lib/types';
import { getNotesText } from '@/lib/notes';

// Pending captures (M3): processing/failed cards are surfaced separately, pinned
// above the feed, and excluded from the normal filtered feed + every facet.
export const isPending = (l: Link) => l.status === 'processing' || l.status === 'failed';

// Consistent millisecond timestamp from a number, ISO string, or Firestore
// Timestamp. Module-scope + pure so it's a stable dependency for memoization.
// Some ingest paths (Facebook, screenshots) store unix SECONDS, not ms — scale
// sub-1e12 values, like Card's getTimeAgo and the backend's _to_ms already do.
export const getTimestampNumber = (val: unknown): number => {
    if (!val) return 0;
    if (typeof val === 'number') return val < 1e12 ? val * 1000 : val;
    if (typeof val === 'string') return new Date(val).getTime();
    if (typeof val === 'object') {
        const obj = val as { toMillis?: () => number; seconds?: number };
        if (typeof obj.toMillis === 'function') return obj.toMillis();
        if (obj.seconds) return obj.seconds * 1000;
    }
    return 0;
};

// --- Keyword search: token-based (AND) matching ----------------------------
// The home-feed keyword filter runs client-side, per keystroke, over the loaded
// feed. It matches on TOKENS, not the raw phrase, so a natural-language query like
// "A collection of articles" finds cards containing "collection" AND "article(s)"
// instead of failing because that exact string appears nowhere.

// A tiny inline English stopword list — no library, no locale data. These are
// dropped from a query so filler words don't force spurious AND-constraints.
// They're all Latin/ASCII, so non-Latin tokens (Hebrew, etc.) are never in the
// set and are always kept — i.e. we never strip meaningful short words from a
// non-Latin query.
const SEARCH_STOPWORDS = new Set([
    'a', 'an', 'the', 'of', 'in', 'on', 'for', 'to', 'my', 'i',
]);

/**
 * Split a query into lowercase match tokens: lowercase, strip punctuation, and
 * drop English stopwords. Uses Unicode letter/number classes, so Hebrew and other
 * scripts tokenize intact. If dropping stopwords would leave nothing (e.g. the
 * query is only "the of a"), we fall back to the raw tokens so the search still
 * runs. Pure + cheap; memoize the result per query (not per card).
 */
export function tokenizeQuery(query: string): string[] {
    const raw = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    if (raw.length === 0) return [];
    const kept = raw.filter((t) => !SEARCH_STOPWORDS.has(t));
    return kept.length > 0 ? kept : raw;
}

/**
 * The lowercased text blob a card is matched against for keyword search — every
 * searchable field concatenated once. Built per card inside the filter loop (plain
 * string joins); the token prep is memoized separately, per query.
 */
export function buildSearchHaystack(link: Link): string {
    return [
        link.title,
        link.summary,
        link.detailedSummary ?? '',
        link.tags.join(' '),
        (link.concepts ?? []).join(' '),
        link.category,
        link.sourceName ?? '',
        getNotesText(link),
    ].join(' ').toLowerCase();
}

/**
 * Does `token` appear in the (already-lowercased) haystack? Substring match, plus a
 * cheap plural heuristic: a trailing "s"/"es" is also stripped (keeping ≥3 chars) so
 * "articles" matches "article". No stemming library — just this heuristic.
 */
function tokenInHaystack(haystack: string, token: string): boolean {
    if (haystack.includes(token)) return true;
    // "boxes" → "box"; require ≥3 chars left so we don't match on a stub.
    if (token.length > 4 && token.endsWith('es') && haystack.includes(token.slice(0, -2))) return true;
    // "articles" → "article".
    if (token.length > 3 && token.endsWith('s') && haystack.includes(token.slice(0, -1))) return true;
    return false;
}

/**
 * True when EVERY token appears somewhere in the haystack (AND semantics). An empty
 * token list means "no keyword constraint" — callers should decide whether to run
 * the token path at all (we skip it for punctuation-only queries).
 */
export function matchesAllTokens(haystack: string, tokens: string[]): boolean {
    for (const token of tokens) {
        if (!tokenInHaystack(haystack, token)) return false;
    }
    return true;
}
