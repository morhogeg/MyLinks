import {
    collection,
    query,
    orderBy,
    limit,
    onSnapshot,
    QueryDocumentSnapshot,
    DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import { WeeklySynthesis } from './types';

/**
 * Read access to the weekly "What you learned" synthesis (M12).
 *
 * Syntheses are written server-side (functions/digest_service.py) to
 * users/{uid}/syntheses/{weekId} — one per ISO week. The feed subscribes to the
 * single most recent one and surfaces it as a special in-app card. Mirrors the
 * onSnapshot style Feed.tsx uses for links and lib/chats.ts uses for chats.
 */

const synthesesCol = (uid: string) => collection(db, 'users', uid, 'syntheses');

function toSynthesis(d: QueryDocumentSnapshot<DocumentData>): WeeklySynthesis {
    const data = d.data();
    return {
        weekId: data.weekId || d.id,
        title: data.title || 'What you learned this week',
        narrative: data.narrative || '',
        themes: (data.themes as WeeklySynthesis['themes']) || [],
        standoutCardId: data.standoutCardId ?? null,
        standoutReason: data.standoutReason || '',
        openQuestion: data.openQuestion || '',
        cards: (data.cards as WeeklySynthesis['cards']) || [],
        cardCount: data.cardCount || 0,
        createdAt: data.createdAt || 0,
    };
}

/**
 * Subscribe to the user's latest weekly synthesis. Calls `cb` with the most
 * recent synthesis (or null if none exist yet) whenever it changes. Returns an
 * unsubscribe function. Fails soft — a listener error yields null rather than
 * throwing, so a missing/empty subcollection never breaks the feed.
 */
export function subscribeLatestSynthesis(
    uid: string,
    cb: (synthesis: WeeklySynthesis | null) => void,
): () => void {
    const q = query(synthesesCol(uid), orderBy('createdAt', 'desc'), limit(1));
    return onSnapshot(
        q,
        (snap) => cb(snap.empty ? null : toSynthesis(snap.docs[0])),
        () => cb(null),
    );
}
