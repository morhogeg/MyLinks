import { useEffect, useState } from 'react';
import { Link } from '@/lib/types';
import { toLink } from '@/lib/storage';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { reportError } from '@/lib/errorReporter';

/**
 * Complete member set for a single collection, independent of the windowed feed.
 *
 * The library feed is windowed (useLinks, limit 150 + load-more), so deriving a
 * collection's members by filtering that array silently truncates large or old
 * collections — the count reads low and, worse, a published public snapshot can
 * drop members it never loaded. This subscribes directly to every link doc
 * carrying `collectionId` in its `collectionIds` array (an array-contains query,
 * naturally scoped to one collection), so callers — the collection detail
 * count/list + ShareCollectionSheet display and what publishCollection freezes —
 * always see the whole collection.
 *
 * Returns `{ links, loading, fromCache }`. `loading` is true from mount (or an id
 * change) until the first snapshot for THAT id lands, so a caller can tell "no
 * members yet" from "empty collection" and not flash an empty state or a zero
 * count while the query is in flight. `fromCache` is true while the latest
 * snapshot came from the local cache only: Firestore answers from the cache
 * first, and that answer can be PARTIAL (it holds only the members this device
 * has seen), so anything that freezes the set (publishing a public page,
 * judging it stale) should wait until the server has confirmed it. No-ops
 * (`links: []`, `loading: false`, `fromCache: false`, no listener) when
 * `collectionId` (or `uid`) is null, so the hook can sit unconditionally in a
 * component whose collection selection is optional.
 */
export function useCollectionLinks(
    uid: string | null | undefined,
    collectionId: string | null | undefined,
): { links: Link[]; loading: boolean; fromCache: boolean } {
    // Tag the loaded set with the collection it belongs to, so we can return []
    // (rather than a previous collection's members) the instant the id changes,
    // without a synchronous setState in the effect body. The same tag is the
    // loading signal: a mismatch means this id's first snapshot has not landed.
    const [state, setState] = useState<{ id: string | null; links: Link[]; fromCache: boolean }>(
        { id: null, links: [], fromCache: false },
    );

    useEffect(() => {
        if (!uid || !collectionId) return;
        const linksRef = collection(db, 'users', uid, 'links');
        const q = query(linksRef, where('collectionIds', 'array-contains', collectionId));
        // includeMetadataChanges: the server confirming a cached answer may
        // change no document at all, and without this option that event (the
        // fromCache flip) would never be delivered.
        const unsubscribe = onSnapshot(
            q,
            { includeMetadataChanges: true },
            (snap) => setState((prev) => {
                const fromCache = snap.metadata.fromCache;
                // Metadata-only event: same members, so keep the same array and
                // callers' memos don't churn on every pending-write ack.
                if (prev.id === collectionId && snap.docChanges().length === 0) {
                    return prev.fromCache === fromCache ? prev : { ...prev, fromCache };
                }
                return { id: collectionId, links: snap.docs.map(toLink), fromCache };
            }),
            (error: Error) => reportError(error, 'useCollectionLinks'),
        );
        return () => unsubscribe();
    }, [uid, collectionId]);

    // No uid means no listener will ever open, so nothing is "loading".
    if (!uid || !collectionId) return { links: [], loading: false, fromCache: false };
    const loaded = state.id === collectionId;
    return { links: loaded ? state.links : [], loading: !loaded, fromCache: loaded && state.fromCache };
}
