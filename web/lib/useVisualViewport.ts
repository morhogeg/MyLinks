import { useState, useEffect } from 'react';

/**
 * Tracks the *visual* viewport (height + top offset) so an overlay can sit
 * centered in the space that isn't covered by the on-screen keyboard. When a
 * focused input pops the keyboard, `visualViewport.height` shrinks to the
 * visible area; centering against it keeps a dialog comfortably above the keys
 * instead of being pinned to the top of the screen. Falls back to the layout
 * viewport where `visualViewport` is unavailable.
 */
export function useVisualViewport() {
    const [vp, setVp] = useState<{ height: number; offsetTop: number }>(
        { height: 0, offsetTop: 0 },
    );

    useEffect(() => {
        const vv = window.visualViewport;
        const sync = () => {
            setVp({
                height: vv ? vv.height : window.innerHeight,
                offsetTop: vv ? vv.offsetTop : 0,
            });
        };
        sync();
        vv?.addEventListener('resize', sync);
        vv?.addEventListener('scroll', sync);
        window.addEventListener('resize', sync);
        window.addEventListener('orientationchange', sync);
        return () => {
            vv?.removeEventListener('resize', sync);
            vv?.removeEventListener('scroll', sync);
            window.removeEventListener('resize', sync);
            window.removeEventListener('orientationchange', sync);
        };
    }, []);

    return vp;
}
