/**
 * Saves that could not be sent yet: offline, no answer, server trouble, too
 * many saves at once, or a token that needs reconnecting.
 *
 * Kept in chrome.storage.local so they survive the service worker stopping
 * and the browser restarting, and retried by one chrome.alarms alarm with
 * backoff (a service worker cannot hold timers). Private-window saves are
 * never written here (see saves.js).
 *
 * Item: { id, kind, url?, title?, quote?, preview?, image?, sourceTitle?,
 *         sourceUrl?, createdAt, attempts, nextAttemptAt,
 *         status: 'pending' | 'reconnect' | 'failed', lastOutcome, error? }
 */

import { Outcome, isDelivered, isRetryable } from './api.js';

export const QUEUE_KEY = 'queue';
export const RETRY_ALARM = 'machina-retry';

/** Caps keep the queue well under storage.local's 10 MB. */
export const LIMITS = Object.freeze({ items: 100, screenshots: 3 });

/** Delay before attempt n+1 (n = attempts so far). */
const BACKOFF_MS = [30e3, 60e3, 2 * 60e3, 5 * 60e3, 15 * 60e3, 30 * 60e3, 60 * 60e3, 2 * 3600e3, 4 * 3600e3];

/** After this long, a save stops being retried and is shown as failed. */
export const GIVE_UP_MS = 24 * 3600e3;

/** A rate limit counts per hour on the server; wait a few minutes. */
const RATE_LIMIT_PAUSE_MS = 5 * 60e3;

export function backoffMs(attempts) {
    return BACKOFF_MS[Math.min(Math.max(attempts - 1, 0), BACKOFF_MS.length - 1)];
}

// Every read-modify-write goes through one chain, so an alarm-driven send
// and a "Send now" click can never overwrite each other's changes.
let chain = Promise.resolve();
function exclusive(fn) {
    const run = chain.then(fn, fn);
    chain = run.catch(() => undefined);
    return run;
}

async function read() {
    const s = await chrome.storage.local.get(QUEUE_KEY);
    return Array.isArray(s[QUEUE_KEY]) ? s[QUEUE_KEY] : [];
}

async function write(items) {
    await chrome.storage.local.set({ [QUEUE_KEY]: items });
}

/** @returns {Promise<object[]>} */
export function list() {
    return exclusive(read);
}

function newId() {
    return `q${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/** Same save already waiting? (Only links and pages can be compared.) */
function sameSave(a, b) {
    return a.kind === b.kind && a.kind !== 'screenshot' && a.url === b.url && (a.quote || '') === (b.quote || '');
}

/**
 * Keep a save for later.
 * @param {object} job the save as built by saves.js
 * @param {string} outcome why it could not be sent now
 * @returns {Promise<{added: boolean, reason?: 'full'}>}
 */
export function add(job, outcome, now = Date.now()) {
    return exclusive(async () => {
        const items = await read();
        if (items.some((i) => i.status !== 'failed' && sameSave(i, job))) return { added: true };
        const screenshots = items.filter((i) => i.kind === 'screenshot').length;
        if (items.length >= LIMITS.items || (job.kind === 'screenshot' && screenshots >= LIMITS.screenshots)) {
            return { added: false, reason: 'full' };
        }
        const attempts = 1;
        items.push({
            ...job,
            id: newId(),
            createdAt: now,
            attempts,
            nextAttemptAt: now + (outcome === Outcome.RATE_LIMITED ? RATE_LIMIT_PAUSE_MS : backoffMs(attempts)),
            status: outcome === Outcome.RECONNECT ? 'reconnect' : 'pending',
            lastOutcome: outcome,
        });
        await write(items);
        await schedule(items);
        return { added: true };
    });
}

export function remove(id) {
    return exclusive(async () => {
        const items = (await read()).filter((i) => i.id !== id);
        await write(items);
        await schedule(items);
    });
}

export function clear() {
    return exclusive(async () => {
        await write([]);
        await schedule([]);
    });
}

/** After reconnecting, saves held for the reconnect become due now. */
export function releaseReconnectHolds(now = Date.now()) {
    return exclusive(async () => {
        const items = await read();
        let changed = false;
        for (const item of items) {
            if (item.status === 'reconnect') {
                item.status = 'pending';
                item.nextAttemptAt = now;
                changed = true;
            }
        }
        if (changed) await write(items);
        await schedule(items);
    });
}

/** Arm the single retry alarm for the earliest pending save (or clear it). */
async function schedule(items, now = Date.now()) {
    const due = items.filter((i) => i.status === 'pending').map((i) => i.nextAttemptAt);
    if (!due.length) {
        await chrome.alarms.clear(RETRY_ALARM);
        return;
    }
    await chrome.alarms.create(RETRY_ALARM, { when: Math.max(Math.min(...due), now + 1000) });
}

/** Re-arm on browser start (alarms normally persist; this is the backstop). */
export function ensureScheduled() {
    return exclusive(async () => schedule(await read()));
}

/** Counts for the badge and the popup footer. */
export async function counts() {
    const items = await list();
    return {
        waiting: items.filter((i) => i.status !== 'failed').length,
        failed: items.filter((i) => i.status === 'failed').length,
    };
}

let flushing = null;

/**
 * Send what is due (everything pending with `force`). One at a time, oldest
 * first; stops early when offline, rate limited, or the token is refused.
 *
 * @param {(item: object) => Promise<{outcome: string, error?: string}>} send
 * @param {{force?: boolean, connected: boolean}} opts
 * @returns {Promise<{sent: number}>}
 */
export function flush(send, { force = false, connected }) {
    if (flushing) return flushing;
    flushing = (async () => {
        let sent = 0;
        if (!connected) return { sent };
        const snapshot = await list();
        const now = Date.now();
        const due = snapshot
            .filter((i) => i.status === 'pending' && (force || i.nextAttemptAt <= now))
            .sort((a, b) => a.createdAt - b.createdAt);
        for (const item of due) {
            if (typeof navigator !== 'undefined' && navigator.onLine === false) break;
            // Discarded from Settings while we were sending the previous one?
            if (!(await list()).some((i) => i.id === item.id)) continue;
            const res = await send(item);
            const stop = await settle(item.id, res);
            if (isDelivered(res.outcome)) sent += 1;
            if (stop) break;
        }
        await exclusive(async () => schedule(await read()));
        return { sent };
    })().finally(() => {
        flushing = null;
    });
    return flushing;
}

/**
 * Record one send's result. Returns true when the rest should wait.
 */
function settle(id, res, now = Date.now()) {
    return exclusive(async () => {
        const items = await read();
        const item = items.find((i) => i.id === id);
        if (!item) return false;
        let stop = false;
        if (isDelivered(res.outcome)) {
            items.splice(items.indexOf(item), 1);
        } else if (res.outcome === Outcome.RECONNECT) {
            for (const i of items) if (i.status === 'pending') i.status = 'reconnect';
            stop = true;
        } else if (isRetryable(res.outcome, item.kind)) {
            item.attempts += 1;
            item.lastOutcome = res.outcome;
            if (now - item.createdAt >= GIVE_UP_MS) {
                item.status = 'failed';
                item.error = 'expired';
            } else if (res.outcome === Outcome.RATE_LIMITED) {
                item.nextAttemptAt = now + RATE_LIMIT_PAUSE_MS;
                stop = true;
            } else {
                item.nextAttemptAt = now + backoffMs(item.attempts);
                stop = res.outcome === Outcome.OFFLINE;
            }
        } else {
            item.status = 'failed';
            item.lastOutcome = res.outcome;
            item.error = res.error || res.outcome;
        }
        await write(items);
        return stop;
    });
}
