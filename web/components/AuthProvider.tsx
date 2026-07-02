'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import {
    collection, query, getDocs, limit, where, doc, getDoc, updateDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/lib/firebase';
import { isNativeApp, REQUIRE_AUTH } from '@/lib/api';
import {
    onAuthChange, completeRedirectSignIn, signIn, signOutUser,
} from '@/lib/auth';
import { syncShareConfigToNative } from '@/lib/shareConfig';
import LoginScreen from '@/components/LoginScreen';

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
    syncShareConfigToNative(docId);
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz && data?.timezone !== tz) {
            updateDoc(doc(db, 'users', docId), { timezone: tz }).catch(() => {});
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
    // Signed in, but the account isn't linked to any workspace.
    const [restricted, setRestricted] = useState(false);

    const native = typeof window !== 'undefined' && isNativeApp();

    const signOut = useCallback(async () => {
        await signOutUser();
        setUid(null);
        setAuthUid(null);
        setEmail(null);
        setDisplayName(null);
        setPhotoURL(null);
        setRestricted(false);
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
    }, []);

    const value: AuthContextType = { uid, authUid, email, displayName, photoURL, loading, signOut };

    // Sign-in gating. Web is always gated; native is gated only when enforcing.
    // During loading we render children so the page shows its own spinner (and
    // SSR/first paint stay consistent — loading starts true).
    const gated = REQUIRE_AUTH || !native;
    if (gated && !loading) {
        if (!authUid) {
            return (
                <AuthContext.Provider value={value}>
                    <LoginScreen onSignIn={signIn} showApple={REQUIRE_AUTH} />
                </AuthContext.Provider>
            );
        }
        if (restricted) {
            return (
                <AuthContext.Provider value={value}>
                    <LoginScreen restricted email={email} onSignIn={signIn} onSignOut={signOut} showApple={REQUIRE_AUTH} />
                </AuthContext.Provider>
            );
        }
    }

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Map a Firebase Auth uid to its Firestore data doc.
 * 1. A doc already linked via `authUids array-contains authUid`.
 * 2. Otherwise ask the backend to claim one (server-side, Admin SDK — works
 *    under locked rules; OWNER_EMAIL gating lives there). Returns null if no
 *    workspace could be resolved or claimed (caller shows the restricted screen).
 */
async function resolveDataDoc(
    authUid: string,
): Promise<{ id: string; data: Record<string, unknown> } | null> {
    // 1. Already linked.
    const linked = await getDocs(
        query(collection(db, 'users'), where('authUids', 'array-contains', authUid), limit(1)),
    );
    if (!linked.empty) {
        const d = linked.docs[0];
        return { id: d.id, data: d.data() };
    }

    // 2. Not linked yet — ask the backend to claim the workspace. This runs with
    //    Admin privileges (bypasses Firestore rules), so it works under the
    //    locked rules; the OWNER_EMAIL allowlist gating lives server-side. The
    //    client no longer reads or writes an arbitrary "first user" doc.
    try {
        const claim = httpsCallable<Record<string, never>, { uid: string | null }>(
            functions, 'claim_workspace',
        );
        const res = await claim({});
        const claimedUid = res.data?.uid;
        if (claimedUid) {
            const fresh = await getDoc(doc(db, 'users', claimedUid));
            return { id: claimedUid, data: fresh.data() ?? {} };
        }
    } catch (e) {
        console.warn('Workspace claim failed:', e);
    }
    return null;
}
