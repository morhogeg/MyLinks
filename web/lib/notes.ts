import { Link, UserNote } from '@/lib/types';
import { getTimestampNumber } from '@/lib/feedUtils';

/**
 * The ONE shared reader for a card's personal notes. Everything that displays,
 * searches, or edits notes goes through here so the two storage shapes are
 * reconciled in exactly one place:
 *
 *   - Legacy: a single `userNote` string (cards saved before multi-note).
 *   - Current: a `userNotes` array of discrete {id, text, createdAt} notes.
 *
 * `getNotes` merges both into one list, **newest first**. A legacy note is
 * surfaced as a single synthetic note (id `LEGACY_NOTE_ID`) timestamped by
 * `userNoteUpdatedAt` (falling back to the card's own createdAt), so it sorts
 * sensibly next to array notes. New writes always target `userNotes` and clear
 * the legacy field (see storage.updateLinkNotes), so a card converges to the
 * array shape the first time its notes are edited.
 */
export const LEGACY_NOTE_ID = 'legacy';

/** The most recent moment a note was touched — created or edited. Orders
    both the notes within a card and the cards within My Notes, so a note
    added OR edited a minute ago bubbles its card to the top. */
export function noteActivityAt(n: UserNote): number {
    return Math.max(n.updatedAt ?? 0, n.createdAt ?? 0);
}

export function getNotes(link: Link): UserNote[] {
    const list: UserNote[] = [];

    if (Array.isArray(link.userNotes)) {
        for (const n of link.userNotes) {
            if (n && typeof n.text === 'string' && n.text.trim()) {
                list.push({
                    id: n.id || newNoteId(),
                    text: n.text,
                    createdAt: typeof n.createdAt === 'number' ? n.createdAt : 0,
                    updatedAt: n.updatedAt,
                });
            }
        }
    }

    // A legacy single note reads as one note. Cards normally carry EITHER the
    // legacy string OR the array (migration clears the string), so this rarely
    // stacks with array notes — but merging both is harmless if it ever does.
    if (link.userNote && link.userNote.trim()) {
        list.push({
            id: LEGACY_NOTE_ID,
            text: link.userNote,
            createdAt: link.userNoteUpdatedAt ?? getTimestampNumber(link.createdAt),
            updatedAt: link.userNoteUpdatedAt,
        });
    }

    return list.sort((a, b) => noteActivityAt(b) - noteActivityAt(a));
}

/** True when the card carries any personal note (legacy or array). */
export function hasNotes(link: Link): boolean {
    return !!(link.userNote && link.userNote.trim())
        || (Array.isArray(link.userNotes) && link.userNotes.some(n => n?.text?.trim()));
}

/**
 * Does any of the card's notes contain `lowerQuery`? `lowerQuery` must already
 * be lower-cased by the caller (the feed lower-cases the query once). Iterates
 * both shapes directly — no sort — so it's cheap inside the feed filter loop.
 */
export function noteMatchesQuery(link: Link, lowerQuery: string): boolean {
    if (link.userNote && link.userNote.toLowerCase().includes(lowerQuery)) return true;
    if (Array.isArray(link.userNotes)) {
        for (const n of link.userNotes) {
            if (n?.text && n.text.toLowerCase().includes(lowerQuery)) return true;
        }
    }
    return false;
}

/**
 * All of a card's note text (legacy string + array) concatenated into one string,
 * for building the keyword-search haystack. Not lowercased — the caller lowercases
 * the whole blob once. Iterates both shapes directly, no sort, so it's cheap in the
 * per-keystroke filter loop.
 */
export function getNotesText(link: Link): string {
    const parts: string[] = [];
    if (link.userNote && link.userNote.trim()) parts.push(link.userNote);
    if (Array.isArray(link.userNotes)) {
        for (const n of link.userNotes) {
            if (n?.text) parts.push(n.text);
        }
    }
    return parts.join(' ');
}

/**
 * A note CARD the user typed themselves (+ → Note), as opposed to a card that
 * merely carries personal notes. Shared text (`captureType: 'text'`, from the
 * share sheet) is also `sourceType: 'note'`, but it is someone else's words
 * kept verbatim ("a note is something you wrote, text is something you kept",
 * SourceByline), so it is NOT one; its personal notes still list as usual.
 */
export function isWrittenNote(link: Link): boolean {
    return link.sourceType === 'note' && !link.captureType;
}

/** A note card's full text: the body for a long note, else the title (a short
    note is entirely its own title, see storage.splitNoteText). Mirrors the
    detail modal's `noteFullText`. */
export function noteCardText(link: Link): string {
    return (link.summary && link.summary.trim()) ? link.summary : link.title;
}

/** One entry in My Notes: a card with ALL of its personal notes, or a note
    card the user wrote (with any personal notes added to it since). */
export interface CardNotes {
    link: Link;
    /** The card's personal notes, newest first (via `getNotes`). Never empty
        unless `body` is set. */
    notes: UserNote[];
    /** Set only for a written note card (`isWrittenNote`): the note's own
        text. The entry then reads as the note itself, not as a card. */
    body?: string;
    /** Most recent activity (the note card's creation, or any personal note
        created/edited); orders the entries. */
    newestAt: number;
}

/**
 * Everything the user wrote themselves, one entry per card, newest first: the
 * data behind the central My Notes view. Two kinds of entry share one list:
 *   - a card with personal notes ("Add a note" in card detail) yields ONE
 *     entry carrying all of them, so the view never repeats the same card;
 *   - a note card saved via + → Note yields an entry carrying its text, so a
 *     note saved from the capture sheet is found where the name says it is.
 * Callers pass an already privacy/pending-filtered list.
 */
export function getNoteGroups(links: Link[]): CardNotes[] {
    const groups: CardNotes[] = [];
    for (const link of links) {
        const notes = getNotes(link);
        const body = isWrittenNote(link) ? noteCardText(link).trim() : '';
        if (notes.length === 0 && !body) continue;
        const noteAt = notes.length > 0 ? noteActivityAt(notes[0]) : 0;
        // A just-captured note's serverTimestamp reads null until the server
        // acks the write; it is the newest thing in the library, not the oldest.
        const writtenAt = body ? (getTimestampNumber(link.createdAt) || Date.now()) : 0;
        groups.push({ link, notes, ...(body ? { body } : {}), newestAt: Math.max(noteAt, writtenAt) });
    }
    return groups.sort((a, b) => b.newestAt - a.newestAt);
}

/** Build a brand-new note from composer text, stamped with `createdAt` now. */
export function makeNote(text: string): UserNote {
    return { id: newNoteId(), text: text.trim(), createdAt: Date.now() };
}

/** Return a copy of `note` with new text and an `updatedAt` stamp of now. */
export function touchNote(note: UserNote, text: string): UserNote {
    return { ...note, text: text.trim(), updatedAt: Date.now() };
}

/** A collision-resistant id for a freshly-added note. */
export function newNoteId(): string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
    }
    return `n_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
