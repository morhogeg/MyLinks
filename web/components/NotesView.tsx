'use client';

import { useMemo, useState } from 'react';
import { Search, StickyNote, X, ChevronRight } from 'lucide-react';
import type { CardNotes } from '@/lib/notes';
import type { Link } from '@/lib/types';
import { getDirection } from '@/lib/rtl';
import { getCategoryColorStyle } from '@/lib/colors';
import { useNow } from '@/lib/useNow';
import SourceByline from './SourceByline';

/**
 * My Notes — every personal note across the library, grouped BY CARD (device
 * QA on build 1137: ungrouped rows made note↔card attachment ambiguous). One
 * container per noted card, ordered by its newest note: the card reads as a
 * compact header (thumbnail when the card has one, title, source, note count),
 * and all of its notes stack beneath it on an accent-tinted panel, newest
 * first. Tapping anywhere in the group opens the card's detail modal revealed
 * at its notes section (Feed passes `scrollToNotes`).
 *
 * Pure client-side: the parent passes the already privacy/pending-filtered
 * groups (Feed merges the live window with the full-library snapshot, so
 * notes on cards older than the loaded feed still appear).
 */

/** Compact relative date, matching the card surfaces; falls to an absolute
    date past ~30 days so old notes stay meaningful. */
function timeAgo(ms: number, now: number, rtl: boolean): string {
    if (!ms || ms <= 0) return rtl ? 'לאחרונה' : 'recently';
    const seconds = Math.floor((now - ms) / 1000);
    if (seconds < 60) return rtl ? 'זה עתה' : 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return rtl ? `לפני ${minutes} דק׳` : `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return rtl ? `לפני ${hours} שע׳` : `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days <= 30) return rtl ? `לפני ${days} ימים` : `${days}d ago`;
    return new Date(ms).toLocaleDateString(rtl ? 'he-IL' : undefined, {
        month: 'short', day: 'numeric', year: 'numeric',
    });
}

export default function NotesView({
    groups,
    loading,
    onOpenCard,
}: {
    /** Noted cards with their notes, newest group first (lib/notes getNoteGroups). */
    groups: CardNotes[];
    /** True while the full-library snapshot is still being fetched — older
        notes may still be on their way. */
    loading?: boolean;
    onOpenCard: (link: Link) => void;
}) {
    const [query, setQuery] = useState('');
    // The shared ticking clock (lib/useNow) — SSR-safe and render-pure.
    const now = useNow();

    const totalNotes = useMemo(
        () => groups.reduce((sum, g) => sum + g.notes.length, 0),
        [groups],
    );

    // Search: a title match keeps the whole group; otherwise the group narrows
    // to just its matching notes — so results always show WHY they matched.
    const searching = !!query.trim();
    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return groups;
        const out: CardNotes[] = [];
        for (const g of groups) {
            if (g.link.title.toLowerCase().includes(q)) { out.push(g); continue; }
            const hits = g.notes.filter((n) => n.text.toLowerCase().includes(q));
            if (hits.length > 0) out.push({ ...g, notes: hits });
        }
        return out;
    }, [groups, query]);
    const shownNotes = useMemo(
        () => shown.reduce((sum, g) => sum + g.notes.length, 0),
        [shown],
    );

    return (
        <div className="max-w-2xl mx-auto w-full">
            {/* Search within notes — the app's canonical search field. Shown
                once there's anything to search. */}
            {groups.length > 0 && (
                <div className="relative mb-2.5">
                    <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted pointer-events-none" />
                    <input
                        type="text"
                        dir="auto"
                        enterKeyHint="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
                        placeholder="Search your notes…"
                        className="w-full h-10 ps-9 pe-9 bg-card border border-border-subtle rounded-full text-[15px] text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-transparent transition-shadow"
                    />
                    {query && (
                        <button
                            onClick={() => setQuery('')}
                            aria-label="Clear search"
                            className="absolute end-2 top-1/2 -translate-y-1/2 p-1 rounded-full text-text-muted hover:text-text hover:bg-fill-strong transition-colors"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    )}
                </div>
            )}

            {/* One quiet line of scale — or of results while searching. */}
            {groups.length > 0 && (
                <p className="text-[12px] text-text-muted px-1.5 mb-3" aria-live="polite">
                    {searching
                        ? `${shownNotes.toLocaleString()} matching note${shownNotes === 1 ? '' : 's'}`
                        : `${totalNotes.toLocaleString()} note${totalNotes === 1 ? '' : 's'} on ${groups.length.toLocaleString()} card${groups.length === 1 ? '' : 's'}`}
                </p>
            )}

            {loading && (
                <div className="flex items-center gap-2 mb-4 text-xs" aria-live="polite">
                    <div className="w-3.5 h-3.5 border-2 border-accent/20 border-t-accent rounded-full animate-spin shrink-0" />
                    <span className="text-text-muted font-medium">Loading your library…</span>
                </div>
            )}

            {shown.length === 0 ? (
                !loading && (
                    <div className="flex flex-col items-center text-center gap-3 py-16 animate-fade-in">
                        <span className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
                            {groups.length === 0 ? <StickyNote className="w-6 h-6" /> : <Search className="w-6 h-6" />}
                        </span>
                        {groups.length === 0 ? (
                            <p className="text-[14px] text-text-muted leading-snug max-w-[260px]">
                                No notes yet — open any card and tap “Add a note”. Everything you write collects here.
                            </p>
                        ) : (
                            <p className="text-[14px] text-text-muted leading-snug max-w-[260px]">
                                No notes match — search looks in note text and card titles.
                            </p>
                        )}
                    </div>
                )
            ) : (
                <div className="space-y-4">
                    {shown.map(({ link, notes }, index) => {
                        const titleRtl = getDirection(link.title, link.language) === 'rtl';
                        const colorStyle = getCategoryColorStyle(link.category);
                        const thumb = link.metadata?.thumbnailUrl;
                        return (
                            <div
                                key={link.id}
                                onClick={() => onOpenCard(link)}
                                role="button"
                                tabIndex={0}
                                aria-label={`${link.title} — ${notes.length === 1 ? 'one note' : `${notes.length} notes`}`}
                                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpenCard(link); } }}
                                style={{ ['--enter-delay' as string]: `${Math.min(index, 12) * 14}ms` }}
                                className="group surface-card animate-card-enter rounded-[20px] border border-border-subtle bg-card shadow-[var(--shadow-card)] overflow-hidden cursor-pointer transition-all duration-150 [@media(hover:hover)]:hover:border-accent/40 [@media(hover:hover)]:hover:shadow-[var(--shadow-card-hover)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
                            >
                                {/* Card header — the anchor the notes hang from. Mirrors
                                    per card language so Hebrew cards read right-to-left
                                    coherently, chevron always at the logical end. */}
                                <div dir={titleRtl ? 'rtl' : 'ltr'} className="relative flex items-center gap-3 ps-4 pe-3 py-3">
                                    <span
                                        className="absolute start-0 inset-y-2.5 w-1.5 rounded-full"
                                        style={{ backgroundColor: colorStyle.backgroundColor }}
                                        aria-hidden
                                    />
                                    {thumb && (
                                        <img
                                            src={thumb}
                                            alt=""
                                            loading="lazy"
                                            className="w-11 h-11 rounded-lg object-cover shrink-0 bg-fill-subtle"
                                        />
                                    )}
                                    <div className="flex-1 min-w-0">
                                        <h3 className={`line-clamp-2 font-semibold text-[15px] leading-snug text-text transition-colors [@media(hover:hover)]:group-hover:text-accent ${titleRtl ? 'font-hebrew' : ''}`}>
                                            {link.title}
                                        </h3>
                                        <div className={`mt-1 flex items-center gap-1.5 min-w-0 text-[11px] text-text-muted ${titleRtl ? 'justify-end' : ''}`} dir="ltr">
                                            <SourceByline link={link} />
                                        </div>
                                    </div>
                                    {notes.length > 1 && (
                                        <span className="shrink-0 inline-flex items-center gap-1 px-2 h-6 rounded-full bg-accent/10 text-accent text-[11px] font-bold tabular-nums">
                                            <StickyNote className="w-3 h-3" />
                                            {notes.length}
                                        </span>
                                    )}
                                    <ChevronRight className="w-4 h-4 shrink-0 text-text-muted/60 rtl:rotate-180" />
                                </div>

                                {/* The notes — the content this view exists for. Each is
                                    the SAME bordered accent panel the detail modal renders
                                    notes in (one visual language for "your note" everywhere);
                                    discrete blocks with real borders survive both themes,
                                    unlike a faint full-bleed tint (device QA on build 1140). */}
                                <div className="px-3 pb-3 space-y-2">
                                    {notes.map((n) => {
                                        const noteRtl = getDirection(n.text) === 'rtl';
                                        return (
                                            <div key={n.id} dir={noteRtl ? 'rtl' : 'ltr'} className="rounded-xl bg-accent/[0.06] border border-accent/15 px-3.5 py-3">
                                                <p className={`text-[15px] text-text whitespace-pre-wrap leading-relaxed ${noteRtl ? 'font-hebrew' : ''}`}>
                                                    {n.text}
                                                </p>
                                                <span className="mt-1.5 block text-[11px] font-medium text-text-muted/60">
                                                    {timeAgo(n.updatedAt ?? n.createdAt, now, noteRtl)}
                                                </span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
