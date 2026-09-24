'use client';

import { useEffect } from 'react';

/**
 * Root error boundary. Unlike app/error.tsx, this catches errors thrown in the
 * root layout itself, so it must render its own <html>/<body> (it replaces the
 * layout entirely). We keep the theme-token classes for parity with the rest of
 * the app, plus an inline fallback background so it never renders unstyled even
 * if globals.css hasn't loaded at the moment of the crash.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => {
        console.error('Root error boundary caught:', error);
        // Best-effort report; a no-op if no workspace uid is resolvable here.
        // Imported dynamically (client-only) so Firebase is never pulled into
        // this root page's static-export prerender graph.
        import('@/lib/errorReporter').then((m) => m.reportError(error, 'react')).catch(() => {});
    }, [error]);

    return (
        <html lang="en">
            <body
                className="bg-background text-text"
                style={{ background: 'var(--background, #0a0a0f)', color: 'var(--text, #ededed)', margin: 0 }}
            >
                <div className="min-h-screen flex items-center justify-center p-6">
                    <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-card shadow-2xl p-8 text-center">
                        <h1 className="text-xl font-bold text-text">Something went wrong</h1>
                        <p className="mt-2 text-sm text-text-secondary leading-relaxed">
                            Machina hit an unexpected error and couldn&apos;t continue. Reloading usually fixes it.
                        </p>
                        {/* A root-layout crash rarely clears on reset(), so the
                            primary action is a real reload; "Go home" escapes a
                            bad deep link. */}
                        <button
                            onClick={() => window.location.reload()}
                            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-accent-ink font-medium hover:bg-accent/90 transition-colors cursor-pointer"
                        >
                            Reload
                        </button>
                        <div className="mt-4 flex items-center justify-center gap-4 text-sm">
                            <button
                                onClick={() => reset()}
                                className="text-text-secondary hover:text-text transition-colors cursor-pointer"
                            >
                                Try again
                            </button>
                            <span className="text-text-muted" aria-hidden="true">·</span>
                            <button
                                // A hard navigation on purpose: after a crash, start from clean state.
                                // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                                onClick={() => window.location.assign('/')}
                                className="text-text-secondary hover:text-text transition-colors cursor-pointer"
                            >
                                Go home
                            </button>
                        </div>
                    </div>
                </div>
            </body>
        </html>
    );
}
