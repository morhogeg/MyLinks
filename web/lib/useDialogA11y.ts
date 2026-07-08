'use client';

import { useEffect, useRef, type RefObject } from 'react';

// Selector for the elements a keyboard user can Tab to.
const FOCUSABLE = [
    'a[href]',
    'button:not([disabled])',
    'textarea:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

/**
 * Baseline dialog accessibility for a modal, in one hook:
 *   • moves focus into the dialog when it opens (so the keyboard/VoiceOver focus
 *     isn't left behind on the trigger, out of the modal),
 *   • traps Tab / Shift+Tab inside the dialog while it's open,
 *   • closes on Escape,
 *   • restores focus to whatever was focused before the dialog opened, on close.
 *
 * Pass a ref to the dialog container (the element with role="dialog"). `onClose`
 * is read through a ref so an unstable handler identity doesn't re-run the effect
 * and yank focus back to the first element on every parent render.
 */
export function useDialogA11y(
    ref: RefObject<HTMLElement | null>,
    { isOpen = true, onClose }: { isOpen?: boolean; onClose: () => void },
): void {
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    useEffect(() => {
        if (!isOpen) return;
        const node = ref.current;
        if (!node) return;

        const previouslyFocused = document.activeElement as HTMLElement | null;

        const focusables = () =>
            Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
                (el) => el.offsetParent !== null || el === document.activeElement,
            );

        // Move focus into the dialog: first focusable, else the container itself.
        const first = focusables()[0];
        if (first) {
            first.focus();
        } else {
            node.setAttribute('tabindex', '-1');
            node.focus();
        }

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onCloseRef.current();
                return;
            }
            if (e.key !== 'Tab') return;

            const items = focusables();
            if (items.length === 0) {
                e.preventDefault();
                return;
            }
            const firstEl = items[0];
            const lastEl = items[items.length - 1];
            const active = document.activeElement as HTMLElement | null;

            if (e.shiftKey) {
                if (active === firstEl || !node.contains(active)) {
                    e.preventDefault();
                    lastEl.focus();
                }
            } else {
                if (active === lastEl || !node.contains(active)) {
                    e.preventDefault();
                    firstEl.focus();
                }
            }
        };

        // Capture phase so the trap wins even if inner handlers stopPropagation.
        document.addEventListener('keydown', onKeyDown, true);
        return () => {
            document.removeEventListener('keydown', onKeyDown, true);
            if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
                previouslyFocused.focus();
            }
        };
    }, [isOpen, ref]);
}
