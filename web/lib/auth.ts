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

// ── Web flows (popup, with redirect fallback) ────────────────────────────────

async function signInWithGoogleWeb(): Promise<void> {
    try {
        await signInWithPopup(auth, googleProvider, browserPopupRedirectResolver);
    } catch (err) {
        const code = (err as { code?: string })?.code ?? '';
        if (popupUnsupported(code)) {
            await signInWithRedirect(auth, googleProvider, browserPopupRedirectResolver);
            return;
        }
        throw err;
    }
}

function appleProvider(): OAuthProvider {
    const provider = new OAuthProvider('apple.com');
    provider.addScope('email');
    provider.addScope('name');
    return provider;
}

async function signInWithAppleWeb(): Promise<void> {
    const provider = appleProvider();
    try {
        await signInWithPopup(auth, provider, browserPopupRedirectResolver);
    } catch (err) {
        const code = (err as { code?: string })?.code ?? '';
        if (popupUnsupported(code)) {
            await signInWithRedirect(auth, provider, browserPopupRedirectResolver);
            return;
        }
        throw err;
    }
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
        return provider === 'apple' ? signInWithAppleNative() : signInWithGoogleNative();
    }
    return provider === 'apple' ? signInWithAppleWeb() : signInWithGoogleWeb();
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
        return result?.user ?? null;
    } catch {
        return null;
    }
}

/** Sign the current user out (clears native plugin state too, when present). */
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
