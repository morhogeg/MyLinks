import {
    collection,
    query,
    orderBy,
    limit,
    onSnapshot,
    deleteDoc,
    doc,
    QueryDocumentSnapshot,
    DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import { CuratedDigest } from './types';

/**
 * Read access to the curated digest history (the in-app Digest section).
 *
 * Digests are written server-side (functions/digest_service.py) to
 * users/{uid}/digests/{digestId} — one per period, retention-pruned to the
 * newest ~30. The Digest section subscribes to the full (bounded) history.
 * Mirrors lib/synthesis.ts's onSnapshot style.
 */

const digestsCol = (uid: string) => collection(db, 'users', uid, 'digests');

/** Remove a single digest from the in-app history. The doc id is the digest's
    deterministic period id (e.g. "2026-07-06" / "2026-W28"). The live onSnapshot
    subscription drops it from the view automatically. */
export async function deleteDigest(uid: string, id: string): Promise<void> {
    await deleteDoc(doc(db, 'users', uid, 'digests', id));
}

function toDigest(d: QueryDocumentSnapshot<DocumentData>): CuratedDigest {
    const data = d.data();
    return {
        id: data.id || d.id,
        createdAt: data.createdAt || 0,
        mode: data.mode || 'smart',
        frequency: data.frequency || 'weekly',
        title: data.title || 'Your Brew',
        topics: (data.topics as string[]) || [],
        cards: (data.cards as CuratedDigest['cards']) || [],
        cardCount: data.cardCount || 0,
    };
}

/**
 * Subscribe to the user's digest history, newest first. Calls `cb` on every
 * change and returns the unsubscribe function. Fails soft — a listener error
 * yields [] rather than throwing, so a missing subcollection (or, post-cutover,
 * a not-yet-deployed rule) never breaks the app.
 */
export function subscribeDigests(
    uid: string,
    cb: (digests: CuratedDigest[]) => void,
): () => void {
    const q = query(digestsCol(uid), orderBy('createdAt', 'desc'), limit(30));
    return onSnapshot(
        q,
        (snap) => cb(snap.docs.map(toDigest)),
        () => cb([]),
    );
}
