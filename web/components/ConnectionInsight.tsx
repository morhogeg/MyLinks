'use client';

import { useMemo, useState } from 'react';
import { Link2, ChevronDown, X, ArrowRight } from 'lucide-react';
import { Link } from '@/lib/types';
import { hapticLight, hapticMedium } from '@/lib/haptics';

/**
 * Proactive connections on the home feed (M10) — the brain speaking first.
 *
 * Clusters the user's recent saves by the abstract `concepts` already computed
 * on each card (functions/ai_service) and surfaces ONE genuine connection at a
 * time: "3 things you saved connect to Network Effects." Tap expands into the
 * cluster; each member links back to its card. Dismissible.
 *
 * Deliberately lightweight and rate-limited so it never feels spammy:
 *  - only clusters of ≥ MIN_CLUSTER recent saves qualify (a real pattern, not noise)
 *  - only the single strongest cluster is shown, never a wall of them
 *  - dismissing remembers the concept (so it won't nag) and quiets the module
 *    for the rest of the session
 *
 * No new compute — it reads `link.concepts` the feed already holds in memory.
 */

// Only consider recent saves — a connection is interesting when it's fresh.
const RECENT_WINDOW_DAYS = 30;
// Fallback when the 30-day window is thin (new/quiet libraries): the N newest.
const RECENT_FALLBACK_COUNT = 40;
// A cluster must gather at least this many cards to be worth surfacing.
const MIN_CLUSTER = 3;

const DISMISSED_KEY = 'connection-insight-dismissed';

function toMs(value: number | string | undefined): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
        const n = Date.parse(value);
        return Number.isNaN(n) ? 0 : n;
    }
    return 0;
}

interface Cluster {
    concept: string;   // original-case display label
    key: string;       // lowercased key for dedupe/dismissal
    links: Link[];
}

/** Find the strongest concept cluster among recent saves, excluding dismissed
 *  concepts. Pure function of its inputs so it memoizes cleanly. */
function bestCluster(links: Link[], dismissed: Set<string>): Cluster | null {
    if (!links.length) return null;

    const sorted = [...links].sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
    const cutoff = Date.now() - RECENT_WINDOW_DAYS * 86_400_000;
    let recent = sorted.filter((l) => toMs(l.createdAt) >= cutoff);
    if (recent.length < RECENT_FALLBACK_COUNT) {
        recent = sorted.slice(0, RECENT_FALLBACK_COUNT);
    }

    // concept key -> { label, links }
    const byConcept = new Map<string, Cluster>();
    for (const link of recent) {
        const seen = new Set<string>(); // guard against a card repeating a concept
        for (const raw of link.concepts ?? []) {
            const concept = (raw ?? '').trim();
            if (!concept) continue;
            const key = concept.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            if (dismissed.has(key)) continue;
            const existing = byConcept.get(key);
            if (existing) existing.links.push(link);
            else byConcept.set(key, { concept, key, links: [link] });
        }
    }

    let best: Cluster | null = null;
    for (const cluster of byConcept.values()) {
        if (cluster.links.length < MIN_CLUSTER) continue;
        if (
            !best ||
            cluster.links.length > best.links.length ||
            // tie-break: prefer the cluster with the most recent activity
            (cluster.links.length === best.links.length &&
                toMs(cluster.links[0].createdAt) > toMs(best.links[0].createdAt))
        ) {
            best = cluster;
        }
    }
    return best;
}

export default function ConnectionInsight({
    links,
    onOpenCard,
}: {
    links: Link[];
    onOpenCard: (id: string) => void;
}) {
    // Seed dismissed concepts from localStorage lazily (client-only, runs once).
    const [dismissed, setDismissed] = useState<Set<string>>(() => {
        try {
            if (typeof window !== 'undefined') {
                const saved = localStorage.getItem(DISMISSED_KEY);
                if (saved) return new Set(JSON.parse(saved) as string[]);
            }
        } catch {
            // ignore malformed storage
        }
        return new Set();
    });
    const [suppressed, setSuppressed] = useState(false);
    const [expanded, setExpanded] = useState(false);

    const cluster = useMemo(() => bestCluster(links, dismissed), [links, dismissed]);

    if (suppressed || !cluster) return null;

    const count = cluster.links.length;

    const toggle = () => {
        hapticLight();
        setExpanded((v) => !v);
    };

    const handleDismiss = (e: React.MouseEvent) => {
        e.stopPropagation();
        hapticMedium();
        const next = new Set(dismissed);
        next.add(cluster.key);
        setDismissed(next);
        setSuppressed(true); // don't immediately pop another — stay calm
        try {
            localStorage.setItem(DISMISSED_KEY, JSON.stringify([...next]));
        } catch {
            // ignore storage failures — dismissal still holds for the session
        }
    };

    const openCard = (id: string) => {
        hapticLight();
        onOpenCard(id);
    };

    return (
        <div className="mb-4 rounded-2xl border border-border bg-card overflow-hidden animate-in fade-in slide-in-from-top-1 duration-300">
            <button
                onClick={toggle}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left min-h-[44px] hover:bg-card-hover transition-colors"
                aria-expanded={expanded}
            >
                <div className="w-9 h-9 shrink-0 rounded-xl bg-accent/15 flex items-center justify-center">
                    <Link2 className="w-[18px] h-[18px] text-accent" />
                </div>
                <div className="flex-grow min-w-0 text-[15px] text-text">
                    <span className="font-bold">{count} things</span> you saved connect to{' '}
                    <span className="font-bold text-accent">{cluster.concept}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        onClick={handleDismiss}
                        aria-label="Dismiss connection"
                        className="w-9 h-9 flex items-center justify-center rounded-lg text-text-muted hover:text-text hover:bg-card-hover transition-colors"
                    >
                        <X className="w-4 h-4" />
                    </button>
                    <ChevronDown
                        className={`w-5 h-5 text-text-secondary transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
                        style={{ transitionTimingFunction: 'var(--ease-modal)' }}
                    />
                </div>
            </button>

            {expanded && (
                <div
                    className="px-4 pb-3 pt-1 border-t border-border flex flex-col gap-1"
                    style={{ animation: 'slide-up 0.3s var(--ease-modal)' }}
                >
                    {cluster.links.map((link) => (
                        <button
                            key={link.id}
                            onClick={() => openCard(link.id)}
                            className="group flex items-center gap-1.5 text-left text-sm text-accent hover:underline min-h-[36px]"
                        >
                            <ArrowRight className="w-3.5 h-3.5 shrink-0 opacity-70 group-hover:translate-x-0.5 transition-transform" />
                            <span className="truncate">{link.title}</span>
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
