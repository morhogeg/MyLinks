import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@/lib/types';
import { toLink } from '@/lib/storage';
import { collection, query, orderBy, limit, onSnapshot, getDocsFromServer, QuerySnapshot, DocumentData } from 'firebase/firestore';
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
    const [links, setLinks] = useState<Link[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [windowSize, setWindowSize] = useState(PAGE_SIZE);
    // True while the last snapshot completely filled the window (so there may be
    // older docs to fetch). Mirrored into a ref so the stable loadMore callback
    // can read the latest value without re-creating.
    const [hasMore, setHasMore] = useState(false);
    const hasMoreRef = useRef(false);

    // A workspace change unmounts Feed (AuthProvider gates children behind the
    // login screen), so this hook re-initializes at PAGE_SIZE on the next
    // sign-in — no explicit uid-reset effect needed.

    // 2. Real-time sync from Firestore, bounded to the current window.
    useEffect(() => {
        if (!uid) return;

        const linksRef = collection(db, 'users', uid, 'links');
        const q = query(linksRef, orderBy('createdAt', 'desc'), limit(windowSize));

        const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
            setLinks(snapshot.docs.map(toLink));
            const filled = snapshot.docs.length >= windowSize;
            hasMoreRef.current = filled;
            setHasMore(filled);
            setIsLoading(false);
        }, (error: Error) => {
            reportError(error, 'useLinks-snapshot');
            toast.error("Lost connection to your library. Reconnecting…");
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [uid, windowSize, toast]);

    // Grow the window by one page. No-op when the last snapshot didn't fill the
    // current window (nothing older exists on the server). Re-subscribing with a
    // larger limit keeps isLoading false, so scrolling in more never flashes the
    // skeleton.
    const loadMore = useCallback(() => {
        if (!hasMoreRef.current) return;
        setWindowSize((n) => n + PAGE_SIZE);
    }, []);

    // Pull-to-refresh (M16). The library already streams live via onSnapshot, so a
    // pull forces an authoritative server re-read (round-trips the network and
    // confirms freshness) rather than faking a spinner. A short floor keeps the
    // native spinner visible long enough to read as a deliberate refresh. Bounded
    // to the current window so a refresh never re-reads the whole collection.
    const handlePullRefresh = async () => {
        if (!uid) return;
        const linksRef = collection(db, 'users', uid, 'links');
        const q = query(linksRef, orderBy('createdAt', 'desc'), limit(windowSize));
        try {
            const [snap] = await Promise.all([
                getDocsFromServer(q),
                new Promise((r) => setTimeout(r, 600)),
            ]);
            setLinks(snap.docs.map(toLink));
        } catch {
            toast.error("Couldn't refresh. Please try again.");
        }
    };

    return { links, isLoading, handlePullRefresh, loadMore, hasMore };
}
