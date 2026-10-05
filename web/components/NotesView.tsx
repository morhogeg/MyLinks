'use client';

import { useMemo, useState } from 'react';
import { Search, StickyNote, X, ChevronRight } from 'lucide-react';
import type { CardNotes } from '@/lib/notes';
import type { Link, UserNote } from '@/lib/types';
import { getDirection } from '@/lib/rtl';
import { getTimestampNumber } from '@/lib/feedUtils';
import { getCategoryColorStyle } from '@/lib/colors';
import { useNow } from '@/lib/useNow';
import SourceByline from './SourceByline';

/**
 * My Notes — everything the user wrote themselves, one entry per card, newest
 * first. Two kinds of entry share the list (lib/notes getNoteGroups):
 *   - Personal notes, grouped BY CARD (device QA on build 1137: ungrouped rows
 *     made note↔card attachment ambiguous). The card reads as a compact header
 *     (thumbnail when the card has one, title, source, note count), and all of
 *     its notes stack beneath it on accent-tinted panels, newest first.
 *     Tapping opens the card's detail revealed at its notes section (Feed
 *     passes `scrollToNotes`).
 *   - Note cards saved via + → Note (E2E finding E3: a note saved from the
 *     capture sheet used to be missing here, so a new user's first note looked
 *     lost). The entry IS the note: its text leads, with the Note byline and
 *     time beneath, and any personal notes added to it since stack below.
 *     Tapping opens the note at the top.
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
    /** Noted cards with their notes, plus written note cards, newest entry
        first (lib/notes getNoteGroups). */
    groups: CardNotes[];
    /** True while the full-library snapshot is still being fetched — older
        notes may still be on their way. */
    loading?: boolean;
    onOpenCard: (link: Link) => void;
}) {
    const [query, setQuery] = useState('');
    // The shared ticking clock (lib/useNow) — SSR-safe and render-pure.
    const now = useNow();

    // Scale, split by kind: notes you wrote as cards vs. notes on other cards.
    const scale = useMemo(() => {
        let written = 0, onCards = 0, notedCards = 0;
        for (const g of groups) {
            if (g.body) written++;
            onCards += g.notes.length;
            if (g.notes.length > 0) notedCards++;
        }
        return { written, onCards, notedCards };
    }, [groups]);

    // Search: a title match (or, for a note card, a match in its text) keeps
    // the whole entry; otherwise the entry narrows to just its matching notes,
    // so results always show WHY they matched.
    const searching = !!query.trim();
    const { shown, matches } = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return { shown: groups, matches: 0 };
        const out: CardNotes[] = [];
        let count = 0;
        for (const g of groups) {
            if (g.link.title.toLowerCase().includes(q) || (g.body && g.body.toLowerCase().includes(q))) {
                out.push(g);
                count += (g.body ? 1 : 0) + g.notes.length;
                continue;
            }
            const hits = g.notes.filter((n) => n.text.toLowerCase().includes(q));
            if (hits.length > 0) { out.push({ ...g, notes: hits }); count += hits.length; }
        }
        return { shown: out, matches: count };
    }, [groups, query]);
    const plural = (n: number, word: string) => `${n.toLocaleString()} ${word}${n === 1 ? '' : 's'}`;
    const scaleLine = scale.written > 0 && scale.onCards > 0
        ? `${plural(scale.written, 'note')} · ${scale.onCards.toLocaleString()} more on ${plural(scale.notedCards, 'card')}`
        : scale.written > 0
            ? plural(scale.written, 'note')
            : `${plural(scale.onCards, 'note')} on ${plural(scale.notedCards, 'card')}`;

    // The personal notes on a card — the content this view exists for. Each is
    // the SAME bordered accent panel the detail modal renders notes in (one
    // visual language for "your note" everywhere); discrete blocks with real
    // borders survive both themes, unlike a faint full-bleed tint (device QA on
    // build 1140).
    const renderNotes = (notes: UserNote[]) => (
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
                    {searching ? plural(matches, 'matching note') : scaleLine}
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
                            <p className="text-[14px] text-text-muted leading-snug max-w-[280px]">
                                No notes yet. Tap + and choose Note to write one, or open any card and tap “Add a note”. Everything you write collects here.
                            </p>
                        ) : (
                            <p className="text-[14px] text-text-muted leading-snug max-w-[260px]">
                                No notes match. Search looks in note text and card titles.
                            </p>
                        )}
                    </div>
                )
            ) : (
                <div className="space-y-4">
                    {shown.map(({ link, notes, body }, index) => {
                        const open = () => onOpenCard(link);
                        const entryProps = {
                            onClick: open,
                            role: 'button',
                            tabIndex: 0,
                            onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); open(); } },
                            style: { ['--enter-delay' as string]: `${Math.min(index, 12) * 14}ms` },
                            className: 'group surface-card animate-card-enter rounded-[20px] border border-border-subtle bg-card shadow-[var(--shadow-card)] overflow-hidden cursor-pointer transition-all duration-150 [@media(hover:hover)]:hover:border-accent/40 [@media(hover:hover)]:hover:shadow-[var(--shadow-card-hover)] active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40',
                        };
                        const colorStyle = getCategoryColorStyle(link.category);

                        // A note card the user wrote: the entry IS the note. Its
                        // text leads (dir="auto" so Hebrew reads right-to-left on
                        // its own), the Note byline and age sit beneath, and any
                        // personal notes added to it since follow as panels.
                        if (body) {
                            const bodyRtl = getDirection(body) === 'rtl';
                            // A long note's AI heading reads above the text; a
                            // first-line title (short note, or before enrichment)
                            // would just repeat the text's opening.
                            const heading = link.title && !body.startsWith(link.title.replace(/…$/, '')) ? link.title : null;
                            const headingRtl = !!heading && getDirection(heading, link.language) === 'rtl';
                            const writtenAt = getTimestampNumber(link.createdAt) || now;
                            const preview = body.length > 80 ? `${body.slice(0, 80)}…` : body;
                            return (
                                <div
                                    key={link.id}
                                    {...entryProps}
                                    aria-label={`Note: ${preview}${notes.length > 0 ? `, ${notes.length === 1 ? 'one more note' : `${notes.length} more notes`}` : ''}`}
                                >
                                    {/* Mirrors per note direction, like the card
                                        header below: a Hebrew note puts its byline
                                        and age on the right, chevron at the logical end. */}
                                    <div dir={bodyRtl ? 'rtl' : 'ltr'} className="relative ps-4 pe-3 py-3">
                                        {link.category && (
                                            <span
                                                className="absolute start-0 inset-y-2.5 w-1.5 rounded-full"
                                                style={{ backgroundColor: colorStyle.backgroundColor }}
                                                aria-hidden
                                            />
                                        )}
                                        {heading && (
                                            <h3 dir="auto" className={`mb-1 line-clamp-2 font-semibold text-[15px] leading-snug text-text transition-colors [@media(hover:hover)]:group-hover:text-accent ${headingRtl ? 'font-hebrew' : ''}`}>
                                                {heading}
                                            </h3>
                                        )}
                                        <p dir="auto" className={`line-clamp-6 text-[15px] text-text whitespace-pre-wrap leading-relaxed ${bodyRtl ? 'font-hebrew' : ''}`}>
                                            {body}
                                        </p>
                                        <div className="mt-2 flex items-center gap-1.5 min-w-0 text-[11px] text-text-muted">
                                            <SourceByline link={link} />
                                            <span aria-hidden className="text-text-muted/60">·</span>
                                            <span className="shrink-0 font-medium text-text-muted/80">{timeAgo(writtenAt, now, bodyRtl)}</span>
                                            <ChevronRight className="ms-auto w-4 h-4 shrink-0 text-text-muted/60 rtl:rotate-180" />
                                        </div>
                                    </div>
                                    {notes.length > 0 && renderNotes(notes)}
                                </div>
                            );
                        }

                        const titleRtl = getDirection(link.title, link.language) === 'rtl';
                        const thumb = link.metadata?.thumbnailUrl;
                        return (
                            <div
                                key={link.id}
                                {...entryProps}
                                aria-label={`${link.title}: ${notes.length === 1 ? 'one note' : `${notes.length} notes`}`}
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
                                {renderNotes(notes)}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
