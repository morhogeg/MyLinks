'use client';

import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Newspaper, Sparkles, ChevronRight } from 'lucide-react';
import type { CuratedDigest, WeeklySynthesis, DigestCardRef } from '@/lib/types';
import { track } from '@/lib/analytics';
import { digestDisplayTitle, digestKindLabel } from '@/lib/digest';
import DigestCard from './DigestCard';
import SynthesisCard from './SynthesisCard';

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

interface Props {
    digests: CuratedDigest[];
    /** The weekly synthesis to surface, or null if none / dismissed. */
    synthesis: WeeklySynthesis | null;
    onOpenCard: (card: DigestCardRef) => void;
    onOpenSynthesisCard: (id: string) => void;
    onDismissSynthesis: () => void;
    onOpenDigestSettings?: () => void;
    onDeleteDigest?: (id: string) => void;
    /** Phone/tablet: open a single digest as its own screen. Passed the digest
     *  id, or the sentinel 'synthesis' for the weekly-synthesis entry. When set,
     *  the compact layout renders a tappable LIST instead of expanding the
     *  latest digest inline. */
    onOpenDigest?: (id: string) => void;
}

/**
 * The Digest section. On phones/tablets it's the elegant single column of
 * collapsible digest cards (unchanged). On desktop it becomes a two-pane
 * reader — a date-grouped sidebar of every digest on the left, the selected one
 * open on the right — so a long history stays navigable instead of an endless
 * scroll of collapsed headers.
 */
export default function DigestView({
    digests, synthesis, onOpenCard, onOpenSynthesisCard, onDismissSynthesis, onOpenDigestSettings, onDeleteDigest, onOpenDigest,
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
                <div className="text-center py-16 px-6 animate-fade-in">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-accent/10 flex items-center justify-center">
                        <Newspaper className="w-7 h-7 text-accent" strokeWidth={1.75} />
                    </div>
                    <h3 className="text-base font-bold text-text">No digests yet</h3>
                    <p className="mt-1.5 max-w-xs mx-auto text-sm text-text-muted leading-relaxed">
                        On your schedule, Machina picks a few saves worth revisiting and delivers them here.
                    </p>
                    {onOpenDigestSettings && (
                        <button
                            onClick={onOpenDigestSettings}
                            className="mt-5 inline-flex items-center gap-2 px-4 h-10 rounded-full bg-accent text-white text-sm font-bold hover:bg-accent-hover active:scale-95 transition-all cursor-pointer"
                        >
                            Set up your digest
                        </button>
                    )}
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
            {/* Phone / tablet — a scannable LIST of every digest, newest first.
                Tapping one opens it as its own screen (Feed owns that view + the
                back navigation). The old behaviour expanded the latest digest
                inline, which hid the rest of the history behind a scroll. */}
            <div className="lg:hidden max-w-3xl mx-auto flex flex-col gap-4">
                {synthesis && (
                    <div className="flex flex-col gap-1.5">
                        <div className="px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">Highlights</div>
                        <SidebarRow
                            icon={<Sparkles className="w-4 h-4" />}
                            eyebrow="Weekly synthesis"
                            title={synthesis.title || 'Your week, connected'}
                            active={false}
                            onClick={() => onOpenDigest?.('synthesis')}
                            trailing={<ChevronRight className="w-4 h-4 text-text-muted shrink-0" />}
                        />
                    </div>
                )}
                {groups.map((g) => (
                    <div key={g.label} className="flex flex-col gap-1.5">
                        <div className="px-1 text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted">{g.label}</div>
                        {g.items.map((d) => (
                            <SidebarRow
                                key={d.id}
                                eyebrow={d.frequency === 'weekly' ? digestKindLabel(d.frequency) : undefined}
                                title={digestDisplayTitle(d)}
                                meta={`${d.cardCount} ${d.cardCount === 1 ? 'card' : 'cards'}`}
                                active={false}
                                onClick={() => onOpenDigest?.(d.id)}
                                trailing={<ChevronRight className="w-4 h-4 text-text-muted shrink-0" />}
                            />
                        ))}
                    </div>
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
                                    eyebrow={d.frequency === 'weekly' ? digestKindLabel(d.frequency) : undefined}
                                    title={digestDisplayTitle(d)}
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

function SidebarRow({ icon, eyebrow, title, meta, active, onClick, trailing }: {
    /** Eyebrow is optional — daily digest rows lead with the date itself
        (repeating "Daily digest" on every row said nothing). */
    icon?: ReactNode; eyebrow?: string; title: string; meta?: ReactNode; active: boolean; onClick: () => void;
    /** Optional trailing affordance (e.g. a chevron for rows that navigate). */
    trailing?: ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            aria-pressed={active}
            className={`w-full flex items-center gap-2 text-left rounded-xl px-3 py-2.5 border transition-colors cursor-pointer active:opacity-80 ${active
                ? 'bg-accent/10 border-accent/40'
                : 'bg-card border-border-subtle hover:bg-card-hover hover:border-text-muted/40'}`}
        >
            <span className="min-w-0 flex-1">
                {(icon || eyebrow) && (
                    <span className={`flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider ${active ? 'text-accent' : 'text-text-muted'}`}>
                        {icon}
                        {eyebrow && <span className="truncate">{eyebrow}</span>}
                    </span>
                )}
                <span dir="auto" className={`block text-[13.5px] font-semibold text-text truncate ${(icon || eyebrow) ? 'mt-0.5' : ''}`}>{title}</span>
                {meta && <span className="mt-0.5 flex items-center gap-1 min-w-0 text-[11px] text-text-muted">{meta}</span>}
            </span>
            {trailing}
        </button>
    );
}
