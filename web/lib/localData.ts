'use client';

/**
 * Purge every local copy of the signed-in user's data.
 *
 * Firestore is initialized with `persistentLocalCache()` (lib/firebase.ts), so
 * the SDK keeps an IndexedDB mirror of every document the app has read — the
 * user's ENTIRE library: card titles, summaries, URLs, chats, collections.
 * Neither `signOut()` nor `delete_account` touches that mirror: Firebase Auth
 * sign-out only drops the credential, and account deletion runs server-side.
 * So without this, two things were true:
 *
 *   1. Signing out on a shared/borrowed browser left the whole library
 *      recoverable from IndexedDB by the next person at that profile — the
 *      exact threat the in-app privacy vault (lib/privacyLock.ts) exists for.
 *   2. "Delete my account" wiped the server and left a complete local copy
 *      behind indefinitely.
 *
 * Called from `signOutUser()` (lib/auth.ts), which is the single choke point
 * both the sign-out and the delete-account flows already pass through.
 *
 * Everything here is best-effort and must never throw: a failed purge must
 * still leave the user signed out. The caller reloads the page afterwards,
 * which is REQUIRED — `terminate()` permanently closes this Firestore instance,
 * so nothing may touch `db` again in this document's lifetime.
 */

import { terminate, clearIndexedDbPersistence } from 'firebase/firestore';
import { db } from './firebase';

/**
 * localStorage keys that describe the DEVICE, not the person, and therefore
 * survive a sign-out. Everything else in localStorage is treated as user state
 * and removed — an allowlist, so a key added by a future feature is purged by
 * default instead of being silently forgotten here.
 */
const DEVICE_PREFERENCE_KEYS = new Set([
    'theme',             // ThemeProvider — light/dark/system choice
    'reader-font-size',  // ReadingView — reader text size
]);

/** Drop every localStorage entry that isn't an allowlisted device preference. */
function purgeLocalStorage(): void {
    try {
        const doomed: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && !DEVICE_PREFERENCE_KEYS.has(key)) doomed.push(key);
        }
        for (const key of doomed) {
            try { localStorage.removeItem(key); } catch { /* keep going */ }
        }
    } catch {
        // Private mode / storage disabled — nothing was persisted anyway.
    }
    try {
        sessionStorage.clear();
    } catch {
        // Same.
    }
}

/**
 * Terminate Firestore and delete its IndexedDB cache, then clear local/session
 * storage. Resolves even when a step fails.
 *
 * AFTER THIS RESOLVES THE FIRESTORE INSTANCE IS DEAD — the caller must reload
 * the page rather than continue rendering.
 */
export async function purgeLocalUserData(): Promise<void> {
    try {
        // clearIndexedDbPersistence() requires a stopped instance; terminate()
        // is the documented way to get there. It rejects if another tab still
        // holds the database, which is why the failure is swallowed — a
        // best-effort purge beats a sign-out that throws.
        await terminate(db);
        await clearIndexedDbPersistence(db);
    } catch {
        // Another tab holds the cache, or the browser denied the delete. The
        // storage purge below still runs.
    }
    purgeLocalStorage();
}
