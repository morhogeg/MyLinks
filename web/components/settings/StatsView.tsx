'use client';

import { useEffect, useRef, useState } from 'react';
import { RefreshCw, BarChart3, StickyNote } from 'lucide-react';
import { loadStats, LibraryStats, LibraryFacetRequest } from '@/lib/stats';
import { track } from '@/lib/analytics';
import { LargeTitle, SectionHeader, Footnote, List, RowShell, RowText, Chevron } from './primitives';

/**
 * Settings → Insights: a birds-eye view of the library, computed entirely
 * on-device (see lib/stats.ts). Single-hue accent marks throughout — length
 * carries the magnitude, so no categorical palette is needed; all text stays
 * in text tokens. Marks grow in on mount (700ms, --ease-modal, staggered);
 * `motion-reduce:transition-none` respects reduced-motion.
 */

const MAX_CATEGORY_ROWS = 6;

// Where the user was in the Insights screen when they tapped through to the
// library. "Back to Insights" remounts the whole Settings sheet, so this lives
// at module level (session-scoped) and is consumed one-shot on restore.
let savedScrollTop: number | null = null;
const GROW = 'transition-all duration-700 motion-reduce:transition-none';
const GROW_EASE = 'var(--ease-modal)';

/** 90 → "1h 30m", 45 → "45m", 900 → "15h" — compact, no false precision. */
function formatMinutes(min: number): string {
    if (min < 60) return `${Math.round(min)}m`;
    const h = Math.floor(min / 60);
    if (h >= 10) return `${h}h`;
    const m = Math.round(min % 60);
    return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

/** Weekday name for a 0=Sun … 6=Sat index, in the user's locale. */
function weekdayName(idx: number): string {
    // 2021-08-01 was a Sunday; offsetting from it yields each weekday.
    return new Date(2021, 7, 1 + idx).toLocaleDateString(undefined, { weekday: 'long' });
}

function StatTile({ label, value, note, accentNote }: { label: string; value: string; note?: string; accentNote?: boolean }) {
    return (
        <div className="rounded-[14px] border border-border-subtle bg-card px-3.5 py-3 min-w-0">
            <div className="text-[12px] text-text-muted leading-tight truncate">{label}</div>
            <div className="text-[22px] font-semibold text-text tracking-[-0.01em] mt-1 leading-none">{value}</div>
            {note && (
                <div className={`text-[11.5px] mt-1.5 leading-tight truncate ${accentNote ? 'text-accent font-medium' : 'text-text-muted'}`}>
                    {note}
                </div>
            )}
        </div>
    );
}

/** 12 columns, accent fill (current week wears the accent gradient), rounded
    caps, square baseline; a 2px stub marks a quiet week so the axis never has
    holes. Columns grow up from the baseline on mount, gently staggered. */
function WeeklyChart({ stats, grown }: { stats: LibraryStats; grown: boolean }) {
    const max = Math.max(...stats.weeks.map((w) => w.count), 1);
    const fmt = (ms: number) =>
        new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const last = stats.weeks.length - 1;
    return (
        <div className="rounded-[14px] border border-border-subtle bg-card px-4 pt-4 pb-3">
            <div className="flex items-end gap-[6px] h-16">
                {stats.weeks.map((w, i) => (
                    <div key={w.start} className="flex-1 max-w-[24px] mx-auto flex flex-col justify-end h-full" title={`Week of ${fmt(w.start)} — ${w.count} save${w.count === 1 ? '' : 's'}`}>
                        <div
                            className={`w-full rounded-t-[4px] ${GROW} ${w.count === 0 ? 'bg-border-subtle' : i === last ? 'bg-[image:var(--accent-gradient)]' : 'bg-accent'}`}
                            style={{
                                height: w.count > 0 && grown ? `${Math.max((w.count / max) * 100, 6)}%` : '2px',
                                transitionTimingFunction: GROW_EASE,
                                transitionDelay: `${i * 30}ms`,
                            }}
                        />
                    </div>
                ))}
            </div>
            <div className="h-px bg-border-subtle" />
            <div className="flex justify-between pt-1.5 text-[11px] text-text-muted">
                <span>{fmt(stats.weeks[0].start)}</span>
                <span>This week</span>
            </div>
        </div>
    );
}

/** Horizontal magnitude bars: label + count in text tokens, an accent bar on a
    light accent track underneath. Widths are relative to the biggest category
    and grow in from zero on mount. Real categories are tappable — they open
    the library filtered to that category ("Other" is an aggregate, so it
    isn't). */
function CategoryBars({ stats, grown, onOpen }: { stats: LibraryStats; grown: boolean; onOpen?: (category: string) => void }) {
    const shown = stats.categories.slice(0, MAX_CATEGORY_ROWS);
    const rest = stats.categories.slice(MAX_CATEGORY_ROWS);
    const rows = rest.length > 0
        ? [...shown, { name: `Other (${rest.length} more)`, count: rest.reduce((s, c) => s + c.count, 0), aggregate: true }]
        : shown;
    const max = Math.max(...rows.map((r) => r.count), 1);
    return (
        <div className="rounded-[14px] border border-border-subtle bg-card px-4 py-3.5 space-y-3">
            {rows.map((row, i) => {
                const tappable = onOpen && !('aggregate' in row);
                const inner = (
                    <>
                        <div className="flex items-baseline justify-between gap-3 mb-1">
                            <span className="text-[13.5px] text-text truncate">{row.name}</span>
                            <span className="text-[13px] text-text-muted tabular-nums shrink-0 inline-flex items-center gap-1">
                                {row.count.toLocaleString()}
                                {tappable && <Chevron />}
                            </span>
                        </div>
                        <div className="h-2 rounded-full bg-accent/10 overflow-hidden">
                            <div
                                className={`h-full rounded-full bg-accent ${GROW}`}
                                style={{
                                    width: grown ? `${(row.count / max) * 100}%` : '0%',
                                    transitionTimingFunction: GROW_EASE,
                                    transitionDelay: `${i * 40}ms`,
                                }}
                            />
                        </div>
                    </>
                );
                const title = `${row.name} — ${Math.round((row.count / stats.total) * 100)}% of your library`;
                return tappable ? (
                    <button
                        key={row.name}
                        onClick={() => onOpen(row.name)}
                        title={`Show ${row.name} cards`}
                        className="block w-full text-left rounded-lg -mx-1.5 px-1.5 py-0.5 hover:bg-card-hover transition-colors cursor-pointer"
                    >
                        {inner}
                    </button>
                ) : (
                    <div key={row.name} title={title} className="px-0 py-0.5">
                        {inner}
                    </div>
                );
            })}
        </div>
    );
}

function CountPills({ items, onOpen }: { items: { name: string; count: number }[]; onOpen?: (name: string) => void }) {
    const cls = 'inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-card border border-border-subtle text-[12.5px] font-medium text-text-secondary';
    return (
        <div className="flex flex-wrap gap-2">
            {items.map((t) =>
                onOpen ? (
                    <button
                        key={t.name}
                        onClick={() => onOpen(t.name)}
                        title={`Show cards tagged ${t.name}`}
                        className={`${cls} hover:text-text hover:border-accent/40 transition-colors cursor-pointer`}
                    >
                        {t.name}
                        <span className="text-text-muted tabular-nums">{t.count.toLocaleString()}</span>
                    </button>
                ) : (
                    <span key={t.name} className={cls}>
                        {t.name}
                        <span className="text-text-muted tabular-nums">{t.count.toLocaleString()}</span>
                    </span>
                ),
            )}
        </div>
    );
}

/** Shimmering placeholders in the exact final layout, so content doesn't jump. */
function Skeleton() {
    return (
        <div className="animate-pulse">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2">
                {[0, 1, 2, 3].map((i) => (
                    <div key={i} className="rounded-[14px] border border-border-subtle bg-card h-[86px]" />
                ))}
            </div>
            <div className="mt-9 rounded-[14px] border border-border-subtle bg-card h-28" />
            <div className="mt-9 rounded-[14px] border border-border-subtle bg-card h-56" />
        </div>
    );
}

export function StatsView({ uid, onOpenFacet, restoreScroll }: {
    uid: string;
    /** Open the library filtered to a facet (closes Settings). Rows/pills are
        only tappable when this is provided. */
    onOpenFacet?: (req: LibraryFacetRequest) => void;
    /** True when this mount came from the feed's "Back to Insights" chip —
        restore the scroll position saved when the user tapped through. */
    restoreScroll?: boolean;
}) {
    const [stats, setStats] = useState<LibraryStats | null>(null);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);
    // Flips true one frame after stats land, so bars/columns transition from
    // zero to their real size instead of appearing fully grown.
    const [grown, setGrown] = useState(false);
    const rootRef = useRef<HTMLDivElement>(null);

    // One handler for every tappable row: remember where the user is in the
    // sheet (so Back can land them right here), then hand off to the page.
    const openFacet = (req: LibraryFacetRequest) => {
        savedScrollTop = rootRef.current?.closest('.overflow-y-auto')?.scrollTop ?? null;
        track('insights_facet_opened', { kind: req.kind });
        onOpenFacet?.(req);
    };

    useEffect(() => {
        let cancelled = false;
        setFailed(false);
        loadStats(uid)
            .then((s) => {
                if (cancelled) return;
                setStats(s);
                track('insights_opened', { total: s.total });
            })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => { cancelled = true; };
    }, [uid, attempt]);

    useEffect(() => {
        if (!stats) return;
        const raf = requestAnimationFrame(() => requestAnimationFrame(() => setGrown(true)));
        return () => cancelAnimationFrame(raf);
    }, [stats]);

    // Back-from-library: put the sheet back exactly where the user tapped.
    // Runs once the real content is mounted (stats are session-cached, so
    // that's the first paint) and consumes the saved position one-shot.
    useEffect(() => {
        if (!stats || !restoreScroll || savedScrollTop === null) return;
        const scroller = rootRef.current?.closest('.overflow-y-auto');
        if (scroller) scroller.scrollTop = savedScrollTop;
        savedScrollTop = null;
    }, [stats, restoreScroll]);

    if (failed) {
        return (
            <>
                <LargeTitle>Insights</LargeTitle>
                <button
                    onClick={() => setAttempt((a) => a + 1)}
                    className="mt-2 inline-flex items-center gap-1.5 text-sm text-red-400 hover:text-red-300 transition-colors cursor-pointer"
                >
                    <RefreshCw className="w-4 h-4" />
                    Couldn&apos;t load your stats — retry
                </button>
            </>
        );
    }

    if (!stats) {
        return (
            <>
                <LargeTitle>Insights</LargeTitle>
                <Skeleton />
            </>
        );
    }

    if (stats.total === 0) {
        return (
            <>
                <LargeTitle>Insights</LargeTitle>
                <div className="flex flex-col items-center text-center gap-3 py-16">
                    <span className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
                        <BarChart3 className="w-6 h-6" />
                    </span>
                    <p className="text-[14px] text-text-muted leading-snug max-w-[240px]">
                        Nothing to chart yet — save a few links and this becomes your library&apos;s birds-eye view.
                    </p>
                </div>
            </>
        );
    }

    const readPct = Math.round((stats.readCount / stats.total) * 100);
    // "in July" beats "this month": it's friendlier AND short enough that the
    // note never truncates in a 3-across tile on a 375px phone.
    const monthName = new Date().toLocaleDateString(undefined, { month: 'long' });
    const since = stats.firstSaveAt
        ? new Date(stats.firstSaveAt).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
        : null;
    const hasReadTime = stats.totalReadMinutes > 0;

    return (
        <div ref={rootRef} className="animate-fade-in">
            <LargeTitle>Insights</LargeTitle>
            {since && (
                <p className="text-[13px] text-text-muted px-1 -mt-1">Your library since {since}</p>
            )}

            <div className={`grid gap-2.5 pt-3 ${hasReadTime ? 'grid-cols-2 sm:grid-cols-4' : 'grid-cols-3'}`}>
                <StatTile
                    label="Saved"
                    value={stats.total.toLocaleString()}
                    note={stats.savedThisMonth > 0 ? `+${stats.savedThisMonth.toLocaleString()} in ${monthName}` : `none yet in ${monthName}`}
                    accentNote={stats.savedThisMonth > 0}
                />
                <StatTile label="Read" value={`${readPct}%`} note={`${stats.readCount.toLocaleString()} of ${stats.total.toLocaleString()}`} />
                <StatTile
                    label="Streak"
                    value={String(stats.streakDays)}
                    note={stats.streakDays === 1 ? 'day in a row' : stats.streakDays > 1 ? 'days in a row' : 'save today to start one'}
                />
                {hasReadTime && (
                    <StatTile label="Reading time" value={formatMinutes(stats.totalReadMinutes)} note="captured for later" />
                )}
            </div>

            <SectionHeader>Saves per week</SectionHeader>
            <WeeklyChart stats={stats} grown={grown} />
            {stats.busiestWeekday !== null && (
                <Footnote>Most of your saving happens on {weekdayName(stats.busiestWeekday)}s.</Footnote>
            )}

            {stats.noteCount > 0 && (
                <>
                    <SectionHeader>Notes</SectionHeader>
                    <List>
                        <RowShell
                            tile={<StickyNote className="w-[17px] h-[17px]" />}
                            onClick={onOpenFacet && (() => openFacet({ kind: 'notes', value: '' }))}
                        >
                            <RowText
                                title="My notes"
                                sub={`${stats.noteCount.toLocaleString()} note${stats.noteCount === 1 ? '' : 's'} on ${stats.notedCards.toLocaleString()} card${stats.notedCards === 1 ? '' : 's'}`}
                            />
                            {onOpenFacet && <Chevron />}
                        </RowShell>
                    </List>
                </>
            )}

            <SectionHeader>Categories</SectionHeader>
            <CategoryBars
                stats={stats}
                grown={grown}
                onOpen={onOpenFacet && ((category) => openFacet({ kind: 'category', value: category }))}
            />

            {stats.topTags.length > 0 && (
                <>
                    <SectionHeader>Top tags</SectionHeader>
                    <CountPills
                        items={stats.topTags}
                        onOpen={onOpenFacet && ((tag) => openFacet({ kind: 'tag', value: tag }))}
                    />
                </>
            )}

            {stats.topSources.length > 0 && (
                <>
                    <SectionHeader>Top sources</SectionHeader>
                    <List tight>
                        {stats.topSources.map((d) => (
                            <RowShell
                                key={d.key}
                                onClick={onOpenFacet && (() => openFacet({ kind: 'source', value: d.key }))}
                            >
                                <RowText title={d.name} />
                                <span className="ml-auto text-[15px] text-text-muted tabular-nums">{d.count.toLocaleString()}</span>
                                {onOpenFacet && <Chevron />}
                            </RowShell>
                        ))}
                    </List>
                </>
            )}

            {stats.sourceMix.length > 1 && (
                <>
                    <SectionHeader>How you capture</SectionHeader>
                    <CountPills items={stats.sourceMix} />
                </>
            )}

            <Footnote>Computed on this device from your saved cards. Private cards aren&apos;t included.</Footnote>
        </div>
    );
}
