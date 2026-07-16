'use client';

import { useEffect, useRef, useState } from 'react';
import { hapticLight } from '@/lib/haptics';

/**
 * Drag-to-dismiss for bottom sheets — the iOS-standard "grab the handle and
 * flick down to close" gesture that pairs with the visible grab handle every
 * sheet already draws. The gesture routes dismissal through the SAME `onClose`
 * the X button uses, so any dirty-guard / confirm dialog a parent wraps around
 * `onClose` keeps gating the close exactly as before.
 *
 * Wiring (see the sheets for live examples):
 *   const drag = useSheetDrag({ onClose, enabled: isMobile });
 *   <div ref={drag.scrimRef} className="…backdrop" onClick={onClose} />
 *   <div ref={drag.sheetRef} className="…sheet animate-slide-up">
 *     <div {...drag.handleProps}>…grab handle + header…</div>
 *     …scrollable body…
 *   </div>
 *
 * Design notes:
 * - The gesture attaches ONLY to the handle/header zone (`handleProps`), never
 *   the scrollable body, so dragging never fights an inner scroll list. Pressing
 *   a button/input inside that zone does not start a drag.
 * - The sheet is translated by writing `transform` straight to the DOM node
 *   during the gesture (no per-frame React render), so it tracks the finger 1:1.
 * - Release past ~28% of the sheet height, or on a downward flick, animates the
 *   sheet out with `--ease-modal` and calls `onClose`; otherwise it springs back.
 * - `touch-action: none` on the handle stops the page from scrolling / pull-to-
 *   refreshing mid-gesture. Purely vertical, so RTL is unaffected.
 * - `enabled` gates the whole thing: pass the same mobile/media check a sheet
 *   uses to render as a bottom sheet, so desktop centered modals get no drag.
 */

interface UseSheetDragOptions {
    /** The dismiss handler — the exact one the X button calls. */
    onClose: () => void;
    /** Turn the gesture on/off (default true). Pass `isMobile` for sheets that become centered modals on desktop. */
    enabled?: boolean;
    /** Fraction of the sheet's height past which release dismisses (default 0.28). */
    threshold?: number;
}

interface SheetDragHandleProps {
    onPointerDown: (e: React.PointerEvent) => void;
    onPointerMove: (e: React.PointerEvent) => void;
    onPointerUp: (e: React.PointerEvent) => void;
    onPointerCancel: (e: React.PointerEvent) => void;
    style?: React.CSSProperties;
}

const DISMISS_MS = 260;
const FLICK_VELOCITY = 0.5; // px per ms (~500 px/s) downward flick

export function useSheetDrag({ onClose, enabled = true, threshold = 0.28 }: UseSheetDragOptions) {
    const sheetRef = useRef<HTMLDivElement | null>(null);
    const scrimRef = useRef<HTMLDivElement | null>(null);

    // Latest props, read inside the pointer handlers without re-binding them.
    // Synced in an effect (never during render) so the handlers, which only run
    // on user interaction well after commit, always see current values.
    const onCloseRef = useRef(onClose);
    const enabledRef = useRef(enabled);
    const thresholdRef = useRef(threshold);
    useEffect(() => {
        onCloseRef.current = onClose;
        enabledRef.current = enabled;
        thresholdRef.current = threshold;
    });

    // Live gesture state (refs — the drag must not trigger React renders).
    const dragging = useRef(false);
    const startY = useRef(0);
    const lastY = useRef(0);
    const lastT = useRef(0);
    const velocity = useRef(0);
    const willDismiss = useRef(false);
    const activePointer = useRef<number | null>(null);

    const setTransform = (y: number) => {
        const sheet = sheetRef.current;
        if (sheet) sheet.style.transform = y ? `translateY(${y}px)` : '';
    };

    const setScrim = (opacity: number | null) => {
        const scrim = scrimRef.current;
        if (scrim) scrim.style.opacity = opacity === null ? '' : String(opacity);
    };

    const endGesture = (dismiss: boolean) => {
        const sheet = sheetRef.current;
        dragging.current = false;
        activePointer.current = null;
        if (!sheet) return;
        sheet.style.transition = `transform ${DISMISS_MS}ms var(--ease-modal), opacity ${DISMISS_MS}ms var(--ease-modal)`;
        if (scrimRef.current) scrimRef.current.style.transition = `opacity ${DISMISS_MS}ms var(--ease-modal)`;
        if (dismiss) {
            hapticLight(); // native-only crisp tap as the sheet lets go
            const h = sheet.offsetHeight || window.innerHeight;
            setTransform(h);
            setScrim(0);
            window.setTimeout(() => {
                onCloseRef.current();
                // If a parent's dirty-guard cancelled the close, the sheet is
                // still mounted — un-stick it so it isn't parked off-screen.
                const s = sheetRef.current;
                if (s) {
                    s.style.transition = 'none';
                    s.style.transform = '';
                }
                setScrim(null);
            }, DISMISS_MS);
        } else {
            setTransform(0);
            setScrim(1);
        }
    };

    const handleProps: SheetDragHandleProps = {
        onPointerDown: (e) => {
            if (!enabledRef.current || dragging.current) return;
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            // Never hijack a tap on an interactive control in the header.
            const target = e.target as HTMLElement;
            if (target.closest('button, a, input, select, textarea, [role="button"], [role="menuitem"]')) return;
            const sheet = sheetRef.current;
            if (!sheet) return;
            dragging.current = true;
            activePointer.current = e.pointerId;
            startY.current = e.clientY;
            lastY.current = e.clientY;
            lastT.current = e.timeStamp;
            velocity.current = 0;
            willDismiss.current = false;
            sheet.style.transition = 'none';
            if (scrimRef.current) scrimRef.current.style.transition = 'none';
            (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        },
        onPointerMove: (e) => {
            if (!dragging.current || e.pointerId !== activePointer.current) return;
            const sheet = sheetRef.current;
            if (!sheet) return;
            let dy = e.clientY - startY.current;
            if (dy < 0) dy *= 0.25; // rubber-band resistance dragging upward
            const dt = e.timeStamp - lastT.current;
            if (dt > 0) velocity.current = (e.clientY - lastY.current) / dt;
            lastY.current = e.clientY;
            lastT.current = e.timeStamp;
            setTransform(Math.max(0, dy));
            const h = sheet.offsetHeight || 1;
            const progress = Math.min(1, Math.max(0, dy / h));
            setScrim(1 - progress * 0.6); // scrim fades as the sheet slides away
            willDismiss.current = dy > h * thresholdRef.current || velocity.current > FLICK_VELOCITY;
        },
        onPointerUp: (e) => {
            if (!dragging.current || e.pointerId !== activePointer.current) return;
            endGesture(willDismiss.current);
        },
        onPointerCancel: (e) => {
            if (!dragging.current || e.pointerId !== activePointer.current) return;
            endGesture(false);
        },
        style: enabled ? { touchAction: 'none', cursor: 'grab' } : undefined,
    };

    return { sheetRef, scrimRef, handleProps };
}

/**
 * `true` below Tailwind's `sm` breakpoint (640px) — i.e. the widths at which the
 * responsive sheets render as bottom sheets rather than centered modals. Sheets
 * pass the result as `useSheetDrag({ enabled })` so drag is off on desktop.
 */
export function useIsMobile(query = '(max-width: 639px)'): boolean {
    const [isMobile, setIsMobile] = useState(
        () => typeof window !== 'undefined' && window.matchMedia(query).matches,
    );
    useEffect(() => {
        const mql = window.matchMedia(query);
        const onChange = () => setIsMobile(mql.matches);
        onChange();
        mql.addEventListener('change', onChange);
        return () => mql.removeEventListener('change', onChange);
    }, [query]);
    return isMobile;
}
