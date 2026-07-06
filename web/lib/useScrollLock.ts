'use client';

import { useEffect } from 'react';

/**
 * Ref-counted body scroll lock shared by every overlay (modals, sheets,
 * dialogs).
 *
 * The bug this fixes (F-16): components previously each did
 * `document.body.style.overflow = 'hidden'` on open and reset it to `'unset'`
 * on close. When one overlay opened on top of another (e.g. an
 * "Add to collection" sheet from inside the detail modal), closing the inner
 * one reset overflow to `'unset'` while the outer one was still open — the
 * background scrolled behind it. Others captured/restored the prior value,
 * which was inconsistent in the opposite direction.
 *
 * Here a single module-level counter tracks how many overlays are open. Only
 * the first lock captures and hides the original overflow; only the last
 * unlock restores it. Nesting and unmount-while-open are both safe.
 *
 * @param active whether this overlay is currently open (defaults to true so a
 *   component that only mounts when open can call `useScrollLock()` with no arg).
 */
let lockCount = 0;
let savedOverflow: string | null = null;

export function useScrollLock(active: boolean = true): void {
  useEffect(() => {
    if (!active) return;

    if (lockCount === 0) {
      savedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
    }
    lockCount += 1;

    return () => {
      lockCount -= 1;
      if (lockCount <= 0) {
        lockCount = 0;
        document.body.style.overflow = savedOverflow ?? '';
        savedOverflow = null;
      }
    };
  }, [active]);
}
