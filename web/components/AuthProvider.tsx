'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { collection, query, getDocs, limit, doc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { syncShareConfigToNative } from '@/lib/shareConfig';

interface AuthContextType {
    /** Firestore user document ID */
    uid: string | null;
    /** True while user doc is being resolved */
    loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
    uid: null,
    loading: true,
});

export function useAuth() {
    return useContext(AuthContext);
}

/**
 * Lightweight auth provider — looks up the first user doc in Firestore.
 * This centralizes the user lookup that was previously duplicated
 * across page.tsx, Feed.tsx, and AddLinkForm.tsx.
 *
 * TODO: Replace with real Firebase Auth (Google Sign-In) when ready.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
    const [uid, setUid] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function findUser() {
            try {
                const usersRef = collection(db, 'users');
                const q = query(usersRef, limit(1));
                const snapshot = await getDocs(q);
                if (!snapshot.empty) {
                    const userDoc = snapshot.docs[0];
                    setUid(userDoc.id);
                    // On the native iOS app, hand the Share Extension its
                    // endpoint + ingest token via the App Group (best-effort).
                    syncShareConfigToNative(userDoc.id);
                    // Persist the browser timezone so the WhatsApp bot can show
                    // reminder times in the user's local time (best-effort).
                    try {
                        const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
                        if (tz && userDoc.data().timezone !== tz) {
                            updateDoc(doc(db, 'users', userDoc.id), { timezone: tz }).catch(() => {});
                        }
                    } catch {
                        // Intl not available — skip.
                    }
                } else {
                    console.warn('No user document found in Firestore');
                }
            } catch (err) {
                console.error('Failed to look up user:', err);
            } finally {
                setLoading(false);
            }
        }
        findUser();
    }, []);

    return (
        <AuthContext.Provider value={{ uid, loading }}>
            {children}
        </AuthContext.Provider>
    );
}
