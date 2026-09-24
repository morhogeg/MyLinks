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
    fetchSignInMethodsForEmail,
    linkWithPopup,
    linkWithCredential,
    reauthenticateWithPopup,
    reauthenticateWithCredential,
    revokeAccessToken,
    updateProfile,
    type AuthCredential,
    type User,
    type UserCredential,
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
    const { credential, fullName } = await nativeCredential('apple');
    const cred = await signInWithCredential(auth, credential);
    await saveAppleName(cred, fullName);
}

/**
 * Run the native plugin's sign-in UI for `provider` and turn the result into a
 * JS-SDK credential (no native Firebase session: skipNativeAuth). Shared by
 * sign-in, re-authentication and provider linking.
 */
async function nativeCredential(
    provider: AuthProviderId,
): Promise<{ credential: AuthCredential; fullName: string | null }> {
    const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
    if (provider === 'google') {
        const result = await FirebaseAuthentication.signInWithGoogle({ skipNativeAuth: true });
        const idToken = result.credential?.idToken;
        if (!idToken) throw new Error('Google sign-in returned no idToken');
        return { credential: GoogleAuthProvider.credential(idToken), fullName: null };
    }
    // The plugin generates the nonce and returns the rawNonce; Apple's idToken
    // is bound to sha256(rawNonce), so we must hand the SAME rawNonce to Firebase.
    const result = await FirebaseAuthentication.signInWithApple({ skipNativeAuth: true });
    const idToken = result.credential?.idToken;
    const rawNonce = result.credential?.nonce;
    if (!idToken) throw new Error('Apple sign-in returned no idToken');
    // Apple hands over the user's name ONCE, on the very first authorization,
    // and never puts it in the ID token. With skipNativeAuth the plugin still
    // returns it as `user.displayName` ("Given Family"; see the plugin's
    // AppleAuthProviderHandler), so this is the only chance to keep it.
    const fullName = result.user?.displayName?.trim() || null;
    return { credential: appleProvider().credential({ idToken, rawNonce }), fullName };
}

/** Browser event AuthProvider listens for to re-read the profile after
    updateProfile (onAuthStateChanged does not fire for profile edits). */
export const PROFILE_UPDATED_EVENT = 'machina:profile-updated';

/** First Apple sign-in on native: persist the name Apple shared, if the
    Firebase user has none yet. Best-effort — a name is never worth a failed
    sign-in. */
async function saveAppleName(cred: UserCredential, fullName: string | null): Promise<void> {
    if (!fullName || cred.user.displayName) return;
    try {
        await updateProfile(cred.user, { displayName: fullName });
        if (typeof window !== 'undefined') window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
    } catch {
        // Keep the account usable without a name.
    }
}

// ── Public API ───────────────────────────────────────────────────────────────

const PROVIDER_NAME: Record<AuthProviderId, string> = { google: 'Google', apple: 'Apple' };
const PROVIDER_ID: Record<AuthProviderId, string> = { google: 'google.com', apple: 'apple.com' };

/**
 * The email already has a Machina account under the OTHER provider (Firebase's
 * one-account-per-email setting refused to create a second one). `existing` is
 * the provider the user originally signed up with.
 */
export class DifferentProviderError extends Error {
    constructor(public existing: AuthProviderId) {
        super(`You signed up with ${PROVIDER_NAME[existing]}. Use that button.`);
        this.name = 'DifferentProviderError';
    }
}

/** Which provider already owns the email in an
    `auth/account-exists-with-different-credential` error. */
async function existingProviderFor(err: unknown, attempted: AuthProviderId): Promise<AuthProviderId> {
    const other: AuthProviderId = attempted === 'apple' ? 'google' : 'apple';
    const email = (err as { customData?: { email?: string } })?.customData?.email;
    if (email) {
        try {
            // Returns [] when email-enumeration protection is on (the default
            // for projects created since 2023) — then the only other provider
            // the app offers is the answer anyway.
            const methods = await fetchSignInMethodsForEmail(auth, email);
            if (methods.includes('apple.com') && attempted !== 'apple') return 'apple';
            if (methods.includes('google.com') && attempted !== 'google') return 'google';
        } catch {
            // Fall through to the generic hint.
        }
    }
    return other;
}

function errCode(err: unknown): string {
    return (err as { code?: string })?.code ?? '';
}

/** Start a sign-in with the given provider, picking the web or native flow. */
export async function signIn(provider: AuthProviderId): Promise<void> {
    try {
        if (isNativeApp()) {
            await (provider === 'apple' ? signInWithAppleNative() : signInWithGoogleNative());
        } else {
            await (provider === 'apple' ? signInWithAppleWeb() : signInWithGoogleWeb());
        }
    } catch (err) {
        if (errCode(err) === 'auth/account-exists-with-different-credential') {
            throw new DifferentProviderError(await existingProviderFor(err, provider));
        }
        throw err;
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
        // The Share Extension's credential lives in the App Group, outside
        // everything else this function purges — drop it first so the share
        // sheet cannot keep posting into the departing account's library.
        try {
            const { clearNativeShareConfig, clearNativeWebsiteData } = await import('@/lib/shareConfig');
            await clearNativeShareConfig();
            // The WebView's own HTTP cache holds every screenshot and thumbnail
            // the feed showed; JS cannot reach it, the native side can.
            await clearNativeWebsiteData();
        } catch {
            // Never let the bridge block a sign-out.
        }
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

// ── Linked sign-in methods ──────────────────────────────────────────────────
//
// Linking attaches a second provider to the SAME Firebase user, so its uid —
// the value stored in the workspace's `authUids[]` and used as the RevenueCat
// app user id — does not change. After linking, "Continue with Apple" and
// "Continue with Google" both open the same library.

/** Providers linked to the signed-in Firebase user. */
export function linkedProviders(user: User | null = auth.currentUser): AuthProviderId[] {
    const ids = user?.providerData.map((p) => p.providerId) ?? [];
    return (['apple', 'google'] as AuthProviderId[]).filter((p) => ids.includes(PROVIDER_ID[p]));
}

/** A link attempt failed for a reason the user should read verbatim. */
export class LinkProviderError extends Error {
    constructor(message: string) { super(message); this.name = 'LinkProviderError'; }
}

/** Link `provider` to the signed-in account (popup on web, native sheet on iOS). */
export async function linkProvider(provider: AuthProviderId): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new LinkProviderError('Sign in first.');
    const name = PROVIDER_NAME[provider];
    try {
        if (isNativeApp()) {
            const { credential } = await nativeCredential(provider);
            await linkWithCredential(user, credential);
        } else {
            await linkWithPopup(
                user,
                provider === 'apple' ? appleProvider() : googleProvider,
                browserPopupRedirectResolver,
            );
        }
    } catch (err) {
        const code = errCode(err);
        if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use'
            || code === 'auth/account-exists-with-different-credential') {
            // That Apple/Google identity is already its own Firebase user, with
            // its own library. Linking would orphan one of them; merging two
            // libraries is not supported yet.
            throw new LinkProviderError(
                `That ${name} account already has its own Machina library. Merging libraries isn't supported yet.`,
            );
        }
        if (code === 'auth/provider-already-linked') {
            throw new LinkProviderError(`${name} is already linked to this account.`);
        }
        if (code === 'auth/popup-blocked') {
            throw new LinkProviderError('Your browser blocked the sign-in window. Allow pop-ups for this site, then try again.');
        }
        if (isCancel(err)) throw new LinkProviderError('');
        throw new LinkProviderError(`Couldn't link ${name}. Please try again.`);
    }
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(PROFILE_UPDATED_EVENT));
}

/** The user backed out of a sign-in sheet/popup (not a failure to report). */
function isCancel(err: unknown): boolean {
    const code = errCode(err);
    if (code === 'auth/popup-closed-by-user' || code === 'auth/cancelled-popup-request') return true;
    // The Capacitor plugin surfaces ASAuthorizationError.canceled (1001) and
    // Google's cancel as plain messages.
    const msg = String((err as { message?: string })?.message ?? '').toLowerCase();
    return msg.includes('cancel') || msg.includes('1001');
}

// ── Re-authentication ────────────────────────────────────────────────────────

/** Which provider to re-authenticate with: the one that signed this session
    in, else the first linked one. Resolve it BEFORE the user taps (and pass
    it to reauthenticate) so the web popup opens inside the tap's gesture. */
export async function sessionProvider(user: User | null = auth.currentUser): Promise<AuthProviderId | null> {
    if (!user) return null;
    try {
        const p = (await user.getIdTokenResult()).signInProvider;
        if (p === 'apple.com') return 'apple';
        if (p === 'google.com') return 'google';
    } catch { /* fall back to providerData */ }
    return linkedProviders(user)[0] ?? null;
}

/** Thrown by reauthenticate(); `cancelled` means the user closed the sheet. */
export class ReauthError extends Error {
    constructor(message: string, public cancelled = false) { super(message); this.name = 'ReauthError'; }
}

/** How recent `auth_time` must be for a re-auth to count as "just now". */
const FRESH_AUTH_MS = 5 * 60 * 1000;

/**
 * Prove it's still the account owner: a fresh sign-in with the user's own
 * provider, bound to the CURRENT Firebase user (a different Google/Apple
 * account fails with auth/user-mismatch). Resolves only once the refreshed ID
 * token's auth_time is within the last few minutes.
 */
export async function reauthenticate(known?: AuthProviderId | null): Promise<void> {
    const user = auth.currentUser;
    if (!user) throw new ReauthError('Sign in first.');
    const provider = known ?? await sessionProvider(user);
    if (!provider) throw new ReauthError('This account has no Apple or Google sign-in to confirm with.');
    try {
        if (isNativeApp()) {
            const { credential } = await nativeCredential(provider);
            await reauthenticateWithCredential(user, credential);
        } else {
            await reauthenticateWithPopup(
                user,
                provider === 'apple' ? appleProvider() : googleProvider,
                browserPopupRedirectResolver,
            );
        }
    } catch (err) {
        if (isCancel(err)) throw new ReauthError('', true);
        if (errCode(err) === 'auth/user-mismatch') {
            throw new ReauthError(`That's a different ${PROVIDER_NAME[provider]} account. Use the one you signed in with.`);
        }
        if (errCode(err) === 'auth/popup-blocked') {
            throw new ReauthError('Your browser blocked the sign-in window. Allow pop-ups for this site, then try again.');
        }
        throw new ReauthError(`Couldn't confirm with ${PROVIDER_NAME[provider]}. Please try again.`);
    }
    const fresh = await user.getIdTokenResult(true);
    const authTime = Date.parse(fresh.authTime);
    if (!Number.isFinite(authTime) || Date.now() - authTime > FRESH_AUTH_MS) {
        throw new ReauthError('Sign-in was not recent enough. Please try again.');
    }
}

// ── Sign in with Apple token revocation (App Review 5.1.1(v)) ────────────────

/** Thrown when the user cancels the Apple confirmation that deletion needs. */
export class AppleConfirmCancelled extends Error {
    constructor() { super('Apple confirmation cancelled'); this.name = 'AppleConfirmCancelled'; }
}

/**
 * For an account with Sign in with Apple linked, revoke the app's Apple tokens
 * before the account is deleted (Apple requires it since June 2022). Apple only
 * accepts a revocation backed by a fresh authorization, so this runs one more
 * Apple sign-in:
 *   - web:    reauthenticateWithPopup → the Apple OAuth access token →
 *             revokeAccessToken (Firebase JS ≥ 9.x).
 *   - native: the plugin's native Apple sign-in (skipNativeAuth: false, so the
 *             native Firebase SDK holds a user) → its authorizationCode → the
 *             plugin's revokeAccessToken, which on iOS calls
 *             Auth.revokeToken(withAuthorizationCode:). The JS SDK's
 *             revokeAccessToken only accepts ACCESS tokens, and a native
 *             sign-in yields an authorization CODE, hence the native route.
 * A user cancelling the Apple sheet aborts the deletion (AppleConfirmCancelled).
 * Any other failure is reported and the deletion proceeds: a revocation
 * problem must never trap someone in an account they asked to delete.
 * Firebase's Apple provider must carry the OAuth code-flow config (Services ID,
 * Team ID, Key ID, private key) for revocation to succeed server-side.
 */
async function revokeAppleIfLinked(): Promise<void> {
    const user = auth.currentUser;
    if (!user || !linkedProviders(user).includes('apple')) return;
    const report = async (e: unknown) => {
        try {
            const { reportError } = await import('@/lib/errorReporter');
            reportError(e, 'apple-token-revoke');
        } catch { /* never block deletion */ }
    };
    if (isNativeApp()) {
        const { FirebaseAuthentication } = await import('@capacitor-firebase/authentication');
        let code: string | undefined;
        try {
            const result = await FirebaseAuthentication.signInWithApple({ skipNativeAuth: false });
            code = result.credential?.authorizationCode;
        } catch (e) {
            if (isCancel(e)) throw new AppleConfirmCancelled();
            await report(e);
            return;
        }
        try {
            if (!code) throw new Error('Apple sign-in returned no authorizationCode');
            await FirebaseAuthentication.revokeAccessToken({ token: code });
        } catch (e) {
            await report(e);
        } finally {
            // Drop the transient native session; the JS SDK stays the source
            // of truth (and signs out after deletion anyway).
            await FirebaseAuthentication.signOut().catch(() => {});
        }
        return;
    }
    let accessToken: string | undefined;
    try {
        const result = await reauthenticateWithPopup(user, appleProvider(), browserPopupRedirectResolver);
        accessToken = OAuthProvider.credentialFromResult(result)?.accessToken;
    } catch (e) {
        if (isCancel(e)) throw new AppleConfirmCancelled();
        await report(e);
        return;
    }
    try {
        if (!accessToken) throw new Error('Apple re-auth returned no access token');
        await revokeAccessToken(auth, accessToken);
    } catch (e) {
        await report(e);
    }
}

/**
 * Permanently delete the signed-in user's account and all their data, then sign
 * out locally. Both paths verify the ID token server-side, delete the Firestore
 * workspace + storage, then the Auth user. Sign in with Apple accounts first
 * revoke their Apple tokens (revokeAppleIfLinked).
 *
 * Native uses the HTTP twin (`/api/delete-account` → delete_account_http) with
 * an Authorization: Bearer token, NOT the Firebase callable: the callable
 * transport's CORS preflight is rejected from the Capacitor `capacitor://localhost`
 * WebView origin (same reason claim_workspace has an HTTP twin). Web keeps the
 * callable. Same underlying server logic, so behavior matches.
 */
export async function deleteAccount(): Promise<void> {
    // FIRST await on the click path: the web popup must open inside the
    // user gesture or the browser blocks it.
    await revokeAppleIfLinked();
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
