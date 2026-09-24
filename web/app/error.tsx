'use client';

import { useEffect } from 'react';
import { RefreshCw, Home } from 'lucide-react';

/**
 * Route-level error boundary. Catches an uncaught render error in the page
 * subtree and shows a branded fallback instead of unmounting to Next's
 * unstyled default. "Try again" calls `reset()` (re-renders the segment);
 * if the error persists, "Reload" does a full page reload and "Go home" leaves
 * the broken route (e.g. a bad `?linkId=` deep link) for the library root.
 */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => {
        // Surface for debugging; the branded UI is what the user sees.
        console.error('Render error boundary caught:', error);
        // Report to the self-hosted client_errors log (no-op when signed out).
        // Dynamic (client-only) import keeps Firebase out of any prerender graph.
        import('@/lib/errorReporter').then((m) => m.reportError(error, 'react')).catch(() => {});
    }, [error]);

    return (
        <div className="min-h-screen bg-background text-text flex items-center justify-center p-6">
            <div className="w-full max-w-md rounded-2xl border border-border-subtle bg-card shadow-2xl p-8 text-center">
                <h1 className="text-xl font-bold text-text">Something went wrong</h1>
                <p className="mt-2 text-sm text-text-secondary leading-relaxed">
                    An unexpected error interrupted Machina. Your saved cards are safe. Try again.
                </p>
                <button
                    onClick={() => reset()}
                    className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-accent-ink font-medium hover:bg-accent/90 transition-colors cursor-pointer"
                >
                    <RefreshCw className="w-4 h-4" />
                    Try again
                </button>
                <div className="mt-4 flex items-center justify-center gap-4 text-sm">
                    <button
                        onClick={() => window.location.reload()}
                        className="text-text-secondary hover:text-text transition-colors cursor-pointer"
                    >
                        Reload
                    </button>
                    <span className="text-text-muted" aria-hidden="true">·</span>
                    <button
                        // A hard navigation on purpose: after a crash, start from clean state.
                        // eslint-disable-next-line @next/next/no-location-assign-relative-destination
                        onClick={() => window.location.assign('/')}
                        className="inline-flex items-center gap-1.5 text-text-secondary hover:text-text transition-colors cursor-pointer"
                    >
                        <Home className="w-3.5 h-3.5" />
                        Go home
                    </button>
                </div>
            </div>
        </div>
    );
}
