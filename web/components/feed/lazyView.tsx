'use client';

import { useEffect, useState, type ComponentType } from 'react';

/**
 * A view whose code loads on first use instead of with the app (launch audit
 * OWN-9). Not next/dynamic: that is React.lazy underneath, which remembers a
 * failed load for the life of the page, so opening the view offline on the
 * web left the error screen up until a full reload. Here a failed load shows
 * a retry state and loads by itself when the connection comes back (a chunk
 * that failed offline loads fine on the next import, verified against a
 * production build). In the iOS app the code ships in the bundle, so this
 * only ever fails on the web.
 *
 * `preload` fetches the code ahead of use and shares the load in flight.
 */
export function lazyView<P extends object>(load: () => Promise<{ default: ComponentType<P> }>) {
    let loaded: ComponentType<P> | null = null;
    let inflight: Promise<ComponentType<P>> | null = null;
    const preload = (): Promise<ComponentType<P>> => {
        if (loaded) return Promise.resolve(loaded);
        inflight ??= load().then(
            (m) => (loaded = m.default),
            (err: unknown) => {
                inflight = null;
                throw err;
            },
        );
        return inflight;
    };

    function LazyView(props: P) {
        const [View, setView] = useState<ComponentType<P> | null>(() => loaded);
        const [failed, setFailed] = useState(false);
        useEffect(() => {
            if (View || failed) return;
            let live = true;
            preload().then(
                (v) => { if (live) setView(() => v); },
                () => { if (live) setFailed(true); },
            );
            return () => { live = false; };
        }, [View, failed]);
        useEffect(() => {
            if (!failed) return;
            const retry = () => setFailed(false);
            window.addEventListener('online', retry);
            return () => window.removeEventListener('online', retry);
        }, [failed]);
        if (View) return <View {...props} />;
        if (failed) return <LazyViewFailed onRetry={() => setFailed(false)} />;
        return <LazyViewPlaceholder />;
    }

    return Object.assign(LazyView, { preload });
}

function LazyViewPlaceholder() {
    return <div className="min-h-[60vh]" aria-busy="true" />;
}

function LazyViewFailed({ onRetry }: { onRetry: () => void }) {
    // Offline it can only wait for the connection (the 'online' listener
    // retries). Online, a load that failed after the runtime's own retry is
    // most likely code a newer deploy replaced, which only a reload fetches.
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    return (
        <div role="alert" className="min-h-[60vh] flex flex-col items-center justify-center gap-3 px-6 text-center">
            <p className="text-base font-semibold text-text">This view didn&apos;t load</p>
            <p className="text-sm text-text-secondary">
                {offline ? "You're offline. It opens once you're back online." : 'Reload Machina to open it.'}
            </p>
            <button
                type="button"
                onClick={offline ? onRetry : () => window.location.reload()}
                className="mt-1 min-h-[44px] px-5 rounded-xl border border-border-subtle bg-card text-sm font-medium text-text hover:border-accent/40 transition-colors cursor-pointer"
            >
                {offline ? 'Try again' : 'Reload'}
            </button>
        </div>
    );
}
