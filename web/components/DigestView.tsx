'use client';

import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { Newspaper, ChevronRight, ChevronDown } from 'lucide-react';
import { CitationGlyph } from '@/components/ui/Wordmark';
import type { CuratedDigest, WeeklySynthesis, DigestCardRef, UserNote } from '@/lib/types';
import { track } from '@/lib/analytics';
import { digestDisplayTitle, digestKindLabel } from '@/lib/digest';
import { synthesisWeekLabel } from '@/lib/synthesis';
import DigestCard from './DigestCard';
import SynthesisCard from './SynthesisCard';

/** Sidebar/list id for an archived synthesis — namespaced so it can never
 *  collide with a digest id. Feed's detail route parses the same prefix. */
export const synthesisEntryId = (weekId: string) => `synthesis:${weekId}`;

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
    /** EVERY weekly synthesis, newest first — the archive. Deliberately NOT
     *  filtered by the feed's dismissal: dismissing this week's banner hides a
     *  banner, it does not delete the write-up. */
    syntheses: WeeklySynthesis[];
    /** weekId → that week's notes, newest first. */
    synthesisNotes: Map<string, UserNote[]>;
    /** Persist a week's whole note list (add / edit / delete). */
    onSaveSynthesisNotes: (weekId: string, notes: UserNote[]) => void;
    onOpenCard: (card: DigestCardRef) => void;
    onOpenSynthesisCard: (id: string) => void;
    onOpenDigestSettings?: () => void;
    onDeleteDigest?: (id: string) => void;
    /** Phone/tablet: open a single entry as its own screen. Passed a digest id,
     *  or `synthesis:<weekId>` for an archived synthesis. When set, the compact
     *  layout renders a tappable LIST instead of expanding the latest digest
     *  inline. */
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
    digests, syntheses, synthesisNotes, onSaveSynthesisNotes, onOpenCard, onOpenSynthesisCard,
    onOpenDigestSettings, onDeleteDigest, onOpenDigest,
}: Props) {
    // The Digest section mounts only when the user opens it (Feed swaps it in),
    // so a mount is a genuine "digest opened" view. Fired once per mount.
    useEffect(() => {
        track('digest_opened');
    }, []);

    // Every sidebar group collapses (owner QA: the synthesis chevron should not
    // be the only one). Open by default; only the groups the user has closed are
    // tracked, so a brand-new date bucket appears expanded like the rest.
    const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
    const isOpen = (key: string) => !collapsed.has(key);
    const toggle = (key: string) => setCollapsed((prev) => {
        const next = new Set(prev);
        if (!next.delete(key)) next.add(key);
        return next;
    });
    const SYNTHESES_KEY = 'weekly-synthesis';

    // Sidebar selection. A digest id or `synthesis:<weekId>`; falls back to the
    // newest digest, or the newest synthesis when there are no digests yet.
    const [selId, setSelId] = useState<string | null>(null);
    const ids = new Set<string>([
        ...digests.map((d) => d.id),
        ...syntheses.map((s) => synthesisEntryId(s.weekId)),
    ]);
    const firstSynthesisId = syntheses[0] ? synthesisEntryId(syntheses[0].weekId) : null;
    const activeId = selId && ids.has(selId) ? selId : (digests[0]?.id ?? firstSynthesisId);
    const activeSynthesis = activeId
        ? syntheses.find((s) => synthesisEntryId(s.weekId) === activeId) ?? null
        : null;

    const isEmpty = digests.length === 0 && syntheses.length === 0;
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
                            className="mt-5 inline-flex items-center gap-2 px-4 h-10 rounded-full bg-accent text-accent-ink text-sm font-bold hover:bg-accent-hover active:scale-95 transition-all cursor-pointer"
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
                {syntheses.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                        <SectionHeader
                            label="Weekly synthesis"
                            count={syntheses.length}
                            open={isOpen(SYNTHESES_KEY)}
                            onToggle={() => toggle(SYNTHESES_KEY)}
                        />
                        {isOpen(SYNTHESES_KEY) && syntheses.map((s) => (
                            <SidebarRow
                                key={s.weekId}
                                icon={<CitationGlyph className="w-3 h-auto" />}
                                eyebrow={synthesisWeekLabel(s)}
                                title={s.title || 'Your week, connected'}
                                active={false}
                                onClick={() => onOpenDigest?.(synthesisEntryId(s.weekId))}
                                trailing={<ChevronRight className="w-4 h-4 text-text-muted shrink-0 rtl:rotate-180" />}
                            />
                        ))}
                    </div>
                )}
                {groups.map((g) => (
                    <div key={g.label} className="flex flex-col gap-1.5">
                        <SectionHeader
                            label={g.label}
                            count={g.items.length}
                            open={isOpen(g.label)}
                            onToggle={() => toggle(g.label)}
                        />
                        {isOpen(g.label) && g.items.map((d) => (
                            <SidebarRow
                                key={d.id}
                                eyebrow={d.frequency === 'weekly' ? digestKindLabel(d.frequency) : undefined}
                                title={digestDisplayTitle(d)}
                                active={false}
                                onClick={() => onOpenDigest?.(d.id)}
                                trailing={<ChevronRight className="w-4 h-4 text-text-muted shrink-0 rtl:rotate-180" />}
                            />
                        ))}
                    </div>
                ))}
            </div>

            {/* Desktop — sidebar list + reading pane. */}
            {/* Wider than the old max-w-6xl (owner QA: the reader left desktop
                width on the table). The sidebar keeps its 288px; the extra room
                all goes to the reading pane, where the article column centres
                itself at its own measure. */}
            <div className="hidden lg:flex gap-6 max-w-[1500px] mx-auto">
                <aside className="w-72 shrink-0 sticky top-2 self-start max-h-[calc(100vh-8rem)] overflow-y-auto scrollbar-subtle pr-1 flex flex-col gap-4">
                    {syntheses.length > 0 && (
                        <div className="flex flex-col gap-1">
                            <SectionHeader
                                label="Weekly synthesis"
                                count={syntheses.length}
                                open={isOpen(SYNTHESES_KEY)}
                                onToggle={() => toggle(SYNTHESES_KEY)}
                            />
                            {isOpen(SYNTHESES_KEY) && syntheses.map((s) => (
                                <SidebarRow
                                    key={s.weekId}
                                    icon={<CitationGlyph className="w-3 h-auto" />}
                                    eyebrow={synthesisWeekLabel(s)}
                                    title={s.title || 'Your week, connected'}
                                    active={activeId === synthesisEntryId(s.weekId)}
                                    onClick={() => setSelId(synthesisEntryId(s.weekId))}
                                />
                            ))}
                        </div>
                    )}
                    {groups.map((g) => (
                        <div key={g.label} className="flex flex-col gap-1">
                            <SectionHeader
                                label={g.label}
                                count={g.items.length}
                                open={isOpen(g.label)}
                                onToggle={() => toggle(g.label)}
                            />
                            {isOpen(g.label) && g.items.map((d) => (
                                <SidebarRow
                                    key={d.id}
                                    eyebrow={d.frequency === 'weekly' ? digestKindLabel(d.frequency) : undefined}
                                    title={digestDisplayTitle(d)}
                                    active={activeId === d.id}
                                    onClick={() => setSelId(d.id)}
                                />
                            ))}
                        </div>
                    ))}
                </aside>

                <div className="flex-1 min-w-0">
                    {activeSynthesis ? (
                        <SynthesisCard
                            key={activeSynthesis.weekId}
                            synthesis={activeSynthesis}
                            onOpenCard={onOpenSynthesisCard}
                            alwaysOpen
                            notes={synthesisNotes.get(activeSynthesis.weekId)}
                            onSaveNotes={(n) => onSaveSynthesisNotes(activeSynthesis.weekId, n)}
                        />
                    ) : activeDigest ? (
                        <DigestCard key={activeDigest.id} digest={activeDigest} alwaysOpen onOpenCard={onOpenCard} onOpenSettings={onOpenDigestSettings} onDelete={onDeleteDigest} />
                    ) : null}
                </div>
            </div>
        </>
    );
}

/** A collapsible group header — same typographic weight as the plain date
 *  headers next to it, so the submenu reads as part of the same list rather
 *  than as a control bolted on top. */
function SectionHeader({ label, count, open, onToggle }: {
    label: string; count: number; open: boolean; onToggle: () => void;
}) {
    return (
        <button
            onClick={onToggle}
            aria-expanded={open}
            className="w-full flex items-center gap-1.5 px-1 py-0.5 text-[11px] font-bold uppercase tracking-[0.14em] text-text-muted hover:text-text-secondary transition-colors cursor-pointer"
        >
            <ChevronDown
                className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${open ? '' : '-rotate-90 rtl:rotate-90'}`}
                style={{ transitionTimingFunction: 'var(--ease-modal)' }}
            />
            <span className="truncate">{label}</span>
            <span className="font-semibold tracking-normal opacity-70">{count}</span>
        </button>
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
                {/* Wraps to two lines instead of truncating — a synthesis title
                    is a sentence, and "A week of systems, performance, a…" told
                    the user nothing about which week they were picking. */}
                <span dir="auto" className={`block text-[13.5px] font-semibold text-text leading-snug line-clamp-2 ${(icon || eyebrow) ? 'mt-0.5' : ''}`}>{title}</span>
                {meta && <span className="mt-0.5 flex items-center gap-1 min-w-0 text-[11px] text-text-muted">{meta}</span>}
            </span>
            {trailing}
        </button>
    );
}
