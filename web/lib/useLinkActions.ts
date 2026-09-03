import { useCallback } from 'react';
import { CaptureState, Link, LinkStatus, UserNote } from '@/lib/types';
import { updateLinkStatus, updateLinkTags, updateLinkCategory, updateLinkTitle, updateLinkSummary, updateNoteText, updateLinkNotes, updateLinkReadStatus, retryFailedLink, generateCardSummary, enrichNoteCard } from '@/lib/storage';
import { newShareId, publishCard, removeLinkFromCollection } from '@/lib/collections';
import { shareLink, shareUrlFor } from '@/lib/share';
import { useToast } from '@/components/Toast';

/**
 * The card action handlers that depend only on [uid, toast] — extracted verbatim
 * from Feed (R-3), same behavior. Kept as stable useCallbacks so memoized cards
 * keep identical props across unrelated re-renders.
 *
 * Firestore's onSnapshot applies writes optimistically (latency compensation)
 * and reverts them if the write fails, so the UI updates instantly. We just
 * surface failures and confirm meaningful actions.
 */
export function useLinkActions(uid: string | null | undefined, toast: ReturnType<typeof useToast>) {
    const handleStatusChange = useCallback(async (
        id: string,
        status: LinkStatus,
        opts?: { silent?: boolean; from?: CaptureState },
    ) => {
        if (!uid) return;
        try {
            await updateLinkStatus(uid, id, status);
            // Name the TRANSITION, not the destination. `unread` is where three
            // different actions land — un-favourite, un-archive, and an explicit
            // "mark as unread" — so keying the label off `status` alone made
            // un-starring a card announce "Marked as unread" (owner, device QA
            // 2026-08-05). `opts.from` is the status being left; callers that
            // toggle a state OFF pass it, and the plain mark-as-unread path
            // doesn't, which is exactly the case that keeps the old label.
            //
            // silent: callers whose UI already confirms the action (the Review
            // deck's fling + session tallies) skip the success toast — stacked
            // per-swipe toasts covered the deck's action buttons. Errors always toast.
            //
            // ONE FIELD, SO SAY WHAT REALLY HAPPENED (PM-1A). favorite/archived/
            // unread are three values of the same `status`, so starring an
            // archived card also pulls it back into the feed, and archiving a
            // favorite also drops the star. We keep the data model (a card is in
            // exactly one of those states) and make the toast admit the side
            // effect instead of naming only the half the user tapped.
            const label =
                status === 'favorite'
                    ? (opts?.from === 'archived' ? 'Back in your feed and starred' : 'Added to favorites')
                    : status === 'archived'
                        ? (opts?.from === 'favorite' ? 'Archived, and no longer a favorite' : 'Archived')
                        : opts?.from === 'favorite' ? 'Removed from favorites'
                            : opts?.from === 'archived' ? 'Back in your feed'
                                : 'Marked as unread';
            if (!opts?.silent) toast.success(label);
        } catch {
            toast.error("Couldn't update the link. Please try again.");
        }
    }, [uid, toast]);

    const handleReadStatusChange = useCallback(async (id: string, isRead: boolean) => {
        if (!uid) return;
        try {
            await updateLinkReadStatus(uid, id, isRead);
        } catch {
            toast.error("Couldn't update read status. Please try again.");
        }
    }, [uid, toast]);

    const handleUpdateTags = useCallback(async (id: string, tags: string[]) => {
        if (!uid) return;
        try {
            await updateLinkTags(uid, id, tags);
        } catch {
            toast.error("Couldn't save tags. Please try again.");
        }
    }, [uid, toast]);

    const handleUpdateCategory = useCallback(async (id: string, category: string) => {
        if (!uid) return;
        try {
            await updateLinkCategory(uid, id, category);
        } catch {
            toast.error("Couldn't change category. Please try again.");
        }
    }, [uid, toast]);

    // Editable AI output — the summary/title the model produced is a draft, not a
    // verdict. Optimistic via onSnapshot latency compensation (same as the others).
    const handleUpdateTitle = useCallback(async (id: string, title: string, reembed = false) => {
        if (!uid) return;
        try {
            await updateLinkTitle(uid, id, title, reembed);
        } catch {
            toast.error("Couldn't save the title. Please try again.");
        }
    }, [uid, toast]);

    const handleUpdateSummary = useCallback(async (id: string, summary: string, reembed = false) => {
        if (!uid) return;
        try {
            await updateLinkSummary(uid, id, summary, reembed);
        } catch {
            toast.error("Couldn't save the summary. Please try again.");
        }
    }, [uid, toast]);

    // A note card is edited as ONE field (see updateNoteText) — re-derives
    // title/body from the single text and re-embeds. The edit reset the title
    // to the first line, so refresh the AI heading in the background the same
    // way capture does (titleOnly: an edit must not clobber tags/category the
    // user curated since capture).
    const handleUpdateNote = useCallback(async (id: string, text: string) => {
        if (!uid) return;
        try {
            await updateNoteText(uid, id, text);
            void enrichNoteCard(uid, id, text, { titleOnly: true });
        } catch {
            toast.error("Couldn't save your note. Please try again.");
        }
    }, [uid, toast]);

    // The user's personal notes on a card — their own annotations, distinct from
    // the AI summary. Takes the full desired note list (the editor computes it);
    // `removed` picks the right confirmation. Optimistic via onSnapshot latency
    // compensation. A note is user content (like a favorite/collection add, which
    // also confirm), so we acknowledge the save/removal.
    const handleUpdateNotes = useCallback(async (id: string, notes: UserNote[], removed = false) => {
        if (!uid) return;
        try {
            await updateLinkNotes(uid, id, notes);
            toast.success(removed ? 'Note removed' : 'Note saved');
        } catch {
            toast.error("Couldn't save your note. Please try again.");
        }
    }, [uid, toast]);

    // Machina's read of a text/note card, produced only when the reader asks for
    // it (the mark under the text). A card captured from the share sheet already
    // has one stored, so the modal reveals that without calling this at all; this
    // covers the cards that never had one — notes typed in the Note tab, and any
    // text saved before the summary was stored. Returns null on failure and the
    // caller keeps the button, so a dead network costs the user nothing.
    const handleGenerateSummary = useCallback(async (id: string, text: string) => {
        if (!uid) return null;
        const result = await generateCardSummary(uid, id, text);
        if (!result) toast.error("Couldn't write a summary. Please try again.");
        return result;
    }, [uid, toast]);

    // Retry analysis for a failed capture card (M3). Optimistically flips the card
    // back to `processing` and re-runs analysis in place; on failure it returns to
    // a `failed` card so nothing is ever lost.
    const handleRetryProcessing = useCallback(async (link: Link) => {
        if (!uid) return;
        try {
            await retryFailedLink(uid, link);
            toast.success('Retrying analysis…');
        } catch {
            toast.error("Couldn't analyze that link. Please try again.");
        }
    }, [uid, toast]);

    const handleRemoveFromCollection = useCallback(async (link: Link, collectionId: string) => {
        if (!uid) return;
        try {
            await removeLinkFromCollection(uid, link.id, collectionId);
            toast.success('Removed from collection');
        } catch {
            toast.error("Couldn't remove from the collection. Please try again.");
        }
    }, [uid, toast]);

    // Share a single card as a public Machina page.
    //
    // The shareId is client-generated, so we know the public URL before the
    // publish round-trip finishes. Open the OS share sheet IMMEDIATELY with that
    // URL and let the Cloud Function publish run in parallel — otherwise the
    // sheet waits several seconds on the (cold-startable) network write, and on
    // mobile web the `await` would also consume the transient user-activation
    // that navigator.share requires. By the time a recipient taps the link, the
    // snapshot is live. If the background publish fails we surface a toast.
    const handleShareCard = useCallback(async (link: Link) => {
        if (!uid) return;
        const shareId = newShareId();
        // Start the publish, but do NOT await it before opening the sheet.
        const publishPromise = publishCard(uid, link, shareId);

        const outcome = await shareLink(
            shareUrlFor(`/s?id=${shareId}`),
            link.title,
            'Saved on Machina'
        );

        if (outcome === 'copied') {
            // Clipboard path: no share sheet holds the link open, so confirm the
            // snapshot actually landed before claiming the copied link works.
            try {
                await publishPromise;
                toast.success('Share link copied to clipboard');
            } catch {
                toast.error("Couldn't create a share link. Please try again.");
            }
        } else if (outcome === 'shared') {
            // Sheet opened instantly; the publish is racing the user. Warn only
            // if it loses (otherwise the shared link would 404).
            publishPromise.catch(() =>
                toast.error("The share link may not work. Please try sharing again.")
            );
        } else {
            // 'failed' (couldn't even copy) or 'cancelled': swallow the publish
            // result so it never surfaces as an unhandled rejection.
            publishPromise.catch(() => {});
            if (outcome === 'failed') toast.error("Couldn't create a share link. Please try again.");
        }
    }, [uid, toast]);

    return {
        handleStatusChange,
        handleReadStatusChange,
        handleUpdateTags,
        handleUpdateCategory,
        handleUpdateTitle,
        handleUpdateSummary,
        handleUpdateNote,
        handleUpdateNotes,
        handleGenerateSummary,
        handleRetryProcessing,
        handleRemoveFromCollection,
        handleShareCard,
    };
}
