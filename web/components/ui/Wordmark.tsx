/**
 * The Machina brand lockup — the Citation mark and the drawn MACHINA wordmark.
 *
 * Geometry is ported verbatim from design/icon-concepts (wordmark.svg — stroke
 * 42, tracking 240; the mark from nonletter.py:citation()). Both draw in
 * currentColor so the ink follows the theme: graphite on light, porcelain on
 * dark. The header uses the BARE glyph — a rounded container there reads as a
 * shrunken app icon rather than as the brand mark.
 */

/** The Citation mark, static and locked. Tight viewBox (288 292 448 416): the
 *  ink is 432×400 in a 1024 canvas, so the full artboard would render at ~8px
 *  in a 20px slot and float off any text's centre. */
export function CitationGlyph({ className = '' }: { className?: string }) {
    return (
        <svg
            viewBox="288 292 448 416"
            className={className}
            fill="currentColor"
            role="img"
            aria-label="Machina"
        >
            <path d="M296 300 L396 300 L396 358 L354 358 L354 642 L396 642 L396 700 L296 700 Z" />
            <path d="M728 300 L628 300 L628 358 L670 358 L670 642 L628 642 L628 700 L728 700 Z" />
            <circle cx="512" cy="500" r="52" />
        </svg>
    );
}

/** The drawn MACHINA wordmark (stroke 42, tracking 240). The hairline outline
 *  (+6 units per edge) exists purely for tiny sizes: at the header's ~11px cap
 *  height the baseline row of every letter otherwise antialiases away. At
 *  larger sizes it adds an imperceptible ~0.1px of weight. */
export function Wordmark({ className = '' }: { className?: string }) {
    return (
        <svg
            viewBox="0 -8 3455 438"
            className={className}
            fill="currentColor"
            stroke="currentColor"
            strokeWidth="12"
            role="img"
            aria-label="Machina"
        >
            <path d="M 0.0 422.0 L 0.0 0.0 L 44.2 0.0 L 194.0 322.4 L 343.8 0.0 L 388.0 0.0 L 388.0 422.0 L 346.0 422.0 L 346.0 95.0 L 194.0 422.0 L 42.0 95.0 L 42.0 422.0 Z M 765.3 0.0 L 810.7 0.0 L 661.4 422.0 L 616.0 422.0 Z M 765.3 0.0 L 810.7 0.0 L 960.0 422.0 L 914.6 422.0 Z M 715.1 253.2 L 860.9 253.2 L 875.8 295.2 L 700.2 295.2 Z M 1482.0 385.9 A 186.0 219.0 0 1 1 1482.0 36.1 L 1458.5 70.9 A 144.0 177.0 0 1 0 1458.5 351.1 Z M 1743.0 0.0 L 1785.0 0.0 L 1785.0 422.0 L 1743.0 422.0 Z M 2001.0 0.0 L 2043.0 0.0 L 2043.0 422.0 L 2001.0 422.0 Z M 1785.0 190.0 L 2001.0 190.0 L 2001.0 232.0 L 1785.0 232.0 Z M 2283.0 0.0 L 2325.0 0.0 L 2325.0 422.0 L 2283.0 422.0 Z M 2565.0 0.0 L 2607.0 0.0 L 2607.0 422.0 L 2565.0 422.0 Z M 2841.0 0.0 L 2883.0 0.0 L 2883.0 422.0 L 2841.0 422.0 Z M 2565.0 0.0 L 2615.2 0.0 L 2883.0 422.0 L 2832.8 422.0 Z M 3260.3 0.0 L 3305.7 0.0 L 3156.4 422.0 L 3111.0 422.0 Z M 3260.3 0.0 L 3305.7 0.0 L 3455.0 422.0 L 3409.6 422.0 Z M 3210.1 253.2 L 3355.9 253.2 L 3370.8 295.2 L 3195.2 295.2 Z" />
        </svg>
    );
}
