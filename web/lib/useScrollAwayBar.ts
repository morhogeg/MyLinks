'use client';

import { useEffect, useRef, useState } from 'react';

/**
 * LinkedIn-style scroll-away state for the bottom tab bar, shared so the bar
 * AND the full-screen tab overlays can react together (the bar slides down; the
 * overlays grow to reclaim the freed space — matching how the Home feed uses it).
 *
 * Works across scrollers: the Home feed scrolls the window while the Collections
 * / Digest overlays scroll their own inner containers. Scroll doesn't bubble, so
 * we listen on `document` in the CAPTURE phase (which still sees every scroller)
 * and read the position off whichever element fired. `resetKey` (the view) flips
 * it back to shown on a tab change so a newly opened screen never starts tucked.
 */
export function useScrollAwayBar(resetKey: unknown): boolean {
    const [hidden, setHidden] = useState(false);
    const lastY = useRef(0);
    const lastTarget = useRef<EventTarget | null>(null);

    useEffect(() => { setHidden(false); lastTarget.current = null; }, [resetKey]);

    useEffect(() => {
        const TOP_LOCK = 40;
        const DELTA = 6;
        const onScroll = (e: Event) => {
            const t = e.target;
            const isDoc = t === document || t === document.documentElement || t === document.body;
            const el = isDoc ? null : (t as HTMLElement);
            const y = el ? el.scrollTop : window.scrollY;
            if (t !== lastTarget.current) { lastTarget.current = t; lastY.current = y; return; }
            const dy = y - lastY.current;
            lastY.current = y;
            if (y < TOP_LOCK) setHidden(false);
            else if (dy > DELTA) setHidden(true);
            else if (dy < -DELTA) setHidden(false);
        };
        document.addEventListener('scroll', onScroll, { capture: true, passive: true });
        return () => document.removeEventListener('scroll', onScroll, { capture: true } as EventListenerOptions);
    }, []);

    return hidden;
}
