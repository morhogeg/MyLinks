/**
 * The popup saves the page the moment it opens (one click), then says what
 * happened in plain words. The save itself runs in the service worker over a
 * port, so closing the popup early never cancels it: the worker shows the
 * result on the page instead.
 */

import { localize, t } from '../lib/i18n.js';
import { describe } from '../lib/describe.js';
import { APP_URL, CONNECT_URL, PRIVACY_URL } from '../lib/config.js';
import { displayUrl, savability } from '../lib/urls.js';

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** @type {{tab: chrome.tabs.Tab | null, port: chrome.runtime.Port | null, status: any, busy: boolean, lastKind: string}} */
const state = { tab: null, port: null, status: null, busy: false, lastKind: 'page' };

/** Outcomes after which the page is in Machina (or will be). */
const KEPT = new Set(['saved', 'duplicate', 'waiting', 'queued', 'reconnect', 'unsure', 'unexpected']);

function ask(message) {
    return chrome.runtime.sendMessage(message);
}

function openTab(url) {
    chrome.tabs.create({ url }).finally(() => window.close());
}

/** `hidden` as an attribute: SVG elements have no `.hidden` property. */
function setHidden(el, hidden) {
    el.toggleAttribute('hidden', hidden);
}

function setIcon(name) {
    setHidden($('spinner'), true);
    setHidden($('result-svg'), false);
    $('result-use').setAttribute('href', `#i-${name}`);
}

function setBusy(kind) {
    state.busy = true;
    state.lastKind = kind;
    $('result').dataset.tone = 'neutral';
    setHidden($('spinner'), false);
    setHidden($('result-svg'), true);
    $('result-title').textContent = t(kind === 'screenshot' ? 'savingScreenshot' : 'saving');
    $('result-detail').textContent = '';
    $('quote').hidden = true;
    $('hint').hidden = true;
    $('actions').replaceChildren();
}

/**
 * @param {string} label
 * @param {'primary' | 'secondary' | 'link'} variant
 * @param {() => void} onClick
 * @param {string} [icon]
 */
function button(label, variant, onClick, icon) {
    const el = document.createElement('button');
    el.type = 'button';
    el.className = variant === 'link' ? 'link-button' : `button ${variant}`;
    if (icon) {
        const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('class', 'icon');
        svg.setAttribute('aria-hidden', 'true');
        const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
        use.setAttribute('href', `#i-${icon}`);
        svg.append(use);
        el.append(svg);
    }
    el.append(document.createTextNode(label));
    el.addEventListener('click', onClick);
    return el;
}

function actionsFor(result) {
    const open = () => openTab(APP_URL);
    const screenshotAllowed = state.tab && savability(state.tab.url).ok;
    switch (result.outcome) {
        case 'not-connected':
            return [
                button(t('connectButton'), 'primary', () => openTab(CONNECT_URL), 'link'),
                button(t('useToken'), 'link', () => openTab(chrome.runtime.getURL('src/options/options.html?token=1'))),
                button(t('privacyLink'), 'link', () => openTab(PRIVACY_URL)),
            ];
        case 'reconnect':
            return [button(t('reconnect'), 'primary', () => openTab(CONNECT_URL), 'link')];
        case 'screenshot-failed':
        case 'private-failed':
            return [
                button(t('tryAgain'), 'primary', () => save(state.lastKind)),
                button(t('openMachina'), 'secondary', open, 'open'),
            ];
        case 'queue-full':
            return [
                button(t('settings'), 'secondary', () => chrome.runtime.openOptionsPage().then(() => window.close()), 'gear'),
                button(t('openMachina'), 'primary', open, 'open'),
            ];
        case 'unsavable':
        case 'no-tab':
            return [button(t('openMachina'), 'secondary', open, 'open')];
        default: {
            const list = [];
            if (result.kind === 'page' && screenshotAllowed) {
                list.push(button(t('saveScreenshot'), 'secondary', () => save('screenshot'), 'camera'));
            }
            list.push(button(t('openMachina'), 'primary', open, 'open'));
            return list;
        }
    }
}

function show(result) {
    state.busy = false;
    const view = describe(result);
    $('result').dataset.tone = view.tone;
    setIcon(view.icon);
    $('result-title').textContent = view.title;
    $('result-detail').textContent = view.detail;

    const quoteShown = Boolean(result.quote) && KEPT.has(result.outcome);
    $('quote').hidden = !quoteShown;
    $('quote-text').textContent = quoteShown ? result.quote.slice(0, 600) : '';

    // Before connecting (the user's consent), say exactly what gets sent.
    const disclose = result.outcome === 'not-connected';
    const hintShown = disclose || (Boolean(result.site) && result.kind === 'page' && KEPT.has(result.outcome));
    $('hint').hidden = !hintShown;
    $('hint').textContent = disclose ? t('connectDisclosure') : hintShown ? t('partialHint', result.site) : '';

    const actions = actionsFor(result);
    $('actions').replaceChildren(...actions);
    // Enter does the obvious next thing; the result itself is announced by
    // the live region it lives in.
    const primary = actions.find((el) => el.classList.contains('primary')) || actions[0];
    primary?.focus();
}

function renderPage(tab) {
    $('page').hidden = false;
    $('page-title').textContent = tab.title || displayUrl(tab.url);
    $('page-url').textContent = displayUrl(tab.url);
    const icon = tab.favIconUrl || '';
    const usable = /^(https:|data:image\/)/.test(icon);
    setHidden($('favicon'), !usable);
    setHidden($('favicon-fallback'), usable);
    if (usable) $('favicon').setAttribute('src', icon);
    $('favicon').addEventListener('error', () => {
        setHidden($('favicon'), true);
        setHidden($('favicon-fallback'), false);
    }, { once: true });
}

function renderFooter() {
    const s = state.status;
    if (!s) return;
    const waiting = s.waiting || 0;
    $('queue-line').hidden = waiting === 0;
    $('queue-text').textContent = waiting === 1 ? t('queueOne') : t('queueMany', String(waiting));
    $('send-now').hidden = Boolean(s.needsReconnect) || !s.connected;

    $('account-line').hidden = !s.connected;
    $('account-line').textContent = s.account ? t('savingTo', s.account) : t('connectedNoAccount');
}

async function renderShortcut() {
    const line = $('shortcut-line');
    let shortcut = '';
    try {
        const commands = await chrome.commands.getAll();
        shortcut = commands.find((c) => c.name === '_execute_action')?.shortcut || '';
    } catch {
        return; // No shortcuts in this browser.
    }
    line.hidden = false;
    if (shortcut) {
        // Localized sentence around the keys: "Shortcut: <kbd>Ctrl+Shift+S</kbd>".
        const [before, after = ''] = t('shortcutHint', '\u0000').split('\u0000');
        const kbd = document.createElement('kbd');
        kbd.textContent = shortcut;
        line.replaceChildren(document.createTextNode(before), kbd, document.createTextNode(after));
    } else {
        line.replaceChildren(button(t('shortcutNotSet'), 'link', () => openTab('chrome://extensions/shortcuts')));
    }
}

function connectPort() {
    if (state.port) return state.port;
    const port = chrome.runtime.connect({ name: 'popup' });
    port.onMessage.addListener((msg) => {
        if (msg?.type !== 'result') return;
        state.status = msg.status || state.status;
        renderFooter();
        show(msg.result);
    });
    port.onDisconnect.addListener(() => {
        state.port = null;
        // The worker restarted mid-save: say so honestly.
        if (state.busy) show({ outcome: 'unexpected', kind: state.lastKind });
    });
    state.port = port;
    return port;
}

function save(kind) {
    if (!state.tab || state.busy) return;
    setBusy(kind);
    connectPort().postMessage({ type: 'save', kind, tabId: state.tab.id });
}

async function main() {
    localize(document);
    $('open-settings').addEventListener('click', () => chrome.runtime.openOptionsPage().then(() => window.close()));
    $('send-now').addEventListener('click', async () => {
        $('send-now').setAttribute('disabled', '');
        state.status = await ask({ type: 'flush' });
        $('send-now').removeAttribute('disabled');
        renderFooter();
    });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    state.tab = tab || null;
    state.status = await ask({ type: 'status' });
    renderFooter();
    renderShortcut();

    if (!state.tab) {
        show({ outcome: 'no-tab' });
        return;
    }
    renderPage(state.tab);
    if (!state.status?.connected) {
        show({ outcome: 'not-connected' });
        return;
    }
    const check = savability(state.tab.url);
    if (!check.ok) {
        show({ outcome: 'unsavable', reason: check.reason, kind: 'page' });
        return;
    }
    save('page');
}

main();
