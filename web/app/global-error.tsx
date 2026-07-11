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
                style={{ background: '#0a0a0f', color: '#ededed', margin: 0 }}
            >
                <div className="min-h-screen flex items-center justify-center p-6">
                    <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-card shadow-2xl p-8 text-center">
                        <h1 className="text-xl font-bold text-text">Something went wrong</h1>
                        <p className="mt-2 text-sm text-text-secondary leading-relaxed">
                            Machina hit an unexpected error and couldn&apos;t continue. Reloading usually fixes it.
                        </p>
                        <button
                            onClick={() => (reset ? reset() : window.location.reload())}
                            className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white font-medium hover:bg-accent/90 transition-colors cursor-pointer"
                        >
                            Reload
                        </button>
                    </div>
                </div>
            </body>
        </html>
    );
}
