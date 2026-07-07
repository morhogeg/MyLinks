import { collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, getDocs, getDoc, serverTimestamp, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { db, appCheckHeaders } from './firebase';
import { authHeaders } from './auth';
import { apiUrl, fetchWithTimeout } from './api';

import { Link, LinkMetadata, LinkStatus, User } from './types';

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
    }, {} as any);

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
    // Optimistic: show the processing skeleton immediately.
    await updateDoc(linkRef, { status: 'processing', error: null });

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
        let data: any;
        try {
            data = JSON.parse(text);
        } catch {
            throw new Error('The analysis service returned an unexpected response.');
        }
        if (!response.ok || !data.success) {
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
            embedding_vector: l.embedding_vector ?? null,
            concepts: l.concepts ?? [],
            relatedLinks: l.relatedLinks ?? [],
            status: 'unread',
            isRead: false,
            error: null,
            failedAt: null,
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
            reminderProfile: profile || 'smart'
        });
    } else {
        // Disable reminders
        await updateDoc(linkRef, {
            reminderStatus: 'none',
            nextReminderAt: null,
            reminderCount: 0,
            reminderProfile: null
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
    const updates: Record<string, any> = {};
    Object.entries(settings).forEach(([key, value]) => {
        updates[`settings.${key}`] = value;
    });
    await updateDoc(userRef, updates);
}

/**
 * Update a top-level field on the user document (e.g. the digest email address).
 */
export async function updateUserEmail(uid: string, email: string): Promise<void> {
    const userRef = doc(db, 'users', uid);
    await updateDoc(userRef, { email });
}

/**
 * Read the user's top-level email (used to prefill the digest form).
 */
export async function getUserEmail(uid: string): Promise<string | null> {
    const snapshot = await getDoc(doc(db, 'users', uid));
    return snapshot.exists() ? (snapshot.data().email ?? null) : null;
}
