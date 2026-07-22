/**
 * Outbound sharing of public Machina pages (a collection or a single card).
 *
 * The URL must be ABSOLUTE and point at the public web origin — inside the iOS
 * Capacitor shell window.location.origin is `capacitor://localhost`, which is
 * not shareable. So we build links from NEXT_PUBLIC_SHARE_BASE (the production
 * Firebase Hosting / Vercel domain), falling back to the known hosting origin.
 */

import { isNativeApp } from './api';

const SHARE_BASE =
    process.env.NEXT_PUBLIC_SHARE_BASE?.replace(/\/$/, '') ||
    'https://secondbrain-app-94da2.web.app';

// Canonical native detection (see api.ts isNativeApp): the capacitor:// origin
// or the runtime's own isNativePlatform() — NOT the mere presence of the
// window.Capacitor global, which @capacitor/core defines in plain browsers too.
const isCapacitor = isNativeApp();

/** Absolute public URL for a share path like `/c?id=abc` or `/s?id=abc`. */
export function shareUrlFor(path: string): string {
    return `${SHARE_BASE}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Legal/policy pages (`/privacy`, `/terms`) are served by the Next.js app on
 * Vercel. On the web a relative path is the right link; inside the native
 * shell relative paths resolve against `capacitor://localhost`, so we point
 * at the public web origin and open it externally instead.
 *
 * The origin is env-driven (`NEXT_PUBLIC_POLICY_BASE`) so App Review's
 * privacy/terms link can be repointed to a stable custom domain without a code
 * change — a hardcoded preview domain that later gets renamed would leave the
 * in-app "Privacy Policy" link (the first thing a reviewer taps) opening a dead
 * page, an instant rejection. Falls back to the current Vercel origin.
 */
const POLICY_BASE =
    process.env.NEXT_PUBLIC_POLICY_BASE?.replace(/\/$/, '') ||
    'https://my-links-sable.vercel.app';

/** Href for a policy page: relative on the web, absolute (Vercel) on native. */
export function policyUrl(path: string): string {
    const p = path.startsWith('/') ? path : `/${path}`;
    return isCapacitor ? `${POLICY_BASE}${p}` : p;
}

/**
 * Open a URL outside the app: the system browser on native (Capacitor routes
 * `window.open` of an external URL to Safari), a new tab on the web. noopener
 * so the opened page can't reach `window.opener`.
 */
export function openExternal(url: string): void {
    if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener,noreferrer');
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * Invoke the native share sheet for `url`, degrading gracefully:
 *  1. @capacitor/share on the native iOS app,
 *  2. the Web Share API (navigator.share) in mobile browsers,
 *  3. clipboard copy everywhere else (so desktop users still get the link).
 */
export async function shareLink(url: string, title?: string, text?: string): Promise<ShareOutcome> {
    // Native iOS app — use the Capacitor plugin (Web Share API is unreliable
    // under the capacitor:// origin).
    if (isCapacitor) {
        try {
            const { Share } = await import('@capacitor/share');
            await Share.share({ title, text, url });
            return 'shared';
        } catch (e: unknown) {
            // User dismissed the sheet — not an error worth surfacing.
            if (isAbort(e)) return 'cancelled';
            // Fall through to clipboard.
        }
    } else if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
        try {
            await navigator.share({ title, text, url });
            return 'shared';
        } catch (e: unknown) {
            if (isAbort(e)) return 'cancelled';
            // Fall through to clipboard.
        }
    }

    // Fallback: copy to clipboard (robust — async Clipboard API with a legacy
    // execCommand path for WKWebView / non-secure contexts / lost activation,
    // where navigator.clipboard is unavailable or rejects).
    return (await copyToClipboard(url)) ? 'copied' : 'failed';
}

/** Copy `text`, preferring the async Clipboard API and falling back to a
    legacy hidden-textarea + execCommand('copy') — which still works inside the
    iOS WKWebView and after transient user-activation has been consumed by an
    await, where navigator.clipboard is often unavailable or rejects. */
async function copyToClipboard(text: string): Promise<boolean> {
    try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            return true;
        }
    } catch {
        // fall through to the legacy path
    }
    if (typeof document === 'undefined') return false;
    try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.setAttribute('readonly', '');
        ta.style.position = 'fixed';
        ta.style.top = '0';
        ta.style.left = '0';
        ta.style.width = '1px';
        ta.style.height = '1px';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        const ok = document.execCommand('copy');
        document.body.removeChild(ta);
        return ok;
    } catch {
        return false;
    }
}

function isAbort(e: unknown): boolean {
    return !!e && typeof e === 'object' && 'name' in e && (e as { name?: string }).name === 'AbortError';
}
