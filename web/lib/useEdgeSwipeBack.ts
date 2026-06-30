import { useEffect } from 'react';

/**
 * iOS-style "swipe from the left edge to go back" for in-app screens that aren't
 * real browser-history entries — full-screen overlays and modals-as-pages (Ask,
 * Settings, the Add sheet). While `enabled`, it watches passive touch events and
 * fires `onBack` once the user drags from near the left edge rightward past a
 * threshold, so those screens feel like pushed views you can pop.
 *
 * Kept deliberately simple: a flick past the threshold triggers, with no
 * interactive drag-follow. Horizontal travel must dominate vertical so it never
 * competes with scrolling.
 */
export function useEdgeSwipeBack(onBack: () => void, enabled = true) {
    useEffect(() => {
        if (!enabled || typeof document === 'undefined') return;

        const EDGE = 28;   // start zone: px from the left edge
        const DIST = 70;   // horizontal travel needed to trigger (px)

        let tracking = false;
        let startX = 0;
        let startY = 0;

        const onStart = (e: TouchEvent) => {
            if (e.touches.length !== 1) { tracking = false; return; }
            const t = e.touches[0];
            tracking = t.clientX <= EDGE;
            startX = t.clientX;
            startY = t.clientY;
        };
        const onMove = (e: TouchEvent) => {
            if (!tracking) return;
            const t = e.touches[0];
            const dx = t.clientX - startX;
            const dy = t.clientY - startY;
            // Bail if the gesture reverses or turns mostly vertical (a scroll).
            if (dx < 0 || Math.abs(dy) > Math.abs(dx)) { tracking = false; return; }
            if (dx > DIST) {
                tracking = false;
                onBack();
            }
        };
        const stop = () => { tracking = false; };

        document.addEventListener('touchstart', onStart, { passive: true });
        document.addEventListener('touchmove', onMove, { passive: true });
        document.addEventListener('touchend', stop, { passive: true });
        document.addEventListener('touchcancel', stop, { passive: true });
        return () => {
            document.removeEventListener('touchstart', onStart);
            document.removeEventListener('touchmove', onMove);
            document.removeEventListener('touchend', stop);
            document.removeEventListener('touchcancel', stop);
        };
    }, [onBack, enabled]);
}
