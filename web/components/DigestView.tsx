'use client';

import { useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import { CalendarCheck, ChevronRight, ChevronDown, Bell, CheckCircle2, GalleryHorizontalEnd } from 'lucide-react';
import { CitationGlyph } from '@/components/ui/Wordmark';
import type { CuratedDigest, WeeklySynthesis, DigestCardRef, UserNote, Link } from '@/lib/types';
import { track } from '@/lib/analytics';
import { digestDisplayTitle, digestKindLabel, TODAY_REVIEW_SIZE } from '@/lib/digest';
import { synthesisWeekLabel } from '@/lib/synthesis';
import { cardThumbnailUrl } from '@/lib/cardThumbnail';
import DigestCard, { ResurfacedCardRow } from './DigestCard';
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

/** The ISO-8601 week id ("2026-W36") a date falls in — the same id the backend
 *  writes syntheses under (digest_service._week_id). Weeks start Monday and
 *  week 1 is the one containing 4 January. */
function isoWeekId(d: Date): string {
    // Shift to the Thursday of this week: that day's year is the ISO year.
    const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const isoDow = t.getUTCDay() || 7; // Sunday(0) → 7
    t.setUTCDate(t.getUTCDate() + 4 - isoDow);
    const jan1 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((t.getTime() - jan1.getTime()) / 86_400_000 + 1) / 7);
    return `${t.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** "This week" / "Last week" for a synthesis, or null when it's older than that.
 *  The recap is generated on the user's chosen day (Sunday by default) for the
 *  ISO week it closes, so from Monday on it is genuinely LAST week's — saying
 *  "this week" then would be a small lie on the one screen that has to be
 *  trustworthy about time. */
function weekSectionLabel(weekId: string, now: Date): string | null {
    if (weekId === isoWeekId(now)) return 'This week';
    const lastWeek = new Date(now.getTime() - 7 * 86_400_000);
    if (weekId === isoWeekId(lastWeek)) return 'Last week';
    return null;
}

/** "4:30 PM" in the reader's locale — the eyebrow on a reminder that lands
 *  later today. */
const timeLabel = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

/** A pending reminder is DUE once it has fired (the sweep sets reminderDue, the
 *  in-app delivery that works with or without push) or once its scheduled moment
 *  has passed and the next sweep simply hasn't run yet. */
const isDueNow = (l: Link, now: number) => l.reminderDue === true || (l.nextReminderAt ?? 0) <= now;

/** A live card, flattened into the shape the shared resurfaced-card row reads. */
const toCardRef = (l: Link): DigestCardRef => ({
    id: l.id,
    title: l.title,
    category: l.category,
    summary: l.summary,
    // Respect the per-card "Hide image" choice, exactly like the feed cards do.
    thumbnailUrl: l.hideThumbnail ? null : cardThumbnailUrl(l),
    sourceName: l.sourceName,
    url: l.url,
});

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
    /** Cards carrying a reminder that still wants attention — already fired, or
     *  pending with a moment attached. Sorted by that moment, soonest first;
     *  this view keeps the ones due now plus the ones landing later today. */
    reminderCards?: Link[];
    /** Open a due card. */
    onOpenReminderCard?: (link: Link) => void;
    /** Open the card's reminder controls (snooze to tomorrow / next week / a
     *  picked time, or turn it off) — the same modal the card detail and the
     *  review deck use. */
    onEditReminder?: (link: Link) => void;
    /** Mark the reminder handled: clears the due flag and stops a still-pending
     *  reminder from firing again. */
    onCompleteReminder?: (link: Link) => void;
    /** How many cards the review deck could deal right now (0 hides the row). */
    reviewCount?: number;
    onStartReview?: () => void;
}

/**
 * The Today section — the one place saves come back to you. Above the curated
 * digest history it carries what today actually asks of you: reminders that are
 * due, this week's synthesis, and a short review session.
 *
 * On phones/tablets the history below is an elegant single column of tappable
 * rows. On desktop it becomes a two-pane reader — a date-grouped sidebar of
 * every digest on the left, the selected one open on the right — so a long
 * history stays navigable instead of an endless scroll of collapsed headers.
 */
export default function DigestView({
    digests, syntheses, synthesisNotes, onSaveSynthesisNotes, onOpenCard, onOpenSynthesisCard,
    onOpenDigestSettings, onDeleteDigest, onOpenDigest,
    reminderCards = [], onOpenReminderCard, onEditReminder, onCompleteReminder,
    reviewCount = 0, onStartReview,
}: Props) {
    // The Today section mounts only when the user opens it (Feed swaps it in),
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
    const DUE_KEY = 'due-now';
    const WEEK_KEY = 'this-week';

    // Desktop sidebar selection. A digest id or `synthesis:<weekId>`; resolved
    // against the live lists below, so a deleted entry falls back on its own.
    const [selId, setSelId] = useState<string | null>(null);

    // ── Today's top section ──────────────────────────────────────────────
    // Computed at render, not memoized: this view is mounted when the tab is
    // opened, so "now" is the moment the user looked.
    const now = new Date();
    const nowMs = now.getTime();
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime();
    const dueNow = reminderCards.filter((l) => isDueNow(l, nowMs));
    const dueLaterToday = reminderCards.filter(
        (l) => !isDueNow(l, nowMs) && (l.nextReminderAt ?? Infinity) < endOfToday,
    );
    const dueToday = [...dueNow, ...dueLaterToday];

    // The newest synthesis is PROMOTED out of the archive into "This week" when
    // it's recent enough to be about the week you're in. Older ones stay in the
    // list below, so a week is never shown twice.
    const weekLabel = syntheses[0] ? weekSectionLabel(syntheses[0].weekId, now) : null;
    const thisWeek = weekLabel ? syntheses[0] : null;
    const archivedSyntheses = thisWeek ? syntheses.slice(1) : syntheses;

    const reviewSize = Math.min(TODAY_REVIEW_SIZE, reviewCount);
    const showReview = reviewSize > 0 && !!onStartReview;

    const isEmpty = digests.length === 0 && syntheses.length === 0 && dueToday.length === 0 && !showReview;
    if (isEmpty) {
        return (
            <div className="max-w-3xl mx-auto">
                <div className="text-center py-16 px-6 animate-fade-in">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-accent/10 flex items-center justify-center">
                        <CalendarCheck className="w-7 h-7 text-accent" strokeWidth={1.75} />
                    </div>
                    <h3 className="text-base font-bold text-text">Nothing for today yet.</h3>
                    <p className="mt-1.5 max-w-xs mx-auto text-sm text-text-muted leading-relaxed">
                        Reminders that come due, your weekly synthesis, and a curated pick of your saves all land here.
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

    // Sidebar selection. A digest id or `synthesis:<weekId>`; falls back to the
    // newest digest, or the newest archived synthesis when there are no digests.
    const ids = new Set<string>([
        ...digests.map((d) => d.id),
        ...archivedSyntheses.map((s) => synthesisEntryId(s.weekId)),
    ]);
    const firstSynthesisId = archivedSyntheses[0] ? synthesisEntryId(archivedSyntheses[0].weekId) : null;
    const activeId = selId && ids.has(selId) ? selId : (digests[0]?.id ?? firstSynthesisId);
    const activeSynthesis = activeId
        ? archivedSyntheses.find((s) => synthesisEntryId(s.weekId) === activeId) ?? null
        : null;
    const activeDigest = digests.find((d) => d.id === activeId) ?? null;

    const todayTop = (dueToday.length > 0 || thisWeek || showReview) ? (
        <div className="flex flex-col gap-4">
            {dueToday.length > 0 && (
                <div className="flex flex-col gap-1.5">
                    <SectionHeader
                        label="Due now"
                        count={dueToday.length}
                        open={isOpen(DUE_KEY)}
                        onToggle={() => toggle(DUE_KEY)}
                    />
                    {isOpen(DUE_KEY) && dueToday.map((l) => (
                        <ResurfacedCardRow
                            key={l.id}
                            card={toCardRef(l)}
                            onOpen={() => onOpenReminderCard?.(l)}
                            trailing={
                                <>
                                    {!isDueNow(l, nowMs) && l.nextReminderAt && (
                                        <span dir="ltr" className="px-1 text-[11px] font-semibold text-text-muted tabular-nums">
                                            {timeLabel(l.nextReminderAt)}
                                        </span>
                                    )}
                                    {onEditReminder && (
                                        <button
                                            onClick={() => onEditReminder(l)}
                                            aria-label={`Change the reminder for “${l.title}”`}
                                            title="Change the reminder"
                                            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                                        >
                                            <Bell className="w-4 h-4" />
                                        </button>
                                    )}
                                    {onCompleteReminder && (
                                        <button
                                            onClick={() => onCompleteReminder(l)}
                                            aria-label={`Mark the reminder for “${l.title}” as done`}
                                            title="Mark as done"
                                            className="w-9 h-9 shrink-0 flex items-center justify-center rounded-lg text-text-muted hover:text-accent hover:bg-accent/10 transition-colors cursor-pointer"
                                        >
                                            <CheckCircle2 className="w-4 h-4" />
                                        </button>
                                    )}
                                </>
                            }
                        />
                    ))}
                </div>
            )}

            {thisWeek && (
                <div className="flex flex-col gap-1.5">
                    <SectionHeader
                        label={weekLabel as string}
                        open={isOpen(WEEK_KEY)}
                        onToggle={() => toggle(WEEK_KEY)}
                    />
                    {isOpen(WEEK_KEY) && (
                        <SynthesisCard
                            key={thisWeek.weekId}
                            synthesis={thisWeek}
                            onOpenCard={onOpenSynthesisCard}
                            notes={synthesisNotes.get(thisWeek.weekId)}
                            onSaveNotes={(n) => onSaveSynthesisNotes(thisWeek.weekId, n)}
                        />
                    )}
                </div>
            )}

            {showReview && (
                <button
                    onClick={onStartReview}
                    className="w-full flex items-center gap-3 rounded-2xl border border-border-subtle bg-card px-3.5 py-3 text-start cursor-pointer transition-colors hover:bg-card-hover hover:border-text-muted/40"
                >
                    <span className="w-9 h-9 shrink-0 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                        <GalleryHorizontalEnd className="w-[18px] h-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1 text-[15px] font-bold text-text">
                        Review {reviewSize} {reviewSize === 1 ? 'card' : 'cards'}
                    </span>
                    <ChevronRight className="w-4 h-4 text-text-muted shrink-0 rtl:rotate-180" />
                </button>
            )}
        </div>
    ) : null;

    return (
        <>
            {/* Phone / tablet — today's top section, then a scannable LIST of
                every digest, newest first. Tapping one opens it as its own
                screen (Feed owns that view + the back navigation). */}
            <div className="lg:hidden max-w-3xl mx-auto flex flex-col gap-4">
                {todayTop}
                {archivedSyntheses.length > 0 && (
                    <div className="flex flex-col gap-1.5">
                        <SectionHeader
                            label="Weekly synthesis"
                            count={archivedSyntheses.length}
                            open={isOpen(SYNTHESES_KEY)}
                            onToggle={() => toggle(SYNTHESES_KEY)}
                        />
                        {isOpen(SYNTHESES_KEY) && archivedSyntheses.map((s) => (
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

            {/* Desktop — today's top section over the sidebar list + reading pane. */}
            {/* Wider than the old max-w-6xl (owner QA: the reader left desktop
                width on the table). The sidebar keeps its 288px; the extra room
                all goes to the reading pane, where the article column centres
                itself at its own measure. */}
            <div className="hidden lg:block max-w-[1500px] mx-auto">
                {todayTop && <div className="mb-6">{todayTop}</div>}
                <div className="flex gap-6">
                    <aside className="w-72 shrink-0 sticky top-2 self-start max-h-[calc(100vh-8rem)] overflow-y-auto scrollbar-subtle pr-1 flex flex-col gap-4">
                        {archivedSyntheses.length > 0 && (
                            <div className="flex flex-col gap-1">
                                <SectionHeader
                                    label="Weekly synthesis"
                                    count={archivedSyntheses.length}
                                    open={isOpen(SYNTHESES_KEY)}
                                    onToggle={() => toggle(SYNTHESES_KEY)}
                                />
                                {isOpen(SYNTHESES_KEY) && archivedSyntheses.map((s) => (
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
            </div>
        </>
    );
}

/** A collapsible group header — same typographic weight as the plain date
 *  headers next to it, so the submenu reads as part of the same list rather
 *  than as a control bolted on top. */
function SectionHeader({ label, count, open, onToggle }: {
    label: string;
    /** Omitted where a count would say nothing (a section holding one thing). */
    count?: number;
    open: boolean;
    onToggle: () => void;
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
            {count !== undefined && <span className="font-semibold tracking-normal opacity-70">{count}</span>}
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
