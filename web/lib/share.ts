/**
 * Outbound sharing of public Machina pages (a collection or a single card).
 *
 * The URL must be ABSOLUTE and point at the public web origin — inside the iOS
 * Capacitor shell window.location.origin is `capacitor://localhost`, which is
 * not shareable. So we build links from NEXT_PUBLIC_SHARE_BASE (the production
 * Firebase Hosting / Vercel domain), falling back to the known hosting origin.
 */

const SHARE_BASE =
    process.env.NEXT_PUBLIC_SHARE_BASE?.replace(/\/$/, '') ||
    'https://secondbrain-app-94da2.web.app';

const isCapacitor =
    typeof window !== 'undefined' &&
    (window.location.protocol === 'capacitor:' ||
        Boolean((window as unknown as { Capacitor?: unknown }).Capacitor));

/** Absolute public URL for a share path like `/c?id=abc` or `/s?id=abc`. */
export function shareUrlFor(path: string): string {
    return `${SHARE_BASE}${path.startsWith('/') ? path : `/${path}`}`;
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

    // Fallback: copy to clipboard.
    try {
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(url);
            return 'copied';
        }
    } catch {
        // ignore
    }
    return 'failed';
}

function isAbort(e: unknown): boolean {
    return !!e && typeof e === 'object' && 'name' in e && (e as { name?: string }).name === 'AbortError';
}
