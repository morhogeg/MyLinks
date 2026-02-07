// localStorage wrapper for link persistence
// TODO: Replace with Firestore SDK when ready for production
// Example Firestore replacement:
//   import { collection, addDoc, updateDoc, deleteDoc, onSnapshot } from 'firebase/firestore';
//   import { db } from './firebase';

import { Link, LinkStatus } from './types';

const STORAGE_KEY = 'secondbrain_links';

/**
 * Get all links from localStorage
 * TODO: Replace with Firestore onSnapshot listener for real-time updates
 */
export function getLinks(): Link[] {
    if (typeof window === 'undefined') return [];

    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    try {
        return JSON.parse(stored) as Link[];
    } catch {
        console.error('Failed to parse stored links');
        return [];
    }
}

/**
 * Save a new link
 * TODO: Replace with Firestore addDoc
 * Example: await addDoc(collection(db, 'users', uid, 'links'), linkData);
 */
export function saveLink(link: Link): void {
    const links = getLinks();
    links.unshift(link); // Add to beginning (newest first)
    localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
}

/**
 * Update a link's status (archive, favorite, unread)
 * TODO: Replace with Firestore updateDoc
 */
export function updateLinkStatus(id: string, status: LinkStatus): void {
    const links = getLinks();
    const index = links.findIndex(l => l.id === id);

    if (index !== -1) {
        links[index].status = status;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(links));
    }
}

/**
 * Delete a link
 * TODO: Replace with Firestore deleteDoc
 */
export function deleteLink(id: string): void {
    const links = getLinks();
    const filtered = links.filter(l => l.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filtered));
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
