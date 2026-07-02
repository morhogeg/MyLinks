'use client';

import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';

/**
 * Crisp native haptics for the key touch moments (M11).
 *
 * Every helper is a no-op off the native iOS app: on the web (desktop or the
 * iPhone PWA in Safari) `Capacitor.isNativePlatform()` is false, so nothing
 * fires and no plugin call is made. Calls are fire-and-forget — the underlying
 * plugin returns a promise, but callers never need to await it, and any error
 * (e.g. an older OS without the Taptic Engine) is swallowed so feedback can
 * never break an interaction.
 */
const isNative = (): boolean => {
    try {
        return Capacitor?.isNativePlatform?.() === true;
    } catch {
        return false;
    }
};

const swallow = (p: Promise<unknown> | undefined) => {
    if (p && typeof p.then === 'function') p.catch(() => { });
};

/** A light tap — for reversible, low-stakes actions (favorite, refresh trigger). */
export function hapticLight(): void {
    if (!isNative()) return;
    swallow(Haptics.impact({ style: ImpactStyle.Light }));
}

/** A medium tap — a touch more presence than light, for a committed toggle. */
export function hapticMedium(): void {
    if (!isNative()) return;
    swallow(Haptics.impact({ style: ImpactStyle.Medium }));
}

/** Success notification buzz — for a save that landed. */
export function hapticSuccess(): void {
    if (!isNative()) return;
    swallow(Haptics.notification({ type: NotificationType.Success }));
}

/** Warning notification buzz — for a destructive confirm the user just fired. */
export function hapticWarning(): void {
    if (!isNative()) return;
    swallow(Haptics.notification({ type: NotificationType.Warning }));
}
