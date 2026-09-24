import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '@/lib/types';
import { toLink } from '@/lib/storage';
import { collection, query, orderBy, where, limit, onSnapshot, getDocsFromServer, startAfter, endAt, QuerySnapshot, QueryDocumentSnapshot, DocumentData, Unsubscribe } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useToast } from '@/components/Toast';
import { reportError } from '@/lib/errorReporter';

/** One page of the growing feed window (report 3.15). */
const PAGE_SIZE = 150;

/**
 * Real-time Firestore subscription for the user's links, plus the pull-to-refresh
 * authoritative re-read.
 *
 * WINDOWED (report 3.15): rather than subscribing to the ENTIRE links collection
 * (which bills a read per card every cold session and mounts the whole library),
 * the feed is a stack of CURSOR PAGES, each with its own live listener:
 *
 *   - page 0 — the newest PAGE_SIZE cards (`limit`). New saves sort to the top,
 *     so they always land here. Once a second page exists, page 0 is re-anchored
 *     to `endAt(<its last card>)` with no limit, so a new save grows page 0
 *     instead of pushing its last card out into a gap between pages;
 *   - page N — `startAfter(<last card of page N-1>)`, `limit(PAGE_SIZE)`.
 *
 * `loadMore()` adds ONE page listener (PAGE_SIZE reads, plus a one-time
 * re-anchor of page 0 on the first call). The old design re-subscribed a
 * single query with a growing limit, re-reading the whole window on every
 * scroll — O(n²) reads to reach the bottom of a large library. Every page
 * stays live, so edits to an old card still show instantly. A card deleted
 * from a middle page lets that page pull in the next card, which is also the
 * first card of the page after; the merge dedupes by id.
 *
 * `hasMore` is false once the LAST page returns fewer than PAGE_SIZE docs.
 * Keyword search/filter operate over the loaded window (plus the search
 * library snapshot); semantic search is server-side over the full library.
 */
export function useLinks(uid: string | null | undefined, toast: ReturnType<typeof useToast>) {
    // Docs per cursor page (index 0 = newest), merged into `windowLinks` below.
    const [pages, setPages] = useState<Link[][]>([]);
    // Page boundaries: cursors[i] is the last card of page i, fixed when page
    // i+1 was requested. There are cursors.length + 1 pages.
    const [cursors, setCursors] = useState<QueryDocumentSnapshot<DocumentData>[]>([]);
    // The raw snapshot docs of each page (a cursor must be a doc snapshot).
    const pageDocsRef = useRef<QueryDocumentSnapshot<DocumentData>[][]>([]);
    // Live listeners by page index, with the query key each was opened for.
    const subsRef = useRef<Map<number, { key: string; unsub: Unsubscribe }>>(new Map());
    // Pull-to-refresh overlay for page 0 (see handlePullRefresh).
    const [refreshedTop, setRefreshedTop] = useState<Link[] | null>(null);
    // Docs the backend has flagged `reminderDue` — see the second subscription.
    const [reminderLinks, setReminderLinks] = useState<Link[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // A workspace change unmounts Feed (AuthProvider gates children behind the
    // login screen), so this hook re-initializes at PAGE_SIZE on the next
    // sign-in — no explicit uid-reset effect needed.

    // 2. Real-time sync from Firestore, one listener per cursor page. Only the
    //    listeners whose query changed are (re)opened: adding page N never
    //    re-reads pages 1..N-1.
    useEffect(() => {
        if (!uid) return;
        const linksRef = collection(db, 'users', uid, 'links');
        const subs = subsRef.current;
        const pageCount = cursors.length + 1;
        for (let i = 0; i < pageCount; i++) {
            const key = i === 0
                ? (cursors.length === 0 ? 'top' : `top:endAt:${cursors[0].id}`)
                : `after:${cursors[i - 1].id}`;
            if (subs.get(i)?.key === key) continue;
            subs.get(i)?.unsub();
            const q = i === 0
                ? (cursors.length === 0
                    ? query(linksRef, orderBy('createdAt', 'desc'), limit(PAGE_SIZE))
                    : query(linksRef, orderBy('createdAt', 'desc'), endAt(cursors[0])))
                : query(linksRef, orderBy('createdAt', 'desc'), startAfter(cursors[i - 1]), limit(PAGE_SIZE));
            const page = i;
            const unsub = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
                pageDocsRef.current[page] = snapshot.docs;
                setPages((prev) => {
                    const next = prev.slice();
                    next[page] = snapshot.docs.map(toLink);
                    return next;
                });
                if (page === 0) setRefreshedTop(null);
                setIsLoading(false);
            }, (error: Error) => {
                reportError(error, 'useLinks-snapshot');
                toast.error("Lost connection to your library. Reconnecting…");
                setIsLoading(false);
            });
            subs.set(i, { key, unsub });
        }
    }, [uid, cursors, toast]);

    // Tear every page listener down when the workspace goes away / on unmount.
    useEffect(() => {
        const subs = subsRef.current;
        return () => {
            subs.forEach((s) => s.unsub());
            subs.clear();
        };
    }, [uid]);

    // The merged window: pages in order, first occurrence of an id wins.
    const windowLinks = useMemo(() => {
        const out: Link[] = [];
        const seen = new Set<string>();
        const all = refreshedTop ? [refreshedTop, ...pages.slice(1)] : pages;
        for (const page of all) {
            if (!page) continue;
            for (const l of page) {
                if (seen.has(l.id)) continue;
                seen.add(l.id);
                out.push(l);
            }
        }
        return out;
    }, [pages, refreshedTop]);

    // More on the server while the LAST page came back full. While a just-
    // requested page is still in flight, keep saying yes (loadMore no-ops).
    const lastPage = pages[cursors.length];
    const hasMore = lastPage ? lastPage.length >= PAGE_SIZE : cursors.length > 0;

    // Due-reminder sync (report 3.15 follow-up). Reminders characteristically
    // fire on OLD cards that have long since scrolled out of the window, yet the
    // in-app "Reminders due" strip is the only channel for users without push —
    // and clearing `reminderDue` happens from that strip, so a due card the
    // window never loaded would keep its flag forever. This second subscription
    // is naturally tiny (only currently-due docs match) and is merged below.
    useEffect(() => {
        // No sync reset needed: a workspace change unmounts Feed (see above), so
        // the hook remounts clean on the next sign-in — matching the window effect.
        if (!uid) return;
        const linksRef = collection(db, 'users', uid, 'links');
        const q = query(linksRef, where('reminderDue', '==', true));
        const unsubscribe = onSnapshot(q, (snapshot: QuerySnapshot<DocumentData>) => {
            setReminderLinks(snapshot.docs.map(toLink));
        }, (error: Error) => {
            reportError(error, 'useLinks-reminders');
        });
        return () => unsubscribe();
    }, [uid]);

    // Merge the due-reminder docs into the window. Window docs win on id conflict
    // (they carry the freshest snapshot); reminder docs outside the window are
    // appended so the reminder strip and deep-links can reach old cards.
    const links = useMemo(() => {
        if (reminderLinks.length === 0) return windowLinks;
        const seen = new Set(windowLinks.map((l) => l.id));
        const extra = reminderLinks.filter((l) => !seen.has(l.id));
        return extra.length ? windowLinks.concat(extra) : windowLinks;
    }, [windowLinks, reminderLinks]);

    // Open the next page after the last card currently loaded. A no-op until
    // the last page has arrived full (the sentinel can fire twice in a row),
    // so a page is never requested twice from the same cursor.
    const loadMore = useCallback(() => {
        setCursors((prev) => {
            const lastDocs = pageDocsRef.current[prev.length];
            if (!lastDocs || lastDocs.length < PAGE_SIZE) return prev;
            const cursor = lastDocs[lastDocs.length - 1];
            if (prev.some((c) => c.id === cursor.id)) return prev;
            return [...prev, cursor];
        });
    }, []);

    // Pull-to-refresh (M16). The library already streams live via onSnapshot, so a
    // pull forces an authoritative server re-read (round-trips the network and
    // confirms freshness) rather than faking a spinner. A short floor keeps the
    // native spinner visible long enough to read as a deliberate refresh. Capped
    // at the initial page (report 3.15): the cost of a pull must not grow with the
    // window — the live listener already keeps docs past the first page fresh, so
    // we only force-read the top page and merge it over the grown window.
    const handlePullRefresh = async () => {
        if (!uid) return;
        const linksRef = collection(db, 'users', uid, 'links');
        const q = query(linksRef, orderBy('createdAt', 'desc'), limit(PAGE_SIZE));
        try {
            const [snap] = await Promise.all([
                getDocsFromServer(q),
                new Promise((r) => setTimeout(r, 600)),
            ]);
            const fresh = snap.docs.map(toLink);
            // Overlay the fresh top page over page 0 until page 0's listener
            // next fires (older pages keep streaming live). The merge dedupes,
            // so a pull never shrinks or duplicates the feed.
            setRefreshedTop((prevTop) => {
                const base = prevTop ?? pages[0] ?? [];
                if (fresh.length >= base.length) return fresh;
                const freshIds = new Set(fresh.map((l) => l.id));
                return fresh.concat(base.filter((l) => !freshIds.has(l.id)));
            });
        } catch {
            toast.error("Couldn't refresh. Please try again.");
        }
    };

    return { links, isLoading, handlePullRefresh, loadMore, hasMore };
}
