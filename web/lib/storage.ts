import { collection, addDoc, updateDoc, deleteDoc, deleteField, doc, query, where, limit, orderBy, getDocs, getDoc, serverTimestamp, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { db, appCheckHeaders } from './firebase';
import { authHeaders } from './auth';
import { apiUrl, fetchWithTimeout } from './api';

import { AnalyzeResponse, Link, LinkMetadata, LinkStatus, User } from './types';

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
        createdAt: data.createdAt ?? 0,
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
 * Get all unique tags for a user from Firestore
 */
export async function getUserTags(uid: string): Promise<string[]> {
    const linksRef = collection(db, 'users', uid, 'links');
    const snapshot = await getDocs(linksRef);

    const tags = new Set<string>();
    snapshot.docs.forEach(doc => {
        const linkTags = doc.data().tags as string[] || [];
        linkTags.forEach(tag => tags.add(tag));
    });

    return Array.from(tags).sort();
}

/**
 * Return the id of an existing saved link with this exact URL, or null.
 *
 * Mirrors the iOS share path's dedup (functions/link_service.py
 * `link_exists_for_url`): an exact-equality match on the stored `url` field,
 * one indexed Firestore query, `limit(1)`. Firestore auto-indexes single
 * fields, so no composite index is required. The web analyze endpoint stores
 * `link.url` === the URL that was submitted, so a pre-analysis check on the
 * formatted URL agrees with what the share path writes — the two capture paths
 * dedup against the same value.
 *
 * Callers MUST treat a thrown error as "unknown" and fall through to saving —
 * a failed dedup probe (e.g. offline) must never block a capture.
 */
export async function findLinkIdByUrl(uid: string, url: string): Promise<string | null> {
    if (!url) return null;
    const linksRef = collection(db, 'users', uid, 'links');
    const q = query(linksRef, where('url', '==', url), limit(1));
    const snapshot = await getDocs(q);
    return snapshot.empty ? null : snapshot.docs[0].id;
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
 * lose the capture. Returns the new card id.
 */
export async function createProcessingPlaceholder(uid: string, url: string): Promise<string> {
    const linksRef = collection(db, 'users', uid, 'links');
    // A client ms clock (mirrors the trigger's int-ms writes) so feed ordering
    // and useProcessingBanner's ramp work the instant the card streams in — unlike
    // serverTimestamp(), which reads as 0 until the server resolves it.
    const now = Date.now();
    const ref = await addDoc(linksRef, {
        url,
        title: placeholderTitle(url),
        summary: '',
        tags: [],
        category: '',
        status: 'processing',
        sourceType: 'web',
        isRead: false,
        createdAt: now,
        // The processing janitor ages out cards stuck here past its timeout.
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
        // serverTimestamp() so ordering is consistent across devices/clocks and
        // survives offline replay. Feed's getTimestampNumber already tolerates a
        // Firestore Timestamp (via toMillis), so sorting stays correct; the
        // pending-write value simply reads as 0 until the server resolves it.
        createdAt: serverTimestamp(),
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
export async function createNoteCard(uid: string, text: string): Promise<string> {
    const trimmed = text.trim();
    const firstLine = (trimmed.split('\n').map(l => l.trim()).find(Boolean) || 'Note');
    // A short one-liner IS its own title, so we leave the body empty to avoid a
    // card that prints the same sentence twice. A longer/multi-line note gets a
    // truncated first-line title with the full text as the body. (AI enrichment
    // later refines the title either way.)
    const isShortSingleLine = !trimmed.includes('\n') && firstLine.length <= 90;
    const title = firstLine.length > 90 ? `${firstLine.slice(0, 90).trimEnd()}…` : firstLine;
    const summary = isShortSingleLine ? '' : trimmed;
    const words = trimmed ? trimmed.split(/\s+/).length : 0;
    const ref = await addDoc(collection(db, 'users', uid, 'links'), {
        url: '',
        title,
        summary,
        tags: [],
        category: '',
        status: 'unread',
        isRead: false,
        sourceType: 'note',
        sourceName: 'Note',
        createdAt: serverTimestamp(),
        // Let the sync_link_embedding trigger vectorize it → searchable + askable.
        needsEmbedding: true,
        metadata: { originalTitle: firstLine, estimatedReadTime: Math.max(1, Math.round(words / 200)) },
    });
    return ref.id;
}

/**
 * Best-effort AI *organization* for a note card created by `createNoteCard`.
 *
 * A note is the user's own words, so we deliberately DON'T let the model rewrite
 * the title or body — we only fold in tags, a category, and concepts so the note
 * files and surfaces like everything else (and, for a short note whose text
 * lives in the title, overwriting the title would lose it). Sends the raw text
 * to the `/api/analyze` note branch and patches only those organizational
 * fields. Never throws: if the branch isn't deployed or the call fails, the note
 * simply stays untagged — still saved, still searchable, still the user's words.
 */
export async function enrichNoteCard(uid: string, cardId: string, text: string): Promise<void> {
    try {
        let existingTags: string[] = [];
        try { existingTags = await getUserTags(uid); } catch { /* optional */ }

        const response = await fetchWithTimeout(apiUrl('/api/analyze'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(await appCheckHeaders()), ...(await authHeaders()) },
            body: JSON.stringify({ text: text.trim(), existingTags, uid }),
        });
        if (!response.ok) return; // e.g. the note branch isn't deployed — leave the note as-is.

        const data = await response.json().catch(() => null);
        const l = data?.link;
        if (!data?.success || !l) return;

        // Organizational fields only — never title/summary (the user's words stay
        // verbatim). concepts/relatedLinks power the knowledge graph; tags/category
        // power filtering.
        const patch: Record<string, unknown> = {};
        if (Array.isArray(l.tags) && l.tags.length) patch.tags = l.tags;
        if (l.category) patch.category = l.category;
        if (Array.isArray(l.concepts) && l.concepts.length) patch.concepts = l.concepts;
        if (Array.isArray(l.relatedLinks) && l.relatedLinks.length) patch.relatedLinks = l.relatedLinks;
        if (Object.keys(patch).length) {
            await updateDoc(doc(db, 'users', uid, 'links', cardId), patch);
        }
    } catch {
        // Best-effort only — the note is already saved with the user's own text.
    }
}

/**
 * Retry analysis for a `failed` capture card (M3).
 *
 * Re-runs the same synchronous analysis the Add-Link form uses, then updates the
 * SAME card doc in place: `processing` while it runs, `unread` (ready) on
 * success, or back to `failed` (with the error) if it fails again. Reusing the
 * existing analyze pipeline means no new backend/rules and the card keeps its id
 * — nothing is ever dropped or duplicated.
 */
export async function retryFailedLink(uid: string, link: Link): Promise<void> {
    const linkRef = doc(db, 'users', uid, 'links', link.id);
    // Optimistic: show the processing skeleton immediately. Stamp when this retry
    // began so the server-side janitor ages the card out from *now* (not its
    // original createdAt) if this attempt dies before completing.
    await updateDoc(linkRef, { status: 'processing', error: null, processingStartedAt: Date.now() });

    try {
        let existingTags: string[] = [];
        try {
            existingTags = await getUserTags(uid);
        } catch {
            // Tag context is a non-critical optimization.
        }

        const response = await fetchWithTimeout(apiUrl('/api/analyze'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(await appCheckHeaders()), ...(await authHeaders()) },
            body: JSON.stringify({ url: link.url, existingTags, uid }),
        }, 60_000);
        const text = await response.text();
        let data: AnalyzeResponse;
        try {
            data = JSON.parse(text) as AnalyzeResponse;
        } catch {
            throw new Error('The analysis service returned an unexpected response.');
        }
        if (!response.ok || !data.success || !data.link) {
            throw new Error(data?.error || 'Analysis failed. Please try again.');
        }

        const l = data.link;
        await updateDoc(linkRef, {
            url: l.url,
            title: l.title,
            summary: l.summary,
            detailedSummary: l.detailedSummary ?? null,
            tags: l.tags ?? [],
            category: l.category ?? 'General',
            language: l.language ?? 'en',
            metadata: {
                originalTitle: l.metadata?.originalTitle ?? '',
                estimatedReadTime: l.metadata?.estimatedReadTime ?? 0,
                actionableTakeaway: l.metadata?.actionableTakeaway ?? null,
            },
            sourceType: l.sourceType || 'web',
            sourceName: l.sourceName ?? null,
            // Intentionally NOT writing embedding_vector here. The API no longer
            // returns it, and a client write would store it as a plain array
            // (invisible to vector search). The `sync_link_embedding` Firestore
            // trigger re-embeds this card server-side on this very update.
            concepts: l.concepts ?? [],
            relatedLinks: l.relatedLinks ?? [],
            status: 'unread',
            isRead: false,
            error: null,
            failedAt: null,
            processingStartedAt: null,
            // Preserve the original createdAt — a successful retry should update
            // the card in place, not teleport it to the top of the feed.
        });
    } catch (err) {
        // Re-mark as failed so it stays a visible, retryable card — never lost.
        // Guard this write in its own try: if it also fails (e.g. offline), we
        // must not swallow the original error or leave the throw un-reached.
        try {
            await updateDoc(linkRef, {
                status: 'failed',
                error: err instanceof Error ? err.message.slice(0, 300) : 'Retry failed',
                failedAt: Date.now(),
            });
        } catch {
            // Best-effort: the card stays in `processing`, but the caller still
            // learns the retry failed via the re-throw below.
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
 * Update a link's tags in Firestore
 */
export async function updateLinkTags(uid: string, id: string, tags: string[]): Promise<void> {
    const linkRef = doc(db, 'users', uid, 'links', id);
    await updateDoc(linkRef, { tags });
}

/**
 * Update a link's category in Firestore
 */
export async function updateLinkCategory(uid: string, id: string, category: string): Promise<void> {
    const linkRef = doc(db, 'users', uid, 'links', id);
    await updateDoc(linkRef, { category });
}

/**
 * Update a link's AI-generated title. Makes the "second brain" correctable: the
 * model's title is a starting point, not a verdict. Persisted to Firestore; no
 * background process rewrites `title` on a ready card (the embedding trigger only
 * touches `embedding_vector`), so a user edit sticks.
 */
export async function updateLinkTitle(uid: string, id: string, title: string): Promise<void> {
    const linkRef = doc(db, 'users', uid, 'links', id);
    await updateDoc(linkRef, { title });
}

/**
 * Update a link's AI-generated summary. Same rationale as updateLinkTitle — the
 * summary is editable and the edit is durable (nothing rewrites it in place).
 */
export async function updateLinkSummary(uid: string, id: string, summary: string): Promise<void> {
    const linkRef = doc(db, 'users', uid, 'links', id);
    await updateDoc(linkRef, { summary });
}

/**
 * Set (or clear) the user's **personal note** on any card — their own thought
 * about a saved item, distinct from the AI summary. An empty note removes the
 * field entirely (via deleteField) so a card is cleanly "note-less" again rather
 * than carrying an empty string. Nothing else writes `userNote`, so the edit is
 * durable.
 *
 * The note is part of the card's embedded/searchable text (search.py folds
 * `userNote` into build_embedding_text), so every note write also flips
 * `needsEmbedding` — the `sync_link_embedding` trigger only re-embeds when that
 * flag (or a repair condition) is set, so without it a note edit would never
 * refresh the vector. Clearing a note sets the same flag so the stale note text
 * is dropped from the embedding on the next pass.
 */
export async function updateLinkNote(uid: string, id: string, note: string): Promise<void> {
    const linkRef = doc(db, 'users', uid, 'links', id);
    const trimmed = note.trim();
    await updateDoc(linkRef, trimmed
        ? { userNote: trimmed, userNoteUpdatedAt: Date.now(), needsEmbedding: true }
        : { userNote: deleteField(), userNoteUpdatedAt: deleteField(), needsEmbedding: true });
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
