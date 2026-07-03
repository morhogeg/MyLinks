'use client';

import { useEffect, useRef } from 'react';

/**
 * Scroll-scrubbed header fade — the top bar's opacity is driven continuously
 * by scroll travel (like iOS large titles), not toggled: scrolling down eases
 * it away over ~140px of travel, scrolling up draws it back over ~80px, and
 * your thumb scrubs the fade frame-by-frame in both directions.
 *
 * Feel notes:
 * - A `progress` value (0 = shown, 1 = hidden) accumulates scroll deltas —
 *   downward travel divided over FADE_PX, upward over the shorter RETURN_PX,
 *   so leaving is lazy and returning is eager. Direction changes just reverse
 *   the scrub; there is no state flip to pop.
 * - While the finger (or momentum) is moving, styles are applied directly with
 *   NO transition — the scroll itself is the animation. ~160ms after the last
 *   scroll event, progress settles to the nearest endpoint on the app's
 *   --ease-modal curve, so the bar never parks half-faded.
 * - Near the very top (< 24px) it always returns to fully shown; scrollY is
 *   clamped to the document range so iOS rubber-banding at either end can't
 *   scrub a phantom fade.
 * - Styles are written straight to the element (no React re-render per frame);
 *   listener is passive + rAF-throttled. Reduced motion skips the drift and
 *   keeps the pure fade. pointer-events cut once it's essentially gone.
 *
 * Attach the returned ref to the sticky header. The bar keeps its height, so
 * content never reflows — it just glides underneath.
 */
export function useHeaderFade<T extends HTMLElement>() {
    const ref = useRef<T | null>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const FADE_PX = 140;   // downward travel for a full fade-out
        const RETURN_PX = 80;  // upward travel for a full fade-in
        const DRIFT_PX = 10;   // upward drift at full fade
        const TOP_LOCK = 24;   // always shown this close to the top
        const SETTLE_MS = 160; // idle time before snapping to an endpoint

        const reduced =
            typeof window.matchMedia === 'function' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        let progress = 0;
        let lastY = 0;
        let ticking = false;
        let settleTimer: ReturnType<typeof setTimeout> | undefined;

        const clampY = () => {
            const maxY = Math.max(
                document.documentElement.scrollHeight - window.innerHeight,
                0,
            );
            return Math.min(Math.max(window.scrollY, 0), maxY);
        };

        const apply = (p: number, settle: boolean) => {
            el.style.transition = settle
                ? 'opacity 320ms var(--ease-modal), transform 320ms var(--ease-modal)'
                : 'none';
            el.style.opacity = String(1 - p);
            el.style.transform = reduced ? '' : `translateY(${(-DRIFT_PX * p).toFixed(2)}px)`;
            el.style.pointerEvents = p > 0.9 ? 'none' : '';
        };

        const settle = () => {
            const target = clampY() < TOP_LOCK ? 0 : progress > 0.5 ? 1 : 0;
            if (target !== progress) {
                progress = target;
                apply(progress, true);
            }
        };

        const onScroll = () => {
            if (ticking) return;
            ticking = true;
            requestAnimationFrame(() => {
                ticking = false;
                const y = clampY();
                const dy = y - lastY;
                lastY = y;

                if (y < TOP_LOCK) {
                    progress = 0;
                } else {
                    progress += dy > 0 ? dy / FADE_PX : dy / RETURN_PX;
                    progress = Math.min(Math.max(progress, 0), 1);
                }
                apply(progress, false);

                if (settleTimer) clearTimeout(settleTimer);
                settleTimer = setTimeout(settle, SETTLE_MS);
            });
        };

        lastY = clampY();
        el.style.willChange = 'opacity, transform';
        apply(0, false);

        window.addEventListener('scroll', onScroll, { passive: true });
        return () => {
            window.removeEventListener('scroll', onScroll);
            if (settleTimer) clearTimeout(settleTimer);
            el.style.opacity = '';
            el.style.transform = '';
            el.style.transition = '';
            el.style.pointerEvents = '';
            el.style.willChange = '';
        };
    }, []);

    return ref;
}
