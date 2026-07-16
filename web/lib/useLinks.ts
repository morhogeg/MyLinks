import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from '@/lib/types';
import { toLink } from '@/lib/storage';
import { collection, query, orderBy, where, limit, onSnapshot, getDocsFromServer, QuerySnapshot, DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/components/Toast';
import { reportError } from '@/lib/errorReporter';

/** One page of the growing feed window (report 3.15). */
const PAGE_SIZE = 150;

/**
 * Real-time Firestore subscription for the user's links, plus the pull-to-refresh
 * authoritative re-read.
 *
 * WINDOWED (report 3.15): rather than subscribing to the ENTIRE links collection
 * (which bills a read per card every cold session and mounts the whole library),
 * the subscription carries a growing `limit`. It starts at PAGE_SIZE and grows by
 * a page each time `loadMore()` is called (wired to a scroll sentinel in Feed).
 * New saves always appear because they sort to the TOP of the ordered window
 * (createdAt desc). `hasMore` is false once a snapshot returns fewer docs than the
 * current window — there is nothing more on the server — and `loadMore` is then a
 * no-op. Keyword search/filter operate over the loaded window (accepted per the
 * report); semantic search is server-side over the full library.
 */
export function useLinks(uid: string | null | undefined, toast: ReturnType<typeof useToast>) {
    // Docs from the growing feed window (createdAt-desc, limited).
    const [windowLinks, setWindowLinks] = useState<Link[]>([]);
    // Docs the backend has flagged `reminderDue` — see the second subscription.
    const [reminderLinks, setReminderLinks] = useState<Link[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [windowSize, setWindowSize] = useState(PAGE_SIZE);
    // True while the last window snapshot completely filled its limit (so older
    // docs remain on the server). Derived at snapshot time from the window doc
    // count — NOT from the merged `links` below, which can exceed the window once
    // out-of-window reminder docs are folded in.
    const [hasMore, setHasMore] = useState(false);

    // A workspace change unmounts Feed (AuthProvider gates children behind the
    // login screen), so this hook re-initializes at PAGE_SIZE on the next
    // sign-in — no explicit uid-reset effect needed.

    // 2. Real-time sync from Firestore, bounded to the current window.
    useEffect(() => {
        if (!uid) return;

        const linksRef = collection(db, 'users', uid, 'links');
        const q = query(linksRef, orderBy('createdAt', 'desc'), limit(windowSize));

        const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
            setWindowLinks(snapshot.docs.map(toLink));
            setHasMore(snapshot.docs.length >= windowSize);
            setIsLoading(false);
        }, (error: Error) => {
            reportError(error, 'useLinks-snapshot');
            toast.error("Lost connection to your library. Reconnecting…");
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [uid, windowSize, toast]);

    // Due-reminder sync (report 3.15 follow-up). Reminders characteristically
    // fire on OLD cards that have long since scrolled out of the window, yet the
    // in-app "Reminders due" strip is the only channel for users without push —
    // and clearing `reminderDue` happens from that strip, so a due card the
    // window never loaded would keep its flag forever. This second subscription
    // is naturally tiny (only currently-due docs match) and is merged below.
    useEffect(() => {
        // No sync reset needed: a workspace change unmounts Feed (see above), so
        // the hook remounts clean on the next sign-in — matching the window effect.
        if (!uid) return;
        const linksRef = collection(db, 'users', uid, 'links');
        const q = query(linksRef, where('reminderDue', '==', true));
        const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
            setReminderLinks(snapshot.docs.map(toLink));
        }, (error: Error) => {
            reportError(error, 'useLinks-reminders');
        });
        return () => unsubscribe();
    }, [uid]);

    // Merge the due-reminder docs into the window. Window docs win on id conflict
    // (they carry the freshest snapshot); reminder docs outside the window are
    // appended so the reminder strip and deep-links can reach old cards.
    const links = useMemo(() => {
        if (reminderLinks.length === 0) return windowLinks;
        const seen = new Set(windowLinks.map((l) => l.id));
        const extra = reminderLinks.filter((l) => !seen.has(l.id));
        return extra.length ? windowLinks.concat(extra) : windowLinks;
    }, [windowLinks, reminderLinks]);

    // Grow the window by one page. Unconditional bounded increment: the scroll
    // sentinel only mounts (and the Load-more button only renders) while
    // `hasMore` is true, so this is never reached with nothing left to load; even
    // if it were, the next snapshot returns the same docs and flips hasMore off.
    // Re-subscribing with a larger limit keeps isLoading false, so scrolling in
    // more never flashes the skeleton.
    const loadMore = useCallback(() => {
        setWindowSize((n) => n + PAGE_SIZE);
    }, []);

    // Pull-to-refresh (M16). The library already streams live via onSnapshot, so a
    // pull forces an authoritative server re-read (round-trips the network and
    // confirms freshness) rather than faking a spinner. A short floor keeps the
    // native spinner visible long enough to read as a deliberate refresh. Capped
    // at the initial page (report 3.15): the cost of a pull must not grow with the
    // window — the live listener already keeps docs past the first page fresh, so
    // we only force-read the top page and merge it over the grown window.
    const handlePullRefresh = async () => {
        if (!uid) return;
        const linksRef = collection(db, 'users', uid, 'links');
        const q = query(linksRef, orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
        try {
            const [snap] = await Promise.all([
                getDocsFromServer(q),
                new Promise((r) => setTimeout(r, 600)),
            ]);
            const fresh = snap.docs.map(toLink);
            setWindowLinks((prev) => {
                // A window that never grew past the first page is fully covered by
                // the re-read; otherwise splice the fresh top page over the docs
                // the live listener still holds so a pull never shrinks the feed.
                if (fresh.length >= prev.length) return fresh;
                const freshIds = new Set(fresh.map((l) => l.id));
                return fresh.concat(prev.filter((l) => !freshIds.has(l.id)));
            });
        } catch {
            toast.error("Couldn't refresh. Please try again.");
        }
    };

    return { links, isLoading, handlePullRefresh, loadMore, hasMore };
}
