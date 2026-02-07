import { collection, addDoc, updateDoc, deleteDoc, doc, query, orderBy, getDocs, QueryDocumentSnapshot, DocumentData } from 'firebase/firestore';
import { db } from './firebase';

import { Link, LinkStatus } from './types';

const STORAGE_KEY = 'secondbrain_links';

/**
 * Get all links from Firestore (one-time fetch)
 * Note: Use Feed.tsx's onSnapshot for real-time updates
 */
export async function getLinksFromFirestore(uid: string): Promise<Link[]> {
    const linksRef = collection(db, 'users', uid, 'links');
    const q = query(linksRef, orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);

    return snapshot.docs.map((doc: QueryDocumentSnapshot<DocumentData>) => ({
        id: doc.id,
        ...doc.data()
    } as Link));
}

// Keeping getLinks as a placeholder for legacy compatibility if needed
export function getLinks(): Link[] {
    return []; // No longer using localStorage
}

/**
 * Save a new link to Firestore
 */
export async function saveLink(uid: string, linkData: Partial<Link>): Promise<void> {
    const linksRef = collection(db, 'users', uid, 'links');
    await addDoc(linksRef, {
        ...linkData,
        createdAt: new Date().toISOString(),
        status: 'unread'
    });
}

/**
 * Update a link's status in Firestore
 */
export async function updateLinkStatus(uid: string, id: string, status: LinkStatus): Promise<void> {
    const linkRef = doc(db, 'users', uid, 'links', id);
    await updateDoc(linkRef, { status });
}

/**
 * Delete a link from Firestore
 */
export async function deleteLink(uid: string, id: string): Promise<void> {
    const linkRef = doc(db, 'users', uid, 'links', id);
    await deleteDoc(linkRef);
}

/**
 * Search links by title, summary, or tags
 */
export function searchLinks(query: string): Link[] {
    const links = getLinks();
    const lowerQuery = query.toLowerCase();

    return links.filter(link =>
        link.title.toLowerCase().includes(lowerQuery) ||
        link.summary.toLowerCase().includes(lowerQuery) ||
        link.tags.some(tag => tag.toLowerCase().includes(lowerQuery)) ||
        link.category.toLowerCase().includes(lowerQuery)
    );
}

/**
 * Filter links by status
 */
export function filterByStatus(status: LinkStatus): Link[] {
    return getLinks().filter(link => link.status === status);
}

/**
 * Generate a unique ID
 * TODO: Firestore auto-generates IDs
 */
export function generateId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}
