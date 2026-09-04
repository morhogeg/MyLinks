'use client';

import { useState, useEffect, useRef } from 'react';
import { Link, StatusChangeHandler, UserNote } from '@/lib/types';
import SourceByline from './SourceByline';
import { ExternalLink, Star, X, Clock, Tag, Trash2, Bell, BellOff, Plus, Pencil, Circle, CircleCheck, Check, Network, Play, Youtube, ImageOff, Image as ImageIcon, ImagePlus, Loader2, Layers, Share2, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, StickyNote, Waypoints, EyeOff } from 'lucide-react';
import { getPlatform } from '@/lib/platform';
import SimpleMarkdown from './SimpleMarkdown';
import PosterImage from './ui/PosterImage';
import { openExternal } from '@/lib/share';
import { getCategoryColorStyle } from '@/lib/colors';
import CategoryInput from './CategoryInput';
import TagInput from './TagInput';
import { hasHebrew, getDominantDirection } from '@/lib/rtl';
import { useEdgeSwipeBack } from '@/lib/useEdgeSwipeBack';
import { useVisualViewport } from '@/lib/useVisualViewport';
import { getRelatedCards } from '@/lib/related';
import { getNotes, makeNote, touchNote } from '@/lib/notes';
import { hapticSuccess, hapticMedium } from '@/lib/haptics';
import { isHttpUrl } from '@/lib/url';
import CitationMark from './ui/CitationMark';
import ProBadge from './ui/ProBadge';
import { requestPaywall } from '@/lib/entitlement';
import { getActionableTakeaway } from '@/lib/takeaway';
import { addScreenshotsToCard, MAX_CARD_SCREENSHOTS } from '@/lib/enrich';
import { useToast } from '@/components/Toast';

// Sentinel `editingNoteId` for the composer when adding a brand-new note (as
// opposed to editing an existing one, keyed by its real id).
const NEW_NOTE_ID = '__new_note__';

// How long a card has to stay open before opening it counts as reading it. Long
// enough that a mis-tap the user immediately backs out of doesn't mark anything,
// short enough that a real read is always caught. A scroll marks it sooner.
const AUTO_READ_MS = 1500;

/**
 * Split a "M:SS — description" (or "H:MM:SS …") video highlight into its
 * timestamp-in-seconds and the human label. Returns seconds=null when no
 * leading timestamp is present so the entry still renders as plain text.
 */
function parseHighlight(entry: string): { seconds: number | null; label: string } {
    const match = entry.match(/^\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*[—\-–:]*\s*(.*)$/); // emdash-ok: parses timestamps in EXISTING cards (old prompt emitted "M:SS — text")
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
    onStatusChange: StatusChangeHandler;
    onReadStatusChange: (id: string, isRead: boolean) => void;
    onUpdateTags: (id: string, tags: string[]) => void;
    onUpdateCategory: (id: string, category: string) => void;
    onUpdateTitle?: (id: string, title: string, reembed?: boolean) => void;
    onUpdateSummary?: (id: string, summary: string, reembed?: boolean) => void;
    /** Edit a note card as one field — re-derives title/body from the text. */
    onUpdateNote?: (id: string, text: string) => void;
    onUpdateNotes?: (id: string, notes: UserNote[], removed?: boolean) => void;
    /** Write Machina's summary of a text/note card, on demand (the mark under
        the text). Resolves null on failure — the card is left untouched. */
    onGenerateSummary?: (id: string, text: string) => Promise<{ aiSummary: string; aiDetailedSummary: string } | null>;
    onDelete: (id: string) => void;
    onUpdateReminder: (link: Link) => void;
    onOpenOtherLink?: (link: Link) => void;
    excludeRelatedIds?: string[];  // cards already behind you in the back-stack
    /** Open the Graph focused on this card. Deliberately NOT in the top action
     *  row — that row already scrolls horizontally on a phone. It lives on the
     *  "Related cards" header instead, which is where the connections story
     *  already is, and which only renders when there ARE connections to see. */
    onOpenInGraph?: (link: Link) => void;
    onAddToCollection?: (link: Link) => void;
    onShare?: (link: Link) => void;
    /** Toggle the card's thumbnail banner on/off (Hide image / Show image). */
    onToggleThumbnail?: (link: Link) => void;
    /** Open revealed at the My-notes section (set when entered from the
        central My Notes view, so the user lands on what they came for). */
    scrollToNotes?: boolean;
    /** Open revealed at the "Related cards" section — set when returning from
        the Graph this card sent the user to, so "Back to card" lands on the
        exact spot the "See in graph" button was tapped from, not the top. */
    scrollToRelated?: boolean;
}

/**
 * PARTIAL CAPTURE, SAID ON THE CARD (PM-1C) — AND FIXED FROM THE CARD.
 *
 * One quiet line under the summary lead, on the cards whose page the scraper
 * could only partly read (a login wall, a social-preview teaser, a PDF). It is
 * deliberately NOT prose inside the summary: the model's writing stays the
 * model's writing, and this sits beside it as chrome the card owns.
 *
 * Under the line, ONE action: "Add a screenshot". It opens the photo picker
 * (native and web alike), sends the screenshots to the same card, and the
 * backend merges what it reads into it — the card keeps its identity, notes,
 * reminders and collections, loses the partial flag, and shows the screenshots
 * (lib/enrich.ts). This replaces the old trailing "How" word that expanded the
 * share-sheet steps: those steps made a NEW card and, in Hebrew, the dangling
 * "איך" read like part of the sentence (owner, 2026-09-04). While the backend
 * reads, the row says so; if it fails, the row says that and offers another
 * try. The line follows the CARD's language, like every other card element.
 */
function PartialCaptureNote({
    link,
    uid,
    isRtl,
    className = '',
}: {
    link: Link;
    uid: string | null;
    isRtl: boolean;
    className?: string;
}) {
    const toast = useToast();
    const inputRef = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const isPdf = link.captureReason === 'pdf';
    const reading = uploading || link.enrichStatus === 'processing';
    const failed = !reading && link.enrichStatus === 'failed';
    const line = isPdf
        ? (isRtl ? 'לא הצלחנו לקרוא את קובץ ה-PDF.' : 'Machina couldn’t read this PDF.')
        : (isRtl ? 'לא הצלחנו לקרוא את הפוסט במלואו.' : 'Machina couldn’t read the full post.');
    const hint = uid
        ? (isRtl ? 'הוסיפו צילום מסך שלו ונשלים את הכרטיס.' : 'Add a screenshot of it and Machina completes the card.')
        : (isRtl ? 'שתפו צילום מסך שלו כדי לקבל כרטיס מלא.' : 'Share a screenshot of it for the full card.');

    const onPick = async (files: File[]) => {
        if (!uid || !files.length || reading) return;
        setUploading(true);
        try {
            const { count } = await addScreenshotsToCard(uid, link.id, files);
            hapticSuccess();
            toast.success(count > 1
                ? (isRtl ? 'קוראים את צילומי המסך. הכרטיס יתעדכן בעוד רגע.' : 'Reading your screenshots. The card updates in a moment.')
                : (isRtl ? 'קוראים את צילום המסך. הכרטיס יתעדכן בעוד רגע.' : 'Reading your screenshot. The card updates in a moment.'));
        } catch (err) {
            toast.error(err instanceof Error ? err.message : (isRtl ? 'לא הצלחנו לשלוח את צילום המסך.' : 'Could not send the screenshot.'));
        } finally {
            setUploading(false);
            if (inputRef.current) inputRef.current.value = '';
        }
    };

    return (
        <div className={className} dir={isRtl ? 'rtl' : 'ltr'}>
            <p className="flex items-start gap-2 text-[13px] leading-relaxed text-text-muted">
                <EyeOff className="w-3.5 h-3.5 mt-[3px] shrink-0" aria-hidden="true" />
                <span className="min-w-0">{line} {hint}</span>
            </p>
            {uid && (
                <div className="mt-2.5 ms-[22px] flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    {reading ? (
                        <span className="inline-flex items-center gap-1.5 text-[13px] text-text-muted" role="status">
                            <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" aria-hidden="true" />
                            {isRtl ? 'קוראים את צילום המסך…' : 'Reading your screenshot…'}
                        </span>
                    ) : (
                        <>
                            <button
                                type="button"
                                onClick={() => inputRef.current?.click()}
                                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-card-hover border border-border-subtle text-[12px] font-semibold text-text-secondary hover:text-text hover:border-accent/40 transition-colors cursor-pointer"
                            >
                                <ImagePlus className="w-3.5 h-3.5 shrink-0 text-accent" aria-hidden="true" />
                                <span>{failed ? (isRtl ? 'נסו שוב' : 'Try again') : (isRtl ? 'הוסיפו צילום מסך' : 'Add a screenshot')}</span>
                            </button>
                            {failed && (
                                <span className="text-[12px] text-text-muted">
                                    {isRtl ? 'לא הצלחנו לקרוא את צילום המסך הזה.' : 'Couldn’t read that screenshot.'}
                                </span>
                            )}
                        </>
                    )}
                    <input
                        ref={inputRef}
                        type="file"
                        accept="image/*"
                        multiple
                        hidden
                        aria-label={isRtl ? 'בחירת צילום מסך' : 'Choose a screenshot'}
                        onChange={(e) => onPick(Array.from(e.target.files ?? []).slice(0, MAX_CARD_SCREENSHOTS))}
                    />
                </div>
            )}
        </div>
    );
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
    onUpdateNote,
    onUpdateNotes,
    onGenerateSummary,
    onDelete,
    onUpdateReminder,
    onOpenOtherLink,
    excludeRelatedIds,
    onOpenInGraph,
    onAddToCollection,
    onShare,
    onToggleThumbnail,
    scrollToNotes,
    scrollToRelated,
}: LinkDetailModalProps) {
    const [isEditingCategory, setIsEditingCategory] = useState(false);
    const [now, setNow] = useState<number>(0);
    const [isAddingTag, setIsAddingTag] = useState(false);
    // Correctable AI output: the title and summary the model produced are drafts
    // the user can fix. Drafts are held locally while editing, committed on Save.
    const [isEditingTitle, setIsEditingTitle] = useState(false);
    const [isEditingSummary, setIsEditingSummary] = useState(false);
    const [titleDraft, setTitleDraft] = useState('');
    const [summaryDraft, setSummaryDraft] = useState('');
    // A note card is edited as ONE field — the whole note text at once (title +
    // body are re-derived on save). Held separately from the title/summary drafts.
    const [isEditingNote, setIsEditingNote] = useState(false);
    const [noteTextDraft, setNoteTextDraft] = useState('');
    // The user's personal notes on this card — a list, newest first. One note is
    // open in the composer at a time: `editingNoteId` holds its id (or NEW_NOTE_ID
    // when adding a fresh note, or null when the list is just being read). The
    // draft text is held locally while writing, committed on Save/blur.
    const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
    const [noteDraft, setNoteDraft] = useState('');
    // Machina's read of a text card: closed by default (the point of a text card
    // is the text), opened by the mark. `summaryBusy` covers the one case that
    // isn't instant — a card that has no stored summary yet, so the tap has to go
    // write one. Both reset on card navigation below.
    const [summaryOpen, setSummaryOpen] = useState(false);
    const [summaryBusy, setSummaryBusy] = useState(false);
    // Broken-image fallbacks, keyed by URL — a multi-screenshot card renders a
    // gallery, and one dead image must not blank its healthy neighbours.
    const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});
    // Multi-screenshot carousel: which slide is in view (drives the counter +
    // dots). The container itself owns the position via scroll-snap.
    const [galleryIndex, setGalleryIndex] = useState(0);
    const galleryRef = useRef<HTMLDivElement>(null);
    // The carousel element survives navigating card → related card, so put it
    // back on slide 1 when the card changes (the index state resets alongside).
    useEffect(() => {
        galleryRef.current?.scrollTo({ left: 0 });
    }, [link.id]);
    // Scroll the carousel to a slide by index. The container is the only owner
    // of position (scroll-snap); `galleryIndex` follows via onScroll, so this
    // never fights the user's own swipe. DESKTOP is why this exists: a mouse
    // cannot swipe horizontally, so arrows/dots/keys drive the same scroll.
    const goToSlide = (i: number) => {
        const el = galleryRef.current;
        if (!el) return;
        const max = Math.max(0, Math.round(el.scrollWidth / Math.max(1, el.clientWidth)) - 1);
        const target = Math.max(0, Math.min(i, max));
        el.scrollTo({ left: target * el.clientWidth, behavior: 'smooth' });
    };
    // Reset the broken-image fallback when navigating to a different card. Done
    // as a render-time state adjustment (React discards this pass and re-renders
    // synchronously) rather than in an effect, avoiding a set-state-in-effect
    // cascade while preserving the previous [link.id] reset behavior.
    const [imgLinkId, setImgLinkId] = useState(link.id);
    if (imgLinkId !== link.id) {
        setImgLinkId(link.id);
        setFailedImages({});
        setGalleryIndex(0);
        // Abandon any in-progress edit when navigating to another card so a draft
        // never leaks onto the wrong card.
        setIsEditingTitle(false);
        setIsEditingSummary(false);
        setIsEditingNote(false);
        setEditingNoteId(null);
        setSummaryOpen(false);
        setSummaryBusy(false);
    }

    // A note card IS the user's own words — a single piece of writing, edited as
    // ONE field (see `onUpdateNote`), not a separate title + body. The full note
    // text lives in `summary` for anything longer than a one-liner; a short note
    // is entirely its own title. Editing re-derives both and re-embeds.
    const isNote = link.sourceType === 'note';
    // A TEXT card (shared paragraph) is a note card with a real heading: the AI
    // wrote the title, the user's words are the body. So it is edited like a link
    // — title pencil for the heading, body pencil for the text — NOT through the
    // single-field note editor, which re-derives the title from the first line
    // and would quietly delete the heading on the first edit. Everything else
    // about it stays a note (byline, no source link, re-embed on edit).
    const isTextCard = isNote && link.captureType === 'text';
    const isSingleFieldNote = isNote && !isTextCard;
    const noteFullText = (link.summary && link.summary.trim()) ? link.summary : link.title;
    const startEditNoteCard = () => { setNoteTextDraft(noteFullText); setIsEditingNote(true); };
    const saveNoteCard = () => {
        const t = noteTextDraft.trim();
        setIsEditingNote(false);
        if (t && t !== noteFullText.trim()) onUpdateNote?.(link.id, t);
    };
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
    // MACHINA'S READ — the summary as an OFFER on a text card, not its content.
    //
    // On an article the summary IS the card: it stands in for something you'd
    // otherwise have to go open. On text the user deliberately kept, it isn't —
    // the words are the thing, and replacing them with a paraphrase throws away
    // the only copy. So the body stays verbatim and the summary sits behind the
    // mark, one tap away. A share-sheet capture already carries one (the backend
    // wrote `aiSummary` at capture time without displaying it), so that tap is
    // instant; a note typed in the Note tab has none, so the first tap generates
    // one and stores it — instant every time after.
    const hasStoredSummary = !!(link.aiSummary?.trim() || link.aiDetailedSummary?.trim());
    const canSummarize = isNote && !(isSingleFieldNote && isEditingNote)
        && (hasStoredSummary || !!onGenerateSummary);
    const toggleSummary = async () => {
        if (summaryBusy) return;
        if (summaryOpen) { setSummaryOpen(false); return; }
        hapticMedium();
        if (hasStoredSummary) { setSummaryOpen(true); return; }
        if (!onGenerateSummary) return;
        setSummaryBusy(true);
        const res = await onGenerateSummary(link.id, noteFullText);
        setSummaryBusy(false);
        // Failure keeps the button exactly as it was (the handler toasts) — a
        // dead network must not leave a permanently empty section on the card.
        if (res) { setSummaryOpen(true); hapticSuccess(); }
    };

    // The note composer: refs + a pointer-down intent flag so save-on-blur can
    // never fight an explicit Save/Cancel/Delete tap. On iOS a button tap often
    // reports a null blur relatedTarget, so we record intent on pointerdown
    // (which fires before blur) rather than inferring it from focus movement.
    const noteTextareaRef = useRef<HTMLTextAreaElement>(null);
    const noteEditorRef = useRef<HTMLDivElement>(null);
    const noteActionRef = useRef<'save' | 'cancel' | 'delete' | null>(null);
    const notesSectionRef = useRef<HTMLDivElement>(null);
    const relatedSectionRef = useRef<HTMLDivElement>(null);

    // Entered from the central My Notes view: reveal the notes section once the
    // entrance animation has settled, so the user lands on what they tapped —
    // their note — not the top of the card. Mount-only by design: navigating on
    // to related cards resets to the normal top-anchored open.
    useEffect(() => {
        if (!scrollToNotes) return;
        const t = setTimeout(() => {
            notesSectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }, 320);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Returning from the Graph this card opened: land back on the Related cards
    // section, where the "See in graph" button is — same mount-only rule as the
    // notes reveal above, so walking on to another card opens normally.
    useEffect(() => {
        if (!scrollToRelated) return;
        const t = setTimeout(() => {
            relatedSectionRef.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
        }, 320);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

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
    // The ordered image set behind a screenshot card: the multi-image array when
    // present, else the single stored image. Scheme-guarded — a stored
    // javascript:/data: value must never render or open.
    const galleryUrls = (link.imageUrls?.length ? link.imageUrls : (link.sourceType === 'image' ? [link.url] : [])).filter((u): u is string => isHttpUrl(u));

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
    useEdgeSwipeBack(goBack, isOpen);

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

    // OPENING A CARD MARKS IT READ (PM-1B).
    //
    // Read used to flip only on an explicit tap, which meant the Unread filter
    // kept showing cards the user had already sat and read. Now the open view
    // itself is the signal: once the card has been open long enough to have been
    // looked at (AUTO_READ_MS), or the moment the reader scrolls it, we write
    // isRead once, silently. No toast: the user did not ask for a state change,
    // they asked to read, so announcing it would be chatter.
    //
    // Rules that keep it honest:
    //   - never write for a card that is already read (no redundant writes),
    //   - never write for a processing/failed capture (there is nothing to read
    //     yet, and the card is about to be replaced by the real one),
    //   - one write per card per open session (`autoReadIds`), so an explicit
    //     "Mark as unread" from the toolbar STICKS while the card is still open.
    // Reopening the card later marks it read again, which is the rule doing what
    // it says rather than a bug.
    const autoReadIds = useRef<Set<string>>(new Set());
    useEffect(() => {
        if (!isOpen || link.isRead) return;
        if (link.status === 'processing' || link.status === 'failed') return;
        const id = link.id;
        if (autoReadIds.current.has(id)) return;
        const markRead = () => {
            if (autoReadIds.current.has(id)) return;
            autoReadIds.current.add(id);
            onReadStatusChange(id, true);
        };
        const timer = setTimeout(markRead, AUTO_READ_MS);
        const el = scrollRef.current;
        el?.addEventListener('scroll', markRead, { passive: true });
        return () => {
            clearTimeout(timer);
            el?.removeEventListener('scroll', markRead);
        };
    }, [isOpen, link.id, link.isRead, link.status, onReadStatusChange]);

    // A11y: Escape closes the topmost open layer first — the distraction-free
    // reader, an inline category edit, or the add-tag input — otherwise it
    // dismisses the whole modal (same as the X / backdrop). Desktop-web win;
    // harmless in the native WKWebView where hardware keyboards are rare.
    useEffect(() => {
        if (!isOpen) return;
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            e.preventDefault();
            if (isEditingNote) setIsEditingNote(false);
            else if (isEditingTitle) setIsEditingTitle(false);
            else if (isEditingSummary) setIsEditingSummary(false);
            else if (editingNoteId) setEditingNoteId(null);
            else if (isEditingCategory) setIsEditingCategory(false);
            else if (isAddingTag) setIsAddingTag(false);
            else onClose();
        };
        window.addEventListener('keydown', onKey);
        return () => window.removeEventListener('keydown', onKey);
    }, [isOpen, isEditingNote, isEditingTitle, isEditingSummary, editingNoteId, isEditingCategory, isAddingTag, onClose]);

    if (!isOpen) return null;

    const isRtl = link.language === 'he' || hasHebrew(link.title) || hasHebrew(link.summary) || (link.detailedSummary ? hasHebrew(link.detailedSummary) : false);

    // Partial capture (PM-1C): the backend flagged this card's page as only
    // partly read. The sourceType check is belt and braces — the flag is only
    // ever written on the scraped web path — but the line must NEVER appear on a
    // screenshot, a note, or a text card (both of those are sourceType 'note'),
    // where "couldn't read the full post" is nonsense: nothing was scraped.
    const isPartialCapture = link.captureQuality === 'partial'
        && link.sourceType !== 'image'
        && !isNote;

    // Live related cards: stored AI relations merged with fresh embedding /
    // concept matches (see lib/related.ts). Computed here, below the isOpen
    // guard, so the closed modal costs nothing.
    const relatedCards = getRelatedCards(link, allLinks, isRtl, excludeRelatedIds);

    // Branded source credit, matching the card: YouTube channel in red, X
    // author (@handle from the URL) in the X grey, everything else muted.
    const isYouTube = getPlatform(link.url) === 'youtube' || link.sourceType === 'youtube';
    // The source byline is rendered by the shared <SourceByline> — don't
    // reintroduce per-view platform/author derivation here.

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
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent text-accent-ink text-xs font-bold hover:bg-accent-hover active:scale-95 transition-all"
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
                {/* Top padding ADDS the safe-area inset instead of using `safe-pt`,
                    which sets `padding-top: env(safe-area-inset-top)` and therefore
                    REPLACED the `p-3 sm:p-4` top padding. On any desktop browser the
                    inset is 0, so this row had 0px above the buttons and 16px below
                    — they sat hard against the top edge and read as vertically
                    off-centre (owner, 2026-07-27). On a notched device the inset is
                    now added to the normal padding rather than standing in for it. */}
                <div className="flex items-center gap-2 p-3 sm:p-4 pt-[calc(0.75rem+env(safe-area-inset-top))] sm:pt-[calc(1rem+env(safe-area-inset-top))] border-b border-border-subtle/60">
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
                            onClick={() => onStatusChange(link.id, link.status === 'favorite' ? 'unread' : 'favorite', { from: link.status })}
                            title={link.status === 'favorite' ? 'Remove from favorites' : 'Add to favorites'}
                            aria-label={link.status === 'favorite' ? 'Remove from favorites' : 'Add to favorites'}
                            // No filled chip when active: a solid yellow star already
                            // says "on" louder than any background could, and the
                            // tinted square read as a stray highlight next to the
                            // flat icons beside it. Matches ListCard's favorite
                            // marker, which has never had a container. The reminder
                            // button below KEEPS its blue chip — a bell has no fill
                            // state, so there the background is the only signal.
                            className={`shrink-0 h-10 w-10 rounded-xl flex items-center justify-center transition-colors ${link.status === 'favorite'
                                ? 'text-yellow-500'
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
                        {onToggleThumbnail && link.metadata?.thumbnailUrl && (
                            <button
                                onClick={() => onToggleThumbnail(link)}
                                title={link.hideThumbnail ? 'Show image' : 'Hide image'}
                                aria-label={link.hideThumbnail ? 'Show image' : 'Hide image'}
                                /* No filled "on" chip: this toggle already states
                                   itself through the icon (ImageIcon = show,
                                   ImageOff = hide), and the grey pill made one
                                   button in an otherwise flat row look selected
                                   for no reason a reader could decode. State now
                                   shows as icon + a brighter glyph, and hover
                                   matches every sibling. */
                                className={`shrink-0 h-10 w-10 rounded-xl flex items-center justify-center transition-colors hover:text-accent hover:bg-card-hover ${link.hideThumbnail ? 'text-text' : 'text-text-muted'
                                    }`}
                            >
                                {link.hideThumbnail ? <ImageIcon className="w-[18px] h-[18px]" /> : <ImageOff className="w-[18px] h-[18px]" />}
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
                    {isHttpUrl(link.url) && (
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
                    {/* Content Section — screenshot/image source. A multi-screenshot
                        card shows ONE image with the rest a flick away — a
                        horizontal snap carousel (counter + dots), the same gesture
                        as the Instagram post it usually came from. Pinned LTR so
                        slide 1 starts visible and the flick direction is identical
                        on Hebrew cards. Each image keeps zoom-to-open, and one
                        broken image never hides its neighbours. */}
                    {(link.sourceType === 'image' || (!!link.enrichedAt && !!link.imageUrls?.length)) && (() => {
                        // A web card completed from the user's screenshots
                        // (enrichedAt + imageUrls) shows them the same way — the
                        // screenshot IS the source the card was read from.
                        const slides = galleryUrls.filter((u) => !failedImages[u]);
                        const slideIndex = Math.min(galleryIndex, slides.length - 1);
                        return slides.length > 0 ? (
                            <div dir="ltr" className="group/gallery relative mb-6 rounded-2xl overflow-hidden border border-border-subtle bg-card-hover">
                                <div
                                    ref={galleryRef}
                                    onScroll={() => {
                                        const el = galleryRef.current;
                                        if (!el) return;
                                        const idx = Math.round(el.scrollLeft / Math.max(1, el.clientWidth));
                                        setGalleryIndex((prev) => (prev === idx ? prev : idx));
                                    }}
                                    // Keyboard parity with the arrows (and the only route for
                                    // someone not using a pointer). Focusable only when there IS
                                    // more than one slide, so a single screenshot adds no stop.
                                    tabIndex={slides.length > 1 ? 0 : undefined}
                                    role={slides.length > 1 ? 'group' : undefined}
                                    aria-label={slides.length > 1 ? `Screenshots, ${slides.length} images` : undefined}
                                    onKeyDown={(e) => {
                                        if (slides.length < 2) return;
                                        if (e.key === 'ArrowRight') { e.preventDefault(); goToSlide(slideIndex + 1); }
                                        if (e.key === 'ArrowLeft') { e.preventDefault(); goToSlide(slideIndex - 1); }
                                    }}
                                    className="flex overflow-x-auto snap-x snap-mandatory outline-none [&::-webkit-scrollbar]:hidden"
                                    style={{ scrollbarWidth: 'none' }}
                                >
                                    {slides.map((u, i) => (
                                        <div key={u} className="w-full shrink-0 snap-center flex items-center justify-center group/img relative">
                                            <img
                                                src={u}
                                                alt={slides.length > 1 ? `Screenshot ${i + 1} of ${slides.length}` : 'Source screenshot'}
                                                onError={() => setFailedImages((prev) => ({ ...prev, [u]: true }))}
                                                className="w-full h-auto max-h-[400px] object-contain cursor-zoom-in"
                                                onClick={() => {
                                                    // Guard the scheme (never open a stored javascript:/data: URL)
                                                    // and pass noopener so the opened page can't reach window.opener.
                                                    if (isHttpUrl(u)) {
                                                        window.open(u, '_blank', 'noopener,noreferrer');
                                                    }
                                                }}
                                            />
                                            <div className="absolute inset-0 bg-black/40 opacity-0 [@media(hover:hover)]:group-hover/img:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
                                                <span className="text-white text-xs font-bold px-3 py-1.5 bg-black/60 rounded-full backdrop-blur-md border border-white/20">
                                                    Click to View Original
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {slides.length > 1 && (
                                    <>
                                        <span className="absolute top-2 end-2 text-[10px] font-bold text-white bg-black/60 px-2 py-0.5 rounded-full pointer-events-none z-10">
                                            {slideIndex + 1}/{slides.length}
                                        </span>
                                        {/* DESKTOP navigation. A mouse cannot swipe a scroll
                                            container sideways, so without these the other
                                            slides were unreachable on desktop (owner, 2026-08-24).
                                            Hover-revealed on pointer devices only — a phone has
                                            the swipe and doesn't need chrome over the image —
                                            and each arrow hides at its end of the set. */}
                                        <button
                                            type="button"
                                            aria-label="Previous screenshot"
                                            onClick={(e) => { e.stopPropagation(); goToSlide(slideIndex - 1); }}
                                            className={`hidden [@media(hover:hover)]:flex absolute start-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md border border-white/15 opacity-0 group-hover/gallery:opacity-100 focus-visible:opacity-100 hover:bg-black/75 active:scale-95 transition-all ${slideIndex === 0 ? 'pointer-events-none !opacity-0' : ''}`}
                                        >
                                            <ChevronLeft className="w-4 h-4" />
                                        </button>
                                        <button
                                            type="button"
                                            aria-label="Next screenshot"
                                            onClick={(e) => { e.stopPropagation(); goToSlide(slideIndex + 1); }}
                                            className={`hidden [@media(hover:hover)]:flex absolute end-2 top-1/2 -translate-y-1/2 z-10 w-8 h-8 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-md border border-white/15 opacity-0 group-hover/gallery:opacity-100 focus-visible:opacity-100 hover:bg-black/75 active:scale-95 transition-all ${slideIndex === slides.length - 1 ? 'pointer-events-none !opacity-0' : ''}`}
                                        >
                                            <ChevronRight className="w-4 h-4" />
                                        </button>
                                        {/* Dots are real controls, not decoration: tapping one
                                            jumps to that slide (the second desktop route, and
                                            the only always-visible one). */}
                                        <div className="absolute bottom-2 inset-x-0 flex justify-center z-10">
                                            <div className="flex items-center gap-1 bg-black/35 backdrop-blur-md px-1.5 py-1 rounded-full">
                                                {slides.map((u, i) => (
                                                    <button
                                                        key={u}
                                                        type="button"
                                                        aria-label={`Screenshot ${i + 1}`}
                                                        aria-current={i === slideIndex}
                                                        onClick={(e) => { e.stopPropagation(); goToSlide(i); }}
                                                        className="p-1 -m-0.5 flex items-center justify-center"
                                                    >
                                                        <span
                                                            className={`block w-1.5 h-1.5 rounded-full transition-colors duration-200 ${i === slideIndex ? 'bg-white' : 'bg-white/40'}`}
                                                        />
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>
                        ) : (
                            <div className="mb-6 rounded-2xl border border-dashed border-border-subtle bg-card-hover/50 px-4 py-8 flex flex-col items-center justify-center gap-2 text-center">
                                <ImageOff className="w-7 h-7 text-text-muted/60" />
                                <p className="text-sm font-semibold text-text-secondary">Screenshot unavailable</p>
                                <p className="text-xs text-text-muted max-w-xs">
                                    The original image isn&apos;t stored for this item. The summary below is still available.
                                </p>
                            </div>
                        );
                    })()}

                    {/* Social-post cover (X / Instagram): the image we read for the
                        summary. Non-video, non-screenshot cards only — the youtube
                        and image blocks own their own rendering above/below. */}
                    {!link.hideThumbnail && link.sourceType !== 'youtube' && link.sourceType !== 'image' && link.metadata?.thumbnailUrl && (
                        <div className="mb-6 rounded-2xl overflow-hidden border border-border-subtle bg-black/40">
                            <PosterImage
                                src={link.metadata.thumbnailUrl}
                                className="w-full h-auto max-h-[400px] object-contain"
                            />
                        </div>
                    )}

                    {/* YouTube: thumbnail (the inline player trips a YouTube "error
                        153" in the WebView) + clickable key moments that deep-link
                        into the video on YouTube. */}
                    {link.sourceType === 'youtube' && link.metadata?.videoId && (() => {
                        const videoId = link.metadata.videoId;
                        const thumb = link.metadata.thumbnailUrl || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
                        return (
                        <div className="mb-6 space-y-4">
                            {!link.hideThumbnail && (
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
                            )}

                            {/* Free plan: the video was not watched (metadata-only
                                card). One honest line, and the way to change it. */}
                            {link.proFeature === 'youtube' && (
                                <button
                                    onClick={() => requestPaywall('youtube')}
                                    className="w-full flex items-center gap-2.5 rounded-2xl border border-border-strong bg-fill-subtle px-4 py-3 text-start hover:bg-card-hover transition-colors cursor-pointer"
                                >
                                    <ProBadge />
                                    <span className="flex-1 min-w-0 text-[13px] text-text-secondary leading-snug">
                                        Video transcripts are a Pro feature. This card was filed from the video’s title and description.
                                    </span>
                                    <ChevronRight className="w-4 h-4 shrink-0 text-text-muted" />
                                </button>
                            )}

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
                                    <SourceByline link={link} size="md" />
                                </div>
                            );
                        })()}
                    </div>

                    {isSingleFieldNote && isEditingNote ? (
                        // A note is ONE piece of writing — edited in a single field
                        // (title + body are re-derived on save), not a title box and a
                        // detached body pencil. This replaces the whole title+body area.
                        <div className="mb-6">
                            <textarea
                                value={noteTextDraft}
                                onChange={(e) => setNoteTextDraft(e.target.value)}
                                onKeyDown={(e) => {
                                    // ⌘/Ctrl+Enter saves; plain Enter is a newline (notes are multiline).
                                    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); saveNoteCard(); }
                                }}
                                rows={8}
                                autoFocus
                                dir="auto"
                                aria-label="Edit note"
                                className={`w-full text-base text-text leading-relaxed bg-background border border-accent/40 rounded-xl px-3.5 py-3 focus:outline-none focus:ring-2 focus:ring-accent/50 resize-y min-h-[8rem] ${isRtl ? 'text-right' : ''}`}
                            />
                            <div className="flex gap-2 mt-3">
                                <button
                                    onClick={saveNoteCard}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-accent text-accent-ink text-sm font-bold hover:bg-accent-hover active:scale-95 transition-all"
                                >
                                    <Check className="w-4 h-4" /> Save
                                </button>
                                <button
                                    onClick={() => setIsEditingNote(false)}
                                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-fill-subtle text-text-muted text-sm font-bold hover:text-text hover:bg-fill-strong transition-all"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    ) : isEditingTitle ? (
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
                                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent text-accent-ink text-xs font-bold hover:bg-accent-hover active:scale-95 transition-all"
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
                        // The edit pencil flows INLINE right after the title text
                        // (not a flex sibling), so it never reserves a right-hand
                        // column that squeezes the title into early wrapping. For a
                        // note it opens the single-field note editor (title + body as
                        // one); for a link it edits just the title.
                        <h2
                            dir="auto"
                            className={`group/title font-bold text-2xl text-text leading-tight mb-4 ${isRtl ? 'text-right' : ''}`}
                        >
                            {link.title}
                            {(isSingleFieldNote ? onUpdateNote : onUpdateTitle) && (
                                <button
                                    onClick={() => { if (isSingleFieldNote) startEditNoteCard(); else { setTitleDraft(link.title); setIsEditingTitle(true); } }}
                                    aria-label={isSingleFieldNote ? 'Edit note' : 'Edit title'}
                                    title={isSingleFieldNote ? 'Edit note' : 'Edit title'}
                                    className={`inline-flex items-center justify-center align-middle ms-2 w-7 h-7 rounded-lg text-text-muted hover:text-text hover:bg-fill-subtle focus:opacity-100 transition-colors ${isNote ? '' : 'opacity-0 group-hover/title:opacity-100 transition-opacity'}`}
                                >
                                    <Pencil className="w-[18px] h-[18px]" />
                                </button>
                            )}
                        </h2>
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
                            to strip, so we show it alone to avoid duplicating it.
                            While a note's single-field editor is open, its read-only
                            body is hidden so the text isn't shown twice. */}
                        {!(isSingleFieldNote && isEditingNote) && (
                        <div className="mb-6">
                            {(() => {
                                const detailed = link.detailedSummary || '';
                                const headingIdx = detailed.indexOf('## ');
                                // A kept Ask ANSWER is exempt from the gist-strip:
                                // its detailedSummary is the whole answer and its
                                // summary is that answer's own first paragraph, so
                                // slicing at the first "## " would silently drop
                                // every word between them. It renders whole, once.
                                const hasSections = link.captureType !== 'answer' && headingIdx >= 0;
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
                                                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-accent text-accent-ink text-xs font-bold hover:bg-accent-hover active:scale-95 transition-all"
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
                                                            className="reading-prose"
                                                        />
                                                        {/* Non-note summaries keep a quiet hover pencil to correct
                                                            AI output. Notes are edited via the single pencil on the
                                                            title (the whole note is one field), so no body control.
                                                            A TEXT card gets neither: hover doesn't exist on a phone,
                                                            and a pencil floating over the first line collides with
                                                            the user's own words — it gets the labelled control below
                                                            the text instead. */}
                                                        {!isSingleFieldNote && !isTextCard && onUpdateSummary && (
                                                            <button
                                                                onClick={startEditSummary}
                                                                aria-label="Edit summary"
                                                                title="Edit summary"
                                                                className={`absolute top-0 inline-flex items-center justify-center w-8 h-8 rounded-lg text-text-muted hover:text-text hover:bg-fill-subtle opacity-0 group-hover/summary:opacity-100 focus:opacity-100 transition-opacity ${isRtl ? 'left-0' : 'right-0'}`}
                                                            >
                                                                <Pencil className="w-4 h-4" />
                                                            </button>
                                                        )}
                                                    </div>
                                                )}
                                                {/* A text card's body is the user's own words, so its edit
                                                    affordance is named and always reachable — never a
                                                    hover-only glyph sitting on top of the text. */}
                                                {isTextCard && onUpdateSummary && (
                                                    <button
                                                        onClick={startEditSummary}
                                                        className="mb-2 inline-flex items-center gap-1.5 text-xs font-bold text-text-muted/60 hover:text-accent transition-colors"
                                                    >
                                                        <Pencil className="w-3.5 h-3.5" /> Edit text
                                                    </button>
                                                )}
                                                {/* Legacy prose-only cards hide the lead to avoid a
                                                    duplicate — still let the user correct the summary. */}
                                                {!showLead && !isSingleFieldNote && onUpdateSummary && (
                                                    <button
                                                        onClick={startEditSummary}
                                                        className="mb-4 inline-flex items-center gap-1.5 text-xs font-bold text-text-muted/60 hover:text-accent transition-colors"
                                                    >
                                                        <Pencil className="w-3.5 h-3.5" /> Edit summary
                                                    </button>
                                                )}
                                            </>
                                        )}
                                        {/* Directly under the lead, above the deeper
                                            sections: the first thing you read is the
                                            summary, the second is how complete it is. */}
                                        {isPartialCapture && (
                                            <PartialCaptureNote
                                                link={link}
                                                uid={uid}
                                                isRtl={isRtl}
                                                className={detailBody ? 'mb-6' : ''}
                                            />
                                        )}
                                        {detailBody && (
                                            <SimpleMarkdown
                                                content={detailBody}
                                                isRtl={isRtl}
                                                className="reading-prose"
                                            />
                                        )}
                                    </>
                                );
                            })()}
                        </div>
                        )}

                        {/* DO THIS — the one concrete action this card supports.
                            The analysis writes a takeaway only when the content
                            genuinely carries one, so most cards render nothing here
                            (see lib/takeaway). It sits at the END of the summary,
                            because it is the last thing the summary has to say —
                            and it is deliberately QUIET: a label and one line of
                            body text at the summary's own type scale, never a
                            callout box competing with the card. An answer card is
                            already an answer to the user's own question, so it
                            never gets one. */}
                        {(() => {
                            const takeaway = getActionableTakeaway(link);
                            // Saved Ask answers are marked captureType 'answer'.
                            // Compared as a plain string so the guard holds whether
                            // or not that value is in the union yet.
                            const isAnswerCard = String(link.captureType) === 'answer';
                            if (!takeaway || isAnswerCard) return null;
                            return (
                                <div className="mb-6" dir={isRtl ? 'rtl' : 'ltr'}>
                                    {/* Same label treatment as Machina's read below, so
                                        the two read as sibling sections rather than two
                                        unrelated inventions. Hebrew skips the uppercase
                                        (a no-op) and the wide tracking (which only makes
                                        Hebrew look loose). */}
                                    <div className={`flex items-center gap-2 mb-2 text-sm font-bold text-text-muted ${isRtl ? '' : 'uppercase tracking-wider'}`}>
                                        <CircleCheck className="w-4 h-4 shrink-0 text-accent" />
                                        <span>{isRtl ? 'לעשות' : 'Do this'}</span>
                                    </div>
                                    <p className={`reading-prose text-text-secondary leading-relaxed ${isRtl ? 'text-right' : 'text-left'}`}>
                                        {takeaway}
                                    </p>
                                </div>
                            );
                        })()}

                        {/* MACHINA'S READ — a divided section under the user's own
                            text. Closed, it's a single quiet row carrying the mark:
                            an offer, weighted below the text it summarizes. Open, it
                            reads like every other summary in the app (the same
                            SimpleMarkdown prose), separated by its own rule so the
                            AI's words can never be mistaken for the user's. */}
                        {canSummarize && (
                            <div className="mb-8 border-t border-border-subtle pt-6">
                                {summaryOpen ? (
                                    <>
                                        {/* The whole header row collapses the section — a chevron,
                                            not a "Hide" word, mirroring the closed row's chevron so
                                            open/closed read as two states of one control. */}
                                        <button
                                            onClick={() => setSummaryOpen(false)}
                                            aria-label="Collapse Machina's read"
                                            aria-expanded="true"
                                            className="w-full text-sm font-bold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-2 hover:text-text transition-colors text-left"
                                        >
                                            <CitationMark state="listening" size={16} className="text-accent shrink-0" />
                                            {/* Always English, always LTR — a product-brand control,
                                                not card content (owner call, build 1313: localizing
                                                it read worse than the mixed-direction row it fixed). */}
                                            <span className="flex-1">Machina’s read</span>
                                            <ChevronUp className="w-4 h-4 shrink-0 text-text-muted/60" />
                                        </button>
                                        {(() => {
                                            const detailed = link.aiDetailedSummary || '';
                                            const headingIdx = detailed.indexOf('## ');
                                            const detailBody = headingIdx >= 0 ? detailed.slice(headingIdx) : detailed;
                                            return (
                                                <>
                                                    {link.aiSummary && (
                                                        <SimpleMarkdown
                                                            content={link.aiSummary}
                                                            isRtl={isRtl}
                                                            className={`reading-prose ${detailBody ? 'mb-6' : ''}`}
                                                        />
                                                    )}
                                                    {detailBody && (
                                                        <SimpleMarkdown content={detailBody} isRtl={isRtl} className="reading-prose" />
                                                    )}
                                                </>
                                            );
                                        })()}
                                    </>
                                ) : hasStoredSummary ? (
                                    /* A STORED read is a disclosure, not an offer: the same flat
                                       header row as the open state with only the chevron flipped,
                                       so expand/collapse reads as one control changing state
                                       (owner design call, 2026-09-01 — the earlier boxed row made
                                       the saved read look like a second card competing with the
                                       user's own text). Button chrome is reserved for the
                                       generate-CTA below, the one state that performs paid work. */
                                    <button
                                        onClick={toggleSummary}
                                        aria-label="Expand Machina's read"
                                        aria-expanded="false"
                                        className="w-full text-sm font-bold text-text-muted uppercase tracking-wider flex items-center gap-2 hover:text-text transition-colors text-left"
                                    >
                                        <CitationMark state="listening" size={16} className="text-accent shrink-0" />
                                        <span className="flex-1">Machina’s read</span>
                                        <ChevronDown className="w-4 h-4 shrink-0 text-text-muted/60" />
                                    </button>
                                ) : (
                                    <button
                                        onClick={toggleSummary}
                                        disabled={summaryBusy}
                                        aria-busy={summaryBusy}
                                        aria-expanded="false"
                                        className="group/read w-full flex items-center gap-3 rounded-2xl border border-border-subtle bg-fill-subtle/60 hover:bg-fill-subtle px-4 py-3.5 transition-colors active:scale-[0.99] disabled:active:scale-100 text-left"
                                    >
                                        <CitationMark
                                            state={summaryBusy ? 'shaping' : 'listening'}
                                            size={22}
                                            className="text-accent shrink-0"
                                        />
                                        <span className="min-w-0 flex-1">
                                            <span className="block text-sm font-bold text-text">
                                                {summaryBusy ? 'Reading your text…' : 'Summarize with Machina'}
                                            </span>
                                            <span className="block text-xs text-text-muted">
                                                {summaryBusy ? 'One moment' : 'Your text stays exactly as you saved it'}
                                            </span>
                                        </span>
                                    </button>
                                )}
                            </div>
                        )}

                        {/* BASED ON — the cards this answer was built from, on an
                            'answer' card only. `answerSources` is denormalized onto
                            the card at save time (lib/answerCards) so the SHARE path
                            has titles even for cards outside the loaded window, but
                            what renders here is resolved against the live feed —
                            exactly like the Related cards list below. That is not
                            only about deleted cards: `allLinks` hides everything in
                            the PIN-locked privacy vault, and a private card's title
                            must not surface on an ordinary card's detail view just
                            because an answer once cited it. Unresolved sources
                            simply don't appear. */}
                        {link.captureType === 'answer' && (() => {
                            const basedOn = (link.answerSources ?? [])
                                .map((src) => allLinks.find((l) => l.id === src.id))
                                .filter((l): l is Link => !!l);
                            if (basedOn.length === 0) return null;
                            return (
                                <div className="mb-8">
                                    <h3 className={`text-sm font-bold text-text-muted uppercase tracking-wider mb-3 flex items-center gap-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                                        <CitationMark state="listening" size={16} className="text-accent shrink-0" />
                                        {isRtl ? 'מבוסס על' : 'Based on'}
                                    </h3>
                                    <div className="flex flex-wrap gap-2">
                                        {basedOn.map((src) => (
                                            <button
                                                key={src.id}
                                                onClick={() => onOpenOtherLink?.(src)}
                                                title={src.title}
                                                className="group inline-flex max-w-full items-center gap-2 px-3 py-2 rounded-xl bg-card-hover border border-border-subtle shadow-sm hover:border-accent/50 transition-colors cursor-pointer text-start"
                                            >
                                                {/* Each title takes its own direction: a Hebrew
                                                    source cited by an English answer reads RTL
                                                    inside its own chip. */}
                                                <span dir="auto" className="min-w-0 truncate text-[13px] font-medium text-text group-hover:text-accent transition-colors">
                                                    {src.title}
                                                </span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            );
                        })()}

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
                                    className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-accent/10 border border-accent/20 text-accent cursor-pointer hover:brightness-110 active:scale-95 transition-all"
                                >
                                    <Bell className="w-3.5 h-3.5" />
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
                            <div ref={notesSectionRef} className="mb-8 border-t border-border-subtle pt-6 scroll-mt-4">
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
                            <div ref={relatedSectionRef} className="mb-8 border-t border-border-subtle pt-6 scroll-mt-4">
                                <div className={`mb-4 flex items-center justify-between gap-3 ${isRtl ? 'flex-row-reverse' : ''}`}>
                                    <h3 className={`text-sm font-bold text-text-muted uppercase tracking-wider flex items-center gap-2 ${isRtl ? 'flex-row-reverse' : ''}`}>
                                        <Network className="w-4 h-4" />
                                        {isRtl ? 'כרטיסים קשורים' : 'Related cards'}
                                    </h3>
                                    {/* The list above is this card's connections as a
                                        list; this opens the same ties as a map, with
                                        the card itself in focus. */}
                                    {onOpenInGraph && (
                                        <button
                                            onClick={() => onOpenInGraph(link)}
                                            title={isRtl ? 'הצג בגרף' : 'See this card in the graph'}
                                            aria-label={isRtl ? 'הצג בגרף' : 'See this card in the graph'}
                                            className={`shrink-0 inline-flex items-center gap-1.5 h-8 px-3 rounded-full bg-card-hover border border-border-subtle text-[12px] font-semibold text-text-secondary hover:text-text hover:border-accent/40 transition-colors cursor-pointer ${isRtl ? 'flex-row-reverse' : ''}`}
                                        >
                                            <Waypoints className="w-3.5 h-3.5 shrink-0 text-accent" />
                                            <span>{isRtl ? 'הצג בגרף' : 'See in graph'}</span>
                                        </button>
                                    )}
                                </div>
                                <div className="grid gap-3">
                                    {relatedCards.map(({ link: rel, reason, strong }) => {
                                        // Each piece takes its OWN direction from its own text: the title
                                        // from the related card's title, the reason from the reason
                                        // sentence — they can be in different languages (a Hebrew card
                                        // related to an English one gets an English "why"), and forcing
                                        // the title's direction onto an English reason rendered it
                                        // backwards, period on the left (owner, 2026-07-28). The reason
                                        // uses dir="auto" (first-strong), NOT the dominant-letter count:
                                        // a Hebrew sentence naming a long English concept ("נוגע גם
                                        // ב־Accountability") has more Latin letters than Hebrew ones,
                                        // and a dominant-LTR base stranded the maqaf at the far left,
                                        // fused against nothing (owner, 2026-08-22).
                                        const relRtl = getDominantDirection(rel.title, isRtl ? 'rtl' : 'ltr') === 'rtl';
                                        return (
                                        <div
                                            key={rel.id}
                                            onClick={() => onOpenOtherLink?.(rel)}
                                            className="group p-3 rounded-xl bg-card-hover border border-border-subtle shadow-sm hover:border-accent/50 transition-all cursor-pointer"
                                        >
                                            <div className={`flex justify-between items-start gap-3 ${relRtl ? 'flex-row-reverse' : ''}`}>
                                                <h4
                                                    dir={relRtl ? "rtl" : "ltr"}
                                                    className={`flex-1 min-w-0 font-medium text-text group-hover:text-accent transition-colors text-sm ${relRtl ? 'text-right' : ''}`}
                                                >
                                                    {rel.title}
                                                </h4>
                                                {strong && (
                                                    <span className="shrink-0 text-[10px] bg-accent/20 text-accent px-1.5 py-0.5 rounded font-mono">
                                                        strong
                                                    </span>
                                                )}
                                            </div>
                                            <p
                                                dir="auto"
                                                className="text-xs text-text-muted mt-1.5 font-normal italic text-start"
                                            >
                                                {reason}
                                            </p>
                                        </div>
                                        );
                                    })}
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
