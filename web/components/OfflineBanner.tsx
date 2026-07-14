'use client';

import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';

/**
 * A slim, fixed top banner shown while the device is offline (report 3.16).
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
 * Safe-area aware: this app runs in a Capacitor WKWebView where a fixed
 * `top: 0` element slides under the status-bar notch. It pads its top by
 * env(safe-area-inset-top) via the shared `.safe-pt` utility (the same approach
 * MobileSubheader and the page header use) so the text clears the notch.
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
            className="safe-pt fixed inset-x-0 top-0 z-[100] bg-card/95 backdrop-blur border-b border-border-subtle shadow-sm animate-in fade-in slide-in-from-top-1 duration-300"
        >
            <div className="flex items-center justify-center gap-2 px-4 py-2 text-[13px] font-medium text-text">
                <WifiOff className="w-4 h-4 text-text-secondary shrink-0" />
                <span>You&rsquo;re offline — changes will sync when you reconnect</span>
            </div>
        </div>
    );
}
