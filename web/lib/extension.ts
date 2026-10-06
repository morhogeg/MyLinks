/**
 * The Machina browser extension, seen from the web app.
 *
 * One-click connect: the extension runs a tiny content script on this site
 * (extension/connect.js). This page talks to it with `window.postMessage`,
 * addressed to its own origin, and only listens to answers that come from its
 * own window and origin. The content script relays to the extension, which
 * only trusts the root page of an allowed origin and checks the token with the
 * server before storing it. Same code in Chrome, Edge, Brave and Safari; no
 * extension id needed. Threat model: extension/store/LISTING.md, "Security".
 *
 * The extension never sends the token back. To tell "connected to THIS
 * account" from "connected to some other account" it returns a short one-way
 * tag of its token, which we compare with the tag of ours.
 */

/**
 * OWNER: the Chrome Web Store item id, once the listing exists (the 32-letter
 * id at the end of the listing URL, chromewebstore.google.com/detail/<id>).
 * Until it is set, Settings says "Coming soon to the Chrome Web Store" and
 * offers no install button. Can also come from NEXT_PUBLIC_CHROME_EXTENSION_ID.
 */
export const CHROME_WEB_STORE_ITEM_ID: string | null = null;

/**
 * OWNER: the Mac App Store URL of the Machina Safari app, once it is listed
 * (https://apps.apple.com/app/id<number>). Until it is set, Safari users see
 * "Coming soon to the Mac App Store". Can also come from
 * NEXT_PUBLIC_MAC_APP_STORE_URL.
 */
export const MAC_APP_STORE_URL: string | null = null;

const ID_RE = /^[a-p]{32}$/;
const MAS_RE = /^https:\/\/apps\.apple\.com\/[^\s]+$/;

/** The Chrome listing to install from, or null while it is not in the store. */
export function chromeWebStoreUrl(): string | null {
    const id = process.env.NEXT_PUBLIC_CHROME_EXTENSION_ID?.trim() || CHROME_WEB_STORE_ITEM_ID;
    return id && ID_RE.test(id) ? `https://chromewebstore.google.com/detail/${id}` : null;
}

/** The Mac App Store listing, or null while it is not there yet. */
export function macAppStoreUrl(): string | null {
    const url = process.env.NEXT_PUBLIC_MAC_APP_STORE_URL?.trim() || MAC_APP_STORE_URL;
    return url && MAS_RE.test(url) ? url : null;
}

/** Where the extension can run, from this browser's point of view. */
export type BrowserKind = 'chromium' | 'safari' | 'other';

export function browserKind(): BrowserKind {
    if (typeof navigator === 'undefined') return 'other';
    const ua = navigator.userAgent || '';
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return 'other';
    const brands = (navigator as unknown as { userAgentData?: { brands?: Array<{ brand: string }> } }).userAgentData?.brands;
    if (brands?.some((b) => /Chromium|Google Chrome|Microsoft Edge|Brave/i.test(b.brand))) return 'chromium';
    if (/Chrome\/\d+|Chromium\/\d+|Edg\/\d+/.test(ua) && !/OPR\/|Firefox\//.test(ua)) return 'chromium';
    if (/Safari\/\d+/.test(ua) && /Version\/\d+/.test(ua) && !/Firefox\/|FxiOS/.test(ua)) return 'safari';
    return 'other';
}

const FROM_PAGE = 'machina-web';
const FROM_EXT = 'machina-extension';

let seq = 0;
function newId(): string {
    seq += 1;
    const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2);
    return `${seq}-${rand}`.slice(0, 64);
}

/** Ask the content script, wait for the answer with the same id. */
function ask<T>(
    type: 'machina-ping' | 'machina-connect' | 'machina-disconnect',
    payload: Record<string, unknown>,
    timeoutMs: number,
): Promise<T | null> {
    if (typeof window === 'undefined') return Promise.resolve(null);
    const id = newId();
    return new Promise((resolve) => {
        const done = (value: T | null) => {
            clearTimeout(timer);
            window.removeEventListener('message', onMessage);
            resolve(value);
        };
        const onMessage = (event: MessageEvent) => {
            if (event.source !== window || event.origin !== window.location.origin) return;
            const d = event.data as { source?: string; id?: string; reply?: T } | null;
            if (!d || d.source !== FROM_EXT || d.id !== id) return;
            done(d.reply ?? null);
        };
        const timer = setTimeout(() => done(null), timeoutMs);
        window.addEventListener('message', onMessage);
        window.postMessage({ source: FROM_PAGE, id, type, ...payload }, window.location.origin);
    });
}

export interface ExtensionStatus {
    version: string;
    connected: boolean;
    tokenTag: string | null;
}

/** Find the Machina extension in this browser (on this site), or null. */
export async function detectExtension(timeoutMs = 1200): Promise<ExtensionStatus | null> {
    const r = await ask<{ ok?: boolean; version?: string; connected?: boolean; tokenTag?: string | null }>('machina-ping', {}, timeoutMs);
    return r && r.ok ? { version: String(r.version ?? ''), connected: !!r.connected, tokenTag: r.tokenTag ?? null } : null;
}

/** Call `fn` when the extension's content script announces itself. */
export function onExtensionReady(fn: () => void): () => void {
    if (typeof window === 'undefined') return () => {};
    const handler = (event: MessageEvent) => {
        if (event.source !== window || event.origin !== window.location.origin) return;
        const d = event.data as { source?: string; type?: string } | null;
        if (d && d.source === FROM_EXT && d.type === 'machina-ready') fn();
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
}

export type ConnectFailure = 'unavailable' | 'untrusted' | 'bad-token' | 'invalid' | 'network' | 'offline'
    | 'rate-limited' | 'server' | 'unexpected' | 'error' | 'unknown';

/** Hand this account's token to the extension. It checks the token with the
    server before keeping it, so `ok` means it can save right away. */
export async function connectExtension(token: string, account?: string | null):
    Promise<{ ok: true } | { ok: false; reason: ConnectFailure }> {
    const r = await ask<{ ok?: boolean; reason?: ConnectFailure }>(
        'machina-connect', { token, account: account ?? '' }, 20000);
    if (!r) return { ok: false, reason: 'unavailable' };
    return r.ok ? { ok: true } : { ok: false, reason: r.reason ?? 'unknown' };
}

/**
 * Signing out of the website: disconnect the extension in this browser, but
 * only when it holds THIS account's token (it compares the one-way tag), so a
 * shared computer stops filing pages into the departing library while someone
 * else's connected extension is left alone. Never throws; with no extension
 * installed it just waits out the short timeout.
 */
export async function disconnectExtensionFor(token: string, timeoutMs = 600): Promise<boolean> {
    try {
        const tag = await tokenTag(token);
        if (!tag) return false;
        const r = await ask<{ ok?: boolean }>('machina-disconnect', { tokenTag: tag }, timeoutMs);
        return !!r?.ok;
    } catch {
        return false;
    }
}

/** Same one-way tag as extension/shared.js tokenTag. */
export async function tokenTag(token: string): Promise<string | null> {
    if (!token || typeof crypto === 'undefined' || !crypto.subtle) return null;
    const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`machina-ext:${token}`)));
    return Array.from(digest.slice(0, 6), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Plain words for a failed connect. */
export function connectFailureText(reason: ConnectFailure): string {
    switch (reason) {
        case 'offline':
        case 'network': return 'The extension couldn’t reach Machina. Check your connection and try again.';
        case 'rate-limited': return 'Too many tries. Wait a minute, then try again.';
        case 'server': return 'Machina hit a problem. Try again in a moment.';
        case 'invalid': return 'Your token was just reset. Reload this page and try again.';
        case 'unavailable': return 'The extension didn’t answer. Make sure it’s turned on, then try again.';
        case 'untrusted': return 'This page can’t connect the extension. Open Machina at mymachina.app and try again.';
        default: return 'Couldn’t connect the extension. Try again, or use the token below.';
    }
}
