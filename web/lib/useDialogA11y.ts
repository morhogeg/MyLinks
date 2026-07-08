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

const focusablesIn = (node: HTMLElement) =>
    Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
        (el) => el.offsetParent !== null || el === document.activeElement,
    );

/**
 * Baseline dialog accessibility for a modal, in one hook:
 *   • moves focus into the dialog when it opens (so the keyboard/VoiceOver focus
 *     isn't left behind on the trigger, out of the modal),
 *   • traps Tab / Shift+Tab inside the dialog while it's the topmost layer,
 *   • closes on Escape,
 *   • restores focus to whatever was focused before the dialog opened, on close.
 *
 * Pass a ref to the dialog container (the element with role="dialog"). `onClose`
 * is read through a ref so an unstable handler identity doesn't re-run the effect
 * and yank focus back to the first element on every parent render.
 *
 * Two distinct gates, because a dialog can be *open but not the topmost layer*:
 *   • `isOpen` drives the focus lifecycle (move-in on open, restore on close).
 *   • `active` drives the keyboard trap + Escape. It defaults to `isOpen`, but a
 *     caller stacks a layer on top — a confirm dialog, a bottom sheet, an inline
 *     editor with its own Escape — by passing `active=false`. That disarms THIS
 *     dialog's Tab-trap and Escape so the layer above owns the keyboard, WITHOUT
 *     running the focus-restore cleanup (which would yank focus back to the
 *     now-hidden trigger behind the stacked layer). Keeping only the topmost
 *     dialog armed is what stops one Escape from closing two layers and stops two
 *     traps from fighting over Tab focus.
 */
export function useDialogA11y(
    ref: RefObject<HTMLElement | null>,
    {
        isOpen = true,
        active,
        onClose,
    }: { isOpen?: boolean; active?: boolean; onClose: () => void },
): void {
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;

    const isActive = active ?? isOpen;

    // Focus lifecycle — keyed on `isOpen` ONLY. Deliberately not keyed on
    // `active`: suspending the trap (a layer stacked on top) must not run this
    // cleanup, or focus would jump to the hidden trigger behind that layer and
    // re-arming would yank it to the top of the dialog.
    useEffect(() => {
        if (!isOpen) return;
        const node = ref.current;
        if (!node) return;

        const previouslyFocused = document.activeElement as HTMLElement | null;

        // Move focus into the dialog: first focusable, else the container itself.
        const first = focusablesIn(node)[0];
        if (first) {
            first.focus();
        } else {
            node.setAttribute('tabindex', '-1');
            node.focus();
        }

        return () => {
            if (previouslyFocused && typeof previouslyFocused.focus === 'function') {
                previouslyFocused.focus();
            }
        };
    }, [isOpen, ref]);

    // Keyboard trap + Escape — keyed on `isActive`. Only the topmost (active)
    // dialog arms these; a layer stacked on top disarms this one via active=false
    // and takes over the keyboard.
    useEffect(() => {
        if (!isActive) return;
        const node = ref.current;
        if (!node) return;

        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onCloseRef.current();
                return;
            }
            if (e.key !== 'Tab') return;

            const items = focusablesIn(node);
            if (items.length === 0) {
                e.preventDefault();
                return;
            }
            const firstEl = items[0];
            const lastEl = items[items.length - 1];
            const activeEl = document.activeElement as HTMLElement | null;

            if (e.shiftKey) {
                if (activeEl === firstEl || !node.contains(activeEl)) {
                    e.preventDefault();
                    lastEl.focus();
                }
            } else {
                if (activeEl === lastEl || !node.contains(activeEl)) {
                    e.preventDefault();
                    firstEl.focus();
                }
            }
        };

        // Capture phase so the trap wins even if inner handlers stopPropagation.
        document.addEventListener('keydown', onKeyDown, true);
        return () => {
            document.removeEventListener('keydown', onKeyDown, true);
        };
    }, [isActive, ref]);
}
