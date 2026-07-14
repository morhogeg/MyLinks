'use client';

import { useState, useEffect, useRef } from 'react';
import { Link, LinkStatus, UserNote } from '@/lib/types';
import { ExternalLink, Star, X, Clock, Tag, Trash2, Bell, BellOff, Plus, Pencil, Circle, Check, Network, Play, Youtube, ImageOff, Image as ImageIcon, BookOpen, Layers, Share2, ChevronLeft, StickyNote } from 'lucide-react';
import { getPlatform, platformIcon, platformColor, xHandle, instagramHandle } from '@/lib/platform';
import SimpleMarkdown from './SimpleMarkdown';
import { openExternal } from '@/lib/share';
import ReadingView from './ReadingView';
import { getCategoryColorStyle } from '@/lib/colors';
import CategoryInput from './CategoryInput';
import TagInput from './TagInput';
import { hasHebrew } from '@/lib/rtl';
import { useEdgeSwipeBack } from '@/lib/useEdgeSwipeBack';
import { useVisualViewport } from '@/lib/useVisualViewport';
import { getRelatedCards } from '@/lib/related';
import { getNotes, makeNote, touchNote } from '@/lib/notes';
import { hapticSuccess, hapticMedium } from '@/lib/haptics';

// Sentinel `editingNoteId` for the composer when adding a brand-new note (as
// opposed to editing an existing one, keyed by its real id).
const NEW_NOTE_ID = '__new_note__';

/**
 * Split a "M:SS — description" (or "H:MM:SS …") video highlight into its
 * timestamp-in-seconds and the human label. Returns seconds=null when no
 * leading timestamp is present so the entry still renders as plain text.
 */
function parseHighlight(entry: string): { seconds: number | null; label: string } {
    const match = entry.match(/^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*[—\-–:]*\s*(.*)$/);
    if (!match) return { seconds: null, label: entry.trim() };
    const [, a, b, c, rest] = match;
    const seconds = c
        ? parseInt(a) * 3600 + parseInt(b) * 60 + parseInt(c)
        : parseInt(a) * 60 + parseInt(b);
    const stamp = c ? `${a}:${b}:${c}` : `${a}:${b}`;
    return { seconds, label: rest?.trim() || stamp };
}

/** YouTube watch URL, optionally deep-linked to a timestamp (seconds). */
function youtubeWatchUrl(id: string, seconds?: number | null): string {
    return `https://www.youtube.com/watch?v=${id}${seconds != null ? `&t=${Math.floor(seconds)}s` : ''}`;
}

interface LinkDetailModalProps {
    link: Link;
    allLinks: Link[];
    allCategories: string[];
    uid: string | null;
    isOpen: boolean;
    onClose: () => void;            // dismiss the modal entirely (clears the back-stack)
    onBack?: () => void;           // step back to the previous card in the back-stack
    canGoBack?: boolean;           // true when there's a previous card to return to
    onStatusChange: (id: string, status: LinkStatus) => void;
    onReadStatusChange: (id: string, isRead: boolean) => void;
    onUpdateTags: (id: string, tags: string[]) => void;
    onUpdateCategory: (id: string, category: string) => void;
    onUpdateTitle?: (id: string, title: string, reembed?: boolean) => void;
    onUpdateSummary?: (id: string, summary: string, reembed?: boolean) => void;
    onUpdateNotes?: (id: string, notes: UserNote[], removed?: boolean) => void;
    onDelete: (id: string) => void;
    onUpdateReminder: (link: Link) => void;
    onOpenOtherLink?: (link: Link) => void;
    excludeRelatedIds?: string[];  // cards already behind you in the back-stack
    onAddToCollection?: (link: Link) => void;
    onShare?: (link: Link) => void;
}

export default function LinkDetailModal({
    link,
    allLinks,
    allCategories,
    uid,
    isOpen,
    onClose,
    onBack,
    canGoBack,
    onStatusChange,
    onReadStatusChange,
    onUpdateTags,
    onUpdateCategory,
    onUpdateTitle,
    onUpdateSummary,
    onUpdateNotes,
    onDelete,
    onUpdateReminder,
    onOpenOtherLink,
    excludeRelatedIds,
    onAddToCollection,
    onShare,
}: LinkDetailModalProps) {
    const [isReading, setIsReading] = useState(false);
    const [isEditingCategory, setIsEditingCategory] = useState(false);
    const [now, setNow] = useState<number>(0);
    const [isAddingTag, setIsAddingTag] = useState(false);
    // Correctable AI output: the title and summary the model produced are drafts
    // the user can fix. Drafts are held locally while editing, committed on Save.
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [isEditingSummary, setIsEditingSummary] = useState(false);
    const [titleDraft, setTitleDraft] = useState('');
    const [summaryDraft, setSummaryDraft] = useState('');
    // The user's personal notes on this card — a list, newest first. One note is
    // open in the composer at a time: `editingNoteId` holds its id (or NEW_NOTE_ID
    // when adding a fresh note, or null when the list is just being read). The
    // draft text is held locally while writing, committed on Save/blur.
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [noteDraft, setNoteDraft] = useState('');
    const [imgFailed, setImgFailed] = useState(false);
    // Reset the broken-image fallback when navigating to a different card. Done
    // as a render-time state adjustment (React discards this pass and re-renders
    // synchronously) rather than in an effect, avoiding a set-state-in-effect
    // cascade while preserving the previous [link.id] reset behavior.
    const [imgLinkId, setImgLinkId] = useState(link.id);
    if (imgLinkId !== link.id) {
        setImgLinkId(link.id);
        setImgFailed(false);
        // Abandon any in-progress edit when navigating to another card so a draft
        // never leaks onto the wrong card.
        setIsEditingTitle(false);
        setIsEditingSummary(false);
        setEditingNoteId(null);
    }

    // A note card IS the user's own words (no source article to preserve): its
    // title and body are meant to be edited freely — not just "corrected" like AI
    // output — and each edit must re-embed the card (reembed=true) to keep
    // search/Ask current. A regular link's title/summary are metadata over an
    // unchanged article, so its vector is left alone.
    const isNote = link.sourceType === 'note';
    const saveTitle = () => {
        const t = titleDraft.trim();
        setIsEditingTitle(false);
        if (t && t !== link.title) onUpdateTitle?.(link.id, t, isNote);
    };
    const saveSummary = () => {
        const s = summaryDraft.trim();
        setIsEditingSummary(false);
        if (s !== (link.summary || '')) onUpdateSummary?.(link.id, s, isNote);
    };
    // The note composer: refs + a pointer-down intent flag so save-on-blur can
    // never fight an explicit Save/Cancel/Delete tap. On iOS a button tap often
    // reports a null blur relatedTarget, so we record intent on pointerdown
    // (which fires before blur) rather than inferring it from focus movement.
    const noteTextareaRef = useRef<HTMLTextAreaElement>(null);
    const noteEditorRef = useRef<HTMLDivElement>(null);
    const noteActionRef = useRef<'save' | 'cancel' | 'delete' | null>(null);

    // Auto-grow the composer to fit its content (capped by CSS max-height, which
    // then scrolls) so the whole note is visible while writing — no inner
    // scrollbar until it gets genuinely long.
    const autoGrowNote = (el: HTMLTextAreaElement | null) => {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    };

    // The card's notes, newest first — the ONE reader that reconciles the legacy
    // `userNote` string with the `userNotes` array (lib/notes). Every write goes
    // back through onUpdateNotes with the full list, so saving ANY note migrates a
    // legacy-only card to the array shape and clears the legacy field.
    const notes = getNotes(link);
    const isNewNote = editingNoteId === NEW_NOTE_ID;

    // Commit the current draft into the note list. Shared by explicit Save and the
    // save-on-blur guard so writing can never be lost. A new note is prepended
    // (newest first); an existing note has its text + updatedAt replaced. An empty
    // draft is a no-op here — emptying an existing note is a Delete, not a Save.
    const commitNoteDraft = () => {
        const text = noteDraft.trim();
        if (!text) return;
        if (isNewNote) {
            onUpdateNotes?.(link.id, [makeNote(text), ...notes]);
            hapticSuccess();
        } else {
            const existing = notes.find(n => n.id === editingNoteId);
            if (!existing || existing.text === text) return; // unchanged — skip the write
            onUpdateNotes?.(link.id, notes.map(n => n.id === editingNoteId ? touchNote(n, text) : n));
            hapticSuccess();
        }
    };
    const saveNote = () => { noteActionRef.current = 'save'; setEditingNoteId(null); commitNoteDraft(); };
    const cancelNote = () => { noteActionRef.current = 'cancel'; setEditingNoteId(null); };
    // Remove a note — from the composer's Delete button (removes the note being
    // edited) or a list row's trash (removes that row). A brand-new, unsaved note
    // just closes the composer. Mirrors the inline tag-delete pattern: instant,
    // confirmed by a toast, no modal.
    const deleteNote = (id: string) => {
        noteActionRef.current = 'delete';
        setEditingNoteId(null);
        if (id === NEW_NOTE_ID) { hapticMedium(); return; }
        if (notes.some(n => n.id === id)) {
            onUpdateNotes?.(link.id, notes.filter(n => n.id !== id), true);
            hapticMedium();
        }
    };
    // Save-on-blur guard: if the composer loses focus with NO explicit action
    // pending (tapped elsewhere, keyboard dismissed), auto-commit a non-empty
    // draft so writing is never lost. An empty draft is left alone — blur never
    // silently deletes an existing note (that needs the explicit Delete button).
    const onNoteBlur = () => {
        if (noteActionRef.current) { noteActionRef.current = null; return; }
        setEditingNoteId(null);
        commitNoteDraft();
    };
    const startAddNote = () => { setNoteDraft(''); noteActionRef.current = null; setEditingNoteId(NEW_NOTE_ID); };
    const startEditNote = (n: UserNote) => { setNoteDraft(n.text); noteActionRef.current = null; setEditingNoteId(n.id); };
    const hasValidImage = !!link.url && /^https?:\/\//.test(link.url);

    // Scroll back to the top when the card changes. Opening a related card reuses
    // this same scroll container, so without this it would open scrolled down to
    // wherever the Related section sat — jump to the top like a fresh open does.
    const scrollRef = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (scrollRef.current) scrollRef.current.scrollTop = 0;
    }, [link.id]);

    useEffect(() => {
        const initialTimer = setTimeout(() => setNow(Date.now()), 0);
        const timer = setInterval(() => setNow(Date.now()), 1000 * 60);
        return () => {
            clearTimeout(initialTimer);
            clearInterval(timer);
        };
    }, []);

    // Swipe in from the left edge to close the card (iOS back gesture). Disabled
    // while the distraction-free reader is on top (it has its own dismissal).
    // The iOS edge-swipe-back gesture steps back one card if there's history,
    // otherwise dismisses — matching native back behaviour. The X button and
    // backdrop, by contrast, always close the whole stack.
    const goBack = onBack ?? onClose;
    useEdgeSwipeBack(goBack, isOpen && !isReading);

    // Clamp the modal to the *visible* viewport so an inline edit (category /
    // tags) can't be hidden behind the on-screen keyboard: the body scrolls the
    // focused field into the shrunken visible area instead of extending under
    // the keys. No-op on desktop (visualViewport spans the full window).
    const vp = useVisualViewport();

    // Note composer focus: when the editor opens, focus it, place the caret at
    // the END of any existing text (so editing continues where the note left
    // off, not with the whole thing selected), and size it to its content.
    useEffect(() => {
        if (!editingNoteId) return;
        const el = noteTextareaRef.current;
        if (!el) return;
        autoGrowNote(el);
        el.focus({ preventScroll: true });
        const end = el.value.length;
        try { el.setSelectionRange(end, end); } catch { /* older WebViews */ }
    }, [editingNoteId]);

    // Keep the composer above the on-screen keyboard (M5, visual-viewport). The
    // modal is already clamped to the visible viewport; here we scroll the
    // composer into that shrunken area. Re-runs when the keyboard animates in and
    // changes vp.height, so the input + its Save/Cancel row never sit under the
    // keys — the core "keyboard covers the note field" fix.
    useEffect(() => {
        if (!editingNoteId) return;
        const t = setTimeout(() => {
            noteEditorRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }, 100);
        return () => clearTimeout(t);
    }, [editingNoteId, vp.height]);

    // A11y: move focus into the dialog on open and restore it to the trigger on
    // close. Keyed on isOpen only, so navigating between related cards (which
    // keeps the modal open and only changes link.id) never steals focus.
    const dialogRef = useRef<HTMLDivElement>(null);
    const restoreFocusRef = useRef<HTMLElement | null>(null);
    useEffect(() => {
        if (!isOpen) return;
        restoreFocusRef.current = (document.activeElement as HTMLElement) ?? null;
        const t = setTimeout(() => dialogRef.current?.focus({ preventScroll: true }), 0);
        return () => {
            clearTimeout(t);
            restoreFocusRef.current?.focus?.({ preventScroll: true });
        };
    }, [isOpen]);

    // A11y: Escape closes the topmost open layer first — the distraction-free
    // reader, an inline category edit, or the add-tag input — otherwise it
    // dismisses the whole modal (same as the X / backdrop). Desktop-web win;
    // harmless in the native WKWebView where hardware keyboards are rare.
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            if (isReading) setIsReading(false);
            else if (isEditingTitle) setIsEditingTitle(false);
            else if (isEditingSummary) setIsEditingSummary(false);
            else if (editingNoteId) setEditingNoteId(null);
            else if (isEditingCategory) setIsEditingCategory(false);
            else if (isAddingTag) setIsAddingTag(false);
            else onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, isReading, isEditingTitle, isEditingSummary, editingNoteId, isEditingCategory, isAddingTag, onClose]);

    if (!isOpen) return null;

    const isRtl = link.language === 'he' || hasHebrew(link.title) || hasHebrew(link.summary) || (link.detailedSummary ? hasHebrew(link.detailedSummary) : false);

    // Live related cards: stored AI relations merged with fresh embedding /
    // concept matches (see lib/related.ts). Computed here, below the isOpen
    // guard, so the closed modal costs nothing.
    const relatedCards = getRelatedCards(link, allLinks, isRtl, excludeRelatedIds);

    // Branded source credit, matching the card: YouTube channel in red, X
    // author (@handle from the URL) in the X grey, everything else muted.
    const platform = getPlatform(link.url);
    const isYouTube = platform === 'youtube' || link.sourceType === 'youtube';
    // Reading mode is for text articles — not videos or screenshots.
    const canRead = !!link.url && /^https?:\/\//.test(link.url) && !isYouTube && link.sourceType !== 'image';
    const youtubeChannel = link.metadata?.youtubeChannel || link.sourceName;
    const xAuthor = platform === 'x' ? xHandle(link.url) : null;
    const isLinkedIn = platform === 'linkedin';
    // Facebook: credit the author/page name (recovered by the scraper from
    // og:title) next to the logo — same byline style as X, minus the @.
    const isFacebook = platform === 'facebook';
    const fbAuthor = isFacebook && link.sourceName
        && !['facebook', 'screenshot', 'none'].includes(link.sourceName.trim().toLowerCase())
        ? link.sourceName : null;
    // Instagram: the author @handle captured by the scraper (stored in
    // sourceName as "@handle"), credited in the same byline style as X.
    const igAuthor = platform === 'instagram' ? instagramHandle(link.sourceName) : null;

    const getTimeAgo = (timestamp: number | string, now: number): string => {
        if (!timestamp || !now) return '...';
        let time = typeof timestamp === 'string' ? new Date(timestamp).getTime() : timestamp;
        if (isNaN(time) || time <= 0) return isRtl ? 'לאחרונה' : 'recently';
        // Some ingest paths (Facebook, screenshots) store Unix *seconds*, not ms —
        // anything below year-2001-in-ms is really a seconds value, so scale it up.
        if (time < 1e12) time *= 1000;

        const seconds = Math.floor((now - time) / 1000);
        if (seconds < 60) return isRtl ? 'זה עתה' : 'just now';
        const minutes = Math.floor(seconds / 60);
        if (minutes < 60) return isRtl ? `לפני ${minutes} דק׳` : `${minutes}m ago`;
        const hours = Math.floor(minutes / 60);
        if (hours < 24) return isRtl ? `לפני ${hours} שע׳` : `${hours}h ago`;
        const days = Math.floor(hours / 24);
        return isRtl ? `לפני ${days} ימים` : `${days}d ago`;
    };

    const isReminderActive = link.reminderStatus === 'pending';
    const nextReminderDate = link.nextReminderAt ? new Date(link.nextReminderAt) : null;

    const handleToggleReminder = () => {
        if (!uid) return;
        onUpdateReminder(link);
    };

    const allTags = Array.from(new Set(allLinks.flatMap(l => l.tags))).sort();

    // The note composer — one instance, rendered either at the top of the list
    // (adding a new note) or in place of the row being edited. Keeps every good
    // property of the revamp: keyboard-safe (noteEditorRef is scrolled above the
    // keyboard), auto-growing, explicit Save/Cancel/Delete, ⌘/Ctrl+Enter to save,
    // Escape to cancel, save-on-blur (onNoteBlur) so writing is never lost, and
    // RTL-safe via dir="auto".
    const renderNoteComposer = () => (
        <div ref={noteEditorRef} onBlur={onNoteBlur} className="scroll-mt-6">
            <textarea
                ref={noteTextareaRef}
                value={noteDraft}
                onChange={(e) => { setNoteDraft(e.target.value); autoGrowNote(e.target); }}
                onKeyDown={(e) => {
                    // Notes are multi-line, so plain Enter adds a line;
                    // ⌘/Ctrl+Enter saves (a familiar "commit" chord).
                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveNote(); }
                    // Escape discards the draft (explicit cancel).
                    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); cancelNote(); }
                }}
                rows={3}
                dir="auto"
                placeholder={isRtl ? 'מה דעתך על זה?' : 'Add your take…'}
                aria-label="Edit your note"
                className={`w-full min-h-[6.5rem] max-h-[45vh] overflow-y-auto text-base text-text bg-background border border-accent/40 rounded-xl px-3.5 py-3 focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none placeholder:text-text-muted/50 leading-relaxed ${isRtl ? 'text-right' : ''}`}
            />
            <div className="flex items-center gap-2 mt-2">
                <button
                    onPointerDown={() => { noteActionRef.current = 'save'; }}
                    onClick={saveNote}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-bold hover:bg-accent-hover active:scale-95 transition-all"
                >
                    <Check className="w-3.5 h-3.5" /> {isRtl ? 'שמור הערה' : 'Save note'}
                </button>
                <button
                    onPointerDown={() => { noteActionRef.current = 'cancel'; }}
                    onClick={cancelNote}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-fill-subtle text-text-muted text-xs font-bold hover:text-text hover:bg-fill-strong transition-all"
                >
                    {isRtl ? 'ביטול' : 'Cancel'}
                </button>
                {/* Delete only when editing an existing note; a brand-new note is
                    discarded by Cancel, not deleted. */}
                {!isNewNote && (
                    <button
                        onPointerDown={() => { noteActionRef.current = 'delete'; }}
                        onClick={() => deleteNote(editingNoteId as string)}
                        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-bold text-text-muted/70 hover:text-red-400 transition-all ${isRtl ? 'mr-auto' : 'ml-auto'}`}
                    >
                        <Trash2 className="w-3.5 h-3.5" /> {isRtl ? 'מחק' : 'Delete'}
                    </button>
                )}
            </div>
        </div>
    );

    return (
        <>
        {isReading && <ReadingView link={link} onClose={() => setIsReading(false)} />}
        <div
            className="fixed inset-x-0 z-50 flex items-center justify-center p-0 sm:p-4"
            style={{ top: vp.offsetTop || 0, height: vp.height || '100%', bottom: 'auto' }}
        >
            <div
                className="absolute inset-0 bg-background/80 backdrop-blur-sm animate-fade-in"
                onClick={onClose}
            />

            <div
                ref={dialogRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-label="Link details"
                className="relative bg-card border-0 sm:border border-border-strong w-full h-full sm:h-auto sm:max-w-2xl sm:max-h-[90vh] sm:rounded-3xl shadow-2xl overflow-hidden flex flex-col animate-scale-up focus:outline-none"
            >
                {/* Header Actions — a single compact row: the item actions scroll
                    horizontally if they don't all fit (so nothing is ever clipped),
                    while the close button stays pinned and always reachable. */}
                <div className="flex items-center gap-2 p-3 sm:p-4 safe-pt border-b border-border-subtle/60">
                    <div className="flex items-center gap-1 sm:gap-1.5 min-w-0 flex-1 overflow-x-auto scrollbar-hide">
                        {/* Back to the previous card — only when opened from another
                            card's Related list. Distinct from Close (X), which
                            dismisses the whole stack. */}
                        {canGoBack && (
                            <>
                                <button
                                    onClick={goBack}
                                    title="Back to previous card"
                                    aria-label="Back to previous card"
                                    className="shrink-0 h-10 w-10 rounded-xl flex items-center justify-center text-text-muted hover:text-text hover:bg-card-hover transition-colors"
                                >
                                    <ChevronLeft className="w-5 h-5" />
                                </button>
                                <span className="shrink-0 mx-0.5 h-5 w-px bg-border-subtle" aria-hidden="true" />
                            </>
                        )}
                        <button
                            onClick={() => onReadStatusChange(link.id, !link.isRead)}
                            title={link.isRead ? 'Mark as unread' : 'Mark as read'}
                            aria-label={link.isRead ? 'Mark as unread' : 'Mark as read'}
                            className={`shrink-0 h-10 w-10 rounded-xl flex items-center justify-center transition-colors ${link.isRead
                                ? 'bg-card-hover text-text'
                                : 'text-text-muted/50 hover:text-text hover:bg-card-hover'
                                }`}
                        >
                            {link.isRead ? <Check className="w-[18px] h-[18px]" /> : <Circle className="w-[18px] h-[18px] opacity-50" />}
                        </button>
                        <button
                            onClick={() => onStatusChange(link.id, link.status === 'favorite' ? 'unread' : 'favorite')}
                            title={link.status === 'favorite' ? 'Remove from favorites' : 'Add to favorites'}
                            aria-label={link.status === 'favorite' ? 'Remove from favorites' : 'Add to favorites'}
                            className={`shrink-0 h-10 w-10 rounded-xl flex items-center justify-center transition-colors ${link.status === 'favorite'
                                ? 'bg-yellow-500/10 text-yellow-500'
                                : 'text-text-muted hover:text-yellow-500 hover:bg-card-hover'
                                }`}
                        >
                            <Star className={`w-[18px] h-[18px] ${link.status === 'favorite' ? 'fill-current' : ''}`} />
                        </button>
                        <button
                            onClick={handleToggleReminder}
                            title={isReminderActive ? `Reminder active (next: ${nextReminderDate?.toLocaleDateString()})` : 'Set reminder'}
                            aria-label={isReminderActive ? 'Reminder active' : 'Set reminder'}
                            className={`shrink-0 h-10 w-10 rounded-xl flex items-center justify-center transition-colors ${isReminderActive
                                ? 'bg-blue-500/10 text-blue-500'
                                : 'text-text-muted hover:text-blue-500 hover:bg-card-hover'
                                }`}
                        >
                            {isReminderActive ? <Bell className="w-[18px] h-[18px]" /> : <BellOff className="w-[18px] h-[18px]" />}
                        </button>

                        {/* Divider between status toggles and the "do something with it" actions. */}
                        <span className="shrink-0 mx-0.5 h-5 w-px bg-border-subtle" aria-hidden="true" />

                        {onAddToCollection && (
                            <button
                                onClick={() => onAddToCollection(link)}
                                title="Add to collection"
                                aria-label="Add to collection"
                                className="shrink-0 h-10 w-10 rounded-xl flex items-center justify-center text-text-muted hover:text-accent hover:bg-card-hover transition-colors"
                            >
                                <Layers className="w-[18px] h-[18px]" />
                            </button>
                        )}
                        {onShare && (
                            <button
                                onClick={() => onShare(link)}
                                title="Share"
                                aria-label="Share this card"
                                className="shrink-0 h-10 w-10 rounded-xl flex items-center justify-center text-text-muted hover:text-accent hover:bg-card-hover transition-colors"
                            >
                                <Share2 className="w-[18px] h-[18px]" />
                            </button>
                        )}
                        {canRead && (
                            <button
                                onClick={() => setIsReading(true)}
                                title="Read in distraction-free mode"
                                aria-label="Read article"
                                className="shrink-0 h-10 w-10 rounded-xl flex items-center justify-center text-text-muted hover:text-accent hover:bg-card-hover transition-colors"
                            >
                                <BookOpen className="w-[18px] h-[18px]" />
                            </button>
                        )}
                    </div>

                    {/* Delete + Open source + Close — pinned right so they're NEVER
                        clipped by the scrolling action row (the reader icon used to
                        push Delete off-screen on narrow phones). Delete keeps its red
                        hover so it reads distinctly from the neutral Close. */}
                    <button
                        /* One confirm only: the parent (Feed.handleDelete) owns the
                           branded dialog, which stacks above this modal (z-100 > z-50).
                           Cancel returns to the card; confirming deletes the link,
                           which unmounts this modal via the live links snapshot. */
                        onClick={() => onDelete(link.id)}
                        title="Delete"
                        aria-label="Delete"
                        className="shrink-0 h-10 w-10 rounded-xl flex items-center justify-center text-text-muted hover:text-red-500 hover:bg-red-500/10 transition-colors"
                    >
                        <Trash2 className="w-[18px] h-[18px]" />
                    </button>
                    {!!link.url && /^https?:\/\//.test(link.url) && (
                        <a
                            href={link.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            title={link.sourceType === 'image' ? 'View original image' : 'Open source'}
                            aria-label={link.sourceType === 'image' ? 'View original image' : 'Open source'}
                            className="shrink-0 h-10 w-10 rounded-xl flex items-center justify-center text-text-muted hover:text-accent hover:bg-card-hover transition-colors"
                        >
                            <ExternalLink className="w-[18px] h-[18px]" />
                        </a>
                    )}
                    <button
                        onClick={onClose}
                        aria-label="Close"
                        title="Close"
                        className="shrink-0 h-10 w-10 rounded-xl flex items-center justify-center text-text-muted hover:text-text hover:bg-card-hover transition-colors"
                    >
                        <X className="w-[18px] h-[18px]" />
                    </button>
                </div>

                <div
                    ref={scrollRef}
                    className="flex-1 overflow-y-auto pt-4 px-4 pb-4 sm:px-6 sm:pb-6 md:px-8 md:pb-8 scrollbar-soft"
                    dir="auto"
                >
                    {/* Content Section — screenshot/image source */}
                    {link.sourceType === 'image' && (
                        hasValidImage && !imgFailed ? (
                            <div className="mb-6 rounded-2xl overflow-hidden border border-border-subtle bg-card-hover group/img relative">
                                <img
                                    src={link.url}
                                    alt="Source screenshot"
                                    onError={() => setImgFailed(true)}
                                    className="w-full h-auto max-h-[400px] object-contain cursor-zoom-in transition-transform duration-500 group-hover/img:scale-105"
                                    onClick={() => {
                                        // Guard the scheme (never open a stored javascript:/data: URL)
                                        // and pass noopener so the opened page can't reach window.opener.
                                        if (/^https?:\/\//i.test(link.url)) {
                                            window.open(link.url, '_blank', 'noopener,noreferrer');
                                        }
                                    }}
                                />
                                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                    <span className="text-white text-xs font-bold px-3 py-1.5 bg-black/60 rounded-full backdrop-blur-md border border-white/20">
                                        Click to View Original
                                    </span>
                                </div>
                            </div>
                        ) : (
                            <div className="mb-6 rounded-2xl border border-dashed border-border-subtle bg-card-hover/50 px-4 py-8 flex flex-col items-center justify-center gap-2 text-center">
                                <ImageOff className="w-7 h-7 text-text-muted/60" />
                                <p className="text-sm font-semibold text-text-secondary">Screenshot unavailable</p>
                                <p className="text-xs text-text-muted max-w-xs">
                                    The original image isn&apos;t stored for this item. The summary below is still available.
                                </p>
                            </div>
                        )
                    )}

                    {/* YouTube: thumbnail (the inline player trips a YouTube "error
                        153" in the WebView) + clickable key moments that deep-link
                        into the video on YouTube. */}
                    {link.sourceType === 'youtube' && link.metadata?.videoId && (() => {
                        const videoId = link.metadata.videoId;
                        const thumb = link.metadata.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
                        return (
                        <div className="mb-6 space-y-4">
                            <button
                                onClick={() => openExternal(youtubeWatchUrl(videoId))}
                                aria-label="Watch on YouTube"
                                className="group relative block w-full h-28 sm:h-32 rounded-2xl overflow-hidden border border-border-strong bg-black cursor-pointer"
                            >
                                <img src={thumb} alt="" className="w-full h-full object-cover" />
                                <span className="absolute inset-0 bg-black/[0.04] group-hover:bg-transparent transition-colors" />
                                <span className="absolute bottom-2 end-2 inline-flex items-center gap-1 text-[11px] font-semibold text-white bg-black/60 px-2 py-0.5 rounded-full">
                                    <Youtube className="w-3.5 h-3.5" /> Watch on YouTube
                                </span>
                            </button>

                            {!!link.metadata.videoHighlights?.length && (
                                <div className="rounded-2xl border border-border-strong bg-fill-subtle p-4">
                                    <h4 className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-text-muted mb-3">
                                        <Play className="w-3.5 h-3.5 text-accent" /> Key moments
                                    </h4>
                                    <ul className="space-y-1">
                                        {link.metadata.videoHighlights.map((entry, i) => {
                                            const { seconds, label } = parseHighlight(entry);
                                            return (
                                                <li key={i}>
                                                    <button
                                                        onClick={() => seconds != null && openExternal(youtubeWatchUrl(videoId, seconds))}
                                                        disabled={seconds == null}
                                                        className={`w-full text-start flex items-start gap-3 rounded-lg px-2 py-1.5 transition-colors ${seconds != null ? 'hover:bg-fill-subtle cursor-pointer' : 'cursor-default'}`}
                                                    >
                                                        {seconds != null && (
                                                            <span className="shrink-0 mt-0.5 text-[11px] font-bold text-accent tabular-nums bg-accent/10 px-1.5 py-0.5 rounded">
                                                                {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
                                                            </span>
                                                        )}
                                                        <span className="text-sm text-text-secondary leading-snug">{label}</span>
                                                    </button>
                                                </li>
                                            );
                                        })}
                                    </ul>
                                </div>
                            )}
                        </div>
                        );
                    })()}

                    <div className="mb-4">
                        {(() => {
                            const colorStyle = getCategoryColorStyle(link.category);
                            return (
                                <div className="relative group/cat flex items-center justify-between w-full">
                                    <div className="flex items-center gap-1.5">
                                        {isEditingCategory ? (
                                            <CategoryInput
                                                currentCategory={link.category}
                                                allCategories={allCategories}
                                                onUpdate={(newCategory) => {
                                                    setIsEditingCategory(false);
                                                    if (newCategory !== link.category) {
                                                        onUpdateCategory(link.id, newCategory);
                                                    }
                                                }}
                                                onCancel={() => setIsEditingCategory(false)}
                                                className="w-32 text-[10px] px-2.5 py-1.5"
                                            />
                                        ) : (
                                            <>
                                                <span
                                                    className="text-[10px] uppercase font-black tracking-widest px-2.5 py-1.5 rounded-lg inline-block cursor-pointer hover:brightness-110 transition-all flex items-center shadow-lg shadow-black/5"
                                                    style={{
                                                        backgroundColor: colorStyle.backgroundColor,
                                                        color: colorStyle.color,
                                                    }}
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setIsEditingCategory(true);
                                                    }}
                                                >
                                                    {link.category}
                                                </span>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setIsEditingCategory(true);
                                                    }}
                                                    aria-label="Edit category"
                                                    className="opacity-0 group-hover/cat:opacity-100 transition-opacity p-1.5 -ms-1.5 hover:bg-fill-subtle rounded-md"
                                                >
                                                    <Pencil className="w-3.5 h-3.5 text-text-muted/40 hover:text-text-muted" />
                                                </button>
                                            </>
                                        )}
                                    </div>
                                    {isYouTube && youtubeChannel ? (
                                        <span
                                            dir="ltr"
                                            className="flex items-center gap-1.5 min-w-0 text-sm font-semibold text-text-secondary whitespace-nowrap max-w-[240px]"
                                            title={youtubeChannel}
                                        >
                                            <Youtube className="w-4 h-4 text-red-500 shrink-0" />
                                            <span className="truncate">{youtubeChannel}</span>
                                        </span>
                                    ) : xAuthor ? (
                                        <span
                                            dir="ltr"
                                            className="flex items-center gap-1.5 min-w-0 text-sm font-semibold text-text-secondary whitespace-nowrap max-w-[240px]"
                                            title={`@${xAuthor}`}
                                        >
                                            <span className="shrink-0 inline-flex" style={{ color: platformColor('x') }}>
                                                {platformIcon('x', 'w-4 h-4')}
                                            </span>
                                            <span className="truncate">@{xAuthor}</span>
                                        </span>
                                    ) : isLinkedIn ? (
                                        <span
                                            dir="ltr"
                                            className="flex items-center gap-1.5 min-w-0 text-sm font-semibold whitespace-nowrap"
                                            title="LinkedIn"
                                            aria-label="LinkedIn"
                                        >
                                            <span className="shrink-0 inline-flex" style={{ color: platformColor('linkedin') }}>
                                                {platformIcon('linkedin', 'w-4 h-4')}
                                            </span>
                                        </span>
                                    ) : isFacebook ? (
                                        <span
                                            dir="auto"
                                            className="flex items-center gap-1.5 min-w-0 text-sm font-semibold text-text-secondary whitespace-nowrap max-w-[240px]"
                                            title={fbAuthor || 'Facebook'}
                                            aria-label={fbAuthor || 'Facebook'}
                                        >
                                            <span className="shrink-0 inline-flex" style={{ color: platformColor('facebook') }}>
                                                {platformIcon('facebook', 'w-4 h-4')}
                                            </span>
                                            {fbAuthor && <span className="truncate">{fbAuthor}</span>}
                                        </span>
                                    ) : igAuthor ? (
                                        <span
                                            dir="ltr"
                                            className="flex items-center gap-1.5 min-w-0 text-sm font-semibold text-text-secondary whitespace-nowrap max-w-[240px]"
                                            title={`@${igAuthor}`}
                                        >
                                            <span className="shrink-0 inline-flex" style={{ color: platformColor('instagram') }}>
                                                {platformIcon('instagram', 'w-4 h-4')}
                                            </span>
                                            <span className="truncate">@{igAuthor}</span>
                                        </span>
                                    ) : link.sourceType === 'image' ? (
                                        <span className="flex items-center gap-1.5 text-sm font-semibold text-accent whitespace-nowrap" title="Screenshot">
                                            <ImageIcon className="w-4 h-4 shrink-0" />
                                            <span>Screenshot</span>
                                        </span>
                                    ) : link.sourceType === 'note' ? (
                                        <span className="flex items-center gap-1.5 text-sm font-semibold text-accent whitespace-nowrap" title="Note">
                                            <StickyNote className="w-4 h-4 shrink-0" />
                                            <span>Note</span>
                                        </span>
                                    ) : link.sourceName && link.sourceName !== 'None' ? (
                                        <span
                                            className="text-[10px] font-black text-text-muted/60 bg-fill-subtle border border-border-strong uppercase tracking-widest px-2.5 py-1.5 rounded-lg shadow-lg shadow-black/5 transition-all"
                                            title={link.sourceName}
                                        >
                                            {link.sourceName}
                                        </span>
                                    ) : null}
                                </div>
                            );
                        })()}
                    </div>

                    {isEditingTitle ? (
                        <div className="mb-4">
                            <textarea
                                value={titleDraft}
                                onChange={(e) => setTitleDraft(e.target.value)}
                                onKeyDown={(e) => {
                                    // Enter saves (a title is single-line); Shift+Enter is unused.
                                    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); saveTitle(); }
                                }}
                                rows={2}
                                autoFocus
                                dir="auto"
                                aria-label="Edit title"
                                className={`w-full font-bold text-2xl text-text leading-tight bg-background border border-accent/40 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none ${isRtl ? 'text-right' : ''}`}
                            />
                            <div className="flex gap-2 mt-2">
                                <button
                                    onClick={saveTitle}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-bold hover:bg-accent-hover active:scale-95 transition-all"
                                >
                                    <Check className="w-3.5 h-3.5" /> Save
                                </button>
                                <button
                                    onClick={() => setIsEditingTitle(false)}
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-fill-subtle text-text-muted text-xs font-bold hover:text-text hover:bg-fill-strong transition-all"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : (
                        <div className={`group/title relative flex items-start gap-2 mb-4 ${isRtl ? 'flex-row-reverse' : ''}`}>
                            <h2
                                dir="auto"
                                className={`font-bold text-2xl text-text leading-tight flex-1 min-w-0 ${isRtl ? 'text-right' : ''}`}
                            >
                                {link.title}
                            </h2>
                            {onUpdateTitle && (
                                <button
                                    onClick={() => { setTitleDraft(link.title); setIsEditingTitle(true); }}
                                    aria-label={isNote ? 'Edit note' : 'Edit title'}
                                    title={isNote ? 'Edit note' : 'Edit title'}
                                    className={`shrink-0 mt-1 focus:opacity-100 transition-opacity p-1.5 hover:bg-fill-subtle rounded-md ${isNote ? 'opacity-100' : 'opacity-0 group-hover/title:opacity-100'}`}
                                >
                                    <Pencil className={`w-4 h-4 ${isNote ? 'text-accent' : 'text-text-muted/50 hover:text-text-muted'}`} />
                                </button>
                            )}
                        </div>
                    )}

                    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
                        {/* Card ↔ open are ONE thought at two zoom levels: the card
                            summary is the canonical lead, shown (bolded) at the top of
                            the open view, then the deeper Key Points / Conclusions
                            expand below it. New cards' detailedSummary starts straight
                            at "## Key Points" (no overview). Older cards still carry a
                            leading overview paragraph — drop everything before the
                            first "## " so the open view never shows two overviews.
                            Prose-only legacy detailedSummary (no headings) has no gist
                            to strip, so we show it alone to avoid duplicating it. */}
                        <div className="mb-6">
                            {(() => {
                                const detailed = link.detailedSummary || '';
                                const headingIdx = detailed.indexOf('## ');
                                const hasSections = headingIdx >= 0;
                                const detailBody = hasSections ? detailed.slice(headingIdx) : detailed;
                                // Lead with the summary unless doing so would duplicate
                                // a legacy overview-only (section-less) detailedSummary.
                                const showLead = !!link.summary && (hasSections || !detailed);
                                const startEditSummary = () => {
                                    setSummaryDraft(link.summary || '');
                                    setIsEditingSummary(true);
                                };
                                return (
                                    <>
                                        {isEditingSummary ? (
                                            <div className={detailBody ? 'mb-6' : ''}>
                                                <textarea
                                                    value={summaryDraft}
                                                    onChange={(e) => setSummaryDraft(e.target.value)}
                                                    rows={4}
                                                    autoFocus
                                                    dir="auto"
                                                    aria-label="Edit summary"
                                                    className={`w-full text-base text-text bg-background border border-accent/40 rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-accent/50 resize-none ${isRtl ? 'text-right' : ''}`}
                                                />
                                                <div className="flex gap-2 mt-2">
                                                    <button
                                                        onClick={saveSummary}
                                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent text-white text-xs font-bold hover:bg-accent-hover active:scale-95 transition-all"
                                                    >
                                                        <Check className="w-3.5 h-3.5" /> Save
                                                    </button>
                                                    <button
                                                        onClick={() => setIsEditingSummary(false)}
                                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-fill-subtle text-text-muted text-xs font-bold hover:text-text hover:bg-fill-strong transition-all"
                                                    >
                                                        Cancel
                                                    </button>
                                                </div>
                                            </div>
                                        ) : (
                                            <>
                                                {showLead && (
                                                    <div className={`group/summary relative ${detailBody ? 'mb-6' : ''}`}>
                                                        <SimpleMarkdown
                                                            content={link.summary}
                                                            isRtl={isRtl}
                                                            className="text-base"
                                                        />
                                                        {onUpdateSummary && (
                                                            <button
                                                                onClick={startEditSummary}
                                                                aria-label={isNote ? 'Edit note' : 'Edit summary'}
                                                                title={isNote ? 'Edit note' : 'Edit summary'}
                                                                className={`absolute top-0 focus:opacity-100 transition-opacity p-1.5 hover:bg-fill-subtle rounded-md ${isNote ? 'opacity-100' : 'opacity-0 group-hover/summary:opacity-100'} ${isRtl ? 'left-0' : 'right-0'}`}
                                                            >
                                                                <Pencil className={`w-4 h-4 ${isNote ? 'text-accent' : 'text-text-muted/50 hover:text-text-muted'}`} />
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                                {/* Legacy prose-only cards hide the lead to avoid a
                                                    duplicate — still let the user correct the summary. */}
                                                {!showLead && onUpdateSummary && (
                                                    <button
                                                        onClick={startEditSummary}
                                                        className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-text-muted/60 hover:text-accent transition-colors"
                                                    >
                                                        <Pencil className="w-3.5 h-3.5" /> {isNote ? 'Add a body' : 'Edit summary'}
                                                    </button>
                                                )}
                                            </>
                                        )}
                                        {detailBody && (
                                            <SimpleMarkdown
                                                content={detailBody}
                                                isRtl={isRtl}
                                                className="text-base"
                                            />
                                        )}
                                    </>
                                );
                            })()}
                        </div>


                        <div className="flex flex-wrap items-center gap-4 text-sm text-text-muted mb-8">
                            <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-fill-subtle border border-border-subtle">
                                <Clock className="w-3.5 h-3.5" />
                                {link.metadata.estimatedReadTime} {isRtl ? 'דק׳ קריאה' : 'min read'}
                            </span>
                            <span className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-fill-subtle border border-border-subtle">
                                <Tag className="w-3.5 h-3.5 text-accent" />
                                {getTimeAgo(link.createdAt, now)}
                            </span>
                            {isReminderActive && nextReminderDate && (
                                <span
                                    onClick={handleToggleReminder}
                                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-500 cursor-pointer hover:brightness-110 active:scale-95 transition-all"
                                >
                                    <Bell className="w-3.5 h-3.5" />
                                    {link.reminderProfile?.startsWith('spaced') && (
                                        <span className="font-bold flex items-center mr-1">
                                            {(() => {
                                                const parts = link.reminderProfile.split('-');
                                                const interval = parts.length > 1 ? ` - ${parts[1]}` : '';
                                                return isRtl ? `[חזרתי${interval}]` : `[Spaced${interval}]`;
                                            })()}
                                        </span>
                                    )}
                                    {isRtl ? 'תזכורת:' : 'Reminder:'} {nextReminderDate.toLocaleDateString(isRtl ? 'he-IL' : undefined)}
                                </span>
                            )}
                        </div>

                        {/* Tags */}
                        <div className="flex flex-wrap gap-2 mb-10">
                            {link.tags.map((tag) => {
                                const parts = tag.split('/');
                                const leaf = parts[parts.length - 1];
                                const parents = parts.slice(0, -1).join('/');
                                return (
                                    <span
                                        key={tag}
                                        className="inline-flex items-center gap-1.5 text-xs font-bold text-text-muted/70 hover:text-accent transition-all group/tag bg-fill-subtle hover:bg-fill-strong px-2 py-1 rounded-lg border border-transparent hover:border-accent/10"
                                    >
                                        <span className="flex items-center">
                                            {parents && <span className="opacity-30 font-normal mr-0.5">{parents}/</span>}
                                            {leaf}
                                        </span>
                                        <X
                                            className="w-3 h-3 ml-1 opacity-40 group-hover/tag:opacity-100 hover:text-red-400 cursor-pointer transition-all"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                onUpdateTags(link.id, link.tags.filter(t => t !== tag));
                                            }}
                                        />
                                    </span>
                                );
                            })}

                            {isAddingTag ? (
                                <TagInput
                                    allTags={allTags}
                                    existingTags={link.tags}
                                    onAdd={(tag) => {
                                        onUpdateTags(link.id, [...link.tags, tag]);
                                        setIsAddingTag(false);
                                    }}
                                    onCancel={() => setIsAddingTag(false)}
                                />
                            ) : (
                                <button
                                    onClick={() => setIsAddingTag(true)}
                                    className="inline-flex items-center gap-1 text-xs font-bold text-text-muted/50 hover:text-accent transition-all bg-fill-subtle hover:bg-fill-strong px-2 py-1 rounded-lg border border-dashed border-border-strong hover:border-accent/30"
                                >
                                    <Plus className="w-3 h-3" />
                                    <span>Add Tag</span>
                                </button>
                            )}
                        </div>

                        {/* My notes — the user's OWN annotations on this card, on
                            every card regardless of source, kept visually distinct
                            from the AI summary. A list, newest first: each note
                            reads back in a calm accent panel with its relative date,
                            tap-anywhere-to-edit, and hover edit/delete. "Add a note"
                            appends another. One composer is open at a time. Kept
                            calm — a notes list, not a chat. */}
                        {onUpdateNotes && (
                            <div className="mb-8 border-t border-border-subtle pt-6">
                                <h3 className={`text-sm font-bold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                                    <StickyNote className="w-4 h-4 text-accent" />
                                    {isRtl ? (notes.length > 1 ? 'ההערות שלי' : 'ההערה שלי') : (notes.length > 1 ? 'My notes' : 'My note')}
                                </h3>

                                <div className="space-y-2.5">
                                    {/* A brand-new note is the newest, so its composer
                                        opens at the top of the list. */}
                                    {isNewNote && renderNoteComposer()}

                                    {notes.map((n) => (
                                        editingNoteId === n.id ? (
                                            <div key={n.id}>{renderNoteComposer()}</div>
                                        ) : (
                                            <div
                                                key={n.id}
                                                className="group/note relative rounded-xl bg-accent/[0.06] border border-accent/15 hover:border-accent/30 transition-colors"
                                            >
                                                <div onClick={() => startEditNote(n)} className="px-4 py-3.5 cursor-text">
                                                    <p dir="auto" className={`text-base text-text whitespace-pre-wrap leading-relaxed ${isRtl ? 'text-right' : ''}`}>
                                                        {n.text}
                                                    </p>
                                                    <span className={`mt-2 block text-[11px] font-medium text-text-muted/60 ${isRtl ? 'text-right' : ''}`}>
                                                        {getTimeAgo(n.updatedAt ?? n.createdAt, now)}
                                                    </span>
                                                </div>
                                                <div className={`absolute top-2 flex items-center gap-0.5 opacity-0 group-hover/note:opacity-100 focus-within:opacity-100 transition-opacity ${isRtl ? 'left-2' : 'right-2'}`}>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); startEditNote(n); }}
                                                        aria-label="Edit note"
                                                        title="Edit note"
                                                        className="p-1.5 hover:bg-fill-subtle rounded-md"
                                                    >
                                                        <Pencil className="w-4 h-4 text-text-muted/50 hover:text-text-muted" />
                                                    </button>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); deleteNote(n.id); }}
                                                        aria-label="Delete note"
                                                        title="Delete note"
                                                        className="p-1.5 hover:bg-fill-subtle rounded-md"
                                                    >
                                                        <Trash2 className="w-4 h-4 text-text-muted/50 hover:text-red-400" />
                                                    </button>
                                                </div>
                                            </div>
                                        )
                                    ))}
                                </div>

                                {/* Add another note — hidden while a new-note composer
                                    is already open (there's nothing to add on top of). */}
                                {!isNewNote && (
                                    <button
                                        onClick={startAddNote}
                                        className={`mt-2.5 w-full flex items-center gap-2 px-4 py-3 rounded-xl border border-dashed border-border-strong text-text-muted/70 hover:text-accent hover:border-accent/40 hover:bg-accent/[0.04] active:scale-[0.99] transition-all ${isRtl ? 'flex-row-reverse' : ''}`}
                                    >
                                        <Plus className="w-4 h-4 shrink-0" />
                                        <span className="text-sm font-semibold">
                                            {notes.length ? (isRtl ? 'הוסף הערה' : 'Add note') : (isRtl ? 'הוסף הערה' : 'Add a note')}
                                        </span>
                                    </button>
                                )}
                            </div>
                        )}

                        {/* Related cards — stored AI relations + live matches
                            (lib/related.ts), each with a one-line "why". Every
                            entry resolves to a live card, so tapping always
                            navigates. */}
                        {relatedCards.length > 0 && (
                            <div className="mb-8 border-t border-border-subtle pt-6">
                                <h3 className={`text-sm font-bold text-text-muted uppercase tracking-wider mb-4 flex items-center gap-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                                    <Network className="w-4 h-4" />
                                    {isRtl ? 'כרטיסים קשורים' : 'Related cards'}
                                </h3>
                                <div className="grid gap-3">
                                    {relatedCards.map(({ link: rel, reason, strong }) => (
                                        <div
                                            key={rel.id}
                                            onClick={() => onOpenOtherLink?.(rel)}
                                            className="group p-3 rounded-xl bg-card-hover border border-border-subtle shadow-sm hover:border-accent/50 transition-all cursor-pointer"
                                        >
                                            <div className="flex justify-between items-start gap-3">
                                                <h4
                                                    dir={isRtl ? "rtl" : "ltr"}
                                                    className={`font-medium text-text group-hover:text-accent transition-colors text-sm ${isRtl ? 'text-right' : ''}`}
                                                >
                                                    {rel.title}
                                                </h4>
                                                {strong && (
                                                    <span className="text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded font-mono">
                                                        strong
                                                    </span>
                                                )}
                                            </div>
                                            <p
                                                dir={isRtl ? "rtl" : "ltr"}
                                                className={`text-xs text-text-muted mt-1.5 font-normal italic ${isRtl ? 'text-right' : ''}`}
                                            >
                                                {reason}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>

        </div>
        </>
    );
}
