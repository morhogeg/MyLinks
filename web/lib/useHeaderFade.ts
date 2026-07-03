'use client';

import { useEffect, useState } from 'react';

/**
 * Direction-aware header visibility for the sticky top bar: scrolling down
 * fades it out, any deliberate upward scroll brings it back — the standard
 * iOS large-title/toolbar behavior.
 *
 * Tuned for feel, not just function:
 * - Hysteresis: ~24px of accumulated downward travel hides it (a lazy thumb
 *   drag doesn't), while ~8px upward shows it (returning must feel instant).
 * - The accumulator resets on direction change, so jittery finger reversals
 *   never fight the animation.
 * - Always visible near the top (< 32px), and scrollY is clamped to the
 *   document range so iOS rubber-banding (negative / past-end overscroll)
 *   can't trigger a phantom hide at either extreme.
 * - rAF-throttled passive listener; state only changes on real transitions,
 *   so scrolling never causes re-render churn.
 *
 * The caller animates opacity/transform only — the header stays sticky and
 * keeps its height, so content never reflows.
 */
export function useHeaderFade(): boolean {
    const [visible, setVisible] = useState(true);

    useEffect(() => {
        let lastY = window.scrollY;
        let acc = 0;
        let shown = true;
        let ticking = false;

        const set = (v: boolean) => {
            if (v !== shown) {
                shown = v;
                setVisible(v);
            }
        };

        const onScroll = () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                ticking = false;
                const maxY = Math.max(
                    document.documentElement.scrollHeight - window.innerHeight,
                    0,
                );
                const y = Math.min(Math.max(window.scrollY, 0), maxY);
                const dy = y - lastY;
                lastY = y;

                if (y < 32) {
                    acc = 0;
                    set(true);
                    return;
                }
                if ((dy > 0 && acc < 0) || (dy < 0 && acc > 0)) acc = 0;
                acc += dy;
                if (acc > 24) set(false);
                else if (acc < -8) set(true);
            });
        };

        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    return visible;
}
