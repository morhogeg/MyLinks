'use client';

// Auth helpers — Google + Sign in with Apple, on both the web and the native
// iOS shell.
//
// firebase.ts initializes `auth` WITHOUT a popup/redirect resolver on purpose:
// the default resolver eagerly loads Google's gapi iframe, which throws under
// Capacitor's capacitor:// WKWebView origin and aborts native startup. So:
//   - WEB sign-in passes `browserPopupRedirectResolver` EXPLICITLY (popup, with
//     a redirect fallback).
//   - NATIVE sign-in never uses popup/redirect: it drives the native
//     @capacitor-firebase/authentication plugin to obtain an OAuth credential,
//     then bridges that into this same JS SDK via signInWithCredential — so
//     `auth.currentUser`, getIdToken(), and onAuthStateChanged work identically
//     on both platforms afterwards.
//
// The native plugin is configured with skipNativeAuth (capacitor.config.ts) so
// it only returns credentials and does not maintain a separate native Firebase
// session; the JS SDK remains the single source of truth.

import {
    GoogleAuthProvider,
    OAuthProvider,
    signInWithPopup,
    signInWithRedirect,
    getRedirectResult,
    signInWithCredential,
    browserPopupRedirectResolver,
    signOut,
    onAuthStateChanged,
    type User,
} from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { isNativeApp } from '@/lib/api';
import { markSignIn } from '@/lib/analytics';

export type AuthProviderId = 'google' | 'apple';

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

/** Popup error codes that mean "fall back to a full-page redirect". */
function popupUnsupported(code: string): boolean {
    return (
        code === 'auth/popup-blocked' ||
        code === 'auth/popup-closed-by-user' ||
        code === 'auth/cancelled-popup-request' ||
        code === 'auth/operation-not-supported-in-this-environment'
    );
}

/** Thrown when the popup was blocked AND the redirect fallback cannot work
    here — the caller should tell the user to allow pop-ups. */
export class PopupBlockedError extends Error {
    constructor() { super('Sign-in pop-up was blocked'); this.name = 'PopupBlockedError'; }
}

/**
 * Whether a full-page `signInWithRedirect` can actually complete on this page.
 * Since Safari 16.1 (and progressively other browsers), the redirect flow
 * silently fails when `authDomain` is a different site from the page: the
 * browser partitions the storage the auth handler uses to hand the result
 * back, so the user picks an account, returns, and getRedirectResult() finds
 * nothing. Redirect is only trustworthy when the auth handler is same-site
 * with the app (post item-24 authDomain cutover).
 */
function redirectCanWork(): boolean {
    if (typeof window === 'undefined') return false;
    const authDomain = auth.config.authDomain ?? '';
    const host = window.location.hostname;
    return host === authDomain || host.endsWith(`.${authDomain}`);
}

async function popupWithFallback(
    provider: GoogleAuthProvider | OAuthProvider,
): Promise<void> {
    try {
        await signInWithPopup(auth, provider, browserPopupRedirectResolver);
    } catch (err) {
        const code = (err as { code?: string })?.code ?? '';
        if (!popupUnsupported(code)) throw err;
        if (redirectCanWork()) {
            await signInWithRedirect(auth, provider, browserPopupRedirectResolver);
            return;
        }
        // Redirect would boomerang back signed-out — don't send the user on
        // that trip. If the browser blocked the window, say so; a popup the
        // user closed themselves keeps the generic error.
        if (code === 'auth/popup-blocked') throw new PopupBlockedError();
        throw err;
    }
}

// ── Web flows (popup, with redirect fallback) ────────────────────────────────

async function signInWithGoogleWeb(): Promise<void> {
    await popupWithFallback(googleProvider);
}

function appleProvider(): OAuthProvider {
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    return provider;
}

async function signInWithAppleWeb(): Promise<void> {
    await popupWithFallback(appleProvider());
}

// ── Native flows (Capacitor plugin → JS SDK credential bridge) ────────────────

async function signInWithGoogleNative(): Promise<void> {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
    const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
    const idToken = result.credential?.idToken;
    if (!idToken) throw new Error('Google sign-in returned no idToken');
    const credential = GoogleAuthProvider.credential(idToken);
    await signInWithCredential(auth, credential);
}

async function signInWithAppleNative(): Promise<void> {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
    // The plugin generates the nonce and returns the rawNonce; Apple's idToken
    // is bound to sha256(rawNonce), so we must hand the SAME rawNonce to Firebase.
    const result = await FirebaseAuthentication.signInWithApple({ skipNativeAuth: true });
    const idToken = result.credential?.idToken;
    const rawNonce = result.credential?.nonce;
    if (!idToken) throw new Error('Apple sign-in returned no idToken');
    const credential = appleProvider().credential({ idToken, rawNonce });
    await signInWithCredential(auth, credential);
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Start a sign-in with the given provider, picking the web or native flow. */
export async function signIn(provider: AuthProviderId): Promise<void> {
    if (isNativeApp()) {
        await (provider === 'apple' ? signInWithAppleNative() : signInWithGoogleNative());
    } else {
        await (provider === 'apple' ? signInWithAppleWeb() : signInWithGoogleWeb());
    }
    // A deliberate sign-in just completed via the popup or native credential
    // flow. AuthProvider emits the `sign_in` analytics event once the workspace
    // uid resolves (track() needs the data uid, unknown at this instant). For
    // the web redirect fallback the page navigates away before this line, so
    // completeRedirectSignIn() marks that case on return instead.
    markSignIn(provider);
}

/** Back-compat named helpers. */
export function signInWithGoogle(): Promise<void> { return signIn('google'); }
export function signInWithApple(): Promise<void> { return signIn('apple'); }

/**
 * Complete a redirect-based sign-in if one is pending (web only). No-op for the
 * popup/native flows or a normal load. Must not run under Capacitor — the
 * redirect resolver would try to load gapi in the WKWebView.
 */
export async function completeRedirectSignIn(): Promise<User | null> {
    if (isNativeApp()) return null;
    try {
        const result = await getRedirectResult(auth, browserPopupRedirectResolver);
        if (result?.user) {
            // Mark the redirect-based sign-in so AuthProvider emits `sign_in`
            // once the workspace uid resolves.
            markSignIn(result.providerId === 'apple.com' ? 'apple' : 'google');
        }
        return result?.user ?? null;
    } catch {
        return null;
    }
}

/**
 * Sign the current user out (clears native plugin state too, when present) and
 * destroy every local copy of their data.
 *
 * The purge is not optional housekeeping: Firestore's `persistentLocalCache`
 * keeps an IndexedDB mirror of the whole library that neither Firebase sign-out
 * nor server-side account deletion touches, so without it a sign-out on a
 * shared browser — and every "Delete my account" — left the full library
 * readable on the device (see lib/localData.ts).
 *
 * Terminating Firestore makes `db` permanently unusable in this document, so
 * the page is reloaded straight after. That lands on the LoginScreen, which is
 * where both callers were headed anyway.
 */
export async function signOutUser(): Promise<void> {
    if (isNativeApp()) {
        try {
            const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
            await FirebaseAuthentication.signOut();
        } catch {
            // Plugin missing/failed — still sign out of the JS SDK below.
        }
    }
    await signOut(auth);

    const { purgeLocalUserData } = await import('@/lib/localData');
    await purgeLocalUserData();
    if (typeof window !== 'undefined') window.location.reload();
}

/** Subscribe to auth state; returns the unsubscribe function. */
export function onAuthChange(cb: (user: User | null) => void): () => void {
    return onAuthStateChanged(auth, cb);
}

/**
 * Fresh Firebase ID token for the signed-in user, or null. Sent as
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

/** Authorization header carrying the ID token (empty object when signed out). */
export async function authHeaders(): Promise<Record<string, string>> {
    const token = await getIdToken();
    return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * Permanently delete the signed-in user's account and all their data, then sign
 * out locally. Both paths verify the ID token server-side, delete the Firestore
 * workspace + storage, then the Auth user.
 *
 * Native uses the HTTP twin (`/api/delete-account` → delete_account_http) with
 * an Authorization: Bearer token, NOT the Firebase callable: the callable
 * transport's CORS preflight is rejected from the Capacitor `capacitor://localhost`
 * WebView origin (same reason claim_workspace has an HTTP twin). Web keeps the
 * callable. Same underlying server logic, so behavior matches.
 */
export async function deleteAccount(): Promise<void> {
    if (isNativeApp()) {
        const { apiUrl, fetchWithTimeout } = await import('@/lib/api');
        const res = await fetchWithTimeout(apiUrl('/api/delete-account'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
            body: '{}',
        });
        if (!res.ok) throw new Error(`delete-account HTTP ${res.status}`);
    } else {
        const { httpsCallable } = await import('firebase/functions');
        const { functions } = await import('@/lib/firebase');
        const callable = httpsCallable(functions, 'delete_account');
        await callable({});
    }
    await signOutUser();
}
