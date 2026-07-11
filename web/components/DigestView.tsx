'use client';

import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Newspaper, Sparkles } from 'lucide-react';
import type { CuratedDigest, WeeklySynthesis, DigestCardRef } from '@/lib/types';
import { track } from '@/lib/analytics';
import DigestCard from './DigestCard';
import SynthesisCard from './SynthesisCard';

const MODE_LABEL: Record<string, string> = {
    smart: 'Smart mix', synthesis: 'Weekly synthesis', unread: 'Backlog',
    rediscover: 'Rediscover', random: 'Surprise me', topic: 'By topic', favorites: 'Favorites',
};

/** Coarse recency bucket for the sidebar section headers. */
function bucketLabel(ms: number): string {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const day = 86_400_000;
    if (ms >= startOfToday) return 'Today';
    if (ms >= startOfToday - day) return 'Yesterday';
    if (ms >= startOfToday - 6 * day) return 'Earlier this week';
    const d = new Date(ms);
    if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) return 'Earlier this month';
    if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString(undefined, { month: 'long' });
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}
const shortDate = (ms: number) => ms ? new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '';

interface Props {
    digests: CuratedDigest[];
    /** The weekly synthesis to surface, or null if none / dismissed. */
    synthesis: WeeklySynthesis | null;
    onOpenCard: (card: DigestCardRef) => void;
    onOpenSynthesisCard: (id: string) => void;
    onDismissSynthesis: () => void;
    onOpenDigestSettings?: () => void;
    onDeleteDigest?: (id: string) => void;
}

/**
 * The Digest section. On phones/tablets it's the elegant single column of
 * collapsible digest cards (unchanged). On desktop it becomes a two-pane
 * reader — a date-grouped sidebar of every digest on the left, the selected one
 * open on the right — so a long history stays navigable instead of an endless
 * scroll of collapsed headers.
 */
export default function DigestView({
    digests, synthesis, onOpenCard, onOpenSynthesisCard, onDismissSynthesis, onOpenDigestSettings, onDeleteDigest,
}: Props) {
    // The Digest section mounts only when the user opens it (Feed swaps it in),
    // so a mount is a genuine "digest opened" view. Fired once per mount.
    useEffect(() => {
        track('digest_opened');
    }, []);

    // Sidebar selection. 'synthesis' or a digest id; falls back to the newest.
    const [selId, setSelId] = useState<string | null>(null);
    const ids = new Set(digests.map((d) => d.id));
    const validSel = selId === 'synthesis' ? !!synthesis : (selId ? ids.has(selId) : false);
    const activeId = validSel ? selId : (digests[0]?.id ?? (synthesis ? 'synthesis' : null));

    const isEmpty = digests.length === 0 && !synthesis;
    if (isEmpty) {
        return (
            <div className="max-w-3xl mx-auto">
                <div className="text-center py-16 animate-fade-in">
                    <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-[image:var(--accent-gradient)] flex items-center justify-center shadow-lg shadow-accent/20">
                        <Newspaper className="w-8 h-8 text-white" />
                    </div>
                    <h3 className="text-lg font-medium text-text mb-2">No digests yet</h3>
                    <p className="text-text-secondary text-sm">
                        Your hand-picked batches will collect here once the curated digest is on.
                        {onOpenDigestSettings && (
                            <> {' '}
                                <button onClick={onOpenDigestSettings} className="text-accent font-medium hover:underline cursor-pointer">
                                    Set up your digest
                                </button>
                            </>
                        )}
                    </p>
                </div>
            </div>
        );
    }

    // Group digests into recency buckets, preserving the newest-first order.
    const groups: { label: string; items: CuratedDigest[] }[] = [];
    for (const d of digests) {
        const label = bucketLabel(d.createdAt);
        const last = groups[groups.length - 1];
        if (last && last.label === label) last.items.push(d);
        else groups.push({ label, items: [d] });
    }

    const activeDigest = digests.find((d) => d.id === activeId) ?? null;

    return (
        <>
            {/* Phone / tablet — the elegant single column (unchanged). */}
            <div className="lg:hidden max-w-3xl mx-auto flex flex-col gap-3">
                {synthesis && (
                    <SynthesisCard synthesis={synthesis} onOpenCard={onOpenSynthesisCard} onDismiss={onDismissSynthesis} />
                )}
                {digests.map((digest, i) => (
                    <DigestCard key={digest.id} digest={digest} defaultExpanded={i === 0} onOpenCard={onOpenCard} onOpenSettings={onOpenDigestSettings} onDelete={onDeleteDigest} />
                ))}
            </div>

            {/* Desktop — sidebar list + reading pane. */}
            <div className="hidden lg:flex gap-5 max-w-6xl mx-auto">
                <aside className="w-72 shrink-0 sticky top-2 self-start max-h-[calc(100vh-8rem)] overflow-y-auto scrollbar-subtle pr-1 flex flex-col gap-4">
                    {synthesis && (
                        <SidebarRow
                            icon={<Sparkles className="w-4 h-4" />}
                            eyebrow="Weekly synthesis"
                            title={synthesis.title || 'Your week, connected'}
                            active={activeId === 'synthesis'}
                            onClick={() => setSelId('synthesis')}
                        />
                    )}
                    {groups.map((g) => (
                        <div key={g.label} className="flex flex-col gap-1">
                            <div className="px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">{g.label}</div>
                            {g.items.map((d) => (
                                <SidebarRow
                                    key={d.id}
                                    eyebrow={`${shortDate(d.createdAt)} · ${d.topics.length ? d.topics.join(', ') : (MODE_LABEL[d.mode] ?? 'Smart mix')}`}
                                    title={d.title}
                                    meta={`${d.cardCount} ${d.cardCount === 1 ? 'card' : 'cards'}`}
                                    active={activeId === d.id}
                                    onClick={() => setSelId(d.id)}
                                />
                            ))}
                        </div>
                    ))}
                </aside>

                <div className="flex-1 min-w-0">
                    {activeId === 'synthesis' && synthesis ? (
                        <SynthesisCard synthesis={synthesis} onOpenCard={onOpenSynthesisCard} onDismiss={onDismissSynthesis} />
                    ) : activeDigest ? (
                        <DigestCard key={activeDigest.id} digest={activeDigest} alwaysOpen onOpenCard={onOpenCard} onOpenSettings={onOpenDigestSettings} onDelete={onDeleteDigest} />
                    ) : null}
                </div>
            </div>
        </>
    );
}

function SidebarRow({ icon, eyebrow, title, meta, active, onClick }: {
    icon?: ReactNode; eyebrow: string; title: string; meta?: string; active: boolean; onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            aria-pressed={active}
            className={`w-full text-left rounded-xl px-3 py-2.5 border transition-colors cursor-pointer ${active
                ? 'bg-accent/10 border-accent/40'
                : 'bg-card border-border-subtle hover:bg-card-hover hover:border-text-muted/40'}`}
        >
            <div className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${active ? 'text-accent' : 'text-text-muted'}`}>
                {icon}
                <span className="truncate">{eyebrow}</span>
            </div>
            <div className="mt-0.5 text-[13.5px] font-semibold text-text truncate">{title}</div>
            {meta && <div className="mt-0.5 text-[11px] text-text-muted">{meta}</div>}
        </button>
    );
}
