'use client';

import { useEffect, useId, useRef } from 'react';

/**
 * Dialog behavior for the feed's sheets and the tag drawer (A11Y-6): the panel
 * is announced as a modal dialog named by its title, Escape closes it, and
 * the close button takes focus on open, so a keyboard or VoiceOver user lands
 * inside the sheet instead of behind it. Focus goes back to whatever opened
 * the sheet when it closes.
 *
 *   const { titleId, closeRef } = useSheetA11y(isOpen, onClose);
 *   <div role="dialog" aria-modal="true" aria-labelledby={titleId}>
 *     <h3 id={titleId}>…</h3>
 *     <button ref={closeRef} onClick={onClose}>…</button>
 *
 * Escape is left to a popup that is open inside the sheet (a dropdown marks
 * its trigger aria-haspopup + aria-expanded): it closes that first, the next
 * Escape the sheet. An expanded disclosure (a tag group) is not a popup and
 * doesn't hold Escape back.
 */
export function useSheetA11y(isOpen: boolean, onClose: () => void) {
    const titleId = useId();
    const closeRef = useRef<HTMLButtonElement>(null);
    // Latest onClose, read by the key handler without re-binding it. Synced in
    // an effect (never during render).
    const onCloseRef = useRef(onClose);
    useEffect(() => {
        onCloseRef.current = onClose;
    });

    useEffect(() => {
        if (!isOpen) return;
        const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
        closeRef.current?.focus({ preventScroll: true });
        // Whether a popup was open when this Escape went down. Read in the
        // capture phase: the popup's own (bubble) listener closes it, and React
        // re-renders before the event reaches window, so by then it looks shut.
        let popupWasOpen = false;
        const onKeyCapture = (e: KeyboardEvent) => {
            if (e.key !== 'Escape') return;
            const panel = closeRef.current?.closest('[role="dialog"]');
            popupWasOpen = !!panel?.querySelector('[aria-haspopup][aria-expanded="true"]');
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key !== 'Escape' || e.defaultPrevented || popupWasOpen) return;
            onCloseRef.current();
        };
        window.addEventListener('keydown', onKeyCapture, true);
        window.addEventListener('keydown', onKey);
        return () => {
            window.removeEventListener('keydown', onKeyCapture, true);
            window.removeEventListener('keydown', onKey);
            if (opener?.isConnected) opener.focus({ preventScroll: true });
        };
    }, [isOpen]);

    return { titleId, closeRef };
}
