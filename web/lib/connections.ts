import { Link } from '@/lib/types';

/**
 * Concept clustering shared by the two connection surfaces (M10):
 *  - the proactive inline banner on the feed (`bestCluster`, strict ≥3), and
 *  - the opted-in Connections view (`allClusters`, relaxed to ≥2).
 *
 * Both read the abstract `concepts` already computed on each card — no new
 * compute — and only consider *recent* saves, so a connection feels fresh.
 */

// Only consider recent saves — a connection is interesting when it's fresh.
const RECENT_WINDOW_DAYS = 30;
// Fallback when the 30-day window is thin (new/quiet libraries): the N newest.
const RECENT_FALLBACK_COUNT = 40;

export interface Cluster {
    concept: string;   // original-case display label
    key: string;       // lowercased key for dedupe
    links: Link[];     // members, newest first
}

function toMs(value: number | string | undefined): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const n = Date.parse(value);
        return Number.isNaN(n) ? 0 : n;
    }
    return 0;
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
    const byConcept = new Map<string, Cluster>();
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
        .sort(
            (a, b) =>
                b.links.length - a.links.length ||
                // tie-break: prefer the cluster with the most recent activity
                toMs(b.links[0].createdAt) - toMs(a.links[0].createdAt)
        );
}

/** The single strongest cluster — the inline "brain speaks first" surface. */
export function bestCluster(links: Link[], minCluster = 3): Cluster | null {
    return allClusters(links, minCluster)[0] ?? null;
}
