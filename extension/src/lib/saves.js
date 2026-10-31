/**
 * The five ways to save, end to end: read what the user chose, send it, and
 * on a failure that can heal (offline, no answer, server trouble, rate limit,
 * a token needing reconnect) keep it in the retry queue instead of losing it.
 *
 * Every function returns a result object for describe.js:
 *   { outcome, kind, title?, url?, quote?, site?, cause?, queued?, message?, error?, reason? }
 */

import { Outcome, buildBody, cleanQuote, isDelivered, isRetryable, postShare } from './api.js';
import { getConnection, markNeedsReconnect } from './account.js';
import * as queue from './queue.js';
import { captureVisible, readPage, socialPreview } from './capture.js';
import { previewOnlySite, savability } from './urls.js';
import { refreshBadge } from './feedback.js';

/** A screenshot can be a few MB on a slow uplink; pages are tiny requests. */
const TIMEOUT_MS = { page: 30000, link: 30000, image: 30000, screenshot: 60000 };

const TITLE_MAX = 500;

function send(job, token) {
    return postShare(buildBody(job), token, { timeoutMs: TIMEOUT_MS[job.kind] || 30000 });
}

/**
 * Send one save now, or keep it for later.
 * @param {object} job
 * @param {{incognito?: boolean}} ctx private-window saves never touch disk
 */
async function deliver(job, { incognito = false } = {}) {
    const conn = await getConnection();
    if (!conn.token) return { outcome: 'not-connected' };

    const keep = async (outcome, onKept) => {
        if (incognito) return null;
        const added = await queue.add(job, outcome);
        return added.added ? onKept : { outcome: 'queue-full' };
    };

    if (conn.needsReconnect) {
        return (await keep(Outcome.RECONNECT, { outcome: 'reconnect', queued: true }))
            || { outcome: 'reconnect', queued: false };
    }

    const res = await send(job, conn.token);
    if (res.outcome === Outcome.RECONNECT) {
        await markNeedsReconnect();
        return (await keep(Outcome.RECONNECT, { outcome: 'reconnect', queued: true }))
            || { outcome: 'reconnect', queued: false };
    }
    if (isRetryable(res.outcome, job.kind)) {
        return (await keep(res.outcome, { outcome: 'queued', cause: res.outcome }))
            || { outcome: 'private-failed', cause: res.outcome };
    }
    // A screenshot with no answer may still have arrived: don't send it twice.
    if (res.outcome === Outcome.TIMEOUT) return { outcome: 'unsure' };
    if (isDelivered(res.outcome)) {
        // The connection works: send anything that was waiting.
        flushQueue().catch(() => undefined);
    }
    return res;
}

async function finish(result, job, tab) {
    await refreshBadge().catch(() => undefined);
    return {
        ...result,
        kind: job.kind,
        title: job.title || '',
        url: job.url || job.sourceUrl || '',
        quote: job.quote || '',
        site: job.kind === 'page' ? previewOnlySite(tab?.url) : null,
    };
}

/**
 * The page in `tab`, with the text selected in it (or `quote` when the caller
 * read the selection itself, e.g. from the right-clicked frame).
 * @param {chrome.tabs.Tab} tab
 * @param {{quote?: string}} [opts]
 */
export async function savePage(tab, { quote } = {}) {
    if (!tab || typeof tab.id !== 'number') return { outcome: 'no-tab', kind: 'page' };
    const check = savability(tab.url);
    if (!check.ok) return { outcome: 'unsavable', reason: check.reason, kind: 'page', title: tab.title || '' };

    const facts = await readPage(tab.id); // null where the browser forbids reading
    const job = {
        kind: 'page',
        url: tab.url,
        title: (facts?.title || tab.title || '').slice(0, TITLE_MAX),
    };
    const selected = cleanQuote(quote !== undefined ? quote : facts?.selection);
    if (selected) job.quote = selected;
    const preview = socialPreview(tab.url, facts);
    if (preview) job.preview = preview;

    return finish(await deliver(job, { incognito: tab.incognito }), job, tab);
}

/** A right-clicked link. */
export async function saveLink(tab, linkUrl) {
    if (!savability(linkUrl).ok) return { outcome: 'unsavable', reason: savability(linkUrl).reason, kind: 'link' };
    const job = { kind: 'link', url: linkUrl, title: linkUrl };
    return finish(await deliver(job, { incognito: tab?.incognito }), job, tab);
}

/** A right-clicked image, by address; the server reads it like a screenshot. */
export async function saveImage(tab, srcUrl) {
    if (!savability(srcUrl).ok) return { outcome: 'image-unsavable', kind: 'image' };
    const job = { kind: 'image', url: srcUrl, title: (tab?.title || srcUrl).slice(0, TITLE_MAX) };
    return finish(await deliver(job, { incognito: tab?.incognito }), job, tab);
}

/**
 * Injected before a capture: remove our own on-page confirmation (it would
 * be in the picture) and wait for the page to repaint.
 */
function clearToastInFrame() {
    for (const el of document.querySelectorAll('machina-save-toast')) el.remove();
    return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))));
}

/** What the user sees in the tab right now, as an image card. */
export async function saveScreenshot(tab) {
    if (!tab || typeof tab.windowId !== 'number') return { outcome: 'no-tab', kind: 'screenshot' };
    try {
        await chrome.scripting.executeScript({ target: { tabId: tab.id, frameIds: [0] }, func: clearToastInFrame });
    } catch {
        // Not allowed to draw here, so there is no toast to remove either.
    }
    let image;
    try {
        image = await captureVisible(tab.windowId);
    } catch {
        return { outcome: 'screenshot-failed', kind: 'screenshot', title: tab.title || '' };
    }
    const job = {
        kind: 'screenshot',
        image: { data: image.data, mimeType: image.mimeType },
        // Shown in the queue only; the server gets the image alone (a note
        // would be read for reminders on this path).
        title: (tab.title || '').slice(0, TITLE_MAX),
        sourceUrl: savability(tab.url).ok ? tab.url : '',
    };
    return finish(await deliver(job, { incognito: tab.incognito }), job, tab);
}

/**
 * Send queued saves: when due (alarm), or all of them (`force`, "Send now").
 */
export async function flushQueue({ force = false } = {}) {
    const conn = await getConnection();
    const result = await queue.flush(async (item) => {
        const res = await send(item, conn.token);
        if (res.outcome === Outcome.RECONNECT) await markNeedsReconnect();
        return res;
    }, { force, connected: Boolean(conn.token) && !conn.needsReconnect });
    await refreshBadge().catch(() => undefined);
    return result;
}
