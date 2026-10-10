'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback, useRef } from 'react';
import {
    collection, query, getDocs, limit, where, doc, getDoc, setDoc, updateDoc, arrayUnion,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions, auth } from '@/lib/firebase';
import { isNativeApp, REQUIRE_AUTH, apiUrl, fetchWithTimeout } from '@/lib/api';
import {
    onAuthChange, completeRedirectSignIn, signIn, signOutUser, authHeaders,
    PROFILE_UPDATED_EVENT, isSigningOut, purgeAfterExternalSignOut,
} from '@/lib/auth';
import { syncShareConfigToNative, clearNativeShareConfig } from '@/lib/shareConfig';
import { readLocalAiConsent, writeLocalAiConsent } from '@/lib/aiConsent';
import { setAnalyticsUid, flushSignIn, trackAppOpen, track } from '@/lib/analytics';
import { installErrorReporter, reportError, flushBufferedReports, reportViaHttp } from '@/lib/errorReporter';
import {
    initPushListeners, refreshPushRegistration, unregisterPush,
    readLocalPushPrompt, writeLocalPushPrompt, getDevicePushPermission,
} from '@/lib/push';
import { reconcileTourSeen } from '@/lib/tourSeen';
import LoginScreen from '@/components/LoginScreen';
import SignedOutWeb from '@/components/SignedOutWeb';
import Onboarding from '@/components/Onboarding';
import AIConsentNotice from '@/components/AIConsentNotice';
import { EntitlementProvider } from '@/components/EntitlementProvider';

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

/** Resolve when `p` settles or after `ms`, whichever comes first; never rejects. */
function settleWithin(p: Promise<unknown>, ms: number): Promise<void> {
    return new Promise((resolve) => {
        const t = setTimeout(resolve, ms);
        p.then(() => { clearTimeout(t); resolve(); }, () => { clearTimeout(t); resolve(); });
    });
}

/** The share-sheet sync held back until the AI notice is accepted. */
let pendingShareSync: { docId: string; docToken?: string } | null = null;
// This workspace's ingest token, from the user doc: sign-out on the web uses
// it to disconnect a browser extension that holds the same token.
let currentIngestToken: string | undefined;

/**
 * Best-effort, fire-and-forget side effects once the data doc is known: hand the
 * iOS Share Extension its endpoint/token, and persist the browser timezone.
 *
 * The share sheet gets its token only once THIS account has accepted the AI
 * notice (App Review 5.1.2). Before that, a user who signed in and left the
 * notice unanswered could share a page from Safari and have it analyzed by
 * Gemini without ever consenting. Until then the extension holds no token
 * (any left by an earlier build is cleared) and asks the user to open Machina.
 */
function attachUserDoc(docId: string, data: Record<string, unknown> | undefined, consented: boolean) {
    // Pass the doc's ingestToken so the bridge needs NO backend call at all
    // (the callable is only a fallback for a token-less first launch).
    const docToken = typeof data?.ingestToken === 'string' ? data.ingestToken : undefined;
    currentIngestToken = docToken;
    if (consented) {
        pendingShareSync = null;
        syncShareConfigToNative(docId, docToken);
    } else {
        pendingShareSync = { docId, docToken };
        void clearNativeShareConfig();
    }
    syncTimezone(docId, typeof data?.timezone === 'string' ? data.timezone : null);
}

/** Last timezone this tab knows is on the doc, so a resume only writes on a
    real change. Module-scoped: one signed-in workspace per page. */
let knownTimezone: string | null = null;

/**
 * Keep `users/{uid}.timezone` (what digests and reminders are scheduled in)
 * pointing at where the PHONE is. The phone is the device that travels and
 * receives the pushes; a desktop browser left open at home must not drag the
 * schedule back to its zone. So native writes whenever the zone differs, and
 * the web writes only to fill a doc that has no zone at all.
 */
function syncTimezone(docId: string, docTz: string | null) {
    knownTimezone = docTz;
    let tz: string | undefined;
    try {
        tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    } catch {
        return; // Intl not available — skip.
    }
    if (!tz || tz === docTz) return;
    if (!isNativeApp() && docTz) return;
    const next = tz;
    updateDoc(doc(db, 'users', docId), { timezone: next })
        .then(() => { knownTimezone = next; })
        .catch((e) => reportError(e, 'auth-timezone-update'));
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
    // Why the last resolution failed, for the restricted screen's diagnostic
    // line. On a device there is no console, so without this the real error
    // (an HTTP status, a timeout, a rules rejection) is unrecoverable from a
    // user's screenshot.
    const [restrictedDetail, setRestrictedDetail] = useState<string | null>(null);
    // Signed in, but no workspace could be resolved or created (edge case —
    // post-cutover this only happens when workspace creation failed).
    const [restricted, setRestricted] = useState(false);
    // Fresh workspace → show the one-screen welcome before the app.
    const [needsOnboarding, setNeedsOnboarding] = useState(false);
    // Bumped by "Try again" on the restricted screen to re-run resolution.
    const [retryNonce, setRetryNonce] = useState(0);
    // AI-consent gate (App Review 5.1.1/5.1.2): null until the workspace
    // resolves, then true/false for THAT account. Either record counts:
    // `aiConsentAt` on the user doc (survives reinstalls and devices), or this
    // device's per-workspace cache (lib/aiConsent).
    const [aiConsented, setAiConsented] = useState<boolean | null>(null);
    // In-session sign-in hand-off. When the user signs in FROM the visible
    // sign-in screen, resolving the workspace takes a second or more (a cold
    // claim can take far longer). Showing the cold-launch boot screen in that
    // gap (the landing's big glowing mark, always dark) read as being thrown
    // back to the start before the app appeared (owner, 2026-10-10). Instead
    // the same SignedOutWeb element stays mounted, so its LoginScreen keeps
    // "Signing in…" on the button until the app takes over. Cold boots with a
    // persisted session never showed the sign-in screen and keep the boot screen.
    const [signInHandoff, setSignInHandoff] = useState(false);
    const signedOutVisibleRef = useRef(false);
    // The auth uid this tab last resolved, to tell "signed out from
    // elsewhere" (deleted or disabled account, revoked sessions) from the
    // signed-out state the app simply started in.
    const lastAuthUidRef = useRef<string | null>(null);

    const native = typeof window !== 'undefined' && isNativeApp();

    // Whether the signed-out screen (landing / sign-in) is what's on screen
    // right now, read by the auth listener when a user arrives. A ref, set
    // after commit, so the listener sees the last PAINTED state, not a render
    // that never landed.
    useEffect(() => {
        signedOutVisibleRef.current =
            !loading && !restricted && (REQUIRE_AUTH || !native) && !authUid;
    }, [loading, restricted, native, authUid]);

    useEffect(() => {
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

    // Native only: a trip across timezones happens with the app backgrounded,
    // so the launch-time write alone would schedule digests in the departure
    // zone until the next cold start. Re-check on every return to foreground.
    useEffect(() => {
        if (!uid || !native) return;
        const onVisible = () => {
            if (document.visibilityState === 'visible') syncTimezone(uid, knownTimezone);
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => document.removeEventListener('visibilitychange', onVisible);
    }, [uid, native]);

    // updateProfile (first Apple sign-in) and provider linking don't fire
    // onAuthStateChanged, so re-read the profile when lib/auth says it changed.
    useEffect(() => {
        const onProfile = () => {
            const u = auth.currentUser;
            if (!u) return;
            setDisplayName(u.displayName);
            setEmail(u.email);
            setPhotoURL(u.photoURL);
        };
        window.addEventListener(PROFILE_UPDATED_EVENT, onProfile);
        return () => window.removeEventListener(PROFILE_UPDATED_EVENT, onProfile);
    }, []);

    // Reconcile the two consent records once the data doc is known: a doc
    // timestamp wins (cache it locally); otherwise mirror this workspace's
    // local acceptance up to the doc (a failed write at accept time) so it
    // survives reinstalls. Returns whether this account has consented.
    const reconcileAiConsent = useCallback(
        (docId: string, data: Record<string, unknown> | undefined): boolean => {
            const docTs = typeof data?.aiConsentAt === 'number' ? data.aiConsentAt : null;
            if (docTs) {
                setAiConsented(true);
                writeLocalAiConsent(docId, docTs);
                return true;
            }
            const localTs = readLocalAiConsent(docId);
            if (localTs !== null) {
                setAiConsented(true);
                updateDoc(doc(db, 'users', docId), { aiConsentAt: localTs })
                    .catch((e) => reportError(e, 'auth-ai-consent-reconcile'));
                return true;
            }
            setAiConsented(false);
            return false;
        },
        [],
    );

    // Same dual-persistence reconcile for the first-run notifications nudge
    // (push-prompt-v1 ↔ pushPromptedAt), so a reinstall doesn't re-nudge —
    // plus the native push bootstrap: attach the messaging listeners
    // (deep-links, foreground toasts, token rotation) and silently re-register
    // the device token when permission was already granted. Never prompts.
    const attachPush = useCallback(
        async (docId: string, data: Record<string, unknown> | undefined) => {
            const docTs = typeof data?.pushPromptedAt === 'number' ? data.pushPromptedAt : null;
            if (docTs) {
                // The account was asked before (another phone, an earlier
                // install), but iOS resets the permission per install: if this
                // device has never been asked and the account wants push, leave
                // the local record unset so the feed offers the nudge here. A
                // deliberate "off" stays respected.
                const settings = (data?.settings ?? {}) as { push_enabled?: unknown };
                const wantsPush = settings.push_enabled === true;
                const neverAskedHere = wantsPush && isNativeApp()
                    && (await getDevicePushPermission()) === 'prompt';
                if (!neverAskedHere) writeLocalPushPrompt(docTs);
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

    // Explicit acceptance from the notice: persist locally + on the user doc,
    // then hand the share sheet the token it was held back from.
    const acceptAiConsent = useCallback(() => {
        const now = Date.now();
        setAiConsented(true);
        track('consent_accepted');
        if (uid) {
            writeLocalAiConsent(uid, now);
            updateDoc(doc(db, 'users', uid), { aiConsentAt: now })
                .catch((e) => reportError(e, 'auth-ai-consent-accept'));
        }
        if (pendingShareSync) {
            const { docId, docToken } = pendingShareSync;
            pendingShareSync = null;
            syncShareConfigToNative(docId, docToken);
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
        // Web: a browser extension connected to this account would keep
        // saving into it after sign-out (a shared computer). Disconnect it;
        // one connected to a different account is left alone.
        if (!isNativeApp() && currentIngestToken) {
            const { disconnectExtensionFor } = await import('@/lib/extension');
            await disconnectExtensionFor(currentIngestToken);
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

    // ── Legacy native path (rollback only): load the owner workspace, no gate.
    //
    // Kept, not deleted, because §3's documented rollback — revert the
    // firestore.rules commit, set both REQUIRE_AUTH flags back to false — lands
    // here. But it is viable ONLY against the OPEN ruleset: the locked rules
    // deny this unbounded `users limit(1)` list by name (see firestore.rules),
    // and with the gate off there is no sign-in screen to recover with. A
    // swallowed error here therefore renders an empty app and hides the cause,
    // which is exactly how ungated builds 1266/1267 failed on device. So a
    // failure now surfaces as the restricted screen instead of nothing.
    useEffect(() => {
        if (REQUIRE_AUTH || !native) return;
        let cancelled = false;
        (async () => {
            try {
                const snapshot = await getDocs(query(collection(db, 'users'), limit(1)));
                if (cancelled) return;
                if (snapshot.empty) {
                    setRestricted(true);
                    return;
                }
                const userDoc = snapshot.docs[0];
                setRestricted(false);
                setUid(userDoc.id);
                const consented = reconcileAiConsent(userDoc.id, userDoc.data());
                attachUserDoc(userDoc.id, userDoc.data(), consented);
                await settleWithin(attachPush(userDoc.id, userDoc.data()), 1500);
                reconcileTourSeen(userDoc.id, userDoc.data(), false);
            } catch (err) {
                console.error('Failed to look up user:', err);
                reportError(err, 'auth-legacy-native-lookup');
                if (!cancelled) { setRestricted(true); setUid(null); }
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
        // retryNonce drives "Try again" on the restricted screen here too.
        // Mount + retry only: the helpers are re-created every render, so
        // listing them would re-run the workspace lookup on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [retryNonce]);

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
                const hadUser = lastAuthUidRef.current !== null;
                lastAuthUidRef.current = null;
                if (hadUser && !isSigningOut()) {
                    // Signed out by Firebase, not by us: run the same purge as
                    // the Sign out button (it reloads into the signed-out page).
                    void purgeAfterExternalSignOut();
                    return;
                }
                setAiConsented(null);
                setUid(null);
                setAuthUid(null);
                setEmail(null);
                setDisplayName(null);
                setPhotoURL(null);
                setRestricted(false);
                setLoading(false);
                return;
            }

            lastAuthUidRef.current = user.uid;
            setSignInHandoff(signedOutVisibleRef.current);
            setAuthUid(user.uid);
            setEmail(user.email);
            setDisplayName(user.displayName);
            setPhotoURL(user.photoURL);
            setLoading(true);
            try {
                const dataDoc = await resolveDataDoc(user.uid, user.email);
                if (cancelled) return;
                if (dataDoc) {
                    setRestricted(false);
                    setRestrictedDetail(null);
                    setUid(dataDoc.id);
                    const consented = reconcileAiConsent(dataDoc.id, dataDoc.data);
                    attachUserDoc(dataDoc.id, dataDoc.data, consented);
                    // Before setLoading(false): the feed reads the nudge record
                    // once, on mount. Bounded so a stuck bridge never holds the app.
                    await settleWithin(attachPush(dataDoc.id, dataDoc.data), 1500);
                    if (cancelled) return;
                    // First run for a fresh workspace: the backend returns
                    // `created` on creation and stamps `onboarded: false` on
                    // the doc (covers a reload before dismissal).
                    const fresh = !!dataDoc.created || dataDoc.data?.onboarded === false;
                    // Synchronous, before setLoading(false) below: app/page.tsx
                    // decides whether to show the tour from the local key.
                    reconcileTourSeen(dataDoc.id, dataDoc.data, fresh);
                    setNeedsOnboarding(fresh && !welcomeDismissedLocally(dataDoc.id));
                } else {
                    setRestricted(true);
                    setRestrictedDetail(lastResolveDetail);
                    setUid(null);
                }
            } catch (err) {
                console.error('Failed to resolve user workspace:', err);
                reportError(err, 'auth-resolve-workspace');
                if (!cancelled) {
                    setRestricted(true);
                    setRestrictedDetail(err instanceof Error ? err.message : String(err));
                    setUid(null);
                }
            } finally {
                if (!cancelled) {
                    setLoading(false);
                    setSignInHandoff(false);
                }
            }
        });

        return () => { cancelled = true; unsub(); };
        // retryNonce re-runs resolution (onAuthChange re-fires with the
        // current user on resubscribe) after a failed workspace setup. The
        // helpers are re-created every render; listing them would resubscribe
        // the auth listener on every render.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [retryNonce]);

    // Workspace is unresolvable → Firestore-backed error reporting is dead with
    // it: `users/{uid}/client_errors` needs an owned doc, and there isn't one,
    // so the reporter's buffer would wait forever for a flush that never comes.
    // Switch it to /api/client-error and drain the buffer. This is precisely the
    // state that reported NOTHING when builds 1266/1267 shipped ungated — the
    // app was dead on device for a day and the only detector was a human.
    // Covers every path into `restricted` (both resolution effects), and
    // reportViaHttp is idempotent, so re-renders cost nothing.
    useEffect(() => {
        if (restricted) reportViaHttp('workspace-unresolved');
    }, [restricted]);

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
    if (loading && signInHandoff && gated) {
        // Same element type at the same position as the signed-out branch
        // below, so React keeps SignedOutWeb (and LoginScreen's busy state)
        // mounted instead of remounting it. See signInHandoff above.
        return (
            <AuthContext.Provider value={value}>
                <SignedOutWeb onSignIn={signIn} showApple={!native || REQUIRE_AUTH} />
            </AuthContext.Provider>
        );
    }
    if (!loading) {
        // A failed workspace resolution ALWAYS surfaces — deliberately checked
        // before the gate, and outside it. In legacy native mode there is no
        // sign-in screen to fall back to, so falling through to children with a
        // null uid renders an empty app and hides the cause. `restricted` is
        // only ever set after a real failure, so this can't pre-empt a healthy
        // load; and where it was reachable before, it was reachable only with
        // authUid already set, so ordering it first changes nothing there.
        //
        // Cause of the failure varies: resolution failed AND the backend
        // couldn't (or, pre-cutover, wouldn't) create a workspace; or, in
        // legacy native, the owner-workspace lookup was denied.
        if (restricted) {
            return (
                <AuthContext.Provider value={value}>
                    <LoginScreen
                        restricted
                        detail={restrictedDetail}
                        email={email}
                        onSignIn={signIn}
                        onSignOut={signOut}
                        // Retry re-runs resolution: the real path when enforcing,
                        // the legacy lookup on native (both keyed on retryNonce).
                        // Pre-cutover WEB keeps the non-owner message, no retry.
                        onRetry={REQUIRE_AUTH || native ? () => setRetryNonce((n) => n + 1) : undefined}
                        showApple={!native || REQUIRE_AUTH}
                    />
                </AuthContext.Provider>
            );
        }
        if (gated && !authUid) {
            // EVERY signed-out visitor gets the public landing page, with
            // sign-in one click behind it — web since 2026-08-06, native since
            // round 14 by explicit owner call ("the page a user that signs out
            // sees — both desktop and the iOS app"). A SIGNED-IN user never
            // reaches this branch on either platform, so the app still opens
            // straight into the library; the landing is only ever the
            // signed-out state. Still not a routing change: `/` is both the
            // landing (signed out) and the app (signed in).
            //
            // Native nuance folded into SignedOutWeb's props: `showApple`
            // mirrors LoginScreen's old per-platform rule (`!native ||
            // REQUIRE_AUTH`), which today is `true` on both platforms — kept
            // as the expression so a future flag change keeps working.
            return (
                <AuthContext.Provider value={value}>
                    <SignedOutWeb onSignIn={signIn} showApple={!native || REQUIRE_AUTH} />
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
                <AIConsentNotice onAccept={acceptAiConsent} onSignOut={signOut} />
            </AuthContext.Provider>
        );
    }

    if (gated && !loading && uid && needsOnboarding) {
        // Fresh workspace: one welcome screen before the app. Inside the
        // entitlement provider so the welcome can mention the Pro trial.
        return (
            <AuthContext.Provider value={value}>
                <EntitlementProvider>
                    <Onboarding onDone={finishOnboarding} />
                </EntitlementProvider>
            </AuthContext.Provider>
        );
    }

    // Machina Pro plan + the single mounted paywall live just inside the auth
    // context: they need the resolved workspace uid and the auth uid, and
    // nothing above this point (sign-in, consent) can show a paywall.
    return (
        <AuthContext.Provider value={value}>
            <EntitlementProvider>{children}</EntitlementProvider>
        </AuthContext.Provider>
    );
}

/** Shape returned by both the claim callable and its HTTP twin. */
type ClaimResult = { uid: string | null; created?: boolean };

/**
 * Why the last resolveDataDoc() returned null, for the restricted screen's
 * diagnostic line. Module-scoped rather than threaded through the return type
 * because resolveDataDoc's null contract is load-bearing in two effects.
 */
let lastResolveDetail: string | null = null;

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
    const attempt = async (): Promise<ClaimResult> => {
        const res = await fetchWithTimeout(apiUrl('/api/claim-workspace'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
            body: '{}',
        }, 60_000);
        if (!res.ok) {
            // Backend rejected the caller (e.g. unverified token) — surface as a
            // failed claim so the caller shows the restricted screen, same as a
            // callable throw.
            throw new Error(`claim-workspace HTTP ${res.status}`);
        }
        return (await res.json()) as ClaimResult;
    };
    // 60s timeout + one retry: this endpoint is only ever called by a
    // brand-new account's FIRST sign-in, so it is the coldest function in the
    // codebase — main.py imports the whole backend, and a cold start on top
    // of a fresh TLS handshake can blow the default 30s budget. A 4xx is the
    // backend answering; retrying it would return the same answer.
    try {
        return await attempt();
    } catch (e) {
        if (e instanceof Error && /HTTP 4\d\d/.test(e.message)) throw e;
        return await attempt();
    }
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
/**
 * Last-resort workspace creation, entirely client-side: write the user's own
 * doc through the Firestore SDK — the one transport PROVEN on native every
 * day (the whole app runs on it). Allowed by the locked rules' create clause:
 * only the caller's own doc id, linked to exactly the caller. Mirrors
 * link_service.create_workspace minus the server-only extras: `settings`
 * falls back to client defaults (useUserSettings), and the ingest token is
 * minted lazily by get_share_config on first share-config fetch.
 */
async function createWorkspaceClientSide(
    authUid: string,
    email: string | null,
): Promise<{ id: string; data: Record<string, unknown>; created: boolean }> {
    // Look once more before creating: this fallback only runs after BOTH
    // server claim transports failed, and a timed-out server claim can still
    // complete in the background. For the owner that claim links the legacy
    // phone-keyed doc; creating a second, empty doc here would then leave the
    // account linked to two workspaces (the server resolver prefers the
    // uid-keyed one, the client's limit(1) query the other).
    const linkedNow = await getDocs(
        query(collection(db, 'users'), where('authUids', 'array-contains', authUid), limit(1)),
    );
    if (!linkedNow.empty) {
        const d = linkedNow.docs[0];
        return { id: d.id, data: d.data(), created: false };
    }
    // No `graphVersion` here, unlike create_workspace: the locked create rule
    // allows only these birth fields. ensureGraphVersion stamps an empty
    // library without calling the backend, so this costs one doc write.
    const payload: Record<string, unknown> = {
        authUids: [authUid],
        createdAt: Date.now(),
        onboarded: false,
        ...(email ? { email } : {}),
    };
    // No merge: this must be a CREATE. If the doc exists and this account is
    // not linked, the update rule rejects it — restricted is then correct.
    await setDoc(doc(db, 'users', authUid), payload);
    return { id: authUid, data: payload, created: true };
}

async function resolveDataDoc(
    authUid: string,
    email: string | null = null,
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
    lastResolveDetail = null;
    let claimed: ClaimResult | null = null;
    const transports: Array<[string, () => Promise<ClaimResult>]> = isNativeApp()
        ? [['http', claimWorkspaceHttp], ['callable', claimWorkspaceCallable]]
        : [['callable', claimWorkspaceCallable], ['http', claimWorkspaceHttp]];
    // Sign-up must not dead-end on any single transport: try the platform's
    // primary claim path, then the other one. A transport error falls through
    // to the next; a transport that ANSWERS (even uid: null) is final — the
    // backend spoke, and asking again over another wire gets the same answer.
    for (const [name, transport] of transports) {
        try {
            claimed = await transport();
            break;
        } catch (e) {
            // KEPT for the restricted screen: on a device there is no console,
            // and this message is the only trace of what failed.
            lastResolveDetail = `${name}: ${e instanceof Error ? e.message : String(e)}`;
            console.warn(`Workspace claim via ${name} failed:`, e);
        }
    }
    if (claimed) {
        const claimedUid = claimed.uid;
        if (claimedUid) {
            const fresh = await getDoc(doc(db, 'users', claimedUid));
            return { id: claimedUid, data: fresh.data() ?? {}, created: claimed.created === true };
        }
        // Backend ran and declined (pre-cutover non-owner) → restricted.
        lastResolveDetail = 'workspace claim declined by backend';
        return null;
    }
    // Both claim transports errored (never answered). Post-cutover, fall back
    // to creating the workspace client-side — the Firestore SDK is the one
    // transport the native shell exercises constantly, so sign-up cannot be
    // taken down by the HTTP/callable path alone. Pre-cutover this is skipped
    // (the open-rules legacy claim below is the correct fallback there).
    if (REQUIRE_AUTH) {
        try {
            return await createWorkspaceClientSide(authUid, email);
        } catch (e) {
            lastResolveDetail += ` | self-serve: ${e instanceof Error ? e.message : String(e)}`;
            console.warn('Client-side workspace creation failed:', e);
        }
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
