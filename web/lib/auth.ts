'use client';

// Google Sign-In helpers (web only).
//
// firebase.ts initializes `auth` WITHOUT a popup/redirect resolver on purpose:
// the default resolver eagerly loads Google's gapi iframe, which throws under
// Capacitor's capacitor:// WKWebView origin and aborts native startup. So every
// sign-in entry point here passes `browserPopupRedirectResolver` EXPLICITLY, and
// callers must only invoke these on the web — never inside the native shell.
// Native Google Sign-In is Phase 2 (a native plugin); see AUTH_SPEC.md.

import {
    GoogleAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    browserPopupRedirectResolver,
    signOut,
    onAuthStateChanged,
    type User,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';

const provider = new GoogleAuthProvider();
provider.setCustomParameters({ prompt: 'select_account' });

/**
 * Start a Google sign-in. Tries a popup first (best desktop UX); if the popup is
 * blocked or unsupported (notably standalone iOS PWAs), falls back to a full-page
 * redirect — completeRedirectSignIn() finishes that on the next load.
 */
export async function signInWithGoogle(): Promise<void> {
    try {
        await signInWithPopup(auth, provider, browserPopupRedirectResolver);
    } catch (err) {
        const code = (err as { code?: string })?.code ?? '';
        const popupUnsupported =
            code === 'auth/popup-blocked' ||
            code === 'auth/popup-closed-by-user' ||
            code === 'auth/cancelled-popup-request' ||
            code === 'auth/operation-not-supported-in-this-environment';
        if (popupUnsupported) {
            // Redirect leaves the page; resolves on the next load.
            await signInWithRedirect(auth, provider, browserPopupRedirectResolver);
            return;
        }
        throw err;
    }
}

/**
 * Complete a redirect-based sign-in if one is pending. No-op (returns null) for
 * the popup flow or a normal load. Safe to call once on web startup.
 */
export async function completeRedirectSignIn(): Promise<User | null> {
    try {
        const result = await getRedirectResult(auth, browserPopupRedirectResolver);
        return result?.user ?? null;
    } catch {
        // No pending redirect, or it failed — treat as signed-out.
        return null;
    }
}

/** Sign the current user out. */
export function signOutUser(): Promise<void> {
    return signOut(auth);
}

/** Subscribe to auth state; returns the unsubscribe function. */
export function onAuthChange(cb: (user: User | null) => void): () => void {
    return onAuthStateChanged(auth, cb);
}

/**
 * Fresh Firebase ID token for the signed-in user, or null. Phase 2 sends this as
 * `Authorization: Bearer <token>` so the Cloud Functions can verify the caller
 * instead of trusting a client-supplied uid.
 */
export async function getIdToken(): Promise<string | null> {
    const user = auth.currentUser;
    if (!user) return null;
    try {
        return await user.getIdToken();
    } catch {
        return null;
    }
}
