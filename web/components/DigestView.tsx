'use client';

import { useState, useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { CalendarCheck, ChevronRight, ChevronDown, Bell, BellRing, Check, CheckCircle2, CircleSlash, GalleryHorizontalEnd } from 'lucide-react';
import { CitationGlyph } from '@/components/ui/Wordmark';
import type { CuratedDigest, WeeklySynthesis, DigestCardRef, UserNote, Link } from '@/lib/types';
import { track } from '@/lib/analytics';
import { digestDisplayTitle, digestKindLabel } from '@/lib/digest';
import { synthesisWeekLabel } from '@/lib/synthesis';
import { cardThumbnailUrl } from '@/lib/cardThumbnail';
import { getActionableTakeaway, isTakeawayDone } from '@/lib/takeaway';
import { isReminderDue, whenLabel, snoozeTarget } from '@/lib/reminderTime';
import { getDirection } from '@/lib/rtl';
import { getCategoryColorStyle } from '@/lib/colors';
import { hapticLight } from '@/lib/haptics';
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

const isDueNow = isReminderDue;

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
     *  this view lists every one: the due ones first, then the upcoming. */
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
    /** Move the reminder later (lib/reminderTime snoozeTarget): a right swipe. */
    onSnoozeReminder?: (link: Link) => void;
    /** The newest digest, whose cards the review row deals (the same cards the
     *  push counted). */
    reviewDigest?: CuratedDigest | null;
    /** How many of its cards are still waiting; 0 hides the row. */
    reviewLeft?: number;
    onStartReview?: () => void;
    /** Cards whose "Do this" takeaway is still open, newest save first
     *  (lib/takeaway openTakeaways). Feed derives it from the visible cards, so
     *  a locked private card never surfaces here. */
    takeawayCards?: Link[];
    /** Open the card a takeaway came from. */
    onOpenTakeawayCard?: (link: Link) => void;
    /** Tick the takeaway off: it leaves this list and stays on its card. */
    onCompleteTakeaway?: (link: Link) => void;
    /** "Not for me" (swipe left): leaves this list without counting as done. */
    onDismissTakeaway?: (link: Link) => void;
    /** Done and "Not for me" takeaways, most recently closed first
     *  (lib/takeaway closedTakeaways): the collapsed Done list. */
    closedTakeawayCards?: Link[];
    /** Put a closed takeaway back on the open list. */
    onReopenTakeaway?: (link: Link) => void;
}

/**
 * The Revisit tab — the one place saves come back to you on their own. Above
 * the curated digest history it carries what actually asks for you: reminders
 * that are due, the things your saves told you to do, this week's synthesis,
 * and a short review session.
 *
 * On phones/tablets the history below is an elegant single column of tappable
 * rows. On desktop it becomes a two-pane reader — a date-grouped sidebar of
 * every digest on the left, the selected one open on the right — so a long
 * history stays navigable instead of an endless scroll of collapsed headers.
 */
export default function DigestView({
    digests, syntheses, synthesisNotes, onSaveSynthesisNotes, onOpenCard, onOpenSynthesisCard,
    onOpenDigestSettings, onDeleteDigest, onOpenDigest,
    reminderCards = [], onOpenReminderCard, onEditReminder, onCompleteReminder, onSnoozeReminder,
    reviewDigest = null, reviewLeft = 0, onStartReview,
    takeawayCards = [], onOpenTakeawayCard, onCompleteTakeaway, onDismissTakeaway,
    closedTakeawayCards = [], onReopenTakeaway,
}: Props) {
    // The Revisit tab mounts only when the user opens it (Feed swaps it in),
    // so a mount is a genuine "digest opened" view. Fired once per mount (the
    // event keeps its historical name so the analytics series stays whole).
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
    const DO_KEY = 'do-this';
    const WEEK_KEY = 'this-week';
    // "Do this" shows a short list by default (Revisit is a place you pass
    // through); one tap unfolds the rest.
    const [showAllTakeaways, setShowAllTakeaways] = useState(false);
    const TAKEAWAYS_FOLDED = 5;
    // The Done list starts closed (it is a look back, not the task at hand)
    // and shows the most recent few until asked for the rest.
    const [showDone, setShowDone] = useState(false);
    const [showAllDone, setShowAllDone] = useState(false);
    const DONE_FOLDED = 10;
    const hasTakeaways = takeawayCards.length > 0 || closedTakeawayCards.length > 0;
    // A one-line hint teaches the swipe until the user has used it once
    // (touch only; pointer devices get the hover button instead).
    const [swipeLearned, setSwipeLearned] = useState(() => {
        try { return localStorage.getItem(SWIPE_HINT_KEY) === '1'; } catch { return false; }
    });
    const dismissTakeaway = (l: Link) => {
        if (!swipeLearned) {
            setSwipeLearned(true);
            try { localStorage.setItem(SWIPE_HINT_KEY, '1'); } catch { /* private mode: hint just shows again */ }
        }
        onDismissTakeaway?.(l);
    };

    // Desktop sidebar selection. A digest id or `synthesis:<weekId>`; resolved
    // against the live lists below, so a deleted entry falls back on its own.
    const [selId, setSelId] = useState<string | null>(null);

    // ── The top section: what is asking for you right now ────────────────
    // Computed at render, not memoized: this view is mounted when the tab is
    // opened, so "now" is the moment the user looked.
    const now = new Date();
    const nowMs = now.getTime();
    // Every active reminder (owner, 2026-10-07: not just today's), the due ones
    // first, then the rest in the order they fire.
    const dueNow = reminderCards.filter((l) => isDueNow(l, nowMs));
    const upcoming = reminderCards.filter((l) => !isDueNow(l, nowMs));
    const reminders = [...dueNow, ...upcoming];

    // The newest synthesis is PROMOTED out of the archive into "This week" when
    // it's recent enough to be about the week you're in. Older ones stay in the
    // list below, so a week is never shown twice.
    const weekLabel = syntheses[0] ? weekSectionLabel(syntheses[0].weekId, now) : null;
    const thisWeek = weekLabel ? syntheses[0] : null;
    const archivedSyntheses = thisWeek ? syntheses.slice(1) : syntheses;

    // The digest's review ritual, for when the push was swiped away. Gone once
    // every card in it is handled; the next digest brings it back.
    const showReview = !!reviewDigest && reviewLeft > 0 && !!onStartReview;
    const reviewWhen = reviewDigest ? digestDisplayTitle(reviewDigest, { relative: true }) : '';

    const isEmpty = digests.length === 0 && syntheses.length === 0 && reminders.length === 0
        && !hasTakeaways && !showReview;
    if (isEmpty) {
        return (
            <div className="max-w-3xl mx-auto">
                <div className="text-center py-16 px-6 animate-fade-in">
                    <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-accent/10 flex items-center justify-center">
                        <CalendarCheck className="w-7 h-7 text-accent" strokeWidth={1.75} />
                    </div>
                    <h3 className="text-base font-bold text-text">Nothing to revisit yet.</h3>
                    <p className="mt-1.5 max-w-xs mx-auto text-sm text-text-muted leading-relaxed">
                        Reminders that come due, things your saves ask you to do, your weekly synthesis, and a curated pick of your saves all land here.
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

    const todayTop = (reminders.length > 0 || hasTakeaways || thisWeek || showReview) ? (
        <div className="flex flex-col gap-4">
            {/* First: it's the one thing here with an end. */}
            {showReview && (
                <button
                    onClick={onStartReview}
                    className="w-full flex items-center gap-3 rounded-2xl border border-border-subtle bg-card px-3.5 py-3 text-start cursor-pointer transition-colors hover:bg-card-hover hover:border-text-muted/40"
                >
                    <span className="w-9 h-9 shrink-0 rounded-xl bg-accent/10 flex items-center justify-center text-accent">
                        <GalleryHorizontalEnd className="w-[18px] h-[18px]" />
                    </span>
                    <span className="min-w-0 flex-1">
                        <span className="block text-[15px] font-bold text-text">
                            Review {reviewLeft} {reviewLeft === 1 ? 'card' : 'cards'}
                        </span>
                        <span className="block text-[13px] text-text-muted truncate">
                            {reviewWhen === 'Today' || reviewWhen === 'Yesterday'
                                ? `From ${reviewWhen.toLowerCase()}'s ${reviewDigest?.frequency === 'weekly' ? 'Weekly' : 'Daily'} Brew`
                                : `From your Brew of ${reviewWhen}`}
                        </span>
                    </span>
                    <ChevronRight className="w-4 h-4 text-text-muted shrink-0 rtl:rotate-180" />
                </button>
            )}
            {reminders.length > 0 && (
                <div className="flex flex-col gap-1.5">
                    <SectionHeader
                        label="Reminders"
                        count={reminders.length}
                        open={isOpen(DUE_KEY)}
                        onToggle={() => toggle(DUE_KEY)}
                    />
                    {isOpen(DUE_KEY) && reminders.map((l) => (
                        <SwipeableReminder
                            key={l.id}
                            onDone={onCompleteReminder ? () => onCompleteReminder(l) : undefined}
                            onSnooze={onSnoozeReminder ? () => onSnoozeReminder(l) : undefined}
                            snoozeLabel={whenLabel(snoozeTarget(l, now), now)}
                        >
                        <ResurfacedCardRow
                            card={toCardRef(l)}
                            onOpen={() => onOpenReminderCard?.(l)}
                            note={isDueNow(l, nowMs) ? (
                                <span className="shrink-0 font-semibold text-accent">· Now</span>
                            ) : l.nextReminderAt ? (
                                <span className="shrink-0 font-semibold tabular-nums whitespace-nowrap">
                                    {`· ${whenLabel(l.nextReminderAt, now)}`}
                                </span>
                            ) : null}
                            trailing={
                                <>
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
                        </SwipeableReminder>
                    ))}
                </div>
            )}

            {hasTakeaways && (
                <div className="flex flex-col gap-1.5">
                    <SectionHeader
                        label="Do this"
                        count={takeawayCards.length || undefined}
                        open={isOpen(DO_KEY)}
                        onToggle={() => toggle(DO_KEY)}
                    />
                    {/* A to-do list, not a card list (owner QA on 1322: the card
                        rows were too busy). One grouped container, a circle to
                        tick, the whole task, and the card title with its category
                        dot as one muted line under it. No byline, chip or
                        thumbnail: tapping the row opens the card, which has all
                        of that. See TakeawayRow for the tick and the swipe. */}
                    {isOpen(DO_KEY) && (
                        <>
                            {takeawayCards.length === 0 && (
                                <p className="px-1 py-1 text-[13px] text-text-muted">
                                    All done. New tasks arrive with your saves.
                                </p>
                            )}
                            {takeawayCards.length > 0 && (
                            <div className="rounded-2xl border border-border-subtle bg-card overflow-hidden">
                                {(showAllTakeaways ? takeawayCards : takeawayCards.slice(0, TAKEAWAYS_FOLDED)).map((l, i) => (
                                    <TakeawayRow
                                        key={l.id}
                                        index={i}
                                        task={getActionableTakeaway(l)}
                                        cardTitle={l.title}
                                        color={getCategoryColorStyle(l.category || '').color}
                                        onOpen={() => onOpenTakeawayCard?.(l)}
                                        onDone={onCompleteTakeaway ? () => onCompleteTakeaway(l) : undefined}
                                        onDismiss={onDismissTakeaway ? () => dismissTakeaway(l) : undefined}
                                    />
                                ))}
                            </div>
                            )}
                            {onDismissTakeaway && !swipeLearned && takeawayCards.length > 0 && (
                                <p className="px-1 text-[12px] text-text-muted [@media(hover:hover)]:hidden">
                                    Swipe left on a task that isn’t for you.
                                </p>
                            )}
                            {takeawayCards.length > TAKEAWAYS_FOLDED && (
                                <button
                                    onClick={() => setShowAllTakeaways((v) => !v)}
                                    className="self-start px-1 py-1 text-[12px] font-semibold text-text-muted hover:text-accent transition-colors cursor-pointer"
                                >
                                    {showAllTakeaways ? 'Show fewer' : `Show all ${takeawayCards.length}`}
                                </button>
                            )}
                            {/* The look back (owner ask on 1344): what was done,
                                and what was set aside as "Not for me", so a
                                mistaken swipe can be found after its toast is
                                gone. Collapsed by default; either can go back. */}
                            {closedTakeawayCards.length > 0 && (
                                <>
                                    <button
                                        onClick={() => setShowDone((v) => !v)}
                                        aria-expanded={showDone}
                                        className="self-start flex items-center gap-1 px-1 py-1 text-[12px] font-semibold text-text-muted [@media(hover:hover)]:hover:text-text-secondary active:opacity-60 transition-colors cursor-pointer"
                                    >
                                        <ChevronDown
                                            className={`w-3.5 h-3.5 shrink-0 transition-transform duration-200 ${showDone ? '' : '-rotate-90 rtl:rotate-90'}`}
                                            style={{ transitionTimingFunction: 'var(--ease-modal)' }}
                                        />
                                        Done
                                        <span className="tabular-nums opacity-70">{closedTakeawayCards.length}</span>
                                    </button>
                                    {showDone && (
                                        <div className="rounded-2xl border border-border-subtle bg-card overflow-hidden animate-fade-in">
                                            {(showAllDone ? closedTakeawayCards : closedTakeawayCards.slice(0, DONE_FOLDED)).map((l, i) => (
                                                <ClosedTakeawayRow
                                                    key={l.id}
                                                    index={i}
                                                    task={getActionableTakeaway(l)}
                                                    cardTitle={l.title}
                                                    color={getCategoryColorStyle(l.category || '').color}
                                                    dismissed={!isTakeawayDone(l)}
                                                    onOpen={() => onOpenTakeawayCard?.(l)}
                                                    onReopen={onReopenTakeaway ? () => onReopenTakeaway(l) : undefined}
                                                />
                                            ))}
                                        </div>
                                    )}
                                    {showDone && closedTakeawayCards.length > DONE_FOLDED && (
                                        <button
                                            onClick={() => setShowAllDone((v) => !v)}
                                            className="self-start px-1 py-1 text-[12px] font-semibold text-text-muted hover:text-accent transition-colors cursor-pointer"
                                        >
                                            {showAllDone ? 'Show fewer' : `Show all ${closedTakeawayCards.length}`}
                                        </button>
                                    )}
                                </>
                            )}
                        </>
                    )}
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

        </div>
    ) : null;

    return (
        <>
            {/* Phone / tablet — the top section, then a scannable LIST of
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

            {/* Desktop — the top section over the sidebar list + reading pane. */}
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
/** How far a row must travel left (share of its width) to count as
 *  "Not for me" when released. */
const DISMISS_FRACTION = 0.35;
const SWIPE_HINT_KEY = 'machina.takeawaySwipeLearned';
/** The tick reads as done (filled circle, struck task) for this long before
 *  the row folds away, so the user sees what they did. */
const CHECK_HOLD_MS = 650;
/** The fold itself: the row's height eases to zero. */
const COLLAPSE_MS = 280;

/** How far a reminder row must travel, as a share of its width, to act. */
const REMINDER_SWIPE_FRACTION = 0.3;
/** A rightward drag starting this close to the screen's left edge belongs to
 *  the app's edge swipe back (lib/useEdgeSwipeBack, 28px), never to a row. */
const EDGE_GUARD_PX = 36;

/**
 * A Revisit reminder row you can swipe (owner, 2026-10-07):
 * - left: Done, the same as the check button (Feed's toast carries Undo);
 * - right: Snooze, to tomorrow 9:00 AM or a day after a later reminder (the
 *   reveal names where it lands; Feed's toast carries Undo too).
 * Past the threshold the row slides off and the write runs; the live list then
 * drops or re-sorts it. Short of it, the row springs back. A vertical drag is
 * the page scroll and is left alone, as is anything starting at the screen's
 * left edge (the back gesture). The buttons on the row stay for taps, mouse
 * and screen readers, so the swipe is a shortcut, never the only way.
 */
function SwipeableReminder({ onDone, onSnooze, snoozeLabel, children }: {
    onDone?: () => void;
    onSnooze?: () => void;
    snoozeLabel: string;
    children: ReactNode;
}) {
    const [dx, setDx] = useState(0);
    const [dragging, setDragging] = useState(false);
    const [armed, setArmed] = useState(false);
    const rowRef = useRef<HTMLDivElement>(null);
    const drag = useRef<{ id: number; x: number; y: number; axis: 'h' | 'v' | null; armed: boolean } | null>(null);
    const suppressClick = useRef(false);
    const timer = useRef<number | null>(null);
    // A write still owed by a row that slid off; flushed if the row unmounts
    // first (leaving the screen mid-slide never drops it).
    const pending = useRef<(() => void) | null>(null);

    useEffect(() => () => {
        if (timer.current) window.clearTimeout(timer.current);
        const owed = pending.current;
        pending.current = null;
        owed?.();
    }, []);

    if (!onDone && !onSnooze) return <>{children}</>;

    const onPointerDown = (e: React.PointerEvent) => {
        if (!e.isPrimary || e.button !== 0 || pending.current) return;
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: null, armed: false };
    };
    const onPointerMove = (e: React.PointerEvent) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        const mx = e.clientX - d.x;
        const my = e.clientY - d.y;
        if (d.axis === null) {
            if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
            const horizontal = Math.abs(mx) > Math.abs(my);
            const ours = horizontal && (mx < 0 ? !!onDone : (!!onSnooze && d.x > EDGE_GUARD_PX));
            d.axis = ours ? 'h' : 'v';
            if (d.axis === 'h') {
                rowRef.current?.setPointerCapture(e.pointerId);
                setDragging(true);
            }
        }
        if (d.axis !== 'h') return;
        // Only a direction that has an action moves the row.
        const next = Math.max(onDone ? -Infinity : 0, Math.min(onSnooze ? Infinity : 0, mx));
        setDx(next);
        const width = rowRef.current?.offsetWidth ?? 1;
        const isArmed = Math.abs(next) > width * REMINDER_SWIPE_FRACTION;
        if (isArmed !== d.armed) {
            d.armed = isArmed;
            setArmed(isArmed);
            if (isArmed) hapticLight();
        }
    };
    const onPointerEnd = (e: React.PointerEvent) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        drag.current = null;
        if (d.axis !== 'h') return;
        suppressClick.current = true;
        setDragging(false);
        setArmed(false);
        const write = dx < 0 ? onDone : onSnooze;
        if (d.armed && e.type === 'pointerup' && write) {
            const width = rowRef.current?.offsetWidth ?? 400;
            setDx(dx < 0 ? -width : width);
            pending.current = write;
            timer.current = window.setTimeout(() => {
                pending.current = null;
                write();
                // Still here a moment later (a failed write, or a snooze that
                // kept its place in the list): come back.
                timer.current = window.setTimeout(() => setDx(0), 900);
            }, 200);
        } else {
            setDx(0);
        }
    };

    return (
        <div className="relative rounded-2xl overflow-hidden">
            {/* What the swipe reveals, under the row. Left = Done (accent),
                right = Snooze (neutral), each naming what it will do. */}
            {dx < 0 && (
                <div
                    aria-hidden="true"
                    className={`absolute inset-0 flex items-center justify-end gap-1.5 pe-5 text-[13px] font-semibold transition-colors ${armed ? 'bg-accent text-accent-ink' : 'bg-accent/15 text-accent'}`}
                >
                    <CheckCircle2 className="w-4 h-4" />
                    Done
                </div>
            )}
            {dx > 0 && (
                <div
                    aria-hidden="true"
                    className={`absolute inset-0 flex items-center justify-start gap-1.5 ps-5 text-[13px] font-semibold transition-colors ${armed ? 'bg-fill-strong text-text' : 'bg-fill-subtle text-text-muted'}`}
                >
                    <BellRing className="w-4 h-4" />
                    {`Snooze to ${snoozeLabel}`}
                </div>
            )}
            <div
                ref={rowRef}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerEnd}
                onPointerCancel={onPointerEnd}
                onClickCapture={(e) => {
                    if (suppressClick.current) {
                        suppressClick.current = false;
                        e.preventDefault();
                        e.stopPropagation();
                    }
                }}
                className="relative touch-pan-y select-none"
                style={{
                    transform: dx ? `translateX(${dx}px)` : undefined,
                    transition: dragging ? 'none' : 'transform 220ms var(--ease-modal)',
                }}
            >
                {children}
            </div>
        </div>
    );
}

/**
 * One task in Revisit's "Do this" list, Reminders-style.
 *
 * - The task is shown whole: it IS the content. A clamp at two lines cut
 *   every instruction mid-sentence (owner QA on 1343), and four still cut
 *   older long tasks (1344); new saves are capped at 20 words upstream.
 * - The circle is a real checkbox. Ticking fills it, strikes the task, holds a
 *   beat, then folds the row away and THEN writes (Feed's toast carries Undo).
 *   Leaving the screen mid-animation flushes the write instead of losing it.
 * - Swiping the row left past a third of its width is "Not for me": the task
 *   leaves the list without counting as done. Pointer devices also get a
 *   hover button for the same action; screen readers get it as a plain button.
 * - The card line carries the card's category dot, so tasks from the same
 *   area read as related at a glance.
 * The circle keeps one column on the left whatever the task's language, so a
 * mixed Hebrew/English list reads as one list, and the swipe is always left.
 */
function TakeawayRow({ task, cardTitle, color, index, onOpen, onDone, onDismiss }: {
    task: string;
    cardTitle: string;
    /** The source card's category color (the app-wide category dot). */
    color: string;
    /** Position in the list, for the staggered entrance. */
    index: number;
    onOpen: () => void;
    onDone?: () => void;
    onDismiss?: () => void;
}) {
    const dir = getDirection(task);
    const isRtl = dir === 'rtl';
    const [phase, setPhase] = useState<'idle' | 'checked' | 'leaving'>('idle');
    const [dx, setDx] = useState(0);
    const [dragging, setDragging] = useState(false);
    const [armed, setArmed] = useState(false);
    const rowRef = useRef<HTMLDivElement>(null);
    const timers = useRef<number[]>([]);
    // The write this row still owes (done / dismiss), if its animation hasn't
    // finished. Flushed on unmount so navigating away never drops a tick.
    const pending = useRef<(() => void) | null>(null);
    const drag = useRef<{ id: number; x: number; y: number; axis: 'h' | 'v' | null; armed: boolean } | null>(null);
    const suppressClick = useRef(false);

    useEffect(() => () => {
        timers.current.forEach((t) => window.clearTimeout(t));
        const owed = pending.current;
        pending.current = null;
        owed?.();
    }, []);

    const later = (fn: () => void, ms: number) => {
        timers.current.push(window.setTimeout(fn, ms));
    };
    // Fold the row, then write. On success the card leaves the list and this
    // row unmounts; if it is somehow still here a moment later (a failed
    // write), it comes back instead of sitting at zero height.
    const leave = (write: () => void) => {
        pending.current = write;
        setPhase('leaving');
        later(() => {
            pending.current = null;
            write();
            later(() => { setPhase('idle'); setDx(0); }, 1500);
        }, COLLAPSE_MS);
    };

    const tick = () => {
        if (!onDone || phase !== 'idle') return;
        hapticLight();
        setPhase('checked');
        pending.current = onDone;
        later(() => leave(onDone), CHECK_HOLD_MS);
    };
    const dismiss = () => {
        if (!onDismiss || phase !== 'idle') return;
        hapticLight();
        leave(onDismiss);
    };

    const onPointerDown = (e: React.PointerEvent) => {
        if (!onDismiss || phase !== 'idle' || !e.isPrimary || e.button !== 0) return;
        drag.current = { id: e.pointerId, x: e.clientX, y: e.clientY, axis: null, armed: false };
    };
    const onPointerMove = (e: React.PointerEvent) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        const mx = e.clientX - d.x;
        const my = e.clientY - d.y;
        if (d.axis === null) {
            if (Math.abs(mx) < 8 && Math.abs(my) < 8) return;
            // Only a leftward, mostly-horizontal drag is ours: vertical is the
            // page scroll, rightward is the app's edge swipe back.
            d.axis = Math.abs(mx) > Math.abs(my) && mx < 0 ? 'h' : 'v';
            if (d.axis === 'h') {
                rowRef.current?.setPointerCapture(e.pointerId);
                setDragging(true);
            }
        }
        if (d.axis !== 'h') return;
        const next = Math.min(0, mx);
        setDx(next);
        const width = rowRef.current?.offsetWidth ?? 1;
        const armed = -next > width * DISMISS_FRACTION;
        if (armed !== d.armed) {
            d.armed = armed;
            setArmed(armed);
            if (armed) hapticLight();
        }
    };
    const onPointerEnd = (e: React.PointerEvent) => {
        const d = drag.current;
        if (!d || d.id !== e.pointerId) return;
        drag.current = null;
        if (d.axis !== 'h') return;
        suppressClick.current = true;
        setDragging(false);
        setArmed(false);
        if (d.armed && e.type === 'pointerup') {
            setDx(-(rowRef.current?.offsetWidth ?? 400));
            const write = onDismiss!;
            pending.current = write;
            later(() => leave(write), 180);
        } else {
            setDx(0);
        }
    };

    const checked = phase !== 'idle';
    return (
        <div
            className="grid motion-safe:transition-[grid-template-rows,opacity] animate-card-enter"
            style={{
                gridTemplateRows: phase === 'leaving' ? '0fr' : '1fr',
                opacity: phase === 'leaving' ? 0 : 1,
                transitionDuration: `${COLLAPSE_MS}ms`,
                transitionTimingFunction: 'var(--ease-modal)',
                ['--enter-delay' as string]: `${Math.min(index, 8) * 35}ms`,
            }}
        >
            {/* The divider lives on the row, not the list (divide-y): each row
                is its own layer for the swipe, and a layered row painted over
                the hairline above it. */}
            <div className={`relative min-h-0 overflow-hidden ${index > 0 ? 'border-t border-border-subtle' : ''}`}>
                {/* What a left swipe reveals. Neutral, not red: this is "not
                    for me", not a delete; the card itself is untouched. */}
                {onDismiss && dx < 0 && (
                    <div
                        aria-hidden="true"
                        className={`absolute inset-0 flex items-center justify-end gap-1.5 pe-5 text-[13px] font-semibold transition-colors ${armed ? 'bg-fill-strong text-text' : 'bg-fill-subtle text-text-muted'}`}
                    >
                        <CircleSlash className="w-4 h-4" />
                        Not for me
                    </div>
                )}
                <div
                    ref={rowRef}
                    onPointerDown={onPointerDown}
                    onPointerMove={onPointerMove}
                    onPointerUp={onPointerEnd}
                    onPointerCancel={onPointerEnd}
                    onClickCapture={(e) => {
                        if (suppressClick.current) {
                            suppressClick.current = false;
                            e.preventDefault();
                            e.stopPropagation();
                        }
                    }}
                    className="group relative flex items-start gap-1 ps-1.5 pe-3 bg-card touch-pan-y select-none"
                    style={{
                        transform: dx ? `translateX(${dx}px)` : undefined,
                        transition: dragging ? 'none' : 'transform 220ms var(--ease-modal)',
                    }}
                >
                    {onDone && (
                        <button
                            onClick={tick}
                            role="checkbox"
                            aria-checked={checked}
                            aria-label={`Mark “${task}” as done`}
                            title="Mark as done"
                            className="w-11 h-12 shrink-0 flex items-center justify-center cursor-pointer"
                        >
                            <span
                                className={`w-[22px] h-[22px] rounded-full flex items-center justify-center border-[1.5px] transition-all duration-200 ${checked
                                    ? 'bg-accent border-accent scale-100'
                                    : 'border-text-muted/60 [@media(hover:hover)]:hover:border-accent active:scale-90'}`}
                                style={{ transitionTimingFunction: 'var(--ease-spring)' }}
                            >
                                {checked && <Check className="w-3.5 h-3.5 text-accent-ink animate-scale-up" strokeWidth={3} />}
                            </span>
                        </button>
                    )}
                    <button
                        onClick={onOpen}
                        dir={dir}
                        disabled={checked}
                        className="min-w-0 flex-1 py-3 text-start cursor-pointer active:opacity-60 transition-opacity"
                    >
                        <div
                            className={`text-[14.5px] font-medium leading-snug transition-colors duration-200 ${checked
                                ? 'text-text-muted line-through decoration-text-muted/60'
                                : 'text-text [@media(hover:hover)]:group-hover:text-accent'} ${isRtl ? 'font-hebrew' : ''}`}
                        >
                            {task}
                        </div>
                        {cardTitle && (
                            <div className="mt-1 flex items-center gap-1.5 min-w-0 text-[12px] text-text-muted">
                                <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                <span dir="auto" className="truncate">{cardTitle}</span>
                            </div>
                        )}
                    </button>
                    {onDismiss && (
                        // Pointer devices get the swipe's action as a hover
                        // button; touch screen readers still reach it (sr-only).
                        <button
                            onClick={dismiss}
                            aria-label={`Not for me: remove “${task}” from Do this`}
                            title="Not for me"
                            className="sr-only [@media(hover:hover)]:not-sr-only [@media(hover:hover)]:self-center [@media(hover:hover)]:w-8 [@media(hover:hover)]:h-8 [@media(hover:hover)]:shrink-0 [@media(hover:hover)]:flex [@media(hover:hover)]:items-center [@media(hover:hover)]:justify-center [@media(hover:hover)]:rounded-lg [@media(hover:hover)]:text-text-muted [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:hover:text-text [@media(hover:hover)]:hover:bg-fill-subtle focus-visible:opacity-100 transition-opacity cursor-pointer"
                        >
                            <CircleSlash className="w-4 h-4" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

/**
 * A row in the Done list: a closed task, muted. Done tasks keep the filled
 * check and the strike; "Not for me" tasks show the slash and say so on the
 * card line. Tapping the mark puts the task back on the open list; tapping
 * the text opens the card, as in the open list.
 */
function ClosedTakeawayRow({ task, cardTitle, color, dismissed, index, onOpen, onReopen }: {
    task: string;
    cardTitle: string;
    color: string;
    dismissed: boolean;
    index: number;
    onOpen: () => void;
    onReopen?: () => void;
}) {
    const dir = getDirection(task);
    const isRtl = dir === 'rtl';
    return (
        <div className={`flex items-start gap-1 ps-1.5 pe-3 ${index > 0 ? 'border-t border-border-subtle' : ''}`}>
            {onReopen && (
                <button
                    onClick={() => { hapticLight(); onReopen(); }}
                    aria-label={`Move “${task}” back to Do this`}
                    title="Move back to Do this"
                    className="w-11 h-12 shrink-0 flex items-center justify-center cursor-pointer active:scale-90 transition-transform"
                >
                    {dismissed ? (
                        <CircleSlash className="w-[22px] h-[22px] text-text-muted" strokeWidth={1.5} />
                    ) : (
                        <span className="w-[22px] h-[22px] rounded-full flex items-center justify-center bg-accent/70 border-[1.5px] border-transparent">
                            <Check className="w-3.5 h-3.5 text-accent-ink" strokeWidth={3} />
                        </span>
                    )}
                </button>
            )}
            <button
                onClick={onOpen}
                dir={dir}
                className="min-w-0 flex-1 py-3 text-start cursor-pointer active:opacity-60 transition-opacity"
            >
                <div className={`text-[14.5px] font-medium leading-snug text-text-muted ${dismissed ? '' : 'line-through decoration-text-muted/60'} ${isRtl ? 'font-hebrew' : ''}`}>
                    {task}
                </div>
                {cardTitle && (
                    <div className="mt-1 flex items-center gap-1.5 min-w-0 text-[12px] text-text-muted">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0 opacity-70" style={{ backgroundColor: color }} />
                        <span dir="auto" className="truncate">{cardTitle}</span>
                        {dismissed && <span className="shrink-0">· Not for me</span>}
                    </div>
                )}
            </button>
        </div>
    );
}

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
