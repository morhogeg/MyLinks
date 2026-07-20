'use client';

import { useMemo, useState } from 'react';
import { Search, StickyNote, X, ChevronRight } from 'lucide-react';
import type { NoteWithCard } from '@/lib/notes';
import type { Link } from '@/lib/types';
import { getDirection } from '@/lib/rtl';
import { getCategoryColorStyle } from '@/lib/colors';
import { useNow } from '@/lib/useNow';
import SourceByline from './SourceByline';

/**
 * My Notes — the central view of every personal note across the library,
 * newest first, each with the card it was written on attached. Rows are
 * note-centric (the note is the content, the card is context): the note reads
 * in the same accent panel the detail modal uses, and the card strip below it
 * opens the card's detail modal — landing right next to the note editor.
 *
 * Pure client-side: the parent passes the already privacy/pending-filtered
 * {note, link} pairs (Feed merges the live window with the full-library
 * snapshot, so notes on cards older than the loaded feed still appear).
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
    notes,
    loading,
    onOpenCard,
}: {
    /** Every {note, link} pair, newest first (lib/notes getAllNotes). */
    notes: NoteWithCard[];
    /** True while the full-library snapshot is still being fetched — older
        notes may still be on their way. */
    loading?: boolean;
    onOpenCard: (link: Link) => void;
}) {
    const [query, setQuery] = useState('');
    // The shared ticking clock (lib/useNow) — SSR-safe and render-pure.
    const now = useNow();

    const shown = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return notes;
        return notes.filter(({ note, link }) =>
            note.text.toLowerCase().includes(q) || link.title.toLowerCase().includes(q));
    }, [notes, query]);

    return (
        <div className="max-w-2xl mx-auto w-full">
            {/* Search within notes — shown once there's anything to search. */}
            {notes.length > 0 && (
                <div className="relative mb-4">
                    <Search className="absolute start-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                    <input
                        type="text"
                        dir="auto"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Escape') setQuery(''); }}
                        placeholder="Search your notes…"
                        className="w-full ps-9 pe-10 py-2 bg-card rounded-xl text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent/30 transition-all"
                    />
                    {query && (
                        <button
                            onClick={() => setQuery('')}
                            aria-label="Clear search"
                            className="absolute end-2 top-1/2 -translate-y-1/2 p-1.5 hover:bg-fill-strong rounded-full transition-all"
                        >
                            <X className="w-4 h-4 text-text-muted" />
                        </button>
                    )}
                </div>
            )}

            {loading && (
                <div className="flex items-center gap-2 mb-4 text-xs" aria-live="polite">
                    <div className="w-3.5 h-3.5 border-2 border-accent/20 border-t-accent rounded-full animate-spin shrink-0" />
                    <span className="text-text-muted font-medium">Loading your library…</span>
                </div>
            )}

            {shown.length === 0 ? (
                !loading && (
                    <div className="flex flex-col items-center text-center gap-3 py-16">
                        <span className="w-12 h-12 rounded-2xl bg-accent/10 text-accent flex items-center justify-center">
                            <StickyNote className="w-6 h-6" />
                        </span>
                        {notes.length === 0 ? (
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
                <div className="space-y-3">
                    {shown.map(({ note, link }) => {
                        const noteRtl = getDirection(note.text) === 'rtl';
                        const titleRtl = getDirection(link.title, link.language) === 'rtl';
                        const colorStyle = getCategoryColorStyle(link.category);
                        return (
                            <div key={`${link.id}:${note.id}`} className="rounded-xl bg-accent/[0.06] border border-accent/15 overflow-hidden">
                                {/* The note itself — the row's content. */}
                                <div className="px-4 py-3.5">
                                    <p dir="auto" className={`text-[15px] text-text whitespace-pre-wrap leading-relaxed ${noteRtl ? 'text-right' : ''}`}>
                                        {note.text}
                                    </p>
                                    <span className={`mt-2 block text-[11px] font-medium text-text-muted/60 ${noteRtl ? 'text-right' : ''}`}>
                                        {timeAgo(note.updatedAt ?? note.createdAt, now, noteRtl)}
                                    </span>
                                </div>
                                {/* The card it was written on — tap to open it. */}
                                <button
                                    onClick={() => onOpenCard(link)}
                                    dir={titleRtl ? 'rtl' : 'ltr'}
                                    className="group relative w-full flex items-center gap-2.5 ps-3.5 pe-3 py-2.5 bg-card border-t border-accent/10 text-start hover:bg-card-hover transition-colors cursor-pointer"
                                >
                                    <span
                                        className="absolute start-0 inset-y-2 w-1 rounded-full"
                                        style={{ backgroundColor: colorStyle.backgroundColor }}
                                        aria-hidden
                                    />
                                    <span className="flex-1 min-w-0">
                                        <span className={`block truncate text-[13.5px] font-semibold text-text group-hover:text-accent transition-colors ${titleRtl ? 'font-hebrew' : ''}`}>
                                            {link.title}
                                        </span>
                                        <span className="mt-0.5 flex items-center" dir="ltr">
                                            <SourceByline link={link} />
                                        </span>
                                    </span>
                                    <ChevronRight className="w-4 h-4 shrink-0 text-text-muted rtl:rotate-180" />
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
