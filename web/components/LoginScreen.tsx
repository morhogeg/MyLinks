'use client';

import { useState } from 'react';

/**
 * Branded sign-in gate (web). Shown when no user is signed in, and — in the
 * `restricted` variant — when a signed-in Google account isn't linked to any
 * data (a non-owner). See AUTH_SPEC.md.
 */
export default function LoginScreen({
    onSignIn,
    onSignOut,
    restricted = false,
    email,
    showApple = true,
}: {
    onSignIn: (provider: 'google' | 'apple') => Promise<void>;
    onSignOut?: () => void;
    restricted?: boolean;
    email?: string | null;
    /** Show "Continue with Apple". Hidden pre-cutover when the Apple provider
        may not be configured yet. */
    showApple?: boolean;
}) {
    const [busy, setBusy] = useState<null | 'google' | 'apple'>(null);
    const [error, setError] = useState<string | null>(null);

    const handleSignIn = async (provider: 'google' | 'apple') => {
        setBusy(provider);
        setError(null);
        try {
            await onSignIn(provider);
            // On the popup path the auth listener takes over from here. On the
            // redirect path the browser navigates away before this resolves.
        } catch {
            setError('Sign-in failed. Please try again.');
            setBusy(null);
        }
    };

    return (
        <div className="min-h-screen bg-background text-text flex items-center justify-center px-6">
            <div className="w-full max-w-sm flex flex-col items-center text-center">
                {/* Brand mark */}
                <div className="w-16 h-16 rounded-3xl overflow-hidden shadow-lg shadow-purple-500/20 ring-1 ring-white/15">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/app-icon.png" alt="Machina" className="w-full h-full object-cover" />
                </div>
                <h1 className="mt-6 text-2xl font-extrabold tracking-tight bg-[image:var(--accent-gradient)] bg-clip-text text-transparent">
                    Machina AI
                </h1>
                <p className="mt-1.5 text-[13px] font-medium text-text-muted tracking-wide">
                    Capture. Connect. Recall.
                </p>

                {restricted ? (
                    <>
                        <p className="mt-8 text-sm text-text-secondary">
                            {email ? <span className="font-semibold">{email}</span> : 'This account'}{' '}
                            isn&apos;t linked to a workspace.
                        </p>
                        <p className="mt-1 text-[13px] text-text-muted">
                            Sign in with the owner account to continue.
                        </p>
                        {onSignOut && (
                            <button
                                onClick={onSignOut}
                                className="mt-6 inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold border border-border-subtle text-text hover:bg-surface transition-colors"
                            >
                                Sign out
                            </button>
                        )}
                    </>
                ) : (
                    <>
                        <p className="mt-8 text-sm text-text-secondary">
                            Sign in to access your second brain.
                        </p>
                        {showApple && (
                            <button
                                onClick={() => handleSignIn('apple')}
                                disabled={busy !== null}
                                className="mt-5 w-full inline-flex items-center justify-center gap-2.5 rounded-full bg-black text-white px-5 py-3 text-sm font-semibold shadow-sm ring-1 ring-white/10 hover:bg-gray-900 disabled:opacity-60 transition-colors"
                            >
                                <AppleGlyph />
                                {busy === 'apple' ? 'Signing in…' : 'Continue with Apple'}
                            </button>
                        )}
                        <button
                            onClick={() => handleSignIn('google')}
                            disabled={busy !== null}
                            className={`${showApple ? 'mt-3' : 'mt-5'} w-full inline-flex items-center justify-center gap-3 rounded-full bg-white text-gray-800 px-5 py-3 text-sm font-semibold shadow-sm ring-1 ring-black/5 hover:bg-gray-50 disabled:opacity-60 transition-colors`}
                        >
                            <GoogleGlyph />
                            {busy === 'google' ? 'Signing in…' : 'Continue with Google'}
                        </button>
                        {error && <p className="mt-3 text-[13px] text-red-500">{error}</p>}
                    </>
                )}
            </div>
        </div>
    );
}

function AppleGlyph() {
    return (
        <svg className="w-[17px] h-[17px]" viewBox="0 0 384 512" fill="currentColor" aria-hidden="true">
            <path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z"/>
        </svg>
    );
}

function GoogleGlyph() {
    return (
        <svg className="w-[18px] h-[18px]" viewBox="0 0 18 18" aria-hidden="true">
            <path
                fill="#4285F4"
                d="M17.64 9.205c0-.639-.057-1.252-.164-1.841H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
            />
            <path
                fill="#34A853"
                d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
            />
            <path
                fill="#FBBC05"
                d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.997 8.997 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
            />
            <path
                fill="#EA4335"
                d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
            />
        </svg>
    );
}
