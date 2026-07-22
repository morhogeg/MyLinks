import { useCallback } from 'react';
import { Link, LinkStatus, UserNote } from '@/lib/types';
import { updateLinkStatus, updateLinkTags, updateLinkCategory, updateLinkTitle, updateLinkSummary, updateNoteText, updateLinkNotes, updateLinkReadStatus, retryFailedLink } from '@/lib/storage';
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
    const handleStatusChange = useCallback(async (id: string, status: LinkStatus, opts?: { silent?: boolean }) => {
        if (!uid) return;
        try {
            await updateLinkStatus(uid, id, status);
            // silent: callers whose UI already confirms the action (the Review
            // deck's fling + session tallies) skip the success toast — stacked
            // per-swipe toasts covered the deck's action buttons. Errors always toast.
            const labels: Record<string, string> = {
                archived: 'Archived',
                favorite: 'Added to favorites',
                unread: 'Marked as unread',
            };
            if (!opts?.silent && labels[status]) toast.success(labels[status]);
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
    // title/body from the single text and re-embeds.
    const handleUpdateNote = useCallback(async (id: string, text: string) => {
        if (!uid) return;
        try {
            await updateNoteText(uid, id, text);
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
                toast.error("The share link may not work — please try sharing again.")
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
        handleRetryProcessing,
        handleRemoveFromCollection,
        handleShareCard,
    };
}
