import { useEffect } from 'react';

/**
 * True when the gesture starts inside a region that owns its own horizontal
 * gesture — a horizontally scrollable container (e.g. the LinkDetailModal action
 * toolbar) or an element that opts out of native panning via `touch-action`
 * (`none`/`pan-y`, e.g. a swipeable deck card). Walking a short ancestor chain on
 * touchstart is cheap and keeps the global edge-swipe from hijacking those.
 * Opt out explicitly with a `data-no-edge-swipe` attribute.
 */
function startsInHorizontalGestureRegion(target: EventTarget | null): boolean {
    let el = target instanceof Element ? target : null;
    while (el && el !== document.body) {
        if (el instanceof HTMLElement) {
            if ('noEdgeSwipe' in el.dataset) return true;
            const cs = getComputedStyle(el);
            if (
                (cs.overflowX === 'auto' || cs.overflowX === 'scroll') &&
                el.scrollWidth > el.clientWidth + 1
            ) {
                return true;
            }
            if (cs.touchAction === 'none' || cs.touchAction === 'pan-y') return true;
        }
        el = el.parentElement;
    }
    return false;
}

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
            if (t.clientX > EDGE) { tracking = false; return; }
            // Don't hijack a gesture that belongs to a horizontally scrollable or
            // gesture-locked region under the finger (toolbar scroll, deck swipe).
            if (startsInHorizontalGestureRegion(e.target)) { tracking = false; return; }
            tracking = true;
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
