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

    return list.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
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
