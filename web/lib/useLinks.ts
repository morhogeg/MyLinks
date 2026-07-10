import { useEffect, useState } from 'react';
import { Link } from '@/lib/types';
import { toLink } from '@/lib/storage';
import { collection, query, orderBy, onSnapshot, getDocsFromServer, QuerySnapshot, DocumentData } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/components/Toast';

/**
 * Real-time Firestore subscription for the user's links, plus the pull-to-refresh
 * authoritative re-read. Extracted verbatim from Feed (R-3) — same behavior.
 *
 * The library streams live via onSnapshot; `handlePullRefresh` forces an
 * authoritative server re-read (round-trips the network and confirms freshness)
 * rather than faking a spinner, with a short floor so the native spinner stays
 * visible long enough to read as a deliberate refresh.
 */
export function useLinks(uid: string | null | undefined, toast: ReturnType<typeof useToast>) {
    const [links, setLinks] = useState<Link[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // 2. Real-time sync from Firestore
    useEffect(() => {
        if (!uid) return;

        const linksRef = collection(db, 'users', uid, 'links');
        const q = query(linksRef, orderBy('createdAt', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
            const fetchedLinks = snapshot.docs.map(toLink);
            setLinks(fetchedLinks);
            setIsLoading(false);
        }, (error: Error) => {
            console.error("Firestore sync error:", error);
            toast.error("Lost connection to your library. Reconnecting…");
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [uid, toast]);

    // Pull-to-refresh (M16). The library already streams live via onSnapshot, so a
    // pull forces an authoritative server re-read (round-trips the network and
    // confirms freshness) rather than faking a spinner. A short floor keeps the
    // native spinner visible long enough to read as a deliberate refresh.
    const handlePullRefresh = async () => {
        if (!uid) return;
        const linksRef = collection(db, 'users', uid, 'links');
        const q = query(linksRef, orderBy('createdAt', 'desc'));
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

    return { links, isLoading, handlePullRefresh };
}
