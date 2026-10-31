/**
 * Service worker: wires browser events to saves. It holds no state between
 * events (Chrome stops it when idle); everything durable is in
 * chrome.storage.local. Every listener is registered synchronously at the
 * top level, as Manifest V3 requires, so an event that wakes the worker is
 * never missed.
 */

import { BRIDGE_ORIGINS, CONNECT_URL } from './lib/config.js';
import { t } from './lib/i18n.js';
import {
    connect, disconnect, getConnection, restrictStorageToExtension, tokenTag,
} from './lib/account.js';
import * as queue from './lib/queue.js';
import { readSelection } from './lib/capture.js';
import { flushQueue, saveImage, saveLink, savePage, saveScreenshot } from './lib/saves.js';
import { describe } from './lib/describe.js';
import { flashBadge, refreshBadge, showToast } from './lib/feedback.js';

restrictStorageToExtension();

export const MENU = Object.freeze({
    parent: 'machina',
    page: 'machina-page',
    link: 'machina-link',
    selection: 'machina-selection',
    image: 'machina-image',
    screenshot: 'machina-screenshot',
});

const WEB_ONLY = ['http://*/*', 'https://*/*'];

/** Right-click menu: one "Save to Machina" entry whose items follow what was clicked. */
export async function createMenus() {
    // onInstalled also fires on every extension and Chrome update; the menu
    // persists across those, so recreate it from scratch (duplicate ids throw).
    await chrome.contextMenus.removeAll();
    const all = ['page', 'link', 'selection', 'image'];
    chrome.contextMenus.create({ id: MENU.parent, title: t('menuParent'), contexts: all, documentUrlPatterns: WEB_ONLY });
    chrome.contextMenus.create({ id: MENU.page, parentId: MENU.parent, title: t('menuPage'), contexts: ['page'] });
    chrome.contextMenus.create({
        id: MENU.link, parentId: MENU.parent, title: t('menuLink'), contexts: ['link'], targetUrlPatterns: WEB_ONLY,
    });
    chrome.contextMenus.create({ id: MENU.selection, parentId: MENU.parent, title: t('menuSelection'), contexts: ['selection'] });
    chrome.contextMenus.create({
        id: MENU.image, parentId: MENU.parent, title: t('menuImage'), contexts: ['image'], targetUrlPatterns: WEB_ONLY,
    });
    chrome.contextMenus.create({ id: MENU.screenshot, parentId: MENU.parent, title: t('menuScreenshot'), contexts: all });
}

/** Badge mark + on-page confirmation for saves made without the popup. */
async function report(tab, result) {
    const view = describe(result);
    await flashBadge(tab?.id, view.tone);
    await showToast(tab?.id, view);
}

export async function onMenuClick(info, tab) {
    let result;
    switch (info.menuItemId) {
        case MENU.page:
            result = await savePage(tab);
            break;
        case MENU.selection: {
            // Read it from the clicked frame (keeps line breaks); the menu's own
            // copy is the fallback where that frame can't be read.
            const text = (tab ? await readSelection(tab.id, info.frameId ?? 0) : '') || info.selectionText || '';
            result = await savePage(tab, { quote: text });
            break;
        }
        case MENU.link:
            result = await saveLink(tab, info.linkUrl);
            break;
        case MENU.image:
            result = await saveImage(tab, info.srcUrl);
            break;
        case MENU.screenshot:
            result = await saveScreenshot(tab);
            break;
        default:
            return;
    }
    await report(tab, result);
}

export async function onCommand(command, tab) {
    if (command !== 'save-screenshot') return;
    const target = tab || (await chrome.tabs.query({ active: true, lastFocusedWindow: true }))[0];
    await report(target, await saveScreenshot(target));
}

/** Messages from the bridge must come from the top frame of Machina's root page. */
export function isTrustedBridge(sender) {
    if (!sender || sender.id !== chrome.runtime.id || sender.frameId !== 0 || !sender.tab) return false;
    let url;
    try {
        url = new URL(sender.url);
    } catch {
        return false;
    }
    if (!BRIDGE_ORIGINS.includes(url.origin)) return false;
    if (sender.origin && sender.origin !== url.origin) return false;
    // Only the app itself (/?settings=extension, /?connect=extension), never
    // the public share pages (/s/…, /c/…) that show other people's content.
    return url.pathname === '/';
}

/** Messages from our own popup and options pages. */
export function isExtensionPage(sender) {
    return Boolean(sender && sender.id === chrome.runtime.id
        && typeof sender.url === 'string' && sender.url.startsWith(chrome.runtime.getURL('')));
}

/** The web app's one-click connect (web/lib/extension.ts), relayed by bridge.js. */
export async function handleBridge(request, sender) {
    if (!isTrustedBridge(sender)) return { ok: false, reason: 'untrusted' };
    switch (request?.type) {
        case 'machina-ping': {
            const conn = await getConnection();
            const connected = Boolean(conn.token) && !conn.needsReconnect;
            return {
                ok: true,
                version: chrome.runtime.getManifest().version,
                connected,
                tokenTag: conn.token ? await tokenTag(conn.token) : null,
            };
        }
        case 'machina-connect':
            return connectAndResume(request.token, request.account);
        case 'machina-disconnect': {
            const conn = await getConnection();
            const tag = typeof request.tokenTag === 'string' ? request.tokenTag : '';
            if (!conn.token || !tag || tag !== (await tokenTag(conn.token))) return { ok: false };
            await disconnectAll();
            return { ok: true };
        }
        default:
            return { ok: false, reason: 'unknown' };
    }
}

async function connectAndResume(token, account) {
    const res = await connect(token, account);
    if (!res.ok) return { ok: false, reason: res.reason };
    // Saves captured for a different account must not land in this one.
    if (res.accountChanged) await queue.clear();
    await queue.releaseReconnectHolds();
    flushQueue({ force: true }).catch(() => undefined);
    await refreshBadge();
    return { ok: true };
}

async function disconnectAll() {
    await disconnect();
    await queue.clear();
    await refreshBadge();
}

/** Queue items for display: the screenshot bytes stay in the worker. */
function forDisplay(item) {
    const { image, preview, ...rest } = item;
    return rest;
}

export async function status() {
    const conn = await getConnection();
    const { waiting, failed } = await queue.counts();
    return {
        connected: Boolean(conn.token),
        needsReconnect: conn.needsReconnect,
        account: conn.account,
        waiting,
        failed,
        version: chrome.runtime.getManifest().version,
    };
}

/** Requests from the popup and the options page. */
export async function handlePageMessage(msg) {
    switch (msg?.type) {
        case 'status':
            return status();
        case 'flush':
            await flushQueue({ force: true });
            return status();
        case 'queue-list':
            return (await queue.list()).map(forDisplay);
        case 'queue-discard':
            await queue.remove(String(msg.id || ''));
            await refreshBadge();
            return status();
        case 'connect-token':
            return connectAndResume(msg.token, '');
        case 'disconnect':
            await disconnectAll();
            return status();
        default:
            return { ok: false, reason: 'unknown' };
    }
}

// ---- listeners (top level) -------------------------------------------------

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
    await createMenus();
    await refreshBadge();
    if (reason === 'install') {
        const conn = await getConnection();
        // A new install opens Machina's connect flow: one click when signed in.
        if (!conn.token) await chrome.tabs.create({ url: CONNECT_URL });
    }
});

chrome.runtime.onStartup.addListener(async () => {
    await queue.ensureScheduled();
    await flushQueue();
});

chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === queue.RETRY_ALARM) flushQueue().catch(() => undefined);
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    onMenuClick(info, tab).catch(() => undefined);
});

chrome.commands.onCommand.addListener((command, tab) => {
    onCommand(command, tab).catch(() => undefined);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    let work;
    if (msg?.type === 'bridge') work = handleBridge(msg.request, sender);
    else if (isExtensionPage(sender)) work = handlePageMessage(msg);
    else return false;
    work.then(sendResponse, () => sendResponse({ ok: false, reason: 'error' }));
    return true; // answer asynchronously
});

/**
 * The popup saves through a port, so the worker knows whether the popup is
 * still open when the answer arrives: if it was closed, the result goes to
 * the page as a toast instead of being lost.
 */
chrome.runtime.onConnect.addListener((port) => {
    if (port.name !== 'popup' || !isExtensionPage(port.sender)) {
        port.disconnect();
        return;
    }
    let open = true;
    port.onDisconnect.addListener(() => {
        open = false;
    });
    port.onMessage.addListener(async (msg) => {
        if (msg?.type !== 'save' || typeof msg.tabId !== 'number') return;
        let tab = null;
        try {
            tab = await chrome.tabs.get(msg.tabId);
        } catch {
            tab = null;
        }
        const result = msg.kind === 'screenshot' ? await saveScreenshot(tab) : await savePage(tab);
        const view = describe(result);
        await flashBadge(tab?.id, view.tone);
        if (open) {
            port.postMessage({ type: 'result', result, status: await status() });
        } else {
            await showToast(tab?.id, view);
        }
    });
});
