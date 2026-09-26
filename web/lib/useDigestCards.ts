'use client';

import { useEffect, useState } from 'react';
import { collection, documentId, onSnapshot, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { toLink } from './storage';
import { Link } from './types';

/**
 * Live cards for a digest review session that the feed hasn't loaded.
 *
 * useLinks pages the library newest-first (150 per page), and a digest mostly
 * picks OLD cards, so on a big library some of them are not in `links`. This
 * listens to exactly those ids (at most 10, Firestore's `in` cap; a digest is
 * 5) so the deck can deal them and sees their live status. `missingIds` empty
 * = no listener, no reads. `ready` is false until the first snapshot, so the
 * deck doesn't flash its empty state while an old card is still on its way.
 */
export function useDigestCards(uid: string | undefined, missingIds: string[]): { cards: Link[]; ready: boolean } {
    const key = missingIds.slice(0, 10).join(',');
    // Tagged with the id set it answers, so a stale answer never reads as ready.
    const [result, setResult] = useState<{ key: string; cards: Link[] }>({ key: '', cards: [] });

    useEffect(() => {
        if (!uid || !key) return;
        const q = query(
            collection(db, 'users', uid, 'links'),
            where(documentId(), 'in', key.split(',')),
        );
        return onSnapshot(
            q,
            (snap) => setResult({ key, cards: snap.docs.map(toLink) }),
            () => setResult({ key, cards: [] }),
        );
    }, [uid, key]);

    if (!key) return { cards: [], ready: true };
    return result.key === key ? { cards: result.cards, ready: true } : { cards: [], ready: false };
}
