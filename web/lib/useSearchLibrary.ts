import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { collection, getDocs, orderBy, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { Link } from '@/lib/types';
import { toLink } from '@/lib/storage';
import { reportError } from '@/lib/errorReporter';

/** A snapshot older than this is refetched when the app comes back to the
 *  foreground (another device may have added, edited or deleted cards). */
const STALE_AFTER_MS = 5 * 60 * 1000;

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
 * The snapshot is a one-time read, so it is kept honest three ways:
 *   - `markDeleted(ids)`: cards deleted this session (single + bulk delete)
 *     are filtered out, so a deleted card older than the window can't come
 *     back in search results;
 *   - `patchLink(id, patch)`: local edits (tags, title, privacy, status…)
 *     made on a card outside the live window are applied to the snapshot;
 *   - on returning to the foreground, a snapshot older than ~5 minutes is
 *     refetched (edits made on another device).
 *
 * Cost: one read per card per fetch, and only in sessions where search is
 * actually used.
 */
export function useSearchLibrary(uid: string | null | undefined) {
    const [rawLibrary, setRawLibrary] = useState<Link[]>([]);
    const [isLoadingLibrary, setIsLoadingLibrary] = useState(false);
    // The uid a fetch has run (or is running) for — the once-per-session guard.
    // Plain state (not a ref): it only changes inside event handlers.
    const [fetchedUid, setFetchedUid] = useState<string | null>(null);
    const fetchedAtRef = useRef(0);
    // Session overlays over the snapshot (see the doc comment).
    const [deletedIds, setDeletedIds] = useState<ReadonlySet<string>>(() => new Set());
    const [patches, setPatches] = useState<ReadonlyMap<string, Partial<Link>>>(() => new Map());

    const fetchLibrary = useCallback((forUid: string) => {
        setFetchedUid(forUid);
        setIsLoadingLibrary(true);
        const linksRef = collection(db, 'users', forUid, 'links');
        getDocs(query(linksRef, orderBy('createdAt', 'desc')))
            .then((snap) => {
                fetchedAtRef.current = Date.now();
                setRawLibrary(snap.docs.map(toLink));
                // A fresh read already carries every edit made before it.
                setPatches(new Map());
            })
            .catch((err) => {
                // Clear the guard so the next search activation retries; the
                // window keeps serving matches for recent cards meanwhile.
                setFetchedUid(null);
                reportError(err, 'search-library');
            })
            .finally(() => setIsLoadingLibrary(false));
    }, []);

    const ensureLibrary = useCallback(() => {
        if (!uid || fetchedUid === uid) return;
        fetchLibrary(uid);
    }, [uid, fetchedUid, fetchLibrary]);

    // Foreground refresh — only for a snapshot that exists and has aged.
    useEffect(() => {
        if (!uid || fetchedUid !== uid) return;
        const onVisible = () => {
            if (document.visibilityState !== 'visible') return;
            if (fetchedAtRef.current && Date.now() - fetchedAtRef.current > STALE_AFTER_MS) {
                fetchLibrary(uid);
            }
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [uid, fetchedUid, fetchLibrary]);

    const markDeleted = useCallback((ids: string[]) => {
        if (ids.length === 0) return;
        setDeletedIds((prev) => {
            const next = new Set(prev);
            ids.forEach((id) => next.add(id));
            return next;
        });
    }, []);

    const patchLink = useCallback((id: string, patch: Partial<Link>) => {
        setPatches((prev) => {
            const next = new Map(prev);
            next.set(id, { ...(prev.get(id) ?? {}), ...patch });
            return next;
        });
    }, []);

    const libraryLinks = useMemo(() => {
        if (deletedIds.size === 0 && patches.size === 0) return rawLibrary;
        const out: Link[] = [];
        for (const l of rawLibrary) {
            if (deletedIds.has(l.id)) continue;
            const p = patches.get(l.id);
            out.push(p ? { ...l, ...p } : l);
        }
        return out;
    }, [rawLibrary, deletedIds, patches]);

    return { libraryLinks, isLoadingLibrary, ensureLibrary, markDeleted, patchLink };
}
