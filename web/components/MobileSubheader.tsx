'use client';

import React from 'react';
import { ChevronLeft } from 'lucide-react';

/**
 * The shared mobile top bar — the exact header treatment the user loves from the
 * "Ask Machina" page, lifted into one reusable component so every sub-view
 * (Ask, Collections, scoped collection, …) gets the identical look.
 *
 * It is a full-width bar that pads itself down past the status bar / notch via
 * `paddingTop: env(safe-area-inset-top)` with `box-sizing: content-box`, so it
 * works even inside a `position:fixed` overlay (which ignores the body's
 * safe-area padding — see the documented iOS gotcha). Contains a round ghost
 * back chevron (RTL-aware), an optional leading icon, a bold title, and an
 * optional trailing action slot.
 */

interface MobileSubheaderProps {
    onBack: () => void;
    /** Optional leading icon shown before the title (e.g. <Layers /> chat icon). */
    icon?: React.ReactNode;
    title: string;
    backLabel?: string;
    /** Optional leading control rendered between the back button and the title
     *  (e.g. the Ask page's chat-history button). */
    leading?: React.ReactNode;
    /** Optional trailing action(s), pinned to the end of the bar (e.g. "+", "New"). */
    children?: React.ReactNode;
    className?: string;
}

export default function MobileSubheader({
    onBack,
    icon,
    title,
    backLabel = 'Back',
    leading,
    children,
    className = '',
}: MobileSubheaderProps) {
    return (
        <div
            className={`flex items-center gap-1 px-2 h-12 shrink-0 border-b border-border-subtle ${className}`}
            // Pad below the notch even inside fixed overlays. content-box keeps the
            // h-12 bar height intact while adding the inset on top.
            style={{ paddingTop: 'env(safe-area-inset-top)', boxSizing: 'content-box' }}
        >
            <button
                onClick={onBack}
                aria-label={backLabel}
                className="p-2 -ms-1 rounded-full text-text-secondary hover:text-text active:bg-card-hover transition-colors cursor-pointer"
            >
                {/* ChevronLeft is mirrored by the document's `dir` in RTL via the
                    browser; the -ms-1 nudge keeps it flush at the start edge. */}
                <ChevronLeft className="w-5 h-5 rtl:rotate-180" />
            </button>

            {leading}

            {icon && (
                <span className="flex items-center text-accent shrink-0">{icon}</span>
            )}

            <span className="font-semibold text-text truncate">{title}</span>

            {children && <div className="ms-auto flex items-center gap-1">{children}</div>}
        </div>
    );
}
