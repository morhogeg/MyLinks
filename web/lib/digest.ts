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

/** "Daily digest" / "Weekly digest" — user-facing kind label. Modes like
    'topic'/'smart' are curation internals and never shown. */
export function digestKindLabel(frequency: CuratedDigest['frequency']): string {
    return frequency === 'weekly' ? 'Weekly digest' : 'Daily digest';
}

/**
 * Display title for a digest, derived client-side from its date — the stored
 * `title` is the same static string on every doc ("Your Daily Brew"), so the
 * date is what actually tells one digest from another. With `relative`,
 * today/yesterday collapse to "Today"/"Yesterday" (for the detail hero);
 * otherwise it's the full "Monday, July 21" (year appended once it's from a
 * previous year).
 */
export function digestDisplayTitle(
    digest: Pick<CuratedDigest, 'createdAt' | 'frequency'>,
    opts?: { relative?: boolean },
): string {
    const date = new Date(digest.createdAt);
    const now = new Date();
    if (opts?.relative && digest.frequency !== 'weekly') {
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        if (digest.createdAt >= startOfToday) return 'Today';
        if (digest.createdAt >= startOfToday - 86_400_000) return 'Yesterday';
    }
    return date.toLocaleDateString(undefined, {
        weekday: 'long', month: 'long', day: 'numeric',
        ...(date.getFullYear() === now.getFullYear() ? {} : { year: 'numeric' }),
    });
}

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
