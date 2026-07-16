'use client';

import { useEffect, useRef } from 'react';

/**
 * Infinite-scroll trigger for the windowed feed (report 3.15).
 *
 * An invisible sentinel div sits after the card grid; when it scrolls into view
 * (with a generous rootMargin so the next page loads just before the user hits
 * the bottom) it calls `onLoadMore`, which grows the useLinks subscription
 * window. A visible, theme-tokened "Load more" button is offered alongside as a
 * fallback for the case where the IntersectionObserver misses (e.g. a
 * programmatic jump, or a browser that never fires it). Renders nothing once
 * there is nothing more to load.
 */
export default function LoadMoreSentinel({
    hasMore,
    onLoadMore,
}: {
    hasMore: boolean;
    onLoadMore: () => void;
}) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!hasMore) return;
        const el = ref.current;
        if (!el || typeof IntersectionObserver === 'undefined') return;
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) onLoadMore();
            },
            { rootMargin: '600px 0px' },
        );
        observer.observe(el);
        return () => observer.disconnect();
        // onLoadMore is a stable useCallback in useLinks, so this observer is
        // created once per hasMore transition.
    }, [hasMore, onLoadMore]);

    if (!hasMore) return null;

    return (
        <div className="flex flex-col items-center gap-2 py-6">
            <div ref={ref} aria-hidden className="h-px w-full" />
            <button
                onClick={onLoadMore}
                className="inline-flex items-center gap-2 px-4 h-10 rounded-full bg-card border border-border-subtle text-text-secondary text-sm font-semibold hover:bg-card-hover hover:text-text transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
            >
                Load more
            </button>
        </div>
    );
}
