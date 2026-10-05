/**
 * The Machina browser extension, seen from the web app.
 *
 * One-click connect: the extension lists the web app's origin in its manifest
 * (`externally_connectable`), which lets this page message it directly with
 * `chrome.runtime.sendMessage(extensionId, …)`. The browser delivers that
 * message to the extension with that exact id and nobody else, so the token
 * never touches another page or another extension. The extension, in turn,
 * only answers the root page of an allowed origin and checks the token with
 * the server before storing it (extension/background.js). Threat model:
 * extension/store/LISTING.md, "Security".
 *
 * The extension never sends the token back. To tell "connected to THIS
 * account" from "connected to some other account" it returns a short one-way
 * tag of its token, which we compare with the tag of ours.
 */

/**
 * OWNER: the Chrome Web Store item id, once the listing exists (the 32-letter
 * id in the listing URL, chromewebstore.google.com/detail/<name>/<id>).
 * Until it is set, Settings says "Coming soon to the Chrome Web Store" and
 * offers no install button. It can also come from the
 * NEXT_PUBLIC_CHROME_EXTENSION_ID env var at build time.
 */
export const CHROME_WEB_STORE_ITEM_ID: string | null = null;

/**
 * The id of the unpacked build in `extension/` (pinned by the public `key` in
 * its manifest, so every checkout loads with the same id). The store package
 * drops that key, so the store build gets its own id (above).
 */
export const EXTENSION_DEV_ID = 'gjegndcjhemlpeoiamfebeoaeegkelnk';

const ID_RE = /^[a-p]{32}$/;

function storeItemId(): string | null {
    const fromEnv = process.env.NEXT_PUBLIC_CHROME_EXTENSION_ID?.trim();
    const id = fromEnv || CHROME_WEB_STORE_ITEM_ID;
    return id && ID_RE.test(id) ? id : null;
}

/** The listing to install from, or null while the extension is not in the store. */
export function chromeWebStoreUrl(): string | null {
    const id = storeItemId();
    return id ? `https://chromewebstore.google.com/detail/${id}` : null;
}

/** Every extension id this page will hand a token to. */
export function trustedExtensionIds(): string[] {
    const ids = [storeItemId(), EXTENSION_DEV_ID].filter((x): x is string => !!x);
    return [...new Set(ids)];
}

interface Runtime {
    sendMessage: (id: string, msg: unknown, cb: (resp: unknown) => void) => void;
    lastError?: { message?: string };
}

/** The page-side runtime, which Chromium only exposes when some installed
    extension lists this origin in `externally_connectable`. */
function pageRuntime(): Runtime | null {
    if (typeof window === 'undefined') return null;
    const w = window as unknown as { chrome?: { runtime?: Runtime } };
    const rt = w.chrome?.runtime;
    return rt && typeof rt.sendMessage === 'function' ? rt : null;
}

/** Desktop Chrome, Edge, Brave and friends: where the extension can run. */
export function isDesktopChromium(): boolean {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    if (/Android|iPhone|iPad|iPod|Mobile/i.test(ua)) return false;
    const brands = (navigator as unknown as { userAgentData?: { brands?: Array<{ brand: string }> } }).userAgentData?.brands;
    if (brands?.some((b) => /Chromium|Google Chrome|Microsoft Edge|Brave/i.test(b.brand))) return true;
    return /Chrome\/\d+/.test(ua) && !/OPR\/|Firefox\//.test(ua);
}

function send<T>(id: string, msg: unknown, timeoutMs: number): Promise<T | null> {
    const rt = pageRuntime();
    if (!rt) return Promise.resolve(null);
    return new Promise((resolve) => {
        let done = false;
        const timer = setTimeout(() => { if (!done) { done = true; resolve(null); } }, timeoutMs);
        try {
            rt.sendMessage(id, msg, (resp) => {
                if (done) return;
                done = true;
                clearTimeout(timer);
                // Read lastError so Chrome doesn't log "Unchecked runtime.lastError".
                void rt.lastError;
                resolve((resp ?? null) as T | null);
            });
        } catch {
            done = true;
            clearTimeout(timer);
            resolve(null);
        }
    });
}

export interface ExtensionStatus {
    id: string;
    version: string;
    connected: boolean;
    tokenTag: string | null;
}

/** Find an installed Machina extension in this browser, or null. */
export async function detectExtension(timeoutMs = 1500): Promise<ExtensionStatus | null> {
    if (!pageRuntime()) return null;
    const answers = await Promise.all(trustedExtensionIds().map(async (id) => {
        const r = await send<{ ok?: boolean; version?: string; connected?: boolean; tokenTag?: string | null }>(
            id, { type: 'machina-ping' }, timeoutMs);
        return r && r.ok ? { id, version: String(r.version ?? ''), connected: !!r.connected, tokenTag: r.tokenTag ?? null } : null;
    }));
    return answers.find((a): a is ExtensionStatus => !!a) ?? null;
}

export type ConnectFailure = 'unavailable' | 'untrusted' | 'bad-token' | 'invalid' | 'network' | 'offline'
    | 'rate-limited' | 'server' | 'unexpected' | 'error' | 'unknown';

/** Hand this account's token to the extension. It checks the token with the
    server before keeping it, so `ok` means it can save right away. */
export async function connectExtension(id: string, token: string, account?: string | null):
    Promise<{ ok: true } | { ok: false; reason: ConnectFailure }> {
    if (!trustedExtensionIds().includes(id)) return { ok: false, reason: 'untrusted' };
    const r = await send<{ ok?: boolean; reason?: ConnectFailure }>(
        id, { type: 'machina-connect', token, account: account ?? '' }, 20000);
    if (!r) return { ok: false, reason: 'unavailable' };
    return r.ok ? { ok: true } : { ok: false, reason: r.reason ?? 'unknown' };
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
