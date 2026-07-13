'use client';

import { useEffect } from 'react';

/**
 * Ref-counted body scroll lock (F-16). Every overlay that needs the page
 * frozen takes the lock through here instead of writing
 * `document.body.style.overflow` directly — raw writes break the moment
 * overlays nest (a ConfirmDialog closing over Settings restored `unset`
 * and re-enabled background scroll behind the still-open modal).
 *
 * The body stays locked while at least one holder is active; the original
 * overflow value is restored only when the LAST holder releases.
 */

let holders = 0;
let savedOverflow = '';

/** Imperative acquire — for locks taken inside a larger effect. Pair with unlockBodyScroll. */
export function lockBodyScroll(): void {
    acquire();
}

/** Imperative release — the twin of lockBodyScroll. */
export function unlockBodyScroll(): void {
    release();
}

function acquire(): void {
    if (holders === 0) {
        savedOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
    }
    holders += 1;
}

function release(): void {
    holders = Math.max(0, holders - 1);
    if (holders === 0) {
        document.body.style.overflow = savedOverflow;
    }
}

/** Hold the body scroll lock while `active` (default true on mount). */
export function useScrollLock(active: boolean = true): void {
    useEffect(() => {
        if (!active) return;
        acquire();
        return release;
    }, [active]);
}
