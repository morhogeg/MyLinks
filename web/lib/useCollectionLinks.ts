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
 * No-ops (returns `[]`, opens no listener) when `collectionId` is null, so the
 * hook can sit unconditionally in a component whose collection selection is
 * optional.
 */
export function useCollectionLinks(
    uid: string | null | undefined,
    collectionId: string | null | undefined,
): Link[] {
    // Tag the loaded set with the collection it belongs to, so we can return []
    // (rather than a previous collection's members) the instant the id changes,
    // without a synchronous setState in the effect body.
    const [state, setState] = useState<{ id: string | null; links: Link[] }>({ id: null, links: [] });

    useEffect(() => {
        if (!uid || !collectionId) return;
        const linksRef = collection(db, 'users', uid, 'links');
        const q = query(linksRef, where('collectionIds', 'array-contains', collectionId));
        const unsubscribe = onSnapshot(
            q,
            (snap) => setState({ id: collectionId, links: snap.docs.map(toLink) }),
            (error: Error) => reportError(error, 'useCollectionLinks'),
        );
        return () => unsubscribe();
    }, [uid, collectionId]);

    return collectionId && state.id === collectionId ? state.links : [];
}
