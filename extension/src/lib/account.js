/**
 * The connection to a Machina account: one ingest token, kept in
 * chrome.storage.local (on this computer only, never synced) and readable
 * only by the extension's own pages and service worker (see
 * restrictStorageToExtension). The token can add saves to the account and do
 * nothing else: it cannot read the library.
 */

import { verifyToken } from './api.js';

/** Same shape the server accepts (main.py _INGEST_TOKEN_RE). */
export const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

/** Longest account label kept for display (an email address). */
const ACCOUNT_MAX = 320;

/**
 * Keep the token away from content scripts, including our own on
 * mymachina.app: by default chrome.storage.local is readable there.
 * Supported for `local` since Chrome 140 (the manifest's minimum).
 */
export async function restrictStorageToExtension() {
    try {
        await chrome.storage.local.setAccessLevel({ accessLevel: 'TRUSTED_CONTEXTS' });
    } catch {
        // Older engines (Safari) keep the default; nothing else depends on it.
    }
}

/**
 * @returns {Promise<{token: string, account: string, needsReconnect: boolean}>}
 */
export async function getConnection() {
    const s = await chrome.storage.local.get(['token', 'account', 'needsReconnect']);
    return {
        token: typeof s.token === 'string' ? s.token : '',
        account: typeof s.account === 'string' ? s.account : '',
        needsReconnect: s.needsReconnect === true,
    };
}

/**
 * A short one-way tag of a token, so the website can tell "connected to this
 * account" from "connected to another one" without ever being sent the token.
 * Must match web/lib/extension.ts tokenTag().
 */
export async function tokenTag(token) {
    if (!token) return null;
    const digest = new Uint8Array(
        await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`machina-ext:${token}`)),
    );
    return Array.from(digest.slice(0, 6), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Same reasons the website shows words for (web/lib/extension.ts ConnectFailure). */
const VERIFY_TO_REASON = {
    invalid: 'invalid',
    'rate-limited': 'rate-limited',
    server: 'server',
    offline: 'offline',
    network: 'network',
    unexpected: 'unexpected',
};

/**
 * Check a token with the server and keep it.
 *
 * Saves still waiting in the queue were captured for the previous account.
 * If the new connection names a DIFFERENT account, they are discarded rather
 * than filed into someone else's library; the caller does that with
 * `accountChanged`.
 *
 * @param {string} token
 * @param {string} [account] display label the website passes (an email)
 * @returns {Promise<{ok: true, accountChanged: boolean} | {ok: false, reason: string}>}
 */
export async function connect(token, account = '') {
    const value = typeof token === 'string' ? token.trim() : '';
    if (!TOKEN_RE.test(value)) return { ok: false, reason: 'bad-token' };
    const verdict = await verifyToken(value);
    if (verdict !== 'valid') return { ok: false, reason: VERIFY_TO_REASON[verdict] || 'unexpected' };

    const label = typeof account === 'string' ? account.trim().slice(0, ACCOUNT_MAX) : '';
    const before = await getConnection();
    const accountChanged = Boolean(before.account && label && before.account.toLowerCase() !== label.toLowerCase());
    await chrome.storage.local.set({
        token: value,
        account: label,
        connectedAt: Date.now(),
        needsReconnect: false,
    });
    return { ok: true, accountChanged };
}

/** Forget the token (the caller also clears the queue). */
export async function disconnect() {
    await chrome.storage.local.remove(['token', 'account', 'connectedAt', 'needsReconnect']);
}

/** The server no longer accepts the token: keep saves, ask to reconnect. */
export async function markNeedsReconnect() {
    await chrome.storage.local.set({ needsReconnect: true });
}
