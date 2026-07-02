'use client';

import { useMemo, useState } from 'react';
import { Link } from '@/lib/types';
import { getCategoryColorStyle } from '@/lib/colors';
import { hapticLight } from '@/lib/haptics';
import { Sparkles, X, ChevronRight, ArrowRight } from 'lucide-react';

/**
 * M10 — Proactive connections on the home feed.
 *
 * The brain speaks first: instead of waiting to be asked, the feed occasionally
 * surfaces ONE genuine connection between recent saves — e.g. "3 things you
 * saved connect to Network Effects." Tapping expands the cluster so the user can
 * jump straight into any of the connected cards.
 *
 * This reuses data already computed on save (`link.concepts`, produced by
 * ai_service + graph_service) — there is NO new compute here, just a small,
 * pure client-side clustering pass over the cards already loaded in the feed.
 *
 * Kept deliberately un-spammy:
 *  - only shows a cluster of ≥ MIN_CLUSTER recent saves sharing one concept,
 *  - shows exactly one insight at a time (the strongest, most-recent cluster),
 *  - is dismissible, and a dismissed concept never comes back (persisted).
 */

// A concept must connect at least this many recent saves to be worth surfacing.
const MIN_CLUSTER = 3;
// Consider only the most recent saves so the insight is about what the user is
// *currently* thinking about — and to bound the (already tiny) compute.
const RECENT_WINDOW = 40;
// localStorage key holding the set of concept keys the user has dismissed.
const DISMISS_KEY = 'machina.connections.dismissed';

interface Cluster {
    key: string;        // lowercased concept, used for dedupe + dismissal
    concept: string;    // display form (the AI already Title-Cases these)
    links: Link[];      // member cards, most-recent first
    recency: number;    // createdAt (ms) of the most recent member
}

function toMs(value: number | string | undefined): number {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? 0 : t;
}

function loadDismissed(): Set<string> {
    if (typeof window === 'undefined') return new Set();
    try {
        const raw = window.localStorage.getItem(DISMISS_KEY);
        return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
        return new Set();
    }
}

interface ConnectionInsightProps {
    links: Link[];
    onOpenLink: (id: string) => void;
}

export default function ConnectionInsight({ links, onOpenLink }: ConnectionInsightProps) {
    const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);
    const [expanded, setExpanded] = useState(false);

    // Pick the single strongest connection to surface. Pure, memoized derivation
    // over the cards already in memory — no reads, no backend cost.
    const cluster = useMemo<Cluster | null>(() => {
        const recent = [...links]
            .filter((l) => Array.isArray(l.concepts) && l.concepts.length > 0)
            .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt))
            .slice(0, RECENT_WINDOW);

        // Group the recent saves by each concept they carry.
        const byConcept = new Map<string, Cluster>();
        for (const link of recent) {
            const seenInLink = new Set<string>();
            for (const raw of link.concepts ?? []) {
                const concept = (raw ?? '').trim();
                const key = concept.toLowerCase();
                if (!key || seenInLink.has(key)) continue;
                seenInLink.add(key);
                const existing = byConcept.get(key);
                if (existing) {
                    existing.links.push(link);
                    existing.recency = Math.max(existing.recency, toMs(link.createdAt));
                } else {
                    byConcept.set(key, { key, concept, links: [link], recency: toMs(link.createdAt) });
                }
            }
        }

        const candidates = Array.from(byConcept.values())
            .filter((c) => c.links.length >= MIN_CLUSTER && !dismissed.has(c.key))
            // Strongest first (most connections), then the freshest.
            .sort((a, b) => (b.links.length - a.links.length) || (b.recency - a.recency));

        return candidates[0] ?? null;
    }, [links, dismissed]);

    if (!cluster) return null;

    const handleToggle = () => {
        hapticLight();
        setExpanded((v) => !v);
    };

    const handleDismiss = (e: React.MouseEvent) => {
        e.stopPropagation();
        hapticLight();
        const next = new Set(dismissed);
        next.add(cluster.key);
        setDismissed(next);
        setExpanded(false);
        try {
            window.localStorage.setItem(DISMISS_KEY, JSON.stringify(Array.from(next)));
        } catch {
            /* dismissal persistence is best-effort */
        }
    };

    const handleOpen = (id: string) => {
        hapticLight();
        onOpenLink(id);
    };

    const count = cluster.links.length;

    return (
        <div className="mb-4 rounded-2xl border border-accent/20 bg-[linear-gradient(135deg,rgba(167,139,250,0.10),rgba(236,72,153,0.06))] surface-card shadow-[var(--shadow-card)] overflow-hidden animate-fade-in">
            {/* Header — the one-line insight; the whole row toggles the cluster. */}
            <button
                type="button"
                onClick={handleToggle}
                aria-expanded={expanded}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left cursor-pointer group"
            >
                <span className="shrink-0 flex items-center justify-center w-9 h-9 rounded-full bg-[image:var(--accent-gradient)] shadow-lg shadow-accent/20">
                    <Sparkles className="w-[18px] h-[18px] text-white" />
                </span>
                <span className="min-w-0 flex-1">
                    <span className="block text-[11px] font-bold uppercase tracking-wider text-accent/80">
                        Connection
                    </span>
                    <span className="block text-[15px] font-semibold text-text leading-snug truncate">
                        {count} things you saved connect to{' '}
                        <span className="text-accent">{cluster.concept}</span>
                    </span>
                </span>
                <ChevronRight
                    className={`shrink-0 w-5 h-5 text-text-muted transition-transform duration-300 [transition-timing-function:var(--ease-modal)] ${expanded ? 'rotate-90' : ''}`}
                />
                <span
                    role="button"
                    tabIndex={0}
                    aria-label="Dismiss this connection"
                    onClick={handleDismiss}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleDismiss(e as unknown as React.MouseEvent); }}
                    className="shrink-0 flex items-center justify-center w-8 h-8 -mr-1 rounded-full text-text-muted hover:text-text hover:bg-white/10 transition-colors cursor-pointer"
                >
                    <X className="w-4 h-4" />
                </span>
            </button>

            {/* Cluster — the connected cards, each tappable to open. Uses the shared
                --ease-modal curve (via .animate-slide-up) so the reveal matches the
                app's modal motion language (M-P2). */}
            {expanded && (
                <div className="px-3 pb-3 pt-0 animate-slide-up">
                    <div className="flex flex-col gap-1.5">
                        {cluster.links.map((link) => {
                            const color = getCategoryColorStyle(link.category);
                            return (
                                <button
                                    key={link.id}
                                    type="button"
                                    onClick={() => handleOpen(link.id)}
                                    className="group flex items-center gap-3 w-full text-left px-3 py-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 hover:border-accent/20 transition-all cursor-pointer"
                                >
                                    <span
                                        className="shrink-0 w-1.5 self-stretch rounded-full"
                                        style={{ backgroundColor: color.backgroundColor }}
                                        aria-hidden
                                    />
                                    <span className="min-w-0 flex-1">
                                        <span className="block text-sm font-medium text-text-secondary group-hover:text-text transition-colors truncate">
                                            {link.title}
                                        </span>
                                        <span className="block text-[11px] text-text-muted truncate">
                                            {link.category}
                                        </span>
                                    </span>
                                    <ArrowRight className="shrink-0 w-4 h-4 text-text-muted opacity-0 group-hover:opacity-100 transition-opacity" />
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}
