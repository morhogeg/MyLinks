import { useCallback, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Link } from '@/lib/types';
import { toLink } from '@/lib/storage';
import { reportError } from '@/lib/errorReporter';

/**
 * Full-library snapshot for search.
 *
 * The feed subscription is WINDOWED (newest 150, growing on scroll), so any
 * search that only looks at the loaded window can't find older cards — the
 * root recall problem of every previous search iteration. `ensureLibrary()`
 * fetches the user's whole links collection ONCE, the first time search is
 * activated (called from the search-open / search-typing handlers), and
 * caches it for the session. Search then matches over window ∪ library;
 * window docs win on id conflicts because they carry the live snapshot.
 *
 * Cost: one read per card, once per session, and only in sessions where
 * search is actually used. New saves during the session are covered by the
 * live window (they sort to its top), so the cache never misses fresh cards.
 */
export function useSearchLibrary(uid: string | null | undefined) {
    const [libraryLinks, setLibraryLinks] = useState<Link[]>([]);
    const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
    // The uid a fetch has run (or is running) for — the once-per-session guard.
    // Plain state (not a ref): it only changes inside event handlers.
    const [fetchedUid, setFetchedUid] = useState<string | null>(null);

    const ensureLibrary = useCallback(() => {
        if (!uid || fetchedUid === uid) return;
        setFetchedUid(uid);
        setIsLoadingLibrary(true);
        const linksRef = collection(db, 'users', uid, 'links');
        getDocs(query(linksRef, orderBy('createdAt', 'desc')))
            .then((snap) => setLibraryLinks(snap.docs.map(toLink)))
            .catch((err) => {
                // Clear the guard so the next search activation retries; the
                // window keeps serving matches for recent cards meanwhile.
                setFetchedUid(null);
                reportError(err, 'search-library');
            })
            .finally(() => setIsLoadingLibrary(false));
    }, [uid, fetchedUid]);

    return { libraryLinks, isLoadingLibrary, ensureLibrary };
}
