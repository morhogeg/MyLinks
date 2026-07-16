import {
    collection,
    addDoc,
    updateDoc,
    deleteDoc,
    doc,
    query,
    orderBy,
    limit,
    getDocs,
    onSnapshot,
    QueryDocumentSnapshot,
    DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import { ChatMessage, ChatSession } from './types';

/**
 * CRUD for the Ask-your-brain chat history (users/{uid}/chats/{chatId}).
 *
 * Conversations are stored as a single doc with a `messages` array — they're
 * small, so this avoids a per-message subcollection and N reads. Mirrors the
 * style of lib/storage.ts and the onSnapshot pattern Feed.tsx uses for links.
 */

const chatsCol = (uid: string) => collection(db, 'users', uid, 'chats');

/** Firestore rejects `undefined`; drop those keys before any write. */
function clean<T extends Record<string, unknown>>(obj: T): T {
    return Object.entries(obj).reduce((acc, [k, v]) => {
        if (v !== undefined) acc[k] = v;
        return acc;
    }, {} as Record<string, unknown>) as T;
}

/** Strip per-message `undefined` (e.g. missing sources/error) so docs are clean. */
function sanitizeMessages(messages: ChatMessage[]): ChatMessage[] {
    return messages.map(m => clean({ ...m }) as ChatMessage);
}

const DEFAULT_TITLE = 'New chat';

/** A short, human title from the first user message (fallback: "New chat"). */
export function deriveTitle(messages: ChatMessage[]): string {
    const first = messages.find(m => m.role === 'user')?.content.trim();
    if (!first) return DEFAULT_TITLE;
    const oneLine = first.replace(/\s+/g, ' ');
    return oneLine.length > 50 ? `${oneLine.slice(0, 50).trimEnd()}…` : oneLine;
}

export const DEFAULT_CHAT_TITLE = DEFAULT_TITLE;

function toSession(d: QueryDocumentSnapshot<DocumentData>): ChatSession {
    const data = d.data();
    return {
        id: d.id,
        title: data.title || DEFAULT_TITLE,
        messages: (data.messages as ChatMessage[]) || [],
        createdAt: data.createdAt || 0,
        updatedAt: data.updatedAt || data.createdAt || 0,
    };
}

// Bound both reads to the 100 most-recently-updated conversations (report
// 3.15) — the sidebar shows recent chats, so an unbounded read doesn't scale.
const CHATS_LIMIT = 100;

/** One-time fetch of the most-recently-updated chats. */
export async function listChats(uid: string): Promise<ChatSession[]> {
    const q = query(chatsCol(uid), orderBy('updatedAt', 'desc'), limit(CHATS_LIMIT));
    const snap = await getDocs(q);
    return snap.docs.map(toSession);
}

/** Live subscription so the sidebar updates across devices. Returns unsubscribe. */
export function subscribeChats(uid: string, cb: (chats: ChatSession[]) => void): () => void {
    const q = query(chatsCol(uid), orderBy('updatedAt', 'desc'), limit(CHATS_LIMIT));
    return onSnapshot(q, snap => cb(snap.docs.map(toSession)));
}

/** Create a new saved conversation; returns its Firestore id. */
export async function createChat(uid: string, messages: ChatMessage[], title?: string): Promise<string> {
    const now = Date.now();
    const ref = await addDoc(chatsCol(uid), {
        title: title || deriveTitle(messages),
        messages: sanitizeMessages(messages),
        createdAt: now,
        updatedAt: now,
    });
    return ref.id;
}

/** Patch an existing conversation. Always bumps `updatedAt` unless caller overrides. */
export async function updateChat(
    uid: string,
    chatId: string,
    patch: { messages?: ChatMessage[]; title?: string; updatedAt?: number },
): Promise<void> {
    const updates = clean({
        title: patch.title,
        messages: patch.messages ? sanitizeMessages(patch.messages) : undefined,
        updatedAt: patch.updatedAt ?? Date.now(),
    });
    await updateDoc(doc(db, 'users', uid, 'chats', chatId), updates);
}

/** Permanently remove a saved conversation. */
export async function deleteChat(uid: string, chatId: string): Promise<void> {
    await deleteDoc(doc(db, 'users', uid, 'chats', chatId));
}
