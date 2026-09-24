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
 * Delete a collection. The work runs server-side (`/api/delete-collection`):
 * unpublish its page if shared, strip its id from every member card, delete
 * the doc. That keeps the membership sweep from reading every member document
 * in full (embedding vectors included) through the client, and makes the
 * unpublish impossible to skip. Order on the server matches the old client
 * order: unpublish FIRST, so a failure there leaves the collection intact and
 * visibly still shared, and this throws for the caller to toast.
 *
 * Falls back to the client-side sweep when the endpoint itself is unreachable
 * (a hosting rewrite not yet live, an old function build): the fallback keeps
 * the same unpublish-first guarantee, so deletion never depends on which side
 * happens to be deployed.
 */
export async function deleteCollection(uid: string, id: string, shareId?: string): Promise<void> {
    try {
        await callShareApi('/api/delete-collection', { uid, collectionId: id });
        return;
    } catch (e) {
        // The server refusing (403: not the owner) is final; anything else
        // (route missing, timeout) falls through to the client path.
        if (e instanceof Error && /belongs to another account/.test(e.message)) throw e;
    }
    if (shareId) {
        // Public snapshot is Admin-SDK-owned (locked rules deny client writes
        // to shared_*), so tear it down via the endpoint, not deleteDoc.
        await callShareApi('/api/unpublish-share', { uid, type: 'collection', shareId, collectionId: id });
    }
    const linksRef = collection(db, 'users', uid, 'links');
    const members = await getDocs(query(linksRef, where('collectionIds', 'array-contains', id)));
    if (!members.empty) {
        await batchedUpdate(
            members.docs.map((d) => d.ref),
            (batch, ref) => batch.update(ref, { collectionIds: arrayRemove(id) }),
        );
    }
    await deleteDoc(doc(db, 'users', uid, 'collections', id));
}

// Membership writes below also bump the collection's `updatedAt`: the gallery
// sorts by it, so adding or removing a card has to count as activity or a
// collection someone files into daily sinks below one they renamed once.

/** Add a card to a collection (idempotent via arrayUnion). */
export async function addLinkToCollection(uid: string, linkId: string, collectionId: string): Promise<void> {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', uid, 'links', linkId), { collectionIds: arrayUnion(collectionId) });
    batch.update(doc(db, 'users', uid, 'collections', collectionId), { updatedAt: Date.now() });
    await batch.commit();
}

/** Remove a card from a collection. */
export async function removeLinkFromCollection(uid: string, linkId: string, collectionId: string): Promise<void> {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', uid, 'links', linkId), { collectionIds: arrayRemove(collectionId) });
    batch.update(doc(db, 'users', uid, 'collections', collectionId), { updatedAt: Date.now() });
    await batch.commit();
}

/**
 * Overwrite a card's full collection membership (used by the multi-toggle sheet).
 * Pass `previousIds` (the card's current `collectionIds`) so only the
 * collections whose membership actually changed get their `updatedAt` bumped.
 */
export async function setLinkCollections(
    uid: string,
    linkId: string,
    collectionIds: string[],
    previousIds: string[] = [],
): Promise<void> {
    const batch = writeBatch(db);
    batch.update(doc(db, 'users', uid, 'links', linkId), { collectionIds });
    const before = new Set(previousIds);
    const after = new Set(collectionIds);
    const changed = [...new Set([...previousIds, ...collectionIds])].filter((id) => before.has(id) !== after.has(id));
    const now = Date.now();
    for (const id of changed) {
        batch.update(doc(db, 'users', uid, 'collections', id), { updatedAt: now });
    }
    await batch.commit();
}

/** Add many cards to a collection in one batched write (suggested collections). */
export async function addLinksToCollection(uid: string, linkIds: string[], collectionId: string): Promise<void> {
    if (linkIds.length === 0) return;
    await batchedUpdate(
        linkIds.map((linkId) => doc(db, 'users', uid, 'links', linkId)),
        (batch, ref) => batch.update(ref, { collectionIds: arrayUnion(collectionId) }),
    );
    await updateDoc(doc(db, 'users', uid, 'collections', collectionId), { updatedAt: Date.now() });
}

/** Remove many cards from a collection in one batched write (Manage cards). */
export async function removeLinksFromCollection(uid: string, linkIds: string[], collectionId: string): Promise<void> {
    if (linkIds.length === 0) return;
    await batchedUpdate(
        linkIds.map((linkId) => doc(db, 'users', uid, 'links', linkId)),
        (batch, ref) => batch.update(ref, { collectionIds: arrayRemove(collectionId) }),
    );
    await updateDoc(doc(db, 'users', uid, 'collections', collectionId), { updatedAt: Date.now() });
}

/** The slice of a Link the share signature and staleness check read. */
export type SignatureMember = Pick<Link, 'id'> & Partial<Pick<Link, 'updatedAt'>>;

/**
 * Stable signature of what a public snapshot would contain: the collection's
 * name + description + the sorted member ids, each with the member's
 * `updatedAt` when it carries one (so an edited title or summary on a member
 * also marks the share stale, not only a changed member set). Stored on the
 * collection doc at publish time; when the live signature differs the UI can
 * offer "Update the public page" instead of leaving the share silently stale.
 */
export function collectionSignature(
    col: Pick<Collection, 'name' | 'description'>,
    memberLinks: SignatureMember[]
): string {
    const base = [
        col.name.trim(),
        (col.description ?? '').trim(),
        ...memberLinks.map((l) => (l.updatedAt ? `${l.id}@${l.updatedAt}` : l.id)).sort(),
    ].join('\u0000');
    // djb2 — tiny, stable, and plenty for change detection (not security).
    let hash = 5381;
    for (let i = 0; i < base.length; i++) {
        hash = ((hash << 5) + hash + base.charCodeAt(i)) | 0;
    }
    return `${memberLinks.length}.${(hash >>> 0).toString(36)}`;
}

/** True when a published collection's public snapshot no longer matches it. */
export function isShareStale(col: Collection, memberLinks: SignatureMember[]): boolean {
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
    // A thumbnail the owner hid on the card stays hidden on the public page too.
    if (!link.hideThumbnail && link.metadata?.thumbnailUrl !== undefined) card.thumbnailUrl = link.metadata.thumbnailUrl;
    // …and the page must know it: a screenshot card's `url` IS the image, and
    // the server used to fall back to it (share_service._share_card_image).
    // Its url is dropped too — the image itself must not ride in the snapshot.
    if (link.hideThumbnail) {
        card.hideThumbnail = true;
        if (link.sourceType === 'image') card.url = '';
    }
    if (link.sourceName !== undefined) card.sourceName = link.sourceName;
    if (link.sourceType !== undefined) card.sourceType = link.sourceType;
    return card;
}

/**
 * A member card as it appears inside a PUBLIC COLLECTION snapshot. The /c page
 * renders thumbnail, source, linked title and the short summary only, so the
 * long-form body and tags are dropped here rather than published for no
 * reader. The single-card /s page keeps them (toSharedCard). The server
 * (share_service._sanitize_card_snapshot) trims the same way; this keeps the
 * request small and the intent visible on the client.
 */
export function toSharedCollectionCard(link: Link): SharedCard {
    const card = toSharedCard(link);
    delete card.detailedSummary;
    delete card.tags;
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
export async function callShareApi(path: string, body: Record<string, unknown>): Promise<{ shareId?: string }> {
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
export function newShareId(): string {
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
    const signature = collectionSignature(collectionDoc, memberLinks);
    // The server writes the share flags onto the collection doc in the SAME
    // batch as the public snapshot (`collection: {id, signature}`), so a
    // publish can never leave a live page whose shareId the collection doc
    // never learned (the old two-step wrote the flags from here afterwards,
    // and a failure between the two minted a fresh id on the next Share).
    await callShareApi('/api/publish-share', {
        uid,
        type: 'collection',
        shareId,
        collection: { id: collectionDoc.id, signature },
        payload: clean({
            name: collectionDoc.name,
            description: collectionDoc.description,
            cards: memberLinks.map(toSharedCollectionCard),
        }),
    });
    // Belt and braces for a function build that predates the server-side
    // flags: the same values, idempotent, and no longer load-bearing, so a
    // failure here is not an error.
    await updateDoc(doc(db, 'users', uid, 'collections', collectionDoc.id), {
        shareId,
        isPublic: true,
        publishedAt: Date.now(),
        publishedSignature: signature,
        updatedAt: Date.now(),
    }).catch(() => {});
    return shareId;
}

/**
 * Stop sharing a collection: delete the snapshot, then clear the share flags.
 * Throws if the unpublish call fails and leaves the flags alone, so the UI
 * keeps saying "Public" while the page is in fact still up; the caller toasts.
 */
export async function unpublishCollection(uid: string, collectionDoc: Collection): Promise<void> {
    if (collectionDoc.shareId) {
        // `collectionId` lets the server clear the flags in the same batch
        // that removes the page; the write below is the pre-server fallback.
        await callShareApi('/api/unpublish-share', {
            uid, type: 'collection', shareId: collectionDoc.shareId, collectionId: collectionDoc.id,
        });
    }
    await updateDoc(doc(db, 'users', uid, 'collections', collectionDoc.id), {
        isPublic: false,
        shareId: null,
        publishedAt: null,
        publishedSignature: null,
        updatedAt: Date.now(),
    }).catch(() => {});
}

/**
 * Publish a single card as a public Machina page; returns the shareId.
 *
 * Accepts an optional pre-generated `shareId` so the caller can build the
 * share URL and open the OS share sheet BEFORE this network write resolves
 * (see handleShareCard) — the sheet no longer waits on the publish round-trip.
 */
export async function publishCard(
    uid: string,
    link: Link,
    shareId: string = link.shareId || newShareId(),
    opts: { updateOnly?: boolean } = {},
): Promise<string> {
    await callShareApi('/api/publish-share', {
        uid,
        type: 'card',
        shareId,
        // "Update public link" only refreshes a LIVE page: the server refuses
        // it when the share was stopped (e.g. on another device), so a stale
        // shareId in this device's copy of the card can't revive it.
        ...(opts.updateOnly ? { mode: 'update' } : {}),
        // The server records shareId/sharePublishedAt on the card in the same
        // batch, so re-sharing reuses this URL and Stop sharing can find it.
        card: { id: link.id },
        payload: { card: toSharedCard(link) },
    });
    return shareId;
}

/** True when the card has a live public page older than its last edit. */
export function isCardShareStale(link: Pick<Link, 'shareId' | 'sharePublishedAt' | 'updatedAt'>): boolean {
    return !!link.shareId && !!link.updatedAt && !!link.sharePublishedAt && link.updatedAt > link.sharePublishedAt;
}

/** Take a card's public page down and clear its shareId (server-side batch). */
export async function unpublishCard(uid: string, link: Link): Promise<void> {
    if (!link.shareId) return;
    await callShareApi('/api/unpublish-share', { uid, type: 'card', shareId: link.shareId, cardId: link.id });
}

/** Settings → Privacy: stop every public card link this account owns.
 *  Collections and answers are untouched. Returns how many were stopped. */
export async function unpublishAllCards(uid: string): Promise<number> {
    const res = await callShareApi('/api/unpublish-share', { uid, type: 'card', all: true }) as { stopped?: number };
    return typeof res.stopped === 'number' ? res.stopped : 0;
}
