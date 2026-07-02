import { useEffect, useRef, useState } from 'react';
import { hapticLight } from '@/lib/haptics';

interface PullToRefreshOptions {
    /** Called when the user pulls past the threshold and releases. May be async;
     *  the spinner stays until the returned promise settles. */
    onRefresh: () => Promise<void> | void;
    /** Turn the gesture off (e.g. while a modal/overlay owns the screen). */
    enabled?: boolean;
    /** Pull distance (px, after damping) that arms + fires a refresh. */
    threshold?: number;
}

interface PullToRefreshState {
    /** Current indicator offset in px (damped finger travel, or the held
     *  spinner position while refreshing). Drive a top spinner's transform. */
    pull: number;
    /** True from trigger until onRefresh settles — spin the indicator. */
    refreshing: boolean;
    /** True once the pull has crossed the threshold (release will fire). */
    armed: boolean;
    /** False mid-drag (follow the finger 1:1) and true on release (ease back). */
    animating: boolean;
}

const MAX_PULL = 120; // hard cap on visual travel so a hard yank can't fling it far

/**
 * Standard iOS pull-to-refresh for a window-scrolled page (M16).
 *
 * Only engages when the page is already scrolled to the very top and the drag is
 * clearly vertical + downward, so it never competes with the left-edge
 * swipe-back (`useEdgeSwipeBack`, horizontal from the edge) or the list rows'
 * horizontal swipe actions. Listeners are passive — we never hijack scrolling,
 * we just track the over-pull past the top and overlay a spinner. Crossing the
 * threshold fires a light haptic; releasing past it runs `onRefresh`.
 */
export function usePullToRefresh({ onRefresh, enabled = true, threshold = 72 }: PullToRefreshOptions): PullToRefreshState {
    const [pull, setPull] = useState(0);
    const [refreshing, setRefreshing] = useState(false);
    const [animating, setAnimating] = useState(false);

    // Keep the latest onRefresh without re-binding listeners every render.
    const onRefreshRef = useRef(onRefresh);
    onRefreshRef.current = onRefresh;
    const refreshingRef = useRef(false);

    useEffect(() => {
        if (!enabled || typeof window === 'undefined') return;

        let tracking = false;
        let armed = false;
        let startX = 0;
        let startY = 0;
        let current = 0;

        const atTop = () => (window.scrollY || document.documentElement.scrollTop || 0) <= 0;

        const onStart = (e: TouchEvent) => {
            if (refreshingRef.current || e.touches.length !== 1 || !atTop()) { tracking = false; return; }
            tracking = true;
            armed = false;
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
            current = 0;
        };

        const onMove = (e: TouchEvent) => {
            if (!tracking) return;
            const dx = e.touches[0].clientX - startX;
            const dy = e.touches[0].clientY - startY;
            // Bail the moment the gesture turns upward, mostly-horizontal, or the
            // page has scrolled — leaving scroll + row/edge swipes untouched.
            if (dy <= 0 || Math.abs(dx) > Math.abs(dy) || !atTop()) {
                if (current !== 0) { current = 0; setPull(0); }
                tracking = false;
                return;
            }
            // Rubber-band damping: the further you pull, the more resistance.
            current = Math.min(MAX_PULL, dy * 0.5);
            setAnimating(false);
            setPull(current);
            if (!armed && current >= threshold) {
                armed = true;
                hapticLight(); // crossed the trigger point — a crisp confirming tap
            } else if (armed && current < threshold) {
                armed = false;
            }
        };

        const onEnd = async () => {
            if (!tracking) return;
            tracking = false;
            setAnimating(true);
            if (armed && !refreshingRef.current) {
                refreshingRef.current = true;
                setRefreshing(true);
                setPull(threshold); // hold the spinner at the threshold while working
                try {
                    await onRefreshRef.current();
                } catch {
                    // A failed refresh shouldn't strand the spinner.
                } finally {
                    refreshingRef.current = false;
                    setRefreshing(false);
                    setPull(0);
                }
            } else {
                setPull(0);
            }
            armed = false;
            current = 0;
        };

        window.addEventListener('touchstart', onStart, { passive: true });
        window.addEventListener('touchmove', onMove, { passive: true });
        window.addEventListener('touchend', onEnd, { passive: true });
        window.addEventListener('touchcancel', onEnd, { passive: true });
        return () => {
            window.removeEventListener('touchstart', onStart);
            window.removeEventListener('touchmove', onMove);
            window.removeEventListener('touchend', onEnd);
            window.removeEventListener('touchcancel', onEnd);
        };
    }, [enabled, threshold]);

    return { pull, refreshing, armed: pull >= threshold, animating };
}
