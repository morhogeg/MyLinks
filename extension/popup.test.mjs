// Headless load-test for the popup: `node extension/popup.test.mjs`.
//
// Stubs the few DOM + chrome APIs popup.js touches, seeds the element ids
// straight out of popup.html (so a renamed id fails loudly instead of silently
// breaking the popup), drives the real handlers, and asserts the copy a user
// actually reads. Zero dependencies. The service worker and the connect
// handshake are covered by background.test.mjs; a real Chromium run is
// e2e/extension (Playwright).
//
// It exercises the wiring, NOT the browser: every network call is a double.
import { readFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const DIR = dirname(fileURLToPath(import.meta.url));
const html = readFileSync(`${DIR}/popup.html`, 'utf8');
const sharedSrc = readFileSync(`${DIR}/shared.js`, 'utf8');
const popupSrc = readFileSync(`${DIR}/popup.js`, 'utf8');
const ids = [...html.matchAll(/id="([^"]+)"/g)].map((m) => m[1]);
const initiallyHidden = new Set([...html.matchAll(/id="([^"]+)"[^>]*\shidden[\s>]/g)].map((m) => m[1]));

let failures = 0;
function check(name, cond, detail) {
    if (cond) console.log(`  ok   ${name}`);
    else { failures++; console.log(`  FAIL ${name} ${detail ?? ''}`); }
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 6; i++) await tick(); };

// ── A fresh popup per scenario ─────────────────────────────────────────────

function makeEl(id) {
    const listeners = new Map();
    const el = {
        id,
        hidden: initiallyHidden.has(id),
        className: '',
        textContent: '',
        value: '',
        type: id === 'token' ? 'password' : undefined,
        placeholder: '',
        disabled: false,
        dataset: {},
        attrs: {},
        focused: 0,
        listeners,
        addEventListener(ev, fn) { listeners.set(ev, fn); },
        setAttribute(k, v) { this.attrs[k] = String(v); },
        focus() { this.focused++; },
        classList: null,
        child: null,
        querySelector(sel) {
            if (sel !== '.result-icon') throw new Error(`unexpected querySelector(${sel})`);
            if (!this.child) this.child = { innerHTML: '' };
            return this.child;
        },
    };
    const set = () => new Set(el.className.split(' ').filter(Boolean));
    el.classList = {
        add(c) { const s = set(); s.add(c); el.className = [...s].join(' '); },
        remove(c) { const s = set(); s.delete(c); el.className = [...s].join(' '); },
        toggle(c, on) { const s = set(); (on === undefined ? !s.has(c) : on) ? s.add(c) : s.delete(c); el.className = [...s].join(' '); },
        contains(c) { return set().has(c); },
    };
    return el;
}

async function openPopup({ storage = {}, search = '', tab = { id: 7, url: 'https://example.com/a', title: 'An article' }, shortcut = 'Ctrl+Shift+S', reply, protocol = 'chrome-extension:', width = 340, noCommands = false } = {}) {
    const els = new Map(ids.map((id) => [id, makeEl(id)]));
    const store = { ...storage };
    const sent = [];
    const opened = [];
    const portMessages = [];
    let portListener = null;
    let closed = 0;
    const storageListeners = [];
    const chrome = {
        runtime: {
            lastError: undefined,
            sendMessage: (msg, cb) => {
                sent.push(msg);
                Promise.resolve((reply && reply(msg)) || { ok: true }).then((r) => {
                    if (msg.type === 'connect-token' && r.ok) Object.assign(store, { token: msg.token });
                    if (msg.type === 'disconnect') delete store.token;
                    cb(r);
                });
            },
            connect: () => ({
                onMessage: { addListener: (fn) => { portListener = fn; } },
                onDisconnect: { addListener: () => {} },
                postMessage: (m) => { portMessages.push(m); },
            }),
        },
        storage: {
            local: {
                get: async (keys) => Object.fromEntries(keys.filter((k) => store[k] !== undefined).map((k) => [k, store[k]])),
                set: async (obj) => { Object.assign(store, obj); },
            },
            onChanged: { addListener: (fn) => storageListeners.push(fn) },
        },
        tabs: {
            query: async () => (tab ? [tab] : []),
            get: async (id) => (tab && tab.id === id ? tab : null),
            create: async ({ url }) => { opened.push(url); },
        },
        commands: noCommands ? undefined : { getAll: async () => [{ name: '_execute_action', shortcut }] },
    };
    const rootClasses = new Set();
    const docListeners = new Map();
    const document = {
        getElementById: (id) => {
            const el = els.get(id);
            if (!el) throw new Error(`popup.js asked for #${id}, which popup.html does not define`);
            return el;
        },
        addEventListener: (ev, fn) => docListeners.set(ev, fn),
        documentElement: { classList: { add: (c) => rootClasses.add(c), contains: (c) => rootClasses.has(c) } },
    };
    const ctx = {
        document, chrome, console, Promise, setTimeout, clearTimeout, URL, URLSearchParams,
        TextEncoder, crypto: globalThis.crypto,
        location: { search, protocol },
        navigator: { userAgent: 'Mozilla/5.0 Chrome/150.0' },
        window: { close: () => { closed++; }, innerWidth: width },
    };
    ctx.self = ctx;
    ctx.globalThis = ctx;
    vm.createContext(ctx);
    vm.runInContext(sharedSrc, ctx);
    vm.runInContext(popupSrc, ctx);
    await docListeners.get('DOMContentLoaded')();
    await settle();
    const $ = (id) => els.get(id);
    return {
        $, store, sent, opened, portMessages, rootClasses,
        get closed() { return closed; },
        click: async (id) => { await $(id).listeners.get('click')(); await settle(); },
        key: async (id, key) => { await $(id).listeners.get('keydown')({ key, preventDefault() {} }); await settle(); },
        docKey: async (key) => { docListeners.get('keydown')({ key, preventDefault() {} }); await settle(); },
        // The service worker's answer to the last save, through the port.
        answer: async (view) => { portListener({ type: 'result', view }); await settle(); },
        storageChange: async (changes) => { storageListeners.forEach((fn) => fn(changes, 'local')); await settle(); },
        visible: (id) => !$(id).hidden,
    };
}

const view = (p) => p.$('app').dataset.view;
const S = (() => { const c = { console, URL, TextEncoder, crypto: globalThis.crypto }; c.self = c; vm.createContext(c); vm.runInContext(sharedSrc, c); return c.MachinaShared; })();

// ── 1. First run: not connected ────────────────────────────────────────────
console.log('first run');
{
    const p = await openPopup();
    check('opens on the connect screen', view(p) === 'connect', view(p));
    check('only the connect view is visible', p.visible('viewConnect') && !p.visible('viewSave') && !p.visible('viewSettings') && !p.visible('viewToken'));
    check('nothing is saved without a token', p.portMessages.length === 0);
    check('gear is offered, Back is not', p.visible('settingsBtn') && !p.visible('backBtn'));
    await p.click('connectBtn');
    check('Connect opens the web app connect page', p.opened[0] === 'https://mymachina.app/?connect=extension', p.opened.join());
    check('Connect closes the popup', p.closed === 1);
}

// ── 2. Token fallback ─────────────────────────────────────────────────────
console.log('token fallback');
{
    const p = await openPopup({ reply: (m) => (m.token === 'good-token-1234567890' ? { ok: true } : { ok: false, message: "That token doesn't work. It may have been reset." }) });
    await p.click('useTokenBtn');
    check('Use a token opens the token screen', view(p) === 'token' && p.visible('backBtn'));
    check('the token field gets focus', p.$('token').focused > 0);
    check('backend placeholder is the default', p.$('baseUrl').placeholder === 'https://secondbrain-app-94da2.web.app');
    await p.click('saveTokenBtn');
    check('empty token is refused', p.$('tokenStatus').textContent === 'Paste your token first.' && p.$('tokenStatus').className.includes('err'));
    p.$('token').value = 'short';
    await p.click('saveTokenBtn');
    check('a malformed token is refused before any network call', p.$('tokenStatus').textContent === "That doesn't look like a Machina token." && !p.sent.length);
    p.$('token').value = 'wrong-token-1234567890';
    await p.click('saveTokenBtn');
    check('a rejected token shows the reason and is not stored', p.$('tokenStatus').textContent.startsWith("That token doesn't work") && !p.store.token);
    p.$('token').value = '  good-token-1234567890  ';
    await p.key('token', 'Enter');
    check('Enter checks and stores a good token, trimmed', p.store.token === 'good-token-1234567890', JSON.stringify(p.store));
    check('the check went through the service worker', p.sent.some((m) => m.type === 'connect-token' && m.token === 'good-token-1234567890'));
    check('success is said plainly', p.$('tokenStatus').textContent.startsWith('Connected.') && p.$('tokenStatus').className.includes('ok'));
    check('the field is cleared after connecting', p.$('token').value === '');
    await p.click('reveal');
    check('Show reveals and is announced', p.$('token').type === 'text' && p.$('reveal').textContent === 'Hide' && p.$('reveal').attrs['aria-pressed'] === 'true');
    await p.click('reveal');
    check('Show toggles back', p.$('token').type === 'password' && p.$('reveal').textContent === 'Show');
    await p.click('backBtn');
    check('Back from a fresh connection lands on the save screen and saves', view(p) === 'save' && p.portMessages.length === 1, view(p));
}
{
    const p = await openPopup();
    await p.click('useTokenBtn');
    p.$('token').value = 'good-token-1234567890';
    p.$('baseUrl').value = 'not a url';
    await p.click('saveTokenBtn');
    check('a bad server address is refused', p.$('tokenStatus').textContent.startsWith('The server address should look like'));
}

// ── 3. Connected: opening the popup saves the page ─────────────────────────
console.log('save on open');
const connected = { token: 'good-token-1234567890' };
{
    const p = await openPopup({ storage: connected });
    check('opens on the save screen', view(p) === 'save');
    check('shows the page title and host', p.$('pageTitle').textContent === 'An article' && p.$('pageHost').textContent === 'example.com');
    check('asks the service worker to save this tab', p.portMessages[0] && p.portMessages[0].type === 'save' && p.portMessages[0].url === 'https://example.com/a' && p.portMessages[0].tabId === 7, JSON.stringify(p.portMessages));
    check('the popup is not laid out as a tab', !p.rootClasses.has('in-tab'));
    check('says Saving while it waits (no early done)', p.$('result').dataset.state === 'saving' && p.$('resultTitle').textContent === 'Saving');
    check('no action buttons while saving', !p.visible('actionBtn') && !p.visible('openBtn'));
    check('shortcut tip uses the real binding', p.$('shortcutHint').textContent === 'Tip: press Ctrl+Shift+S on any page to save it.', p.$('shortcutHint').textContent);

    const saved = S.describeResult({ ok: true, status: 200, body: { success: true, queued: true, id: 'q1' } });
    await p.answer(saved);
    check('saved: says saved, and that reading is still happening', p.$('resultTitle').textContent === 'Saved to Machina' && /reading it now/.test(p.$('resultDetail').textContent));
    check('saved: offers Open Machina only', p.visible('openBtn') && !p.visible('actionBtn'));
    check('saved: success styling, not error', p.$('result').dataset.state === 'saved' && !p.$('result').classList.contains('is-error'));
    await p.click('openBtn');
    check('Open Machina opens the library', p.opened.at(-1) === 'https://mymachina.app/');
}
{
    const p = await openPopup({ storage: connected });
    await p.answer(S.describeResult({ ok: true, status: 200, body: { success: true, saved: true, waiting: true, upgrade: true, message: 'Saved. Machina will read it on the 1st, or now with Pro.' } }));
    check('waiting: reads as saved for later', p.$('resultTitle').textContent === 'Saved for later' && p.$('result').dataset.state === 'waiting');
    check('waiting: shows the server message', p.$('resultDetail').textContent === 'Saved. Machina will read it on the 1st, or now with Pro.');
    check('waiting: not styled as an error', !p.$('result').classList.contains('is-error'));
    check('waiting: offers Get Pro and Open Machina', p.$('actionBtn').textContent === 'Get Pro' && p.visible('actionBtn') && p.visible('openBtn'));
    check('waiting: clock icon, not a check', p.$('result').child.innerHTML.includes('M12 7v5.2'));
    await p.click('actionBtn');
    check('Get Pro opens the paywall', p.opened.at(-1) === 'https://mymachina.app/?paywall=saves');
}
{
    const p = await openPopup({ storage: connected });
    await p.answer(S.describeResult({ ok: true, status: 200, body: { success: true, saved: true, waiting: true, upgrade: false, message: 'Saved. Machina will read it on the 1st.' } }));
    check('waiting on Pro: no upgrade button', !p.visible('actionBtn') && p.visible('openBtn'));
}
{
    const p = await openPopup({ storage: connected });
    await p.answer(S.describeResult({ ok: true, status: 200, body: { success: true, duplicate: true } }));
    check('duplicate: already in your library, not an error', p.$('resultTitle').textContent === 'Already in your library' && !p.$('result').classList.contains('is-error'));
}
{
    const p = await openPopup({ storage: connected });
    await p.answer(S.describeResult({ ok: false, status: 403, body: { error: 'Invalid ingest token' } }));
    check('revoked token: says reconnect', p.$('resultTitle').textContent === 'Reconnect Machina' && p.$('actionBtn').textContent === 'Reconnect');
    await p.click('actionBtn');
    check('Reconnect opens the web connect page', p.opened.at(-1) === 'https://mymachina.app/?connect=extension');
}
{
    const p = await openPopup({ storage: connected });
    await p.answer(S.describeResult({ ok: false, status: 0, error: 'offline' }));
    check('offline: says so with Try again', p.$('resultTitle').textContent === "You're offline" && p.$('actionBtn').textContent === 'Try again');
    await p.click('actionBtn');
    check('Try again saves again and shows Saving', p.portMessages.length === 2 && p.$('result').dataset.state === 'saving');
}
{
    const p = await openPopup({ storage: connected });
    await p.answer(S.describeResult({ ok: false, status: 503, body: null }));
    check('server error: retryable, error styled', p.$('resultTitle').textContent === 'Machina hit a problem' && p.$('result').classList.contains('is-error') && p.visible('actionBtn'));
}
{
    const p = await openPopup({ storage: connected });
    await p.answer(S.describeResult({ ok: false, status: 0, error: 'timeout' }));
    check('timeout: never claims success or failure', p.$('resultTitle').textContent === 'No answer from Machina' && /may still have saved/.test(p.$('resultDetail').textContent) && p.visible('openBtn'));
}

// ── 4. Pages that can't be saved never reach the server ────────────────────
console.log('restricted pages');
for (const [url, expect] of [
    ['chrome://newtab/', /Browser pages/],
    ['edge://settings', /Browser pages/],
    ['file:///Users/me/doc.pdf', /Files on your computer/],
    ['chrome-extension://abc/index.html', /belongs to an extension/],
    ['', /can't see this tab/],
]) {
    const p = await openPopup({ storage: connected, tab: { id: 3, url, title: '' } });
    if (!url) check('no address and no title: the empty page card is hidden', p.$('pageCard').hidden === true);
    check(`${url || '(no url)'}: explained, nothing sent`, p.$('resultTitle').textContent === "Can't save this page" && expect.test(p.$('resultDetail').textContent) && p.portMessages.length === 0, p.$('resultDetail').textContent);
}
{
    const p = await openPopup({ storage: connected, tab: { id: 3, url: 'https://chromewebstore.google.com/detail/x', title: 'Store' } });
    check('a store listing is a web page and is saved', p.portMessages.length === 1);
}

// ── 5. RTL titles ─────────────────────────────────────────────────────────
{
    const p = await openPopup({ storage: connected, tab: { id: 4, url: 'https://www.ynet.co.il/news/1', title: 'כותרת בעברית: מה קרה היום' } });
    check('Hebrew title shown as is, host without www', p.$('pageTitle').textContent === 'כותרת בעברית: מה קרה היום' && p.$('pageHost').textContent === 'ynet.co.il');
    check('title element carries dir=auto', /id="pageTitle"[^>]*dir="auto"/.test(html));
}

// ── 6. Options page: settings, never a save ────────────────────────────────
console.log('settings');
{
    const p = await openPopup({ storage: { token: 'good-token-1234567890', account: 'me@example.com' }, search: '?view=settings' });
    check('options page opens on settings', view(p) === 'settings');
    check('options page saves nothing', p.portMessages.length === 0);
    check('says Connected with the account', p.$('connText').textContent === 'Connected' && p.$('accountLine').textContent === 'Saving to me@example.com' && p.visible('accountLine'));
    check('offers Reconnect and Disconnect', p.$('settingsConnectBtn').textContent === 'Reconnect' && p.visible('disconnectBtn'));
    check('shows the shortcut', p.$('shortcutKeys').textContent === 'Ctrl+Shift+S');
    await p.click('disconnectBtn');
    check('Disconnect clears the token', !p.store.token && p.$('connText').textContent === 'Not connected' && !p.visible('disconnectBtn'));
    await p.storageChange({ token: { newValue: 'fresh-token-1234567890' }, account: { newValue: 'me@example.com' } });
    check('a connect from the web app shows up live', p.$('connText').textContent === 'Connected');
    await p.click('shortcutLink');
    check('Change shortcut opens the browser shortcuts page', p.opened.at(-1) === 'chrome://extensions/shortcuts');
    check('the options page stays open', p.closed === 0);
}
{
    const p = await openPopup({ storage: connected, shortcut: '' });
    check('no shortcut bound: the tip says how else to save', /right click/.test(p.$('shortcutHint').textContent));
    await p.click('settingsBtn');
    check('gear opens settings with Back', view(p) === 'settings' && p.visible('backBtn') && p.$('shortcutKeys').textContent === 'Not set');
    await p.docKey('Escape');
    check('Escape goes back', view(p) === 'save');
}
{
    const p = await openPopup({ storage: connected, search: '?tab=9', tab: { id: 9, url: 'https://example.org/x', title: 'Target' } });
    check('?tab= aims the save at that tab', p.portMessages[0] && p.portMessages[0].url === 'https://example.org/x');
}

// ── 7. Safari ─────────────────────────────────────────────────────────────
console.log('safari');
{
    // Safari hands over an empty address until Machina is allowed on the site.
    const p = await openPopup({ storage: connected, protocol: 'safari-web-extension:', tab: { id: 5, url: '', title: '' } });
    check('Safari, no address: says how to allow the site', p.$('resultTitle').textContent === 'Allow Machina on this website' && /Safari Settings, Extensions, Machina/.test(p.$('resultDetail').textContent) && p.portMessages.length === 0);
}
{
    const p = await openPopup({ storage: connected, protocol: 'safari-web-extension:', search: '?view=settings', width: 1200, noCommands: true });
    check('Safari options tab: centered column', p.rootClasses.has('in-tab'));
    check('Safari: no shortcuts page to send people to', p.$('shortcutLink').hidden === true);
    check('no commands API: the shortcut reads Not set, nothing throws', p.$('shortcutKeys').textContent === 'Not set');
}
{
    const p = await openPopup({ storage: connected, search: '?view=settings' });
    check('Chrome options dialog: fills the dialog too', p.rootClasses.has('in-tab') && p.$('shortcutLink').hidden === false);
}

// ── 8. Every string a user reads is em-dash free ───────────────────────────
for (const f of ['popup.js', 'popup.html', 'popup.css', 'background.js', 'shared.js', 'connect.js', 'manifest.json', 'README.md']) {
    const body = readFileSync(`${DIR}/${f}`, 'utf8');
    const bad = body.split('\n').map((l, i) => [i + 1, l]).filter(([, l]) => l.includes('—'));
    check(`${f} has no em dashes`, bad.length === 0, bad.map(([n]) => `line ${n}`).join(', '));
}

console.log(failures === 0 ? '\nAll popup checks passed.' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
