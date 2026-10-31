/**
 * Settings: which account this browser saves to, connecting with a pasted
 * token, saves waiting to be sent, keyboard shortcuts, and what the
 * extension reads. All changes go through the service worker.
 */

import { localize, t } from '../lib/i18n.js';
import { CONNECT_URL, PRIVACY_URL } from '../lib/config.js';
import { TOKEN_RE } from '../lib/account.js';
import { displayUrl } from '../lib/urls.js';

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** Words for a failed token connect (account.js / api.js reasons). */
const TOKEN_ERRORS = {
    'bad-token': 'tokenBadFormat',
    invalid: 'tokenInvalid',
    offline: 'tokenOffline',
    network: 'tokenNetwork',
    server: 'tokenServer',
    'rate-limited': 'tokenRateLimited',
    unexpected: 'tokenUnexpected',
};

/** Words for why a queued save failed for good. */
const FAILURE_TITLES = {
    'too-large': 'tooLargeTitle',
    rejected: 'rejectedTitle',
    quota: 'quotaTitle',
    unexpected: 'unsureTitle',
    timeout: 'unsureTitle',
};

const KIND_LABELS = { page: 'kindPage', link: 'kindLink', image: 'kindImage', screenshot: 'kindScreenshot' };

function ask(message) {
    return chrome.runtime.sendMessage(message);
}

function announce(text) {
    $('announcer').textContent = '';
    // A fresh node change so screen readers read repeats too.
    requestAnimationFrame(() => {
        $('announcer').textContent = text;
    });
}

async function renderAccount(status) {
    const s = status || (await ask({ type: 'status' }));
    let text;
    if (!s.connected) text = t('accountNotConnected');
    else if (s.needsReconnect) text = t('accountNeedsReconnect');
    else text = s.account ? t('accountConnected', s.account) : t('accountConnectedNoEmail');
    $('account-status').textContent = text;
    $('connect').hidden = s.connected && !s.needsReconnect;
    $('connect').textContent = s.needsReconnect ? t('reconnect') : t('connectButton');
    $('disconnect').hidden = !s.connected;
    $('disconnect-confirm').hidden = true;
    $('disconnect-warning').hidden = true;
    $('send-all').hidden = !s.connected || s.needsReconnect || s.waiting === 0;
    return s;
}

function failureText(item) {
    if (item.error === 'expired') return t('queueExpired');
    const key = FAILURE_TITLES[item.lastOutcome];
    // A server reason (e.g. "Image is too large") is more useful than a title.
    if (item.error && item.error !== item.lastOutcome) return item.error;
    return t(key || 'rejectedTitle');
}

async function renderQueue() {
    const items = await ask({ type: 'queue-list' });
    const list = $('queue-list');
    list.replaceChildren();
    $('queue-empty').hidden = items.length > 0;
    for (const item of items) {
        const li = document.createElement('li');
        const text = document.createElement('div');
        text.className = 'item-text';

        const title = document.createElement('p');
        title.className = 'item-title';
        title.setAttribute('dir', 'auto');
        const name = item.title || displayUrl(item.url || item.sourceUrl || '');
        title.textContent = `${t(KIND_LABELS[item.kind] || 'kindPage')}: ${name}`;

        const meta = document.createElement('p');
        meta.className = 'item-meta';
        if (item.status === 'failed') {
            meta.dataset.failed = '';
            meta.textContent = t('queueFailed', failureText(item));
        } else {
            meta.textContent = t(item.status === 'reconnect' ? 'queueNeedsReconnect' : 'queuePending');
        }
        text.append(title, meta);

        const discard = document.createElement('button');
        discard.type = 'button';
        discard.className = 'button secondary';
        discard.textContent = t('queueDiscard');
        discard.setAttribute('aria-label', t('queueDiscardLabel', name));
        discard.addEventListener('click', async () => {
            const status = await ask({ type: 'queue-discard', id: item.id });
            await renderAccount(status);
            await renderQueue();
            $('queue-heading').focus?.();
        });

        li.append(text, discard);
        list.append(li);
    }
}

async function renderShortcuts() {
    const dl = $('shortcuts');
    dl.replaceChildren();
    let commands = [];
    try {
        commands = await chrome.commands.getAll();
    } catch {
        commands = [];
    }
    for (const c of commands) {
        const dt = document.createElement('dt');
        dt.textContent = c.description || (c.name === '_execute_action' ? t('commandSavePage') : c.name);
        const dd = document.createElement('dd');
        if (c.shortcut) {
            const kbd = document.createElement('kbd');
            kbd.textContent = c.shortcut;
            dd.append(kbd);
        } else {
            dd.textContent = t('shortcutNotSetLabel');
        }
        dl.append(dt, dd);
    }
}

function setTokenMessage(text, tone) {
    const el = $('token-message');
    el.textContent = text;
    if (tone) el.dataset.tone = tone;
    else delete el.dataset.tone;
}

async function onTokenSubmit(event) {
    event.preventDefault();
    const input = /** @type {HTMLInputElement} */ ($('token-input'));
    const token = input.value.trim();
    if (!TOKEN_RE.test(token)) {
        setTokenMessage(t('tokenBadFormat'), 'error');
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
    }
    input.removeAttribute('aria-invalid');
    $('token-submit').setAttribute('disabled', '');
    setTokenMessage(t('tokenChecking'));
    const res = await ask({ type: 'connect-token', token });
    $('token-submit').removeAttribute('disabled');
    if (res?.ok) {
        input.value = '';
        setTokenMessage(t('tokenOk'), 'ok');
        await renderAccount();
        await renderQueue();
    } else {
        setTokenMessage(t(TOKEN_ERRORS[res?.reason] || 'tokenUnexpected'), 'error');
        input.setAttribute('aria-invalid', 'true');
    }
}

async function onDisconnect() {
    const status = await ask({ type: 'status' });
    if (status.waiting > 0) {
        // Two steps when saves would be lost.
        $('disconnect-warning').textContent = t('disconnectWarning', String(status.waiting));
        $('disconnect-warning').hidden = false;
        $('disconnect').hidden = true;
        $('disconnect-confirm').hidden = false;
        $('disconnect-confirm').focus();
        return;
    }
    await disconnectNow();
}

async function disconnectNow() {
    const status = await ask({ type: 'disconnect' });
    await renderAccount(status);
    await renderQueue();
    announce(t('disconnected'));
    $('connect').focus();
}

async function main() {
    localize(document);
    $('privacy-link').setAttribute('href', PRIVACY_URL);
    $('version').textContent = t('versionLabel', chrome.runtime.getManifest().version);

    $('connect').addEventListener('click', () => chrome.tabs.create({ url: CONNECT_URL }));
    $('disconnect').addEventListener('click', onDisconnect);
    $('disconnect-confirm').addEventListener('click', disconnectNow);
    $('token-form').addEventListener('submit', onTokenSubmit);
    $('change-shortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));
    $('send-all').addEventListener('click', async () => {
        $('send-all').setAttribute('disabled', '');
        const status = await ask({ type: 'flush' });
        $('send-all').removeAttribute('disabled');
        await renderAccount(status);
        await renderQueue();
    });

    // Reflect changes made elsewhere (the popup, a reconnect on the website).
    chrome.storage.onChanged.addListener((changes, area) => {
        if (area !== 'local') return;
        if ('queue' in changes || 'token' in changes || 'needsReconnect' in changes || 'account' in changes) {
            renderAccount().then(renderQueue);
        }
    });

    await renderAccount();
    await renderQueue();
    await renderShortcuts();
    if (new URLSearchParams(location.search).has('token')) /** @type {HTMLDetailsElement} */ ($('token-details')).open = true;
}

main();
