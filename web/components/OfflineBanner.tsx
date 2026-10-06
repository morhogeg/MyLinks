'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * A small pill shown while the device is offline (report 3.16).
 *
 * Listens to the browser's `online`/`offline` events — the cheap, universal
 * signal that navigator connectivity dropped — and surfaces a reassuring strip
 * so a user whose edits aren't syncing understands why (Firestore queues writes
 * and replays them on reconnect). Theme-tokened (bg-card / text-text / border)
 * so it reads in both light and dark.
 *
 * SSR-safe: `navigator` is only ever touched inside an effect, so the first
 * render (server + hydration) assumes online and the banner is absent — it
 * appears only after the client confirms an offline state.
 *
 * It sits just below the page header (52px on a phone, 68px from `sm`, under
 * the safe-area inset) and takes no taps. It used to be a full-width strip
 * over the top of the screen, which hid the header and swallowed its taps:
 * offline, the Settings button could not be reached at all.
 */
export default function OfflineBanner() {
    const [offline, setOffline] = useState(false);

    useEffect(() => {
        const update = () => setOffline(!navigator.onLine);
        update();
        window.addEventListener('online', update);
        window.addEventListener('offline', update);
        return () => {
            window.removeEventListener('online', update);
            window.removeEventListener('offline', update);
        };
    }, []);

    if (!offline) return null;

    return (
        <div
            role="status"
            aria-live="polite"
            className="pointer-events-none fixed inset-x-0 z-[100] flex justify-center px-4 animate-fade-in top-[calc(env(safe-area-inset-top)+60px)] sm:top-[calc(env(safe-area-inset-top)+76px)]"
        >
            <div className="flex items-center gap-2 max-w-full rounded-full bg-card/95 backdrop-blur border border-border-subtle shadow-sm px-3.5 py-1.5 text-[13px] font-medium text-text">
                <WifiOff className="w-4 h-4 text-text-secondary shrink-0" aria-hidden="true" />
                <span>Offline. Changes sync when you reconnect.</span>
            </div>
        </div>
    );
}
