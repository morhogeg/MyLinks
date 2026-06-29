'use client';

import { useState } from 'react';
import { Brain, Loader2 } from 'lucide-react';
import { signInWithGoogle, signInWithApple } from '@/lib/firebase';

/**
 * Login screen shown by AuthProvider when real auth is enforced
 * (NEXT_PUBLIC_REQUIRE_AUTH=true) and no user is signed in.
 */
export default function SignIn() {
    const [busy, setBusy] = useState<null | 'google' | 'apple'>(null);
    const [error, setError] = useState<string | null>(null);

    async function run(provider: 'google' | 'apple', fn: () => Promise<void>) {
        setError(null);
        setBusy(provider);
        try {
            await fn();
            // onAuthStateChanged in AuthProvider takes over from here.
        } catch (e) {
            console.error('Sign-in failed', e);
            setError('Sign-in failed. Please try again.');
            setBusy(null);
        }
    }

    return (
        <div className="fixed inset-0 flex items-center justify-center p-6 bg-background">
            <div className="w-full max-w-sm bg-card rounded-2xl border border-white/5 shadow-2xl p-8 text-center">
                <div className="mx-auto mb-5 w-14 h-14 rounded-2xl bg-purple-500/10 text-purple-400 flex items-center justify-center">
                    <Brain className="w-8 h-8" />
                </div>
                <h1 className="text-2xl font-bold text-white">Second Brain</h1>
                <p className="mt-2 text-sm text-text-secondary">
                    Sign in to access your saved links and chats.
                </p>

                <div className="mt-8 flex flex-col gap-3">
                    <button
                        onClick={() => run('google', signInWithGoogle)}
                        disabled={busy !== null}
                        className="w-full px-4 py-3 rounded-xl bg-white text-black font-medium hover:bg-gray-200 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                        {busy === 'google' ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                        Continue with Google
                    </button>
                    <button
                        onClick={() => run('apple', signInWithApple)}
                        disabled={busy !== null}
                        className="w-full px-4 py-3 rounded-xl bg-white/5 text-text font-medium hover:bg-white/10 transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                    >
                        {busy === 'apple' ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                        Continue with Apple
                    </button>
                </div>

                {error ? (
                    <p className="mt-4 text-sm text-red-400">{error}</p>
                ) : null}
            </div>
        </div>
    );
}
