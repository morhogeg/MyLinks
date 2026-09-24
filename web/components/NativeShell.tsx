'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { isNativeApp } from '@/lib/api';
import { appStoreUrl, checkForcedUpdate, type UpdateRequirement } from '@/lib/appUpdate';

/**
 * App-level plumbing for the native iOS shell, mounted once in the root layout
 * (above the auth gate, so it also covers the sign-in screen). Renders nothing
 * on the web and nothing on native unless an update is required.
 *
 * 1. Deep links. `machina://open?card=<linkId>` (the scheme is registered in
 *    ios/App/App/Info.plist) and, once Associated Domains is enabled,
 *    `https://mymachina.app/?linkId=<id>` universal links, route to the card
 *    through the Feed's existing `?linkId=` handler — which opens it if it is
 *    in this workspace and silently does nothing if it is not (someone else's
 *    card, or deleted). Share-page context (`?shared=<id>`, /s /c /a) just
 *    brings the app forward: those snapshots carry no card id to open.
 * 2. Forced update. See lib/appUpdate.ts: re-checked on launch and on every
 *    resume; fails open.
 */

// A Firestore doc id as the app mints them. Anything else is not a card link.
const LINK_ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

/** The card id a deep link points at, or null. */
export function linkIdFromDeepLink(raw: string): string | null {
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        return null;
    }
    const scheme = url.protocol.replace(/:$/, '').toLowerCase();
    if (scheme === 'https') {
        const host = url.hostname.toLowerCase();
        if (host !== 'mymachina.app' && host !== 'www.mymachina.app') return null;
        if (url.pathname !== '/' && url.pathname !== '') return null;
    } else if (scheme !== 'machina') {
        return null;
    }
    const id = url.searchParams.get('card') || url.searchParams.get('linkId') || '';
    return LINK_ID_RE.test(id) ? id : null;
}

export default function NativeShell() {
    const router = useRouter();
    const [update, setUpdate] = useState<UpdateRequirement | null>(null);

    // Deep links: the live event (app running or woken by the link) and the
    // launch URL (cold start, where the event can fire before this listener).
    useEffect(() => {
        if (!isNativeApp()) return;
        let cancelled = false;
        let remove: (() => void) | undefined;
        let lastHandled = '';
        const route = (url: string | undefined) => {
            if (!url || url === lastHandled) return;
            lastHandled = url;
            const linkId = linkIdFromDeepLink(url);
            if (linkId) router.push(`/?linkId=${encodeURIComponent(linkId)}`);
        };
        void (async () => {
            try {
                const { App } = await import('@capacitor/app');
                const handle = await App.addListener('appUrlOpen', ({ url }) => route(url));
                if (cancelled) {
                    void handle.remove();
                    return;
                }
                remove = () => void handle.remove();
                route((await App.getLaunchUrl())?.url);
            } catch {
                // Older native build without @capacitor/app — no deep links.
            }
        })();
        return () => {
            cancelled = true;
            remove?.();
        };
    }, [router]);

    // Forced update: on launch and whenever the app comes back to the front.
    useEffect(() => {
        if (!isNativeApp()) return;
        let cancelled = false;
        const check = async () => {
            const req = await checkForcedUpdate();
            if (!cancelled) setUpdate(req);
        };
        void check();
        const onVisible = () => {
            if (document.visibilityState === 'visible') void check();
        };
        document.addEventListener('visibilitychange', onVisible);
        return () => {
            cancelled = true;
            document.removeEventListener('visibilitychange', onVisible);
        };
    }, []);

    if (!update) return null;

    const storeId = update.appStoreId;
    return (
        <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="machina-update-title"
            className="safe-pt fixed inset-0 z-[200] bg-background text-text flex items-center justify-center px-6"
        >
            <div className="w-full max-w-sm flex flex-col items-center text-center">
                <div className="w-16 h-16 rounded-3xl overflow-hidden shadow-lg shadow-accent/20 ring-1 ring-border-subtle">
                    <img src="/app-icon.png" alt="" className="w-full h-full object-cover" />
                </div>
                <h1 id="machina-update-title" className="mt-6 text-xl font-semibold text-text">
                    Update Machina
                </h1>
                <p className="mt-2 text-sm text-text-secondary">
                    {update.message
                        || 'This version of Machina is no longer supported. Update to keep using your library.'}
                </p>
                {storeId ? (
                    <button
                        type="button"
                        onClick={() => window.open(appStoreUrl(storeId), '_blank', 'noopener')}
                        className="mt-6 w-full inline-flex items-center justify-center gap-2 rounded-full bg-accent text-accent-ink px-5 py-2.5 text-sm font-semibold shadow-sm shadow-accent/20 hover:bg-accent-hover transition-colors"
                    >
                        Open the App Store
                    </button>
                ) : (
                    <p className="mt-6 text-[13px] text-text-muted">
                        Install the latest version from the App Store or TestFlight.
                    </p>
                )}
            </div>
        </div>
    );
}
