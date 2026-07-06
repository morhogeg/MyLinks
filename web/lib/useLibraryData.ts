'use client';

import { useState, useEffect } from 'react';
import { Link, Collection } from '@/lib/types';
import { collection, query, orderBy, onSnapshot, QuerySnapshot, DocumentData, QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/components/Toast';
import { toMillis, type TimestampLike } from '@/lib/time';

/** Helper to get consistent number for timestamps (handles number, string, or Firestore Timestamp) */
export const getTimestampNumber = (val: TimestampLike): number => toMillis(val);

/**
 * The user's library data — links and collections, streamed live from
 * Firestore via onSnapshot, plus the initial-load flag.
 *
 * `setLinks` is exposed for pull-to-refresh, which replaces the list with an
 * authoritative server re-read.
 */
export function useLibraryData(uid: string | null) {
    const toast = useToast();
    const [links, setLinks] = useState<Link[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [collections, setCollections] = useState<Collection[]>([]);

    // 2. Real-time sync from Firestore
    useEffect(() => {
        if (!uid) return;

        const linksRef = collection(db, 'users', uid, 'links');
        const q = query(linksRef, orderBy('createdAt', 'desc'));

        const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
            const fetchedLinks = snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => ({
                id: doc.id,
                ...doc.data()
            } as Link));
            setLinks(fetchedLinks);
            setIsLoading(false);
        }, (error: Error) => {
            console.error("Firestore sync error:", error);
            toast.error("Lost connection to your library. Reconnecting…");
            setIsLoading(false);
        });

        return () => unsubscribe();
    }, [uid, toast]);

    // 2b. Real-time sync of collections from Firestore
    useEffect(() => {
        if (!uid) return;
        const ref = collection(db, 'users', uid, 'collections');
        const unsubscribe = onSnapshot(ref, (snapshot: QuerySnapshot<DocumentData>) => {
            setCollections(snapshot.docs.map((d: QueryDocumentSnapshot<DocumentData>) => ({
                id: d.id,
                ...d.data()
            } as Collection)));
        }, (error: Error) => {
            console.error("Collections sync error:", error);
        });
        return () => unsubscribe();
    }, [uid]);

    return { links, setLinks, collections, isLoading };
}
