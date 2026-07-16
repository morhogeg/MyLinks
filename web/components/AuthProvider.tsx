'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import {
    collection, query, getDocs, limit, where, doc, getDoc, updateDoc, arrayUnion,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { isNativeApp, REQUIRE_AUTH, apiUrl, fetchWithTimeout } from '@/lib/api';
import {
    onAuthChange, completeRedirectSignIn, signIn, signOutUser, authHeaders,
} from '@/lib/auth';
import { syncShareConfigToNative } from '@/lib/shareConfig';
import { readLocalAiConsent, writeLocalAiConsent } from '@/lib/aiConsent';
import { setAnalyticsUid, flushSignIn, trackAppOpen, track } from '@/lib/analytics';
import { installErrorReporter, reportError, flushBufferedReports } from '@/lib/errorReporter';
import {
    initPushListeners, refreshPushRegistration, unregisterPush,
    readLocalPushPrompt, writeLocalPushPrompt,
} from '@/lib/push';
import LoginScreen from '@/components/LoginScreen';
import Onboarding from '@/components/Onboarding';
import AIConsentNotice from '@/components/AIConsentNotice';

/** localStorage fallback for onboarding dismissal (user doc is the primary
    record — this only covers a failed `onboarded: true` write). */
const WELCOME_DISMISSED_KEY = 'machina_welcome_done';

function welcomeDismissedLocally(docId: string): boolean {
    try {
        return localStorage.getItem(`${WELCOME_DISMISSED_KEY}:${docId}`) === '1';
    } catch {
        // Private mode — rely on the user-doc record (`onboarded`) alone.
        return false;
    }
}

interface AuthContextType {
    /** Firestore user document ID (the data key — a phone number today). */
    uid: string | null;
    /** Firebase Auth uid of the signed-in Google account (web), if any. */
    authUid: string | null;
    /** Signed-in Google account email (web), if any. */
    email: string | null;
    /** Signed-in Google account display name (web), if any. */
    displayName: string | null;
    /** Signed-in Google account photo URL (web), if any. */
    photoURL: string | null;
    /** True while auth state + the data doc are being resolved. */
    loading: boolean;
    /** Sign the current user out (web). */
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    uid: null,
    authUid: null,
    email: null,
    displayName: null,
    photoURL: null,
    loading: true,
    signOut: async () => {},
});

export function useAuth() {
    return useContext(AuthContext);
}

/**
 * Best-effort, fire-and-forget side effects once the data doc is known: hand the
 * iOS Share Extension its endpoint/token, and persist the browser timezone.
 */
function attachUserDoc(docId: string, data: Record<string, unknown> | undefined) {
    // Pass the doc's ingestToken so the bridge needs NO backend call at all
    // (the callable is only a fallback for a token-less first launch).
    const docToken = typeof data?.ingestToken === 'string' ? data.ingestToken : undefined;
    syncShareConfigToNative(docId, docToken);
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz && data?.timezone !== tz) {
            updateDoc(doc(db, 'users', docId), { timezone: tz })
                .catch((e) => reportError(e, 'auth-timezone-update'));
        }
    } catch {
        // Intl not available — skip.
    }
}

/**
 * Auth-aware provider (two-mode, for the staged rollout).
 *
 * REQUIRE_AUTH ON: both web and native require real sign-in (Google or Apple);
 * signed-in resolves the data doc (linked via `authUids`, claimed server-side).
 * Native uses the Capacitor auth plugin bridged into the Firebase JS SDK
 * (lib/auth.ts). REQUIRE_AUTH OFF (default, pre-cutover): web keeps its Google
 * sign-in gate; native loads the owner workspace with no gate (legacy). Flip
 * NEXT_PUBLIC_REQUIRE_AUTH at cutover — see AUTH_SPEC.md / NATIVE_AUTH_SETUP.md.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
    const [uid, setUid] = useState<string | null>(null);
    const [authUid, setAuthUid] = useState<string | null>(null);
    const [email, setEmail] = useState<string | null>(null);
    const [displayName, setDisplayName] = useState<string | null>(null);
    const [photoURL, setPhotoURL] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    // Signed in, but no workspace could be resolved or created (edge case —
    // post-cutover this only happens when workspace creation failed).
    const [restricted, setRestricted] = useState(false);
    // Fresh workspace → show the one-screen welcome before the app.
    const [needsOnboarding, setNeedsOnboarding] = useState(false);
    // Bumped by "Try again" on the restricted screen to re-run resolution.
    const [retryNonce, setRetryNonce] = useState(0);
    // AI-consent gate (App Review 5.1.1/5.1.2): null until the local record is
    // read on mount (keeps SSR/first paint consistent), then true/false. Both
    // signals count — localStorage `ai-consent-v1` OR `aiConsentAt` on the
    // user doc (checked when the doc resolves, so a reinstall doesn't re-ask).
    const [aiConsented, setAiConsented] = useState<boolean | null>(null);

    const native = typeof window !== 'undefined' && isNativeApp();

    useEffect(() => {
        setAiConsented(readLocalAiConsent() !== null);
        // Install the global JS error handlers once, as early as possible.
        installErrorReporter();
    }, []);

    // Keep the analytics/error-reporter workspace uid in sync with the resolved
    // data doc. When a workspace is active, emit the once-per-session `sign_in`
    // (if a deliberate sign-in is pending) and the once-per-day `app_open`
    // heartbeat that powers D1/D7 retention.
    useEffect(() => {
        setAnalyticsUid(uid);
        if (uid) {
            flushSignIn();
            trackAppOpen();
            // A workspace is now resolved — drain any errors captured while
            // signed out (the sign-in window where failures otherwise vanish).
            flushBufferedReports();
        }
    }, [uid]);

    // Reconcile the two consent records once the data doc is known: a doc
    // timestamp wins (cache it locally); otherwise mirror a local acceptance
    // up to the doc so it survives reinstalls.
    const reconcileAiConsent = useCallback(
        (docId: string, data: Record<string, unknown> | undefined) => {
            const docTs = typeof data?.aiConsentAt === 'number' ? data.aiConsentAt : null;
            if (docTs) {
                setAiConsented(true);
                writeLocalAiConsent(docTs);
                return;
            }
            const localTs = readLocalAiConsent();
            if (localTs !== null) {
                updateDoc(doc(db, 'users', docId), { aiConsentAt: localTs })
                    .catch((e) => reportError(e, 'auth-ai-consent-reconcile'));
            }
        },
        [],
    );

    // Same dual-persistence reconcile for the first-run notifications nudge
    // (push-prompt-v1 ↔ pushPromptedAt), so a reinstall doesn't re-nudge —
    // plus the native push bootstrap: attach the messaging listeners
    // (deep-links, foreground toasts, token rotation) and silently re-register
    // the device token when permission was already granted. Never prompts.
    const attachPush = useCallback(
        (docId: string, data: Record<string, unknown> | undefined) => {
            const docTs = typeof data?.pushPromptedAt === 'number' ? data.pushPromptedAt : null;
            if (docTs) {
                writeLocalPushPrompt(docTs);
            } else {
                const localTs = readLocalPushPrompt();
                if (localTs !== null) {
                    updateDoc(doc(db, 'users', docId), { pushPromptedAt: localTs })
                        .catch((e) => reportError(e, 'auth-push-prompt-reconcile'));
                }
            }
            if (isNativeApp()) {
                initPushListeners().then(refreshPushRegistration).catch(() => {});
            }
        },
        [],
    );

    // Explicit acceptance from the notice: persist locally + on the user doc.
    const acceptAiConsent = useCallback(() => {
        const now = Date.now();
        setAiConsented(true);
        writeLocalAiConsent(now);
        track('consent_accepted');
        if (uid) {
            updateDoc(doc(db, 'users', uid), { aiConsentAt: now })
                .catch((e) => reportError(e, 'auth-ai-consent-accept'));
        }
    }, [uid]);

    const signOut = useCallback(async () => {
        // Remove this device's push token BEFORE signing out — the unregister
        // endpoint verifies the caller's ID token, which is gone afterwards.
        try {
            await unregisterPush();
        } catch {
            // Dead tokens are also pruned server-side on the next send.
        }
        await signOutUser();
        setUid(null);
        setAuthUid(null);
        setEmail(null);
        setDisplayName(null);
        setPhotoURL(null);
        setRestricted(false);
        setNeedsOnboarding(false);
    }, []);

    // ── Legacy native path (pre-cutover only): load the owner workspace, no gate.
    useEffect(() => {
        if (REQUIRE_AUTH || !native) return;
        let cancelled = false;
        (async () => {
            try {
                const snapshot = await getDocs(query(collection(db, 'users'), limit(1)));
                if (cancelled) return;
                if (!snapshot.empty) {
                    const userDoc = snapshot.docs[0];
                    setUid(userDoc.id);
                    attachUserDoc(userDoc.id, userDoc.data());
                    reconcileAiConsent(userDoc.id, userDoc.data());
                    attachPush(userDoc.id, userDoc.data());
                }
            } catch (err) {
                console.error('Failed to look up user:', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    // ── Real sign-in path: web always; native only when REQUIRE_AUTH is on. ──
    useEffect(() => {
        if (!REQUIRE_AUTH && native) return;
        let cancelled = false;

        // Finish a redirect-based sign-in if one is pending (web only; no-op
        // under Capacitor and on a normal load).
        completeRedirectSignIn().catch(() => {});

        const unsub = onAuthChange(async (user) => {
            if (cancelled) return;
            if (!user) {
                setUid(null);
                setAuthUid(null);
                setEmail(null);
                setDisplayName(null);
                setPhotoURL(null);
                setRestricted(false);
                setLoading(false);
                return;
            }

            setAuthUid(user.uid);
            setEmail(user.email);
            setDisplayName(user.displayName);
            setPhotoURL(user.photoURL);
            setLoading(true);
            try {
                const dataDoc = await resolveDataDoc(user.uid);
                if (cancelled) return;
                if (dataDoc) {
                    setRestricted(false);
                    setUid(dataDoc.id);
                    attachUserDoc(dataDoc.id, dataDoc.data);
                    reconcileAiConsent(dataDoc.id, dataDoc.data);
                    attachPush(dataDoc.id, dataDoc.data);
                    // First run for a fresh workspace: the backend returns
                    // `created` on creation and stamps `onboarded: false` on
                    // the doc (covers a reload before dismissal).
                    setNeedsOnboarding(
                        (dataDoc.created || dataDoc.data?.onboarded === false)
                        && !welcomeDismissedLocally(dataDoc.id),
                    );
                } else {
                    setRestricted(true);
                    setUid(null);
                }
            } catch (err) {
                console.error('Failed to resolve user workspace:', err);
                if (!cancelled) { setRestricted(true); setUid(null); }
            } finally {
                if (!cancelled) setLoading(false);
            }
        });

        return () => { cancelled = true; unsub(); };
        // retryNonce re-runs resolution (onAuthChange re-fires with the
        // current user on resubscribe) after a failed workspace setup.
    }, [retryNonce]);

    // Dismiss the first-run welcome: record it on the user doc (authoritative,
    // survives devices) with a localStorage fallback if the write fails.
    const finishOnboarding = useCallback(() => {
        setNeedsOnboarding(false);
        if (!uid) return;
        try {
            localStorage.setItem(`${WELCOME_DISMISSED_KEY}:${uid}`, '1');
        } catch { /* private mode — best effort */ }
        updateDoc(doc(db, 'users', uid), { onboarded: true })
            .catch((e) => reportError(e, 'auth-finish-onboarding'));
    }, [uid]);

    const value: AuthContextType = { uid, authUid, email, displayName, photoURL, loading, signOut };

    // Sign-in gating. Web is always gated; native is gated only when enforcing.
    // During loading we render children so the page shows its own spinner (and
    // SSR/first paint stay consistent — loading starts true).
    const gated = REQUIRE_AUTH || !native;
    if (gated && !loading) {
        if (!authUid) {
            return (
                <AuthContext.Provider value={value}>
                    <LoginScreen onSignIn={signIn} showApple={!native || REQUIRE_AUTH} />
                </AuthContext.Provider>
            );
        }
        if (restricted) {
            // Edge case only: resolution failed AND the backend couldn't (or,
            // pre-cutover, wouldn't) create a workspace. Post-cutover the
            // screen offers a retry; pre-cutover it keeps the owner-account
            // message (live behavior unchanged).
            return (
                <AuthContext.Provider value={value}>
                    <LoginScreen
                        restricted
                        email={email}
                        onSignIn={signIn}
                        onSignOut={signOut}
                        onRetry={REQUIRE_AUTH ? () => setRetryNonce((n) => n + 1) : undefined}
                        showApple={!native || REQUIRE_AUTH}
                    />
                </AuthContext.Provider>
            );
        }
    }

    // AI-consent gate (App Review 5.1.1/5.1.2, Nov 2025): explicit consent to
    // Google Gemini processing before anything can be saved. Deliberately NOT
    // behind the auth flags — pre-cutover native has no sign-in, so this sits
    // after the sign-in/restricted screens (web) but gates children on both
    // platforms, including existing users with no recorded consent. Renders
    // BEFORE the welcome screen (below) and the tour (app/page.tsx mounts only
    // once children render), so the screens appear one at a time, in order.
    if (!loading && aiConsented === false) {
        return (
            <AuthContext.Provider value={value}>
                <AIConsentNotice onAccept={acceptAiConsent} />
            </AuthContext.Provider>
        );
    }

    if (gated && !loading && uid && needsOnboarding) {
        // Fresh workspace: one welcome screen before the app.
        return (
            <AuthContext.Provider value={value}>
                <Onboarding onDone={finishOnboarding} />
            </AuthContext.Provider>
        );
    }

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Shape returned by both the claim callable and its HTTP twin. */
type ClaimResult = { uid: string | null; created?: boolean };

/** Web path: the Firebase callable (works from a real browser origin). */
async function claimWorkspaceCallable(): Promise<ClaimResult> {
    const claim = httpsCallable<Record<string, never>, ClaimResult>(functions, 'claim_workspace');
    const res = await claim({});
    return res.data ?? { uid: null };
}

/**
 * Native path: the HTTP twin (`/api/claim-workspace` → claim_workspace_http),
 * called with an Authorization: Bearer ID token exactly like the other /api/*
 * endpoints. Bypasses the Firebase callable, whose CORS preflight the WKWebView
 * `capacitor://localhost` origin can't clear. apiUrl() prefixes the native
 * NEXT_PUBLIC_API_BASE (the live Hosting site) so the request lands on the
 * function's rewrite; a 401 with no linked workspace is treated as "declined".
 */
async function claimWorkspaceHttp(): Promise<ClaimResult> {
    const res = await fetchWithTimeout(apiUrl('/api/claim-workspace'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
        body: '{}',
    });
    if (!res.ok) {
        // Backend rejected the caller (e.g. unverified token) — surface as a
        // failed claim so the caller shows the restricted screen, same as a
        // callable throw.
        throw new Error(`claim-workspace HTTP ${res.status}`);
    }
    return (await res.json()) as ClaimResult;
}

/**
 * Map a Firebase Auth uid to its Firestore data doc.
 * 1. A doc already linked via `authUids array-contains authUid`.
 * 2. Otherwise ask the backend to claim one — or, post-cutover, create a
 *    fresh workspace for a brand-new account (server-side, Admin SDK — works
 *    under locked rules; OWNER_EMAIL gating lives there). `created` is true
 *    when a new workspace was just made (triggers the welcome screen).
 *    Returns null only if no workspace could be resolved, claimed, or created
 *    (caller shows the restricted screen).
 */
async function resolveDataDoc(
    authUid: string,
): Promise<{ id: string; data: Record<string, unknown>; created?: boolean } | null> {
    // 1. Already linked.
    const linked = await getDocs(
        query(collection(db, 'users'), where('authUids', 'array-contains', authUid), limit(1)),
    );
    if (!linked.empty) {
        const d = linked.docs[0];
        return { id: d.id, data: d.data() };
    }

    // 2. Not linked yet — ask the backend to claim (owner) or create (new
    //    account, REQUIRE_AUTH only) the workspace. This runs with Admin
    //    privileges (bypasses Firestore rules), so it works under the locked
    //    rules; the OWNER_EMAIL allowlist gating lives server-side. The client
    //    no longer reads or writes an arbitrary "first user" doc.
    //
    //    Native uses the HTTP twin, NOT the Firebase callable: the callable
    //    transport's CORS preflight is rejected from the Capacitor
    //    `capacitor://localhost` WebView origin, so httpsCallable() fails before
    //    the request ever reaches the function (no execution logs, user lands on
    //    the restricted screen). The HTTP endpoint sets CORS from the backend
    //    allowlist that includes capacitor://localhost and verifies the ID token
    //    via Authorization: Bearer — the same pattern every other /api/* call
    //    uses. Web keeps the callable (works fine there). Same underlying logic
    //    server-side, so behavior matches exactly.
    try {
        const claimed = isNativeApp()
            ? await claimWorkspaceHttp()
            : await claimWorkspaceCallable();
        const claimedUid = claimed?.uid;
        if (claimedUid) {
            const fresh = await getDoc(doc(db, 'users', claimedUid));
            return { id: claimedUid, data: fresh.data() ?? {}, created: claimed?.created === true };
        }
        // Backend ran and declined (pre-cutover non-owner) → restricted.
        return null;
    } catch (e) {
        console.warn('Workspace claim unavailable:', e);
    }

    // 3. Soft-mode fallback: if the callable isn't deployed yet (pre-cutover),
    //    fall back to the legacy client-side claim, which works while the live
    //    rules are still open. Skipped once REQUIRE_AUTH is on (locked rules
    //    would reject it, and claim_workspace is the only correct path then).
    if (!REQUIRE_AUTH) {
        try {
            const first = await getDocs(query(collection(db, 'users'), limit(1)));
            if (!first.empty) {
                const candidate = first.docs[0];
                const existing = candidate.data().authUids;
                // Don't hijack a doc already claimed by a different account.
                if (!(Array.isArray(existing) && existing.length > 0 && !existing.includes(authUid))) {
                    await updateDoc(doc(db, 'users', candidate.id), { authUids: arrayUnion(authUid) });
                    const fresh = await getDoc(doc(db, 'users', candidate.id));
                    return { id: candidate.id, data: fresh.data() ?? candidate.data() };
                }
            }
        } catch (e) {
            console.warn('Legacy client-side claim failed:', e);
        }
    }
    return null;
}
