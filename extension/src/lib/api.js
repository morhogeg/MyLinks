/**
 * The one server call: POST /api/share (`share_ingest`, functions/main.py).
 *
 * The extension is a thin client. It sends what the user chose to save and
 * the server does the rest (reads the page, analyzes, files the card, which
 * then appears in the app through real-time sync). This module builds each
 * request body and turns every possible answer into one named outcome, so
 * the popup, the on-page toast and the retry queue all speak the same terms.
 */

import { SHARE_ENDPOINT } from './config.js';

export const Outcome = Object.freeze({
    SAVED: 'saved',             // 200, queued (or a note saved)
    DUPLICATE: 'duplicate',     // 200, already in the library or in flight
    WAITING: 'waiting',         // 200, kept past the monthly free reads
    RECONNECT: 'reconnect',     // 401/403: the token was reset or is unknown
    QUOTA: 'quota',             // 429 with a quota body (older servers)
    RATE_LIMITED: 'rate-limited', // 429 plain: too many saves in the hour
    TOO_LARGE: 'too-large',     // 413
    REJECTED: 'rejected',       // other 4xx, with the server's reason
    SERVER: 'server',           // 5xx
    OFFLINE: 'offline',         // the browser says there is no network
    NETWORK: 'network',         // fetch failed without an answer
    TIMEOUT: 'timeout',         // no answer in time; it may still have saved
    UNEXPECTED: 'unexpected',   // 2xx this version doesn't understand
});

/** Answers that mean the save is in the user's library. */
export function isDelivered(outcome) {
    return outcome === Outcome.SAVED || outcome === Outcome.DUPLICATE || outcome === Outcome.WAITING;
}

/**
 * Worth trying again later (the retry queue). A link or page is safe to send
 * twice because the server ignores an address it already has. A screenshot
 * has no such check, so a timeout (the server may have it) is NOT retried.
 * @param {string} outcome @param {string} kind
 */
export function isRetryable(outcome, kind) {
    switch (outcome) {
        case Outcome.OFFLINE:
        case Outcome.NETWORK:
        case Outcome.SERVER:
        case Outcome.RATE_LIMITED:
            return true;
        case Outcome.TIMEOUT:
            return kind !== 'screenshot';
        default:
            return false;
    }
}

/** Longest quote sent with a page (the server keeps up to 30,000). */
export const QUOTE_MAX = 10000;

/** Collapse runs of blank space but keep paragraph breaks; cap the length. */
export function cleanQuote(text) {
    if (typeof text !== 'string') return '';
    const tidy = text
        .replace(/\r\n?/g, '\n')
        .replace(/[ \t ]+/g, ' ')
        .replace(/ *\n */g, '\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
    if (tidy.length <= QUOTE_MAX) return tidy;
    const cut = tidy.slice(0, QUOTE_MAX);
    const space = cut.lastIndexOf(' ');
    return `${(space > QUOTE_MAX - 200 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

// The server finds the address in shared text with this pattern and trims
// sentence punctuation off its end (main.py _URL_IN_TEXT_RE, _trim_url).
const URL_IN_TEXT = /^https?:\/\/[^\s<>"　-〿＀-￯]+$/i;
const TRAILING_PUNCT = ').,;:!?"\'”’»]>…״׳';

/**
 * Would the server read exactly this address back out of shared text?
 * Chrome hands us serialized URLs (no spaces, quotes or angle brackets), so
 * this fails only for an address that ends in punctuation.
 */
export function survivesTextExtraction(url) {
    if (typeof url !== 'string' || !URL_IN_TEXT.test(url)) return false;
    if (!/^https?:\/\/[^/\s]+\.[^/\s]/i.test(url)) return false;
    let end = url.length;
    while (end > 0 && TRAILING_PUNCT.includes(url[end - 1])) end -= 1;
    if (end === url.length) return true;
    // The server keeps a closing paren the address itself opened.
    const kept = url.slice(0, end);
    const restoresParen = url[end] === ')' && (kept.match(/\(/g) || []).length > (kept.match(/\)/g) || []).length;
    return restoresParen && end + 1 === url.length;
}

/**
 * The JSON body for one save.
 *
 * Page with selected text: the address and the quote travel as shared text
 * (`shared`), the way the iPhone share sheet sends "text + link". The server
 * then keeps the quote as the card's first note and gives it to the model as
 * the caption; `noteKind: 'quote'` stops it from ever being read as a
 * reminder ("tomorrow" inside a quote sets nothing).
 *
 * @param {{kind: string, url?: string, quote?: string, preview?: object,
 *          image?: {data: string, mimeType: string}}} job
 */
export function buildBody(job) {
    switch (job.kind) {
        case 'page': {
            const body = {};
            const quote = cleanQuote(job.quote);
            if (quote && survivesTextExtraction(job.url)) {
                body.shared = `${job.url}\n\n${quote}`;
                body.noteKind = 'quote';
            } else {
                body.url = job.url;
                if (quote) {
                    // Rare fallback (an address ending in punctuation): the
                    // quote still informs the summary, as a quote.
                    body.note = quote;
                    body.noteKind = 'quote';
                }
            }
            if (job.preview) body.pagePreview = job.preview;
            return body;
        }
        case 'link':
        case 'image':
            // A direct image address is read by the server like a screenshot.
            return { url: job.url };
        case 'screenshot':
            return { image: job.image.data, mimeType: job.image.mimeType };
        default:
            throw new Error(`Unknown save kind: ${job.kind}`);
    }
}

function serverText(value, max = 300) {
    return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

/**
 * Every server answer, named.
 * @param {number} status
 * @param {unknown} data parsed JSON, or null
 * @returns {{outcome: string, error?: string, message?: string, upgrade?: boolean}}
 */
export function classify(status, data) {
    const d = data && typeof data === 'object' && !Array.isArray(data) ? /** @type {any} */ (data) : null;
    const error = serverText(d?.error);
    if (status >= 200 && status < 300) {
        if (!d || d.success === false) return { outcome: Outcome.UNEXPECTED };
        if (d.duplicate === true) return { outcome: Outcome.DUPLICATE };
        if (d.waiting === true) {
            return { outcome: Outcome.WAITING, message: serverText(d.message), upgrade: d.upgrade === true };
        }
        if (d.queued === true || d.saved === true) return { outcome: Outcome.SAVED };
        return { outcome: Outcome.UNEXPECTED };
    }
    if (status === 401 || status === 403) return { outcome: Outcome.RECONNECT, error };
    if (status === 429) {
        const quota = d && (typeof d.kind === 'string' || 'limit' in d || 'upgrade' in d);
        return quota
            ? { outcome: Outcome.QUOTA, error, upgrade: d.upgrade === true }
            : { outcome: Outcome.RATE_LIMITED, error };
    }
    if (status === 413) return { outcome: Outcome.TOO_LARGE, error };
    if (status >= 400 && status < 500) return { outcome: Outcome.REJECTED, error };
    if (status >= 500) return { outcome: Outcome.SERVER, error };
    return { outcome: Outcome.UNEXPECTED };
}

function isOffline() {
    return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * POST a body with the connection token. Never throws.
 *
 * Long uploads ping a cheap extension API every 20 s: Chrome stops an idle
 * service worker after 30 s, and an API call counts as activity.
 *
 * @param {object} body
 * @param {string} token
 * @param {{timeoutMs?: number}} [opts]
 * @returns {Promise<{outcome: string, status?: number, error?: string, message?: string, upgrade?: boolean}>}
 */
export async function postShare(body, token, { timeoutMs = 30000 } = {}) {
    if (isOffline()) return { outcome: Outcome.OFFLINE };
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const keepAlive = setInterval(() => {
        try {
            chrome.runtime.getPlatformInfo(() => void chrome.runtime.lastError);
        } catch { /* not in an extension context (tests) */ }
    }, 20000);
    try {
        const res = await fetch(SHARE_ENDPOINT, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Ingest-Token': token },
            body: JSON.stringify(body),
            credentials: 'omit',
            cache: 'no-store',
            signal: controller.signal,
        });
        let data = null;
        try {
            data = await res.json();
        } catch {
            data = null;
        }
        return { ...classify(res.status, data), status: res.status };
    } catch (err) {
        if (/** @type {any} */ (err)?.name === 'AbortError') return { outcome: Outcome.TIMEOUT };
        return { outcome: isOffline() ? Outcome.OFFLINE : Outcome.NETWORK };
    } finally {
        clearTimeout(timer);
        clearInterval(keepAlive);
    }
}

/**
 * Is this a working token? share_ingest answers an empty body with 400 ("No
 * URL or text found") for a token it knows and 403 for one it doesn't, and
 * saves nothing either way.
 * @returns {Promise<'valid' | 'invalid' | 'rate-limited' | 'server' | 'offline' | 'network' | 'unexpected'>}
 */
export async function verifyToken(token) {
    const res = await postShare({}, token, { timeoutMs: 20000 });
    if (res.status === 400 || (res.status && res.status >= 200 && res.status < 300)) return 'valid';
    switch (res.outcome) {
        case Outcome.RECONNECT: return 'invalid';
        case Outcome.RATE_LIMITED:
        case Outcome.QUOTA: return 'rate-limited';
        case Outcome.SERVER: return 'server';
        case Outcome.OFFLINE: return 'offline';
        case Outcome.NETWORK:
        case Outcome.TIMEOUT: return 'network';
        default: return 'unexpected';
    }
}
