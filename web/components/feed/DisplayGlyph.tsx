'use client';

import { SlidersHorizontal } from 'lucide-react';

/**
 * Header glyph that opens the Display sheet (view / sort / filter).
 *
 * Extracted from page.tsx so its active state is renderable in isolation —
 * the state is the whole point of the component and it was previously inline
 * JSX that no harness could reach.
 *
 * ACTIVE FILTERS tint it and hang a count on it; SORT deliberately does not.
 * The line is destructive vs non-destructive: a filter hides cards, and content
 * that silently isn't there reads as a bug rather than a setting — which is why
 * Mail fills its funnel and names the active filter. Sort only reorders, is
 * visible in the feed the moment you look at it, and stays a checkmark inside
 * the sheet, the way Files, Notes, Photos and Reminders all handle it.
 */
export default function DisplayGlyph({
    activeFilterCount,
    onClick,
}: {
    /** Number of filters currently applied. 0 renders the plain, quiet state. */
    activeFilterCount: number;
    onClick: () => void;
}) {
    const active = activeFilterCount > 0;
    return (
        <button
            data-tour="views"
            onClick={onClick}
            aria-label={active
                ? `View, sort, and filter options — ${activeFilterCount} ${activeFilterCount === 1 ? 'filter' : 'filters'} active`
                : 'View, sort, and filter options'}
            // Active goes to FULL-strength text, not `text-accent`: in this theme
            // --accent is a neutral emphasis token (#E9E9F2 dark / near-black
            // light), so tinting with it is invisible next to text-secondary.
            // The badge is what actually carries the state — the tint just
            // stops the glyph reading as muted while filters are on.
            className={`relative h-10 w-10 flex items-center justify-center transition-colors ${active
                ? 'text-text'
                : 'text-text-secondary hover:text-text active:text-text'}`}
        >
            <SlidersHorizontal className="w-[19px] h-[19px]" />
            {active && (
                // aria-hidden: the count is already in the button's label, and
                // a screen reader announcing a bare "3" after it would be noise.
                <span
                    aria-hidden
                    // Pinned to the button's corner, inside its padding, so it
                    // clips the glyph only at the very edge the way an iOS badge
                    // does — at top-1/right-1 it sat squarely on the sliders.
                    className="absolute top-0 right-0 min-w-[14px] h-[14px] px-1 rounded-full bg-accent text-accent-ink text-[9px] font-bold leading-[14px] text-center"
                >
                    {activeFilterCount > 9 ? '9+' : activeFilterCount}
                </span>
            )}
        </button>
    );
}
