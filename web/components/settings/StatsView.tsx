'use client';

import { useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { loadStats, LibraryStats } from '@/lib/stats';
import { LargeTitle, SectionHeader, Footnote, List, RowShell, RowText } from './primitives';

/**
 * Settings → Insights: a birds-eye view of the library, computed entirely
 * on-device (see lib/stats.ts). Single-hue accent marks throughout — length
 * carries the magnitude, so no categorical palette is needed; all text stays
 * in text tokens.
 */

const MAX_CATEGORY_ROWS = 6;

function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
    return (
        <div className="rounded-[14px] border border-border-subtle bg-card px-3.5 py-3 min-w-0">
            <div className="text-[12px] text-text-muted leading-tight truncate">{label}</div>
            <div className="text-[22px] font-semibold text-text tracking-[-0.01em] mt-1 leading-none">{value}</div>
            {note && <div className="text-[11.5px] text-text-muted mt-1.5 leading-tight truncate">{note}</div>}
        </div>
    );
}

/** 12 columns, accent fill, rounded caps, square baseline; a 2px stub marks a
    quiet week so the axis never has holes. */
function WeeklyChart({ stats }: { stats: LibraryStats }) {
    const max = Math.max(...stats.weeks.map((w) => w.count), 1);
    const fmt = (ms: number) =>
        new Date(ms).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    return (
        <div className="rounded-[14px] border border-border-subtle bg-card px-4 pt-4 pb-3">
            <div className="flex items-end gap-[6px] h-16">
                {stats.weeks.map((w) => (
                    <div key={w.start} className="flex-1 max-w-[24px] mx-auto flex flex-col justify-end h-full" title={`Week of ${fmt(w.start)} — ${w.count} save${w.count === 1 ? '' : 's'}`}>
                        <div
                            className={`w-full rounded-t-[4px] ${w.count > 0 ? 'bg-accent' : 'bg-border-subtle'}`}
                            style={{ height: w.count > 0 ? `${Math.max((w.count / max) * 100, 6)}%` : '2px' }}
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
    light accent track underneath. Widths are relative to the biggest category. */
function CategoryBars({ stats }: { stats: LibraryStats }) {
    const shown = stats.categories.slice(0, MAX_CATEGORY_ROWS);
    const rest = stats.categories.slice(MAX_CATEGORY_ROWS);
    const rows = rest.length > 0
        ? [...shown, { name: `Other (${rest.length} more)`, count: rest.reduce((s, c) => s + c.count, 0) }]
        : shown;
    const max = Math.max(...rows.map((r) => r.count), 1);
    return (
        <div className="rounded-[14px] border border-border-subtle bg-card px-4 py-3.5 space-y-3">
            {rows.map((row) => (
                <div key={row.name}>
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                        <span className="text-[13.5px] text-text truncate">{row.name}</span>
                        <span className="text-[13px] text-text-muted tabular-nums shrink-0">{row.count}</span>
                    </div>
                    <div className="h-2 rounded-full bg-accent/10 overflow-hidden">
                        <div className="h-full rounded-full bg-accent" style={{ width: `${(row.count / max) * 100}%` }} />
                    </div>
                </div>
            ))}
        </div>
    );
}

function CountPills({ items }: { items: { name: string; count: number }[] }) {
    return (
        <div className="flex flex-wrap gap-2">
            {items.map((t) => (
                <span key={t.name} className="inline-flex items-center gap-1.5 px-3 h-8 rounded-full bg-card border border-border-subtle text-[12.5px] font-medium text-text-secondary">
                    {t.name}
                    <span className="text-text-muted tabular-nums">{t.count}</span>
                </span>
            ))}
        </div>
    );
}

export function StatsView({ uid }: { uid: string }) {
    const [stats, setStats] = useState<LibraryStats | null>(null);
    const [failed, setFailed] = useState(false);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        let cancelled = false;
        setFailed(false);
        loadStats(uid)
            .then((s) => { if (!cancelled) setStats(s); })
            .catch(() => { if (!cancelled) setFailed(true); });
        return () => { cancelled = true; };
    }, [uid, attempt]);

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
                <div className="flex justify-center py-16">
                    <div className="w-7 h-7 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                </div>
            </>
        );
    }

    if (stats.total === 0) {
        return (
            <>
                <LargeTitle>Insights</LargeTitle>
                <Footnote>Nothing to chart yet — save a few links and this becomes your library&apos;s birds-eye view.</Footnote>
            </>
        );
    }

    const readPct = Math.round((stats.readCount / stats.total) * 100);
    const since = stats.firstSaveAt
        ? new Date(stats.firstSaveAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })
        : null;

    return (
        <>
            <LargeTitle>Insights</LargeTitle>

            <div className="grid grid-cols-3 gap-2.5 pt-2">
                <StatTile
                    label="Saved"
                    value={String(stats.total)}
                    note={stats.savedThisMonth > 0 ? `+${stats.savedThisMonth} this month` : since ? `since ${since}` : undefined}
                />
                <StatTile label="Read" value={`${readPct}%`} note={`${stats.readCount} of ${stats.total}`} />
                <StatTile
                    label="Streak"
                    value={`${stats.streakDays}d`}
                    note={stats.streakDays > 0 ? 'days saving in a row' : 'save today to start one'}
                />
            </div>

            <SectionHeader>Saves per week</SectionHeader>
            <WeeklyChart stats={stats} />

            <SectionHeader>Categories</SectionHeader>
            <CategoryBars stats={stats} />

            {stats.topTags.length > 0 && (
                <>
                    <SectionHeader>Top tags</SectionHeader>
                    <CountPills items={stats.topTags} />
                </>
            )}

            {stats.topDomains.length > 0 && (
                <>
                    <SectionHeader>Top sources</SectionHeader>
                    <List tight>
                        {stats.topDomains.map((d) => (
                            <RowShell key={d.name}>
                                <RowText title={d.name} />
                                <span className="ml-auto text-[15px] text-text-muted tabular-nums">{d.count}</span>
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
        </>
    );
}
