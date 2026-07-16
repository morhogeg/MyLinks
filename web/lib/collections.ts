import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    getDocs,
    query,
    where,
    writeBatch,
    arrayUnion,
    arrayRemove,
} from 'firebase/firestore';
import { db, appCheckHeaders } from './firebase';
import { authHeaders } from './auth';
import { apiUrl, fetchWithTimeout } from './api';
import { Collection, Link, SharedCard } from './types';

/**
 * Storage layer for Collections — curated groups of cards.
 *
 * Mirrors the conventions in storage.ts: strip `undefined` (Firestore rejects
 * it), stamp timestamps with Date.now(), and lean on Firestore's optimistic
 * onSnapshot updates for instant UI feedback.
 *
 * Membership is stored as `collectionIds` on each Link (see addLinkToCollection),
 * NOT as a list on the collection doc — so the already-loaded feed filters in
 * memory with no extra reads.
 */

const collectionsRef = (uid: string) => collection(db, 'users', uid, 'collections');

// Firestore caps a WriteBatch at 500 operations — chunk conservatively so
// membership sweeps over large collections can't throw mid-delete (L-5).
const BATCH_LIMIT = 450;

/** Apply `op` to every ref, committing in ≤BATCH_LIMIT-op batches sequentially. */
export async function batchedUpdate(
    refs: ReturnType<typeof doc>[],
    op: (batch: ReturnType<typeof writeBatch>, ref: ReturnType<typeof doc>) => void,
): Promise<void> {
    for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
        const batch = writeBatch(db);
        refs.slice(i, i + BATCH_LIMIT).forEach((ref) => op(batch, ref));
        await batch.commit();
    }
}

/** Drop undefined keys — Firestore can't store them. */
function clean<T extends Record<string, unknown>>(obj: T): Record<string, unknown> {
    return Object.entries(obj).reduce((acc, [k, v]) => {
        if (v !== undefined) acc[k] = v;
        return acc;
    }, {} as Record<string, unknown>);
}

/** Create a new collection; returns the new doc id. */
export async function createCollection(
    uid: string,
    data: { name: string; description?: string; color?: string; coverLinkId?: string; isPrivate?: boolean }
): Promise<string> {
    const now = Date.now();
    const ref = await addDoc(collectionsRef(uid), clean({
        name: data.name.trim(),
        description: data.description?.trim() || undefined,
        color: data.color,
        coverLinkId: data.coverLinkId,
        isPrivate: data.isPrivate || undefined,
        createdAt: now,
        updatedAt: now,
    }));
    return ref.id;
}

/** Update a collection's metadata (name/description/color/cover/privacy). */
export async function updateCollection(
    uid: string,
    id: string,
    patch: Partial<Pick<Collection, 'name' | 'description' | 'color' | 'coverLinkId' | 'isPrivate'>>
): Promise<void> {
    const ref = doc(db, 'users', uid, 'collections', id);
    await updateDoc(ref, clean({ ...patch, updatedAt: Date.now() }));
}

/**
 * Delete a collection. Also strips its id from every member card's
 * `collectionIds` (batched) and removes the public snapshot if published.
 */
export async function deleteCollection(uid: string, id: string, shareId?: string): Promise<void> {
    // Find all member cards and clear the membership in one batch.
    const linksRef = collection(db, 'users', uid, 'links');
    const members = await getDocs(query(linksRef, where('collectionIds', 'array-contains', id)));
    if (!members.empty) {
        await batchedUpdate(
            members.docs.map((d) => d.ref),
            (batch, ref) => batch.update(ref, { collectionIds: arrayRemove(id) }),
        );
    }
    if (shareId) {
        // Public snapshot is Admin-SDK-owned now (locked rules deny client
        // writes to shared_*), so tear it down via the endpoint, not deleteDoc.
        await callShareApi('/api/unpublish-share', { uid, type: 'collection', shareId }).catch(() => {});
    }
    await deleteDoc(doc(db, 'users', uid, 'collections', id));
}

/** Add a card to a collection (idempotent via arrayUnion). */
export async function addLinkToCollection(uid: string, linkId: string, collectionId: string): Promise<void> {
    const ref = doc(db, 'users', uid, 'links', linkId);
    await updateDoc(ref, { collectionIds: arrayUnion(collectionId) });
}

/** Remove a card from a collection. */
export async function removeLinkFromCollection(uid: string, linkId: string, collectionId: string): Promise<void> {
    const ref = doc(db, 'users', uid, 'links', linkId);
    await updateDoc(ref, { collectionIds: arrayRemove(collectionId) });
}

/** Overwrite a card's full collection membership (used by the multi-toggle sheet). */
export async function setLinkCollections(uid: string, linkId: string, collectionIds: string[]): Promise<void> {
    const ref = doc(db, 'users', uid, 'links', linkId);
    await updateDoc(ref, { collectionIds });
}

/** Add many cards to a collection in one batched write (suggested collections). */
export async function addLinksToCollection(uid: string, linkIds: string[], collectionId: string): Promise<void> {
    if (linkIds.length === 0) return;
    await batchedUpdate(
        linkIds.map((linkId) => doc(db, 'users', uid, 'links', linkId)),
        (batch, ref) => batch.update(ref, { collectionIds: arrayUnion(collectionId) }),
    );
}

/**
 * Stable signature of what a public snapshot would contain: the collection's
 * name + description + the sorted member ids. Stored on the collection doc at
 * publish time; when the live signature differs the UI can offer "Update the
 * public page" instead of leaving the share silently stale.
 */
export function collectionSignature(
    col: Pick<Collection, 'name' | 'description'>,
    memberLinks: Pick<Link, 'id'>[]
): string {
    const base = [
        col.name.trim(),
        (col.description ?? '').trim(),
        ...memberLinks.map((l) => l.id).sort(),
    ].join('\u0000');
    // djb2 — tiny, stable, and plenty for change detection (not security).
    let hash = 5381;
    for (let i = 0; i < base.length; i++) {
        hash = ((hash << 5) + hash + base.charCodeAt(i)) | 0;
    }
    return `${memberLinks.length}.${(hash >>> 0).toString(36)}`;
}

/** True when a published collection's public snapshot no longer matches it. */
export function isShareStale(col: Collection, memberLinks: Pick<Link, 'id'>[]): boolean {
    if (!col.isPublic || !col.shareId) return false;
    // Legacy shares published before signatures existed: assume fresh rather
    // than nagging about an update we can't actually detect.
    if (!col.publishedSignature) return false;
    return col.publishedSignature !== collectionSignature(col, memberLinks);
}

/** Build a frozen, denormalized snapshot card from a live Link (no undefined keys). */
export function toSharedCard(link: Link): SharedCard {
    const card: SharedCard = { title: link.title, summary: link.summary, url: link.url };
    if (link.detailedSummary !== undefined) card.detailedSummary = link.detailedSummary;
    if (link.category !== undefined) card.category = link.category;
    if (link.tags !== undefined) card.tags = link.tags;
    if (link.metadata?.thumbnailUrl !== undefined) card.thumbnailUrl = link.metadata.thumbnailUrl;
    if (link.sourceName !== undefined) card.sourceName = link.sourceName;
    if (link.sourceType !== undefined) card.sourceType = link.sourceType;
    return card;
}

/**
 * POST to a share publish/unpublish endpoint.
 *
 * Publishing goes through an Admin-SDK Cloud Function (not a direct Firestore
 * write) so the world-readable snapshot never carries `ownerUid` — for the
 * phone-keyed owner workspace that value is PII, and any client can read a
 * public share doc. The server keeps the owner mapping in a functions-only
 * collection. HTTP (not a callable) so native's WKWebView can reach it.
 */
async function callShareApi(path: string, body: Record<string, unknown>): Promise<{ shareId?: string }> {
    const res = await fetchWithTimeout(apiUrl(path), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await appCheckHeaders()), ...(await authHeaders()) },
        body: JSON.stringify(body),
    }, 30_000);
    if (!res.ok) {
        let msg = `Request failed (HTTP ${res.status})`;
        try { const j = await res.json(); if (j?.error) msg = j.error; } catch { /* non-JSON error body */ }
        throw new Error(msg);
    }
    return res.json().catch(() => ({}));
}

/** Generate an unguessable share id. */
function newShareId(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, '');
    return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}

/**
 * Publish (or re-publish) a collection as a frozen public snapshot.
 * Reuses the existing shareId on re-publish so the URL stays stable.
 * Returns the shareId.
 */
export async function publishCollection(
    uid: string,
    collectionDoc: Collection,
    memberLinks: Link[]
): Promise<string> {
    const shareId = collectionDoc.shareId || newShareId();
    await callShareApi('/api/publish-share', {
        uid,
        type: 'collection',
        shareId,
        payload: clean({
            name: collectionDoc.name,
            description: collectionDoc.description,
            cards: memberLinks.map(toSharedCard),
        }),
    });
    await updateDoc(doc(db, 'users', uid, 'collections', collectionDoc.id), {
        shareId,
        isPublic: true,
        publishedAt: Date.now(),
        publishedSignature: collectionSignature(collectionDoc, memberLinks),
        updatedAt: Date.now(),
    });
    return shareId;
}

/** Stop sharing a collection: delete the snapshot and clear the share flags. */
export async function unpublishCollection(uid: string, collectionDoc: Collection): Promise<void> {
    if (collectionDoc.shareId) {
        await callShareApi('/api/unpublish-share', {
            uid, type: 'collection', shareId: collectionDoc.shareId,
        }).catch(() => {});
    }
    await updateDoc(doc(db, 'users', uid, 'collections', collectionDoc.id), {
        isPublic: false,
        shareId: null,
        publishedAt: null,
        publishedSignature: null,
        updatedAt: Date.now(),
    });
}

/** Publish a single card as a public Machina page; returns the shareId. */
export async function publishCard(uid: string, link: Link): Promise<string> {
    const shareId = newShareId();
    await callShareApi('/api/publish-share', {
        uid,
        type: 'card',
        shareId,
        payload: { card: toSharedCard(link) },
    });
    return shareId;
}
