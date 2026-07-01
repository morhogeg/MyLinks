'use client';

import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import {
    collection, query, getDocs, limit, where, doc, getDoc, updateDoc, arrayUnion,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { isNativeApp } from '@/lib/api';
import {
    onAuthChange, completeRedirectSignIn, signInWithGoogle, signOutUser,
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
    /** True while auth state + the data doc are being resolved. */
    loading: boolean;
    /** Sign the current user out (web). */
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    uid: null,
    authUid: null,
    email: null,
    loading: true,
    signOut: async () => {},
});

export function useAuth() {
    return useContext(AuthContext);
}

// When set (Vercel + web/.env.local), only this Google account may claim/own the
// workspace. Unset → the sole unclaimed user doc is claimed (single-user dev).
const OWNER_EMAIL = process.env.NEXT_PUBLIC_OWNER_EMAIL || null;

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
 * Auth-aware provider.
 *
 * Web: real Google Sign-In. Signed-out renders a login gate; signed-in resolves
 * the user's data doc (linked via `authUids`, or claimed on first sign-in). A
 * signed-in account with no linked doc sees a restricted screen.
 *
 * Native (Capacitor): keeps the legacy single-user behavior (load the first user
 * doc, no gate) — popup/redirect auth can't run in the WKWebView. Native Google
 * Sign-In is Phase 2. See AUTH_SPEC.md.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
    const [uid, setUid] = useState<string | null>(null);
    const [authUid, setAuthUid] = useState<string | null>(null);
    const [email, setEmail] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    // Signed in, but the Google account isn't linked to any workspace.
    const [restricted, setRestricted] = useState(false);

    const native = typeof window !== 'undefined' && isNativeApp();

    const signOut = useCallback(async () => {
        await signOutUser();
        setUid(null);
        setAuthUid(null);
        setEmail(null);
        setRestricted(false);
    }, []);

    // ── Native: legacy first-user-doc lookup (no auth gate) ──────────────────
    useEffect(() => {
        if (!native) return;
        let cancelled = false;
        (async () => {
            try {
                const snapshot = await getDocs(query(collection(db, 'users'), limit(1)));
                if (cancelled) return;
                if (!snapshot.empty) {
                    const userDoc = snapshot.docs[0];
                    setUid(userDoc.id);
                    attachUserDoc(userDoc.id, userDoc.data());
                } else {
                    console.warn('No user document found in Firestore');
                }
            } catch (err) {
                console.error('Failed to look up user:', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, [native]);

    // ── Web: Google Sign-In + data-doc resolution ────────────────────────────
    useEffect(() => {
        if (native) return;
        let cancelled = false;

        // Finish a redirect-based sign-in if one is pending (no-op otherwise).
        completeRedirectSignIn().catch(() => {});

        const unsub = onAuthChange(async (user) => {
            if (cancelled) return;
            if (!user) {
                setUid(null);
                setAuthUid(null);
                setEmail(null);
                setRestricted(false);
                setLoading(false);
                return;
            }

            setAuthUid(user.uid);
            setEmail(user.email);
            setLoading(true);
            try {
                const dataDoc = await resolveDataDoc(user.uid, user.email);
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
    }, [native]);

    const value: AuthContextType = { uid, authUid, email, loading, signOut };

    // Web gating. During loading we render children so the page shows its own
    // spinner (and SSR/first paint stay consistent — loading starts true).
    if (!native && !loading) {
        if (!authUid) {
            return (
                <AuthContext.Provider value={value}>
                    <LoginScreen onSignIn={signInWithGoogle} />
                </AuthContext.Provider>
            );
        }
        if (restricted) {
            return (
                <AuthContext.Provider value={value}>
                    <LoginScreen restricted email={email} onSignIn={signInWithGoogle} onSignOut={signOut} />
                </AuthContext.Provider>
            );
        }
    }

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Map a Firebase Auth uid to its Firestore data doc.
 * 1. A doc already linked via `authUids array-contains authUid`.
 * 2. Otherwise claim the bootstrap (owner) doc: link it (+ email), gated by
 *    NEXT_PUBLIC_OWNER_EMAIL when set. Returns null if no doc may be claimed.
 */
async function resolveDataDoc(
    authUid: string,
    accountEmail: string | null,
): Promise<{ id: string; data: Record<string, unknown> } | null> {
    // 1. Already linked.
    const linked = await getDocs(
        query(collection(db, 'users'), where('authUids', 'array-contains', authUid), limit(1)),
    );
    if (!linked.empty) {
        const d = linked.docs[0];
        return { id: d.id, data: d.data() };
    }

    // 2. Bootstrap claim of the (single-user) owner doc.
    if (OWNER_EMAIL && accountEmail !== OWNER_EMAIL) return null;

    const first = await getDocs(query(collection(db, 'users'), limit(1)));
    if (first.empty) return null;

    const candidate = first.docs[0];
    const existing = candidate.data().authUids;
    // Already claimed by a different account → don't hijack it.
    if (Array.isArray(existing) && existing.length > 0 && !existing.includes(authUid)) {
        return null;
    }

    await updateDoc(doc(db, 'users', candidate.id), {
        authUids: arrayUnion(authUid),
        ...(accountEmail ? { email: accountEmail } : {}),
    });

    // Re-read so callers see the freshly written fields.
    const fresh = await getDoc(doc(db, 'users', candidate.id));
    return { id: candidate.id, data: fresh.data() ?? candidate.data() };
}
