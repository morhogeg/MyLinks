/**
 * The shared "working" mark — a small spinning gradient ring (see the
 * `.working-ring` class in globals.css). Shown wherever Machina is mid-task: the
 * Ask thinking row, the active save step, and the persistent AnalyzingBanner.
 *
 * Purely decorative, so `aria-hidden` — the surrounding status copy carries the
 * meaning for screen readers. Colour comes from `--accent`, so it recolors in
 * light/dark automatically; the caller sets the pixel size.
 */
export function WorkingRing({ size = 18, className = '' }: { size?: number; className?: string }) {
    return (
        <span
            aria-hidden
            className={`working-ring inline-block shrink-0 ${className}`}
            style={{ width: size, height: size }}
        />
    );
}

export default WorkingRing;
