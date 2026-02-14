'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { collection, query, getDocs, limit } from 'firebase/firestore';
import { db } from '@/lib/firebase';

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
                    setUid(snapshot.docs[0].id);
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
