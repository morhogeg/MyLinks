import { Link } from '@/lib/types';

/**
 * Concept clustering behind the Connections surface (M10). `allClusters` groups
 * recent saves by the abstract `concepts` already computed on each card (no new
 * compute); `crossCategoryClusters` keeps only the threads that bridge 2+
 * categories — the connections a category filter can't reproduce, which is what
 * the Connections view/pill shows. Only *recent* saves count, so a connection
 * feels fresh.
 */

// Only consider recent saves — a connection is interesting when it's fresh.
const RECENT_WINDOW_DAYS = 30;
// Fallback when the 30-day window is thin (new/quiet libraries): the N newest.
const RECENT_FALLBACK_COUNT = 40;

export interface Cluster {
    concept: string;     // original-case display label
    key: string;         // lowercased key for dedupe
    links: Link[];       // members, newest first
    categories: string[]; // distinct categories the members span, most-common first
}

function toMs(value: number | string | undefined): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const n = Date.parse(value);
        return Number.isNaN(n) ? 0 : n;
    }
    return 0;
}

/** Distinct categories among a cluster's members, most-common first. */
function clusterCategories(links: Link[]): string[] {
    const counts = new Map<string, number>();
    for (const l of links) {
        const c = (l.category ?? '').trim();
        if (!c) continue;
        counts.set(c, (counts.get(c) ?? 0) + 1);
    }
    return [...counts.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .map(([c]) => c);
}

/** All concept clusters among recent saves, strongest first. `minCluster`
 *  controls how many members a cluster needs to qualify — the inline surface
 *  stays strict (3) while the opted-in view can relax (2). Pure function of its
 *  inputs so callers can memoize cleanly. */
export function allClusters(links: Link[], minCluster = 3): Cluster[] {
    if (!links.length) return [];

    const sorted = [...links].sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
    const cutoff = Date.now() - RECENT_WINDOW_DAYS * 86_400_000;
    let recent = sorted.filter((l) => toMs(l.createdAt) >= cutoff);
    if (recent.length < RECENT_FALLBACK_COUNT) {
        recent = sorted.slice(0, RECENT_FALLBACK_COUNT);
    }

    // concept key -> { label, links }. `recent` is already newest-first, so each
    // cluster's links inherit that order (links[0] is the freshest member).
    const byConcept = new Map<string, { concept: string; key: string; links: Link[] }>();
    for (const link of recent) {
        const seen = new Set<string>(); // guard against a card repeating a concept
        for (const raw of link.concepts ?? []) {
            const concept = (raw ?? '').trim();
            if (!concept) continue;
            const key = concept.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            const existing = byConcept.get(key);
            if (existing) existing.links.push(link);
            else byConcept.set(key, { concept, key, links: [link] });
        }
    }

    return [...byConcept.values()]
        .filter((c) => c.links.length >= minCluster)
        .map((c) => ({ ...c, categories: clusterCategories(c.links) }))
        .sort(
            (a, b) =>
                b.links.length - a.links.length ||
                // tie-break: prefer the cluster with the most recent activity
                toMs(b.links[0].createdAt) - toMs(a.links[0].createdAt)
        );
}

/** Clusters that bridge 2+ categories — the connections a category filter *can't*
 *  reproduce (cards in different categories sharing a hidden thread). This is the
 *  whole reason the Connections view exists as something distinct from browsing
 *  by category. Ranked by how many categories a cluster bridges, then size, then
 *  recency. */
export function crossCategoryClusters(links: Link[], minCluster = 2): Cluster[] {
    return allClusters(links, minCluster)
        .filter((c) => c.categories.length >= 2)
        .sort(
            (a, b) =>
                b.categories.length - a.categories.length ||
                b.links.length - a.links.length ||
                toMs(b.links[0].createdAt) - toMs(a.links[0].createdAt)
        );
}
