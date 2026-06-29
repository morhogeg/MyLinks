'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { User, onAuthStateChanged } from 'firebase/auth';
import { collection, query, getDocs, limit, doc, updateDoc } from 'firebase/firestore';
import { auth, db, REQUIRE_AUTH, signOutUser } from '@/lib/firebase';
import SignIn from './SignIn';

interface AuthContextType {
    /** The authenticated user's uid (real auth) or the prototype user doc id. */
    uid: string | null;
    /** The Firebase Auth user, when real auth is active. */
    user: User | null;
    /** True while the user/uid is being resolved. */
    loading: boolean;
    /** Sign out (no-op in prototype mode). */
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
    uid: null,
    user: null,
    loading: true,
    signOut: async () => {},
});

export function useAuth() {
    return useContext(AuthContext);
}

/** Persist the browser timezone so the WhatsApp bot can localize reminder times. */
function persistTimezone(uid: string, currentTz?: string) {
    try {
        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
        if (tz && currentTz !== tz) {
            updateDoc(doc(db, 'users', uid), { timezone: tz }).catch(() => {});
        }
    } catch {
        // Intl not available — skip.
    }
}

/**
 * Auth provider with two modes, selected by NEXT_PUBLIC_REQUIRE_AUTH:
 *
 *  - REQUIRE_AUTH=true  → real Firebase Auth. Tracks the signed-in user and
 *    renders the <SignIn> screen until the user logs in. `uid` is the auth uid.
 *  - otherwise (default) → legacy single-user prototype: loads the first user
 *    doc in Firestore and uses its id as `uid`. No login. This keeps the live
 *    app working until auth is rolled out end-to-end (see docs/AUTH_AND_IOS_SPEC).
 */
export function AuthProvider({ children }: { children: ReactNode }) {
    const [uid, setUid] = useState<string | null>(null);
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    // ── Real auth mode ──
    useEffect(() => {
        if (!REQUIRE_AUTH) return;
        const unsub = onAuthStateChanged(auth, (u) => {
            setUser(u);
            setUid(u?.uid ?? null);
            setLoading(false);
            if (u) persistTimezone(u.uid);
        });
        return () => unsub();
    }, []);

    // ── Prototype mode (no real auth) ──
    useEffect(() => {
        if (REQUIRE_AUTH) return;
        let cancelled = false;
        (async () => {
            try {
                const snapshot = await getDocs(query(collection(db, 'users'), limit(1)));
                if (cancelled) return;
                if (snapshot.empty) {
                    console.warn('No user document found in Firestore');
                } else {
                    const userDoc = snapshot.docs[0];
                    setUid(userDoc.id);
                    persistTimezone(userDoc.id, userDoc.data().timezone);
                }
            } catch (err) {
                console.error('Failed to look up user:', err);
            } finally {
                if (!cancelled) setLoading(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const value: AuthContextType = { uid, user, loading, signOut: signOutUser };

    // In real-auth mode, gate the app behind the login screen.
    if (REQUIRE_AUTH && !loading && !uid) {
        return (
            <AuthContext.Provider value={value}>
                <SignIn />
            </AuthContext.Provider>
        );
    }

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
