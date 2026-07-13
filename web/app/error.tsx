'use client';

import { useEffect } from 'react';
import { RefreshCw } from 'lucide-react';

/**
 * Route-level error boundary. Catches an uncaught render error in the page
 * subtree and shows a branded fallback instead of unmounting to Next's
 * unstyled default. `reset()` re-renders the segment; a full reload is the
 * fallback if the error persists.
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
                    An unexpected error interrupted Machina. Your saved cards are safe — try again.
                </p>
                <button
                    onClick={() => reset()}
                    className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-accent text-white font-medium hover:bg-accent/90 transition-colors cursor-pointer"
                >
                    <RefreshCw className="w-4 h-4" />
                    Reload
                </button>
            </div>
        </div>
    );
}
