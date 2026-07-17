import { Link } from '@/lib/types';

/**
 * Machina search — rebuilt from the ground up (2026-07-17), deliberately simple.
 *
 * One rule: a card matches when EVERY word of the query appears (as a
 * substring) in its TITLE or SUMMARY, after normalization. No vector search,
 * no server round-trip, no score fusion, no thresholds to tune — matching is
 * literal and predictable, and it runs locally on every keystroke.
 *
 * Normalization keeps Hebrew content findable: lowercase, NFKC, niqqud/
 * cantillation stripped ("שָׁלוֹם" matches "שלום"), final letters folded
 * (a word ending in ם matches its מ form).
 *
 * Ranking is two tiers: cards whose title contains every query word rank
 * above cards that needed the summary; recency breaks ties (see useFeedFilters).
 */

/** Lowercase + strip Hebrew niqqud/cantillation + fold final letters. */
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
        if (title.includes(token)) continue;
        titleHit = false;
        if (!summary.includes(token)) return null;
    }
    return { titleHit };
}
