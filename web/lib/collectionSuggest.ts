import { Collection, Link } from './types';

/**
 * Client-side collection intelligence (M20-lite).
 *
 * Two jobs, both computed over the already-loaded feed (no reads, no backend):
 *
 * 1. `suggestNewCollections` — cluster cards by shared tags/concepts and
 *    propose ready-made collections ("7 cards about Machine Learning"), so
 *    collections build themselves instead of relying on manual curation.
 * 2. `rankCollectionsForLink` — when filing a card, score existing collections
 *    by topical affinity with the card so the right one is one tap away.
 *
 * Everything is heuristic and cheap on purpose: token overlap over tags,
 * concepts, and category — recomputed in a useMemo, never persisted. Dismissed
 * suggestions are remembered in localStorage so declining one is respected.
 */

export interface CollectionSuggestion {
    /** Stable key for dismissal — the normalized topic term. */
    key: string;
    /** Display name for the would-be collection (title-cased topic). */
    name: string;
    /** Ids of the cards that would seed it. */
    linkIds: string[];
    /** Up to 4 member thumbnails for the preview tile. */
    thumbnails: string[];
}

const DISMISSED_KEY = 'collection-suggestions-dismissed-v1';
/** A topic needs at least this many cards before it's worth proposing. */
const MIN_CLUSTER_SIZE = 4;
const MAX_SUGGESTIONS = 3;

function normalize(term: string): string {
    return term.trim().toLowerCase();
}

/** "machine learning" → "Machine Learning". */
function titleCase(term: string): string {
    return term.replace(/\p{L}[\p{L}\p{M}'’-]*/gu, (w) => w.charAt(0).toUpperCase() + w.slice(1));
}

/** The card's topical vocabulary: tags + concepts (+ category), normalized. */
function linkTerms(link: Link): Set<string> {
    const terms = new Set<string>();
    for (const t of link.tags ?? []) terms.add(normalize(t));
    for (const c of link.concepts ?? []) terms.add(normalize(c));
    if (link.category) terms.add(normalize(link.category));
    terms.delete('');
    return terms;
}

export function getDismissedSuggestions(): Set<string> {
    try {
        const raw = localStorage.getItem(DISMISSED_KEY);
        if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch { /* unavailable / corrupt — treat as none dismissed */ }
    return new Set();
}

export function dismissSuggestion(key: string): void {
    try {
        const next = getDismissedSuggestions();
        next.add(key);
        localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
    } catch { /* localStorage unavailable — dismissal just won't persist */ }
}

/**
 * Propose up to 3 new collections from tag/concept clusters in the feed.
 *
 * A topic qualifies when ≥4 ready cards share it, it doesn't collide with an
 * existing collection's name, most of its cards aren't already organized into
 * one collection together, and the user hasn't dismissed it. Overlapping
 * topics are deduped (largest cluster wins) so we never propose "AI" and
 * "Artificial Intelligence" side by side with the same cards.
 */
export function suggestNewCollections(
    links: Link[],
    collections: Collection[],
    dismissed: Set<string> = getDismissedSuggestions()
): CollectionSuggestion[] {
    // Only ready cards — processing/failed cards have no analysis to cluster on.
    const ready = links.filter((l) => l.status !== 'processing' && l.status !== 'failed');
    if (ready.length < MIN_CLUSTER_SIZE) return [];

    const existingNames = new Set(collections.map((c) => normalize(c.name)));

    // term → member cards.
    const clusters = new Map<string, Link[]>();
    for (const link of ready) {
        for (const term of linkTerms(link)) {
            // Single-character or purely numeric "topics" make bad collections.
            if (term.length < 2 || /^\d+$/.test(term)) continue;
            const bucket = clusters.get(term);
            if (bucket) bucket.push(link);
            else clusters.set(term, [link]);
        }
    }

    const candidates = [...clusters.entries()]
        .filter(([term, members]) => {
            if (members.length < MIN_CLUSTER_SIZE) return false;
            if (dismissed.has(term)) return false;
            if (existingNames.has(term)) return false;
            // Skip topics whose cards mostly already live together in one
            // collection — the user has organized this theme their own way.
            const counts = new Map<string, number>();
            for (const m of members) {
                for (const cid of m.collectionIds ?? []) {
                    counts.set(cid, (counts.get(cid) ?? 0) + 1);
                }
            }
            const maxShared = Math.max(0, ...counts.values());
            return maxShared < members.length * 0.6;
        })
        .sort((a, b) => b[1].length - a[1].length);

    // Dedupe near-identical clusters: a candidate that shares most of its cards
    // with an already-picked (larger) one is the same theme under another name.
    const picked: CollectionSuggestion[] = [];
    const pickedSets: Set<string>[] = [];
    for (const [term, members] of candidates) {
        if (picked.length >= MAX_SUGGESTIONS) break;
        const ids = members.map((m) => m.id);
        const idSet = new Set(ids);
        const overlaps = pickedSets.some((prev) => {
            let shared = 0;
            for (const id of idSet) if (prev.has(id)) shared++;
            return shared >= idSet.size * 0.6;
        });
        if (overlaps) continue;
        picked.push({
            key: term,
            name: titleCase(term),
            linkIds: ids,
            thumbnails: members
                .map((m) => m.metadata?.thumbnailUrl)
                .filter((t): t is string => !!t)
                .slice(0, 4),
        });
        pickedSets.push(idSet);
    }
    return picked;
}

/**
 * Score existing collections by affinity with a card (shared tags/concepts/
 * category with the collection's members). Returns the best non-member matches,
 * strongest first — used to surface "Suggested" targets when filing a card.
 */
export function rankCollectionsForLink(
    link: Link,
    collections: Collection[],
    links: Link[],
    limit = 2
): Collection[] {
    const cardTerms = linkTerms(link);
    if (cardTerms.size === 0 || collections.length === 0) return [];
    const memberOf = new Set(link.collectionIds ?? []);

    // Aggregate each collection's vocabulary from its members once.
    const vocab = new Map<string, Map<string, number>>();
    for (const l of links) {
        if (l.id === link.id) continue;
        const cids = l.collectionIds;
        if (!cids || cids.length === 0) continue;
        const terms = linkTerms(l);
        for (const cid of cids) {
            let counts = vocab.get(cid);
            if (!counts) vocab.set(cid, (counts = new Map()));
            for (const t of terms) counts.set(t, (counts.get(t) ?? 0) + 1);
        }
    }

    return collections
        .filter((c) => !memberOf.has(c.id))
        .map((c) => {
            const counts = vocab.get(c.id);
            let score = 0;
            if (counts) {
                for (const t of cardTerms) score += counts.get(t) ?? 0;
            }
            // The collection's own name matching a card term is a strong signal
            // even for small/empty collections.
            if (cardTerms.has(normalize(c.name))) score += 3;
            return { c, score };
        })
        .filter(({ score }) => score >= 2)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(({ c }) => c);
}
