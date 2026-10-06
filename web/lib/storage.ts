import { collection, addDoc, setDoc, updateDoc, deleteDoc, deleteField, doc, query, where, limit, orderBy, getDocs, getDoc, QueryDocumentSnapshot, DocumentData, arrayUnion, arrayRemove, writeBatch, runTransaction } from 'firebase/firestore';
import { db, appCheckHeaders } from './firebase';
import { authHeaders } from './auth';
import { apiUrl, fetchWithTimeout } from './api';
import { offerUpgradeFor, isWaitingSave, saveWallAsWaiting, type WaitingSave } from './entitlement';

import { Link, LinkMetadata, LinkStatus, User, UserNote } from './types';
import { canonicalCategory } from './category';
import { urlKey } from './urlKey';
import { getNotes } from './notes';
import { getTimestampNumber } from './feedUtils';

/**
 * Normalize a Firestore link doc into a safe `Link`.
 *
 * `tags`, `metadata`, `title`, `category`, and `summary` are typed required in
 * lib/types.ts, but Firestore doesn't guarantee them — a legacy or malformed
 * doc can omit them, and code like `link.tags.some(...)` / `link.title.toLowerCase()`
 * then throws during render and whites out the whole feed. Defaulting the
 * required fields at the snapshot boundary (mirroring how lib/chats.ts's
 * toSession normalizes) keeps the UI resilient. Reused by every reader so no
 * code path produces an un-normalized Link.
 */
export function toLink(doc: QueryDocumentSnapshot<DocumentData>): Link {
    const data = doc.data();
    const md = (data.metadata ?? {}) as Partial<LinkMetadata>;
    return {
        ...data,
        id: doc.id,
        title: typeof data.title === 'string' ? data.title : '',
        summary: typeof data.summary === 'string' ? data.summary : '',
        category: typeof data.category === 'string' ? data.category : 'General',
        tags: Array.isArray(data.tags) ? data.tags : [],
        status: data.status ?? 'unread',
        // One shape for every reader: legacy cards hold a Firestore Timestamp
        // (pre-2026-10-05 notes, Image-tab screenshots, saved answers), an ISO
        // string or unix seconds. Readers that treat it as ms (getTimeAgo) read
        // a Timestamp as year ~4000 and printed "just now" forever.
        createdAt: getTimestampNumber(data.createdAt),
        metadata: {
            originalTitle: md.originalTitle ?? '',
            estimatedReadTime: md.estimatedReadTime ?? 0,
            ...md,
        },
    } as Link;
}

/**
 * Get all links from Firestore (one-time fetch)
 * Note: Use Feed.tsx's onSnapshot for real-time updates
 */
export async function getLinksFromFirestore(uid: string): Promise<Link[]> {
    const linksRef = collection(db, 'users', uid, 'links');
    const q = query(linksRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map(toLink);
}

/**
 * Get the user's unique tags from their most recent links.
 *
 * Bounded to the 300 newest links (report 3.9): reading the ENTIRE links
 * collection on every note/save/retry doesn't scale, and tag vocabulary comes
 * from recent activity anyway. Mirrors the backend `get_user_tags` cap.
 */
export async function getUserTags(uid: string): Promise<string[]> {
    const linksRef = collection(db, 'users', uid, 'links');
    const q = query(linksRef, orderBy('createdAt', 'desc'), limit(300));
    const snapshot = await getDocs(q);

    const tags = new Set<string>();
    snapshot.docs.forEach(doc => {
        const linkTags = doc.data().tags as string[] || [];
        linkTags.forEach(tag => tags.add(tag));
    });

    return Array.from(tags).sort();
}

/**
 * The workspace's existing category vocabulary, for the "reuse a category"
 * half of the analysis prompt (functions SYSTEM_PROMPT rule 6).
 *
 * Categories used to drift because the model was never told which ones already
 * existed — tags got a reuse list, categories got nothing, so a household
 * economics article could land in "Business" while similar cards sat under
 * "Society". Same window as getUserTags (the 300 most recent cards) so the two
 * lists cost one read each and describe the same slice of the library.
 */
export async function getUserCategories(uid: string): Promise<string[]> {
    const linksRef = collection(db, 'users', uid, 'links');
    const q = query(linksRef, orderBy('createdAt', 'desc'), limit(300));
    const snapshot = await getDocs(q);

    const categories = new Set<string>();
    snapshot.docs.forEach(doc => {
        const c = doc.data().category;
        if (typeof c === 'string' && c.trim()) categories.add(c.trim());
    });

    return Array.from(categories).sort();
}

/**
 * Return the id of an existing saved link for this URL, or null.
 *
 * Mirrors the backend dedup (functions/link_service.py `link_exists_for_url`):
 * the canonical `urlKey` (lib/urlKey.ts ≡ functions/url_key.py, so http/https,
 * www., tracking params and YouTube short forms are one page), then
 * `finalUrlKey` (where a shortener/redirect landed), then — for cards saved
 * before urlKey existed — the exact stored `url`. Single-field equality
 * queries with `limit(1)`: Firestore auto-indexes single fields, so no
 * composite index is required.
 *
 * Callers MUST treat a thrown error as "unknown" and fall through to saving —
 * a failed dedup probe (e.g. offline) must never block a capture.
 */
export async function findLinkIdByUrl(
    uid: string,
    url: string,
    opts: { excludeId?: string } = {},
): Promise<string | null> {
    if (!url) return null;
    const linksRef = collection(db, 'users', uid, 'links');
    const key = urlKey(url);
    const probes: [string, string][] = key
        ? [['urlKey', key], ['finalUrlKey', key], ['url', url]]
        : [['url', url]];
    // In parallel, priority kept in the order above: three sequential round
    // trips held the Save button for seconds on a slow connection.
    const snapshots = await Promise.all(probes.map(([field, value]) =>
        getDocs(query(linksRef, where(field, '==', value), limit(opts.excludeId ? 3 : 1)))));
    for (const snapshot of snapshots) {
        for (const d of snapshot.docs) {
            // `excludeId`: the caller's own placeholder (an offline save checking
            // for an earlier copy). Another offline save still waiting is not
            // an earlier copy either: it hasn't been read yet.
            if (d.id === opts.excludeId) continue;
            if (opts.excludeId && d.data().pendingEnqueue === true) continue;
            return d.id;
        }
    }
    return null;
}

/** Friendly placeholder title for an in-flight capture — the URL's host, or a
 *  generic fallback. Mirrors functions/main.py `_capture_placeholder_title` so a
 *  web-added processing card reads the same as an iOS-shared one. */
function placeholderTitle(url: string): string {
    try {
        const host = new URL(url).hostname.replace(/^www\./, '');
        return host || 'Analyzing link…';
    } catch {
        return 'Analyzing link…';
    }
}

/**
 * Write a `processing` placeholder card for a DURABLE web link capture
 * (Weakness #5).
 *
 * Mirrors the card `process_link_background` writes for the iOS share path, so
 * the feed's `useProcessingBanner` + Card rendering treat a web-added capture
 * identically — a processing skeleton the instant the user hits Save. AddLinkForm
 * then enqueues the URL (via /api/share, passing this card's id as `cardId`) into
 * the SAME background pipeline, which flips THIS card to ready/failed when
 * analysis lands. A slow scrape can therefore never trip a request timeout or
 * lose the capture.
 *
 * The id is minted client-side, so the caller has it at once; `written`
 * resolves when the server acknowledges the write. OFFLINE that ack only comes
 * on reconnect (Firestore queues the write and the card shows in the feed from
 * its local cache right away), so the capture form waits on it only briefly
 * (AddLinkForm PLACEHOLDER_ACK_MS) and otherwise finishes as an offline save.
 */
export function startProcessingPlaceholder(
    uid: string,
    url: string,
    opts: { offline?: boolean } = {},
): { id: string; written: Promise<void> } {
    const ref = doc(collection(db, 'users', uid, 'links'));
    // A client ms clock (mirrors the trigger's int-ms writes) so feed ordering
    // and useProcessingBanner's ramp work the instant the card streams in — unlike
    // serverTimestamp(), which reads as 0 until the server resolves it.
    const now = Date.now();
    const key = urlKey(url);
    const written = setDoc(ref, {
        url,
        ...(key ? { urlKey: key } : {}),
        title: placeholderTitle(url),
        summary: '',
        tags: [],
        category: '',
        status: 'processing',
        sourceType: 'web',
        isRead: false,
        createdAt: now,
        ...(opts.offline
            // OFFLINE: nothing is running yet, so the card is QUEUED (Card.tsx
            // shows "Queued" and ages it on the long queue clock, as does the
            // janitor), and flagged for enqueue once the device is back online
            // (lib/offlineSave.ts; the server clears the flag on accept). The
            // worker stamps processingStartedAt when it actually starts.
            ? { queuedAt: now, pendingEnqueue: true }
            // The processing janitor ages out cards stuck here past its timeout.
            : { processingStartedAt: now }),
        metadata: { originalTitle: '', estimatedReadTime: 0 },
    });
    return { id: ref.id, written };
}

/**
 * Placeholder card for an IMAGE capture (one screenshot, or several that become
 * one card). Same durable pattern as startProcessingPlaceholder: the card exists
 * in the feed the instant capture starts, and process_link_background flips this
 * same doc to ready/failed via the cardId passed through /api/share.
 */
export async function createImagePlaceholder(uid: string, count: number): Promise<string> {
    const linksRef = collection(db, 'users', uid, 'links');
    const now = Date.now();
    const ref = await addDoc(linksRef, {
        url: '',
        title: count === 1 ? 'Reading your screenshot…' : `Reading ${count} screenshots…`,
        summary: '',
        tags: [],
        category: '',
        status: 'processing',
        sourceType: 'image',
        isRead: false,
        createdAt: now,
        processingStartedAt: now,
        metadata: { originalTitle: '', estimatedReadTime: 0 },
    });
    return ref.id;
}

/**
 * Flip a capture card to a retryable `failed` state — used when the durable web
 * enqueue can't be reached, so the placeholder never rots as an eternal spinner.
 * The existing Retry flow (`retryFailedLink`) re-runs analysis on this same card.
 */
export async function markLinkFailed(uid: string, id: string, error: string): Promise<void> {
    const linkRef = doc(db, 'users', uid, 'links', id);
    await updateDoc(linkRef, {
        status: 'failed',
        error: error.slice(0, 300),
        failedAt: Date.now(),
    });
}

/**
 * Keep a capture card as `waiting`: saved, not analyzed until the 1st or an
 * upgrade (functions/deferred_capture.py). The server normally writes this
 * itself when a save crosses the monthly allowance; the client writes it when
 * a server answers the old way (a save-wall 429), so the card never turns into
 * a red `failed` card with a Retry that could only hit the same wall. The
 * processing clocks go, so nothing ages it.
 */
export async function markLinkWaiting(uid: string, id: string): Promise<void> {
    await updateDoc(doc(db, 'users', uid, 'links', id), {
        status: 'waiting',
        waitingAt: Date.now(),
        processingStartedAt: deleteField(),
        processingStage: deleteField(),
        queuedAt: deleteField(),
        pendingEnqueue: deleteField(),
        error: deleteField(),
        failedAt: deleteField(),
    });
}

/**
 * Save a new link to Firestore
 */
export async function saveLink(uid: string, linkData: Partial<Link>): Promise<void> {
    const linksRef = collection(db, 'users', uid, 'links');

    // Remove undefined properties as Firestore doesn't support them
    const cleanData = Object.entries(linkData).reduce((acc, [key, value]) => {
        if (value !== undefined) {
            acc[key] = value;
        }
        return acc;
    }, {} as Record<string, unknown>);

    await addDoc(linksRef, {
        ...cleanData,
        // Epoch ms, like every other writer (the share trigger, the processing
        // placeholder). NOT serverTimestamp(): Firestore orders by type before
        // value, so a Timestamp sorts above every numeric createdAt and the card
        // sat at the top of the feed's newest-first pages forever.
        createdAt: Date.now(),
        status: 'unread',
        isRead: false
    });
}

/**
 * Create a URL-less **note card** durably and instantly, returning its id.
 *
 * A note is the user's own words — capturing it must never depend on a slow (or
 * undeployed) AI round-trip the way the old synchronous path did (it POSTed to
 * `/api/analyze` and failed with "URL is required" whenever the note branch
 * wasn't live). So we write the card immediately, client-side, with the note
 * text as its body and `needsEmbedding` set so the backend trigger makes it
 * searchable/askable. `enrichNoteCard` then upgrades it (AI title/tags/category)
 * in the background — best-effort, so the note stands on its own if that never
 * lands.
 */
/**
 * Split raw note text into the card's `{ title, summary }`.
 *
 * A short one-liner IS its own title, so the body stays empty to avoid a card
 * that prints the same sentence twice. A longer/multi-line note gets a truncated
 * first-line title with the full text as the body. Shared by `startNoteCard`
 * and `updateNoteText` so a note reads identically whether it was just captured
 * or later edited.
 */
export function splitNoteText(text: string): { title: string; summary: string; firstLine: string; words: number } {
    const trimmed = text.trim();
    const firstLine = (trimmed.split('\n').map(l => l.trim()).find(Boolean) || 'Note');
    const isShortSingleLine = !trimmed.includes('\n') && firstLine.length <= 90;
    const title = firstLine.length > 90 ? `${firstLine.slice(0, 90).trimEnd()}…` : firstLine;
    const summary = isShortSingleLine ? '' : trimmed;
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    return { title, summary, firstLine, words };
}

/**
 * A note card, without waiting for the server: the id is minted client-side
 * and `written` resolves on the server's acknowledgement. Offline that only
 * comes on reconnect (Firestore queues the write and the feed shows the note
 * from its local cache at once), so the capture form must not await it.
 */
export function startNoteCard(uid: string, text: string): { id: string; written: Promise<void> } {
    const { title, summary, firstLine, words } = splitNoteText(text);
    const ref = doc(collection(db, 'users', uid, 'links'));
    const written = setDoc(ref, {
        url: '',
        title,
        summary,
        tags: [],
        category: '',
        status: 'unread',
        isRead: false,
        sourceType: 'note',
        sourceName: 'Note',
        createdAt: Date.now(), // epoch ms: see saveLink
        // Let the sync_link_embedding trigger vectorize it → searchable + askable.
        needsEmbedding: true,
        metadata: { originalTitle: firstLine, estimatedReadTime: Math.max(1, Math.round(words / 200)) },
    });
    return { id: ref.id, written };
}

/**
 * Edit a note card's text as ONE thing.
 *
 * A note IS a single piece of the user's writing, so the detail view edits it in
 * a single field — not a separate "title" and "body". We re-derive title/summary
 * with the SAME split `startNoteCard` uses (so the card reads identically to a
 * fresh capture), refresh the read-time estimate, and flip `needsEmbedding` so
 * search/Ask pick up the new words. One atomic write.
 */
export async function updateNoteText(uid: string, id: string, text: string): Promise<void> {
    const { title, summary, firstLine, words } = splitNoteText(text);
    const linkRef = doc(db, 'users', uid, 'links', id);
    await updateDoc(linkRef, {
        title,
        summary,
        needsEmbedding: true,
        'metadata.originalTitle': firstLine,
        'metadata.estimatedReadTime': Math.max(1, Math.round(words / 200)),
    });
}

/**
 * Best-effort AI *organization* for a note card created by `startNoteCard`.
 *
 * The note's BODY is the user's own words and is never touched. The TITLE
 * depends on the note's shape (owner call, 2026-08-26 — this also matches the
 * share-sheet text path, where the backend already writes an AI heading over a
 * verbatim body):
 *   - A short one-liner IS its own title (splitNoteText left the body empty),
 *     so retitling it would orphan the user's actual words — leave it alone.
 *   - A long-form note keeps its full text verbatim in the body, so the
 *     first-line title is just a bad LABEL ("the first sentence, truncated").
 *     Replace it with the model's heading — but only while the card still
 *     wears the auto-derived title, so a title the user edited by hand in the
 *     race window is never clobbered.
 * Beyond the title we fold in tags, a category, and concepts so the note files
 * and surfaces like everything else. `titleOnly` is the note-EDIT path: a text
 * edit re-derives the first-line title (updateNoteText), so it refreshes the
 * heading the same way without touching tags/category the user may have
 * curated since. The actionable takeaway is the one field written on BOTH
 * paths: it isn't a filing choice the user can curate, it's read straight out
 * of the note's words, so re-analyzed text must bring a fresh takeaway or clear
 * the stale one. Never throws: if the call fails, the note simply stays as
 * written — still saved, still searchable, still the user's words.
 */
export async function enrichNoteCard(uid: string, cardId: string, text: string,
    opts: { titleOnly?: boolean } = {}): Promise<void> {
    try {
        let existingTags: string[] = [];
        let existingCategories: string[] = [];
        if (!opts.titleOnly) {
            try { existingTags = await getUserTags(uid); } catch { /* optional */ }
            try { existingCategories = await getUserCategories(uid); } catch { /* optional */ }
        }

        const response = await fetchWithTimeout(apiUrl('/api/analyze'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(await appCheckHeaders()), ...(await authHeaders()) },
            body: JSON.stringify({ text: text.trim(), existingTags, existingCategories, uid }),
        });
        if (!response.ok) {
            // Past the monthly allowance the note stays exactly as saved (a
            // normal, searchable card) and its organization waits: flag it so
            // the server enriches it on upgrade or next month
            // (functions/deferred_capture.py). Not for the edit-path heading.
            if (!opts.titleOnly) {
                const body = await response.json().catch(() => null);
                if (saveWallAsWaiting(response.status, body)) {
                    await updateDoc(doc(db, 'users', uid, 'links', cardId), {
                        noteEnrichPending: true,
                        noteEnrichWaitingAt: Date.now(),
                    });
                }
            }
            return; // otherwise e.g. the note branch isn't deployed: leave the note as-is.
        }

        const data = await response.json().catch(() => null);
        const l = data?.link;
        if (!data?.success || !l) return;

        const patch: Record<string, unknown> = {};
        if (!opts.titleOnly) {
            // Organizational fields — concepts/relatedLinks power the knowledge
            // graph; tags/category power filtering.
            if (Array.isArray(l.tags) && l.tags.length) patch.tags = l.tags;
            if (l.category) patch.category = canonicalCategory(l.category) || 'General';
            if (Array.isArray(l.concepts) && l.concepts.length) patch.concepts = l.concepts;
            if (Array.isArray(l.relatedLinks) && l.relatedLinks.length) patch.relatedLinks = l.relatedLinks;
        }

        // The note's actionable takeaway, when the analysis found one. This is
        // the ONE card path that used to drop it: every backend save path stores
        // it (functions/main.py `_build_link_data`), but a note card is written
        // client-side and this enrichment never copied it across, so a note
        // carrying a real action never showed one.
        //
        // Set-or-CLEAR, not set-when-present: on the edit path the note's words
        // just changed, and a takeaway derived from the old ones would be shown
        // as if it described the new text.
        const takeaway = typeof l.metadata?.actionableTakeaway === 'string'
            ? l.metadata.actionableTakeaway.trim()
            : '';
        patch['metadata.actionableTakeaway'] = takeaway || deleteField();

        // AI heading for LONG-FORM notes only (see the doc comment above). The
        // getDoc guard makes the overwrite conditional on the card still wearing
        // the auto-derived title.
        const { title: derivedTitle, summary: derivedSummary } = splitNoteText(text);
        const aiTitle = typeof l.title === 'string' ? l.title.trim() : '';
        if (derivedSummary && aiTitle && aiTitle !== derivedTitle) {
            const snap = await getDoc(doc(db, 'users', uid, 'links', cardId));
            if (snap.exists() && snap.data()?.title === derivedTitle) {
                patch.title = aiTitle;
            }
        }

        if (Object.keys(patch).length) {
            await updateDoc(doc(db, 'users', uid, 'links', cardId), patch);
        }
    } catch {
        // Best-effort only — the note is already saved with the user's own text.
    }
}

/**
 * Machina's read of a text card, on demand.
 *
 * A verbatim card (shared text) keeps the user's words as its body, so the
 * standard summary has nowhere to go in the normal layout — it waits behind the
 * Machina mark in the detail view. A card captured from the share sheet already
 * carries one (`aiSummary`, written at capture time by the backend); a note
 * typed in the Note tab never had one generated, so the first tap produces it
 * here and PERSISTS it, making every later open instant and free.
 *
 * Reuses the `/api/analyze` note branch — the same analysis the capture path
 * runs — and stores only the two summary fields. The user's title, body, tags
 * and category are never touched: asking for a summary must not rewrite the
 * thing being summarized. Returns the summary pair, or null if the call failed
 * (the caller shows an error and the card is unchanged).
 */
export async function generateCardSummary(
    uid: string,
    cardId: string,
    text: string,
): Promise<{ aiSummary: string; aiDetailedSummary: string } | null> {
    const body = text.trim();
    if (!body) return null;
    try {
        const response = await fetchWithTimeout(apiUrl('/api/analyze'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(await appCheckHeaders()), ...(await authHeaders()) },
            body: JSON.stringify({ text: body, uid }),
        });
        if (!response.ok) return null;
        const data = await response.json().catch(() => null);
        const l = data?.link;
        if (!data?.success || !l) return null;
        const aiSummary: string = typeof l.summary === 'string' ? l.summary : '';
        const aiDetailedSummary: string = typeof l.detailedSummary === 'string' ? l.detailedSummary : '';
        if (!aiSummary && !aiDetailedSummary) return null;
        await updateDoc(doc(db, 'users', uid, 'links', cardId), { aiSummary, aiDetailedSummary });
        return { aiSummary, aiDetailedSummary };
    } catch {
        return null;
    }
}

/**
 * Retry analysis for a `failed` capture card (M3), on the SAME card.
 *
 * The card goes back through the durable background pipeline every capture
 * uses: POST /api/share naming this card (`cardId`), and the worker writes the
 * result onto it in place (`processing` while it runs, then ready or `failed`
 * again), keeping the user's own fields and an imported card's folder tags. An
 * IMAGE card re-sends its stored images (`imageUrls`); any other card its URL.
 *
 * Never the synchronous /api/analyze: every caller cut that request off at 60
 * seconds while the function ran on, so a video, a PDF or a slow page failed
 * again on every Retry, the server kept the unit and threw the result away,
 * and each Retry cost another save.
 *
 * Returns `{ waiting }` when the retry crossed the monthly allowance: the card
 * is then kept as `waiting` (read next month or on upgrade) rather than failed
 * again, and the caller announces it (lib/entitlement announceWaitingSave).
 */
export async function retryFailedLink(uid: string, link: Link): Promise<{ waiting?: WaitingSave }> {
    const linkRef = doc(db, 'users', uid, 'links', link.id);
    // Optimistic: show the processing skeleton immediately. Stamp when this retry
    // began so the server-side janitor ages the card out from *now* (not its
    // original createdAt) if this attempt dies before completing.
    await updateDoc(linkRef, { status: 'processing', error: null, processingStartedAt: Date.now() });

    try {
        let body: Record<string, unknown>;
        if (link.sourceType === 'image') {
            // Its images are already in Storage (the server only accepts the
            // caller's own); the worker writes it back as an image card.
            const imageUrls = (link.imageUrls?.length ? link.imageUrls : [link.url]).filter(Boolean);
            if (!imageUrls.length) throw new Error('This image is no longer available. Please add it again.');
            body = { imageUrls, cardId: link.id, uid };
        } else {
            if (!link.url) throw new Error('This link is no longer available. Please add it again.');
            body = { url: link.url, cardId: link.id, uid };
        }
        const response = await fetchWithTimeout(apiUrl('/api/share'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(await appCheckHeaders()), ...(await authHeaders()) },
            body: JSON.stringify(body),
        }, 30_000);
        const text = await response.text();
        let data: { success?: boolean; error?: string };
        try { data = JSON.parse(text); } catch { data = {}; }
        // Past the allowance the server keeps the card waiting itself.
        if (response.ok && isWaitingSave(data)) return { waiting: data };
        const wall = saveWallAsWaiting(response.status, data);
        if (wall) {
            await markLinkWaiting(uid, link.id);
            return { waiting: wall };
        }
        // 409: the card is no longer waiting for a read (an earlier job
        // finished it meanwhile). Nothing to retry, and nothing to mark failed.
        if (response.status === 409) return {};
        if (!response.ok || !data.success) {
            if (response.status === 429) offerUpgradeFor(data);
            throw new Error(data?.error || 'Could not restart analysis. Please try again.');
        }
        // Queued: the background worker flips this card to ready/failed.
        return {};
    } catch (err) {
        // Re-mark as failed so it stays a visible, retryable card, never lost.
        // Guard this write in its own try: if it also fails (e.g. offline), we
        // must not swallow the original error or leave the throw un-reached.
        try {
            await updateDoc(linkRef, {
                status: 'failed',
                error: err instanceof Error ? err.message.slice(0, 300) : 'Retry failed',
                failedAt: Date.now(),
            });
        } catch {
            // Best-effort: the janitor ages out a card stuck in `processing`,
            // and the caller still learns the retry failed via the re-throw.
        }
        throw err;
    }
}

/**
 * Update a link's status in Firestore
 */
export async function updateLinkStatus(uid: string, id: string, status: LinkStatus): Promise<void> {
    const linkRef = doc(db, 'users', uid, 'links', id);
    await updateDoc(linkRef, { status });
}

/**
 * Update a link's read status in Firestore
 */
export async function updateLinkReadStatus(uid: string, id: string, isRead: boolean): Promise<void> {
    const linkRef = doc(db, 'users', uid, 'links', id);
    await updateDoc(linkRef, { isRead });
}

/**
 * Stamp (or clear) the "kept in Review" marker — the right swipe in the deck.
 * Deliberately touches NOTHING else: Keep means "leave this card exactly where
 * it is", and the timestamp only rests the card from review sessions
 * (lib/reviewQueue REVIEWED_REST_DAYS). Clearing is the deck's Undo.
 */
export async function markLinkReviewed(uid: string, id: string, reviewed: boolean): Promise<void> {
    const linkRef = doc(db, 'users', uid, 'links', id);
    await updateDoc(linkRef, { reviewedAt: reviewed ? Date.now() : deleteField() });
}

/**
 * Tick the card's "Do this" takeaway off (or back on). Touches nothing else:
 * the takeaway text stays on the card, the card's status is not a task's
 * status, and the marker only removes the row from the Revisit list
 * (lib/takeaway openTakeaways).
 */
export async function markTakeawayDone(uid: string, id: string, done: boolean): Promise<void> {
    const linkRef = doc(db, 'users', uid, 'links', id);
    await updateDoc(linkRef, { takeawayDoneAt: done ? Date.now() : deleteField() });
}

/**
 * Say the card's "Do this" takeaway is not for the user (or take that back).
 * Like done, it only removes the row from the Revisit list; the takeaway text
 * stays on the card, and it does not count as done.
 */
export async function markTakeawayDismissed(uid: string, id: string, dismissed: boolean): Promise<void> {
    const linkRef = doc(db, 'users', uid, 'links', id);
    await updateDoc(linkRef, { takeawayDismissedAt: dismissed ? Date.now() : deleteField() });
}

/**
 * Update a link's tags in Firestore.
 *
 * With `previous` (the list the editor started from) only the DIFFERENCE is
 * written — arrayRemove for what was taken off, arrayUnion for what was added,
 * in one batch — so two devices tagging the same card at once both keep their
 * change instead of the later write replacing the whole array. Works offline
 * (no transaction). Without `previous` the list is written as given.
 */
export async function updateLinkTags(uid: string, id: string, tags: string[], previous?: string[]): Promise<void> {
    const linkRef = doc(db, 'users', uid, 'links', id);
    if (!previous) {
        await updateDoc(linkRef, { tags });
        return;
    }
    const removed = previous.filter((t) => !tags.includes(t));
    const added = tags.filter((t) => !previous.includes(t));
    if (removed.length === 0 && added.length === 0) return;
    const batch = writeBatch(db);
    if (removed.length) batch.update(linkRef, { tags: arrayRemove(...removed) });
    if (added.length) batch.update(linkRef, { tags: arrayUnion(...added) });
    await batch.commit();
}

/**
 * Update a link's category in Firestore
 */
export async function updateLinkCategory(uid: string, id: string, category: string): Promise<void> {
    const linkRef = doc(db, 'users', uid, 'links', id);
    // Canonicalised on the way in, so typing "sports" into the category editor
    // joins the existing "Sports" instead of forking a second one that differs
    // only by case. Matches the backend's canonical_category exactly.
    await updateDoc(linkRef, { category: canonicalCategory(category) || 'General', updatedAt: Date.now() });
}

/**
 * Update a link's AI-generated title. Makes the "second brain" correctable: the
 * model's title is a starting point, not a verdict. Persisted to Firestore; no
 * background process rewrites `title` on a ready card (the embedding trigger only
 * touches `embedding_vector`), so a user edit sticks.
 */
export async function updateLinkTitle(uid: string, id: string, title: string, reembed = false): Promise<void> {
    const linkRef = doc(db, 'users', uid, 'links', id);
    // For a NOTE card the title IS (part of) the user's own words — the embedding
    // is built from that text — so a title edit must re-flag `needsEmbedding` to
    // keep search/Ask honest. For a regular link the title is just metadata (the
    // embedding comes from the article), so we leave the vector untouched.
    // `updatedAt` feeds collectionSignature: a published collection page that
    // shows this card is flagged stale when what it shows has changed.
    await updateDoc(linkRef, { title, updatedAt: Date.now(), ...(reembed ? { needsEmbedding: true } : {}) });
}

/**
 * Update a link's AI-generated summary. Same rationale as updateLinkTitle — the
 * summary is editable and the edit is durable (nothing rewrites it in place).
 * `reembed` re-vectorizes note cards (whose body IS the user's words) so an edit
 * flows through to search/Ask.
 */
export async function updateLinkSummary(uid: string, id: string, summary: string, reembed = false): Promise<void> {
    const linkRef = doc(db, 'users', uid, 'links', id);
    await updateDoc(linkRef, { summary, updatedAt: Date.now(), ...(reembed ? { needsEmbedding: true } : {}) });
}

/**
 * Write the user's **personal notes** on a card — their own thoughts, distinct
 * from the AI summary. Takes the full desired note list (the editor computes it
 * from getNotes + its edit) and persists it to `userNotes`, always **migrating
 * away from the legacy `userNote` string**: the legacy field is deleted on every
 * write, so a card converges to the array shape the first time its notes are
 * touched. An empty list removes `userNotes` too, so a note-less card carries no
 * empty array.
 *
 * Notes are part of the card's embedded/searchable text (search.py folds every
 * note into build_embedding_text), so every write flips `needsEmbedding` — the
 * `sync_link_embedding` trigger only re-embeds when that flag (or a repair
 * condition) is set, so without it a note edit would never refresh the vector.
 */
export async function updateLinkNotes(uid: string, id: string, notes: UserNote[], previous?: UserNote[]): Promise<void> {
    const linkRef = doc(db, 'users', uid, 'links', id);
    // Drop empties and strip undefined fields — Firestore rejects `undefined`,
    // so `updatedAt` is only included when present.
    const cleanList = (list: UserNote[]) => list
        .filter(n => n.text && n.text.trim())
        .map(n => ({
            id: n.id,
            text: n.text.trim(),
            createdAt: n.createdAt,
            ...(n.updatedAt ? { updatedAt: n.updatedAt } : {}),
        }));
    const payload = (clean: ReturnType<typeof cleanList>) => clean.length
        ? { userNotes: clean, userNote: deleteField(), userNoteUpdatedAt: deleteField(), needsEmbedding: true }
        : { userNotes: deleteField(), userNote: deleteField(), userNoteUpdatedAt: deleteField(), needsEmbedding: true };

    if (previous) {
        // Concurrent-safe path: apply only what THIS editor changed (by note
        // id — removed, edited, added) onto the notes as they are on the
        // server right now, inside a transaction. A note another device added
        // meanwhile survives instead of being overwritten by a stale list.
        const desired = new Map(notes.map(n => [n.id, n]));
        const before = new Map(previous.map(n => [n.id, n]));
        const removedIds = new Set(previous.filter(n => !desired.has(n.id)).map(n => n.id));
        const added = notes.filter(n => !before.has(n.id));
        try {
            await runTransaction(db, async (tx) => {
                const snap = await tx.get(linkRef);
                if (!snap.exists()) return;
                const server = getNotes({ ...(snap.data() as Link), id });
                const merged = server
                    .filter(n => !removedIds.has(n.id))
                    .map(n => (before.has(n.id) && desired.has(n.id)) ? desired.get(n.id)! : n);
                const have = new Set(merged.map(n => n.id));
                for (const n of added) if (!have.has(n.id)) merged.push(n);
                tx.update(linkRef, payload(cleanList(merged)));
            });
            return;
        } catch {
            // Offline (transactions need the server) or contention: fall back
            // to the plain write below, which the offline cache can queue.
        }
    }
    await updateDoc(linkRef, payload(cleanList(notes)));
}

/**
 * Delete a link from Firestore
 */
export async function deleteLink(uid: string, id: string): Promise<void> {
    const linkRef = doc(db, 'users', uid, 'links', id);
    await deleteDoc(linkRef);
}

/**
 * Update a link's reminder settings in Firestore
 */
export async function updateLinkReminder(
    uid: string,
    id: string,
    enabled: boolean,
    reminderTime?: number,
    profile?: string
): Promise<void> {
    const linkRef = doc(db, 'users', uid, 'links', id);

    if (enabled) {
        // Use provided time or default to 24h from now (Smart Default)
        const nextReminder = reminderTime || (Date.now() + (24 * 60 * 60 * 1000));

        await updateDoc(linkRef, {
            reminderStatus: 'pending',
            nextReminderAt: nextReminder,
            reminderCount: 0,
            reminderProfile: profile || 'smart',
            // Re-setting a reminder clears any stale "due" flag from a prior fire.
            reminderDue: false,
            reminderDueAt: null
        });
    } else {
        // Disable reminders
        await updateDoc(linkRef, {
            reminderStatus: 'none',
            nextReminderAt: null,
            reminderCount: 0,
            reminderProfile: null,
            reminderDue: false,
            reminderDueAt: null
        });
    }
}


/**
 * Get user settings from Firestore
 */
export async function getUserSettings(uid: string): Promise<User['settings'] | null> {
    const userRef = doc(db, 'users', uid);
    const snapshot = await getDoc(userRef);
    if (snapshot.exists()) {
        const data = snapshot.data();
        return data.settings || null;
    }
    return null;
}

/**
 * Update user settings in Firestore
 */
export async function updateUserSettings(uid: string, settings: Partial<User['settings']>): Promise<void> {
    const userRef = doc(db, 'users', uid);
    // Construct dot notation for partial updates to avoid overwriting other settings
    const updates: Record<string, unknown> = {};
    Object.entries(settings).forEach(([key, value]) => {
        updates[`settings.${key}`] = value;
    });
    await updateDoc(userRef, updates);
}
