// Headless tests for the service worker and the shared logic:
// `node extension/background.test.mjs`.
//
// Runs the real background.js + shared.js in a vm with stubbed chrome.* APIs
// and a fake fetch, then drives the same events the browser would fire: the
// web app's connect handshake (relayed by connect.js), right-click saves, the
// popup's port, notifications, install. Zero dependencies. Proves the wiring
// and the security checks, not that Chrome loads the extension (that is the
// Playwright run in e2e/extension).
import { readFileSync } from 'fs';
import { dirname } from 'path';
import { fileURLToPath } from 'url';
import vm from 'vm';

const DIR = dirname(fileURLToPath(import.meta.url));
const sharedSrc = readFileSync(`${DIR}/shared.js`, 'utf8');
const bgSrc = readFileSync(`${DIR}/background.js`, 'utf8');
const MANIFEST = JSON.parse(readFileSync(`${DIR}/manifest.json`, 'utf8'));
const EXT_ID = 'gjegndcjhemlpeoiamfebeoaeegkelnk';
const API = 'https://secondbrain-app-94da2.web.app';
const GOOD = 'tok_GoodToken_1234567890';
const OTHER = 'tok_OtherToken_0987654321';

let failures = 0;
function check(name, cond, detail) {
    if (cond) console.log(`  ok   ${name}`);
    else { failures++; console.log(`  FAIL ${name} ${detail ?? ''}`); }
}
const tick = () => new Promise((r) => setTimeout(r, 0));
const settle = async () => { for (let i = 0; i < 10; i++) await tick(); };

const ev = () => {
    const fns = [];
    return { addListener: (fn) => fns.push(fn), fns, fire: (...a) => fns.map((fn) => fn(...a)) };
};

// ── Shared logic, on its own ───────────────────────────────────────────────
const S = (() => {
    const c = { console, URL, TextEncoder, crypto: globalThis.crypto };
    c.self = c;
    vm.createContext(c);
    vm.runInContext(sharedSrc, c);
    return c.MachinaShared;
})();

console.log('classifyUrl');
for (const [url, ok, reason] of [
    ['https://example.com/a', true],
    ['http://example.com', true],
    ['https://example.com/report.pdf', true],
    ['https://chromewebstore.google.com/detail/abc', true],
    ['chrome://extensions', false, 'browser'],
    ['edge://newtab', false, 'browser'],
    ['brave://settings', false, 'browser'],
    ['about:blank', false, 'browser'],
    ['view-source:https://x.com', false, 'browser'],
    ['file:///tmp/a.pdf', false, 'file'],
    ['chrome-extension://mhjfbmdgcfjbbpaeojofohoefgiehjai/index.html', false, 'extension'],
    ['data:text/html,hi', false, 'other'],
    ['javascript:alert(1)', false, 'other'],
    ['', false, 'missing'],
    [undefined, false, 'missing'],
]) {
    const r = S.classifyUrl(url);
    check(`${String(url) || '(empty)'} -> ${ok ? 'savable' : reason}`, r.ok === ok && (ok || r.reason === reason), JSON.stringify(r));
}

console.log('describeResult');
const d = (r, o) => S.describeResult(r, o);
check('queued -> saved', d({ ok: true, status: 200, body: { success: true, queued: true, id: 'x' } }).state === 'saved');
check('saved with selection says so', /selection/.test(d({ ok: true, status: 200, body: { success: true, queued: true, id: 'x' } }, { withNote: true }).detail));
check('a server message replaces the stock line', d({ ok: true, status: 200, body: { success: true, queued: true, id: 'x', message: 'First save!' } }).detail === 'First save!');
const w = d({ ok: true, status: 200, body: { success: true, saved: true, queued: false, waiting: true, upgrade: true, message: 'Saved. Machina will read it on the 1st, or now with Pro.' } });
check('waiting -> saved for later + upgrade', w.state === 'waiting' && w.title === 'Saved for later' && w.action === 'upgrade' && w.detail.startsWith('Saved. Machina will read it'));
check('waiting on Pro -> no upgrade action', d({ ok: true, status: 200, body: { success: true, waiting: true, upgrade: false } }).action === 'open');
check('waiting with no message still explains', /on the 1st/.test(d({ ok: true, status: 200, body: { success: true, waiting: true, upgrade: false } }).detail));
check('duplicate', d({ ok: true, status: 200, body: { success: true, duplicate: true } }).state === 'duplicate');
check('200 with no JSON is NOT called saved', d({ ok: true, status: 200, body: null }).state === 'unknown');
check('200 {success:false} is NOT called saved', d({ ok: true, status: 200, body: { success: false } }).state === 'unknown');
check('403 -> reconnect', d({ ok: false, status: 403, body: {} }).action === 'connect');
check('401 -> reconnect', d({ ok: false, status: 401, body: {} }).state === 'auth');
const lim = d({ ok: false, status: 429, body: { success: false, error: 'You—ve used 100 saves', upgrade: true, kind: 'saves', used: 100, limit: 100 } });
check('old-server quota 429 -> limit, says NOT saved, upgrade', lim.state === 'limit' && /not saved/.test(lim.detail) && lim.action === 'upgrade');
check('server em dash is softened', !lim.detail.includes('—'));
check('plain 429 -> rate limit, retry', d({ ok: false, status: 429, body: { error: 'Too many requests. Please slow down.' } }).state === 'rate');
check('413 -> too large', d({ ok: false, status: 413, body: {} }).title === 'Too large to save');
check('400 -> server reason', d({ ok: false, status: 400, body: { error: 'Invalid URL' } }).detail === 'Invalid URL');
check('500 -> busy, retry', d({ ok: false, status: 500, body: null }).action === 'retry');
check('503 -> busy', d({ ok: false, status: 503, body: null }).state === 'busy');
check('status 0 -> could not reach', d({ ok: false, status: 0, error: 'network' }).title === "Couldn't reach Machina");
check('timeout -> may still have saved', /may still have saved/.test(d({ ok: false, status: 0, error: 'timeout' }).detail));
check('badges: saved/duplicate/waiting distinct, errors red', new Set(['saved', 'duplicate', 'waiting'].map((s) => S.badgeFor(s).color)).size === 3 && S.badgeFor('auth').color === '#DC2626');

console.log('who may connect');
const devOrigins = S.connectOriginsFromMatches(MANIFEST.content_scripts.find((c) => c.js.includes('connect.js')).matches);
check('dev manifest allows mymachina.app + localhost', JSON.stringify(devOrigins.map((o) => o.host)) === '["mymachina.app","localhost","127.0.0.1"]', JSON.stringify(devOrigins));
check('a manifest edit alone cannot add a host', S.connectOriginsFromMatches(['https://evil.example/*', 'https://*.mymachina.app/*', 'https://mymachina.app.evil.example/*']).length === 0);
const trusted = (url, extra = {}) => S.isTrustedConnectSender({ url, origin: new URL(url).origin, frameId: 0, ...extra }, devOrigins);
check('web app root: trusted', trusted('https://mymachina.app/'));
check('web app root with ?connect: trusted', trusted('https://mymachina.app/?connect=extension'));
check('local dev server on any port: trusted', trusted('http://localhost:3100/'));
check('public share page /s: refused', !trusted('https://mymachina.app/s?id=abc'));
check('public collection page /c: refused', !trusted('https://mymachina.app/c?id=abc'));
check('privacy page: refused', !trusted('https://mymachina.app/privacy'));
check('plain http on the real host: refused', !trusted('http://mymachina.app/'));
check('odd port on the real host: refused', !trusted('https://mymachina.app:8443/'));
check('look-alike host: refused', !trusted('https://mymachina.app.evil.example/'));
check('subframe: refused', !trusted('https://mymachina.app/', { frameId: 2 }));
check('origin that disagrees with url: refused', !trusted('https://mymachina.app/', { origin: 'https://evil.example' }));
check('no sender: refused', !S.isTrustedConnectSender(null, devOrigins));
check('localhost https needs the real list entry: refused', !trusted('https://localhost/'));

// ── The service worker, in a sandbox ───────────────────────────────────────

async function boot({ manifest = MANIFEST, storage = {}, online = true, noNotifications = false, noContextMenus = false, scriptingFails = false } = {}) {
    const store = { ...storage };
    const session = {};
    const fetches = [];
    const notifications = [];
    const toasts = [];
    const tabsOpened = [];
    const badge = { text: '', color: '' };
    let fetchImpl = async () => ({ ok: false, status: 400, json: async () => ({ success: false, error: 'No URL or text found in shared content' }) });
    const events = {
        onInstalled: ev(), onStartup: ev(), onConnect: ev(), onMessage: ev(),
        menuClicked: ev(), notifClicked: ev(), notifButton: ev(),
    };
    const chrome = {
        runtime: {
            id: EXT_ID,
            getManifest: () => manifest,
            getURL: (p) => `chrome-extension://${EXT_ID}/${p}`,
            onInstalled: events.onInstalled, onStartup: events.onStartup, onConnect: events.onConnect,
            onMessage: events.onMessage,
        },
        storage: {
            local: {
                get: async (keys) => Object.fromEntries([].concat(keys).filter((k) => store[k] !== undefined).map((k) => [k, store[k]])),
                set: async (o) => { Object.assign(store, o); },
                remove: async (keys) => { [].concat(keys).forEach((k) => delete store[k]); },
            },
            session: {
                get: async (k) => ({ [k]: session[k] }),
                set: async (o) => { Object.assign(session, o); },
            },
        },
        action: {
            setBadgeBackgroundColor: async ({ color }) => { badge.color = color; },
            setBadgeTextColor: async () => {},
            setBadgeText: async ({ text }) => { badge.text = text; },
        },
        notifications: noNotifications ? undefined : {
            create: async (id, opts) => { notifications.push({ id, ...opts }); },
            clear: (id, cb) => cb && cb(),
            onClicked: events.notifClicked, onButtonClicked: events.notifButton,
        },
        contextMenus: noContextMenus ? undefined : { removeAll: (cb) => cb(), create: () => {}, onClicked: events.menuClicked },
        scripting: { executeScript: async (inj) => { if (scriptingFails) throw new Error('Cannot access contents of the page'); toasts.push(inj); return [{}]; } },
        tabs: { create: async ({ url }) => { tabsOpened.push(url); } },
    };
    const ctx = {
        chrome, console, URL, TextEncoder, crypto: globalThis.crypto, AbortController, JSON, Promise,
        // Long timers (badge reset, fetch timeout) never fire inside a test.
        setTimeout: (fn, ms) => (ms >= 1000 ? 0 : setTimeout(fn, ms)), clearTimeout: (t) => t && clearTimeout(t),
        navigator: { onLine: online },
        fetch: (url, init) => { fetches.push({ url, init, body: init.body ? JSON.parse(init.body) : null }); return fetchImpl(url, init); },
    };
    ctx.self = ctx;
    ctx.globalThis = ctx;
    ctx.importScripts = (name) => { if (name !== 'shared.js') throw new Error(`importScripts(${name})`); vm.runInContext(sharedSrc, ctx); };
    vm.createContext(ctx);
    vm.runInContext(bgSrc, ctx);
    // What connect.js forwards for the web app (machina-ping -> web-ping, ...).
    const WEB = { 'machina-ping': 'web-ping', 'machina-connect': 'web-connect' };
    const external = (msg, url, extra = {}) => new Promise((resolve) => {
        const sender = { id: EXT_ID, url, origin: new URL(url).origin, frameId: 0, tab: { id: 1 }, ...extra };
        const handled = events.onMessage.fns[0]({ ...msg, type: WEB[msg.type] || msg.type }, sender, resolve);
        if (!handled) setTimeout(() => resolve('<ignored>'), 0);
    });
    const internal = (msg, senderId = EXT_ID, url = `chrome-extension://${EXT_ID}/popup.html`) => new Promise((resolve) => {
        const handled = events.onMessage.fns[0](msg, { id: senderId, url }, resolve);
        if (!handled) setTimeout(() => resolve('<ignored>'), 0);
    });
    return {
        toasts,
        store, session, fetches, notifications, tabsOpened, badge, events, external, internal, ctx,
        respond: (status, body) => { fetchImpl = async () => ({ ok: status >= 200 && status < 300, status, json: async () => { if (body === undefined) throw new Error('no json'); return body; } }); },
        respondWith: (fn) => { fetchImpl = fn; },
        menu: async (info, tab) => { events.menuClicked.fns[0](info, tab); await settle(); },
    };
}

console.log('connect handshake');
{
    const bg = await boot();
    const APP = 'https://mymachina.app/';
    let r = await bg.external({ type: 'machina-ping' }, APP);
    check('ping from the web app: installed, not connected', r.ok && r.version === MANIFEST.version && r.connected === false && r.tokenTag === null, JSON.stringify(r));
    r = await bg.external({ type: 'machina-ping' }, 'https://mymachina.app/s?id=1');
    check('ping from a share page: refused', r.ok === false && r.reason === 'untrusted');

    r = await bg.external({ type: 'machina-connect', token: 'x' }, APP);
    check('malformed token: refused before any network call', r.reason === 'bad-token' && bg.fetches.length === 0);

    r = await bg.external({ type: 'machina-connect', token: GOOD, account: 'me@example.com' }, 'https://evil.example/');
    check('connect from another site: refused, nothing stored, nothing sent', r.reason === 'untrusted' && !bg.store.token && bg.fetches.length === 0);

    bg.respond(403, { success: false, error: 'Invalid ingest token' });
    r = await bg.external({ type: 'machina-connect', token: GOOD }, APP);
    check('a token the server rejects is not stored', r.ok === false && r.reason === 'invalid' && !bg.store.token);

    bg.respond(400, { success: false, error: 'No URL or text found in shared content' });
    r = await bg.external({ type: 'machina-connect', token: GOOD, account: 'me@example.com' }, APP);
    const probe = bg.fetches.at(-1);
    check('the token is checked with an empty POST to share_ingest', probe.url === `${API}/api/share` && probe.init.headers['X-Ingest-Token'] === GOOD && JSON.stringify(probe.body) === '{}');
    check('the check sends no cookies', probe.init.credentials === 'omit');
    check('a good token is stored with the account label', r.ok === true && bg.store.token === GOOD && bg.store.account === 'me@example.com' && typeof bg.store.connectedAt === 'number');
    check('the answer never carries the token', !JSON.stringify(r).includes(GOOD));
    check('the answer carries the same tag the web app computes', r.tokenTag === await S.tokenTag(GOOD) && /^[0-9a-f]{12}$/.test(r.tokenTag));
    r = await bg.external({ type: 'machina-ping' }, APP);
    check('ping after connect: connected, tag, still no token', r.connected === true && r.tokenTag === await S.tokenTag(GOOD) && !JSON.stringify(r).includes(GOOD));

    bg.respond(403, {});
    r = await bg.external({ type: 'machina-connect', token: OTHER }, APP);
    check('a failed reconnect keeps the working token', bg.store.token === GOOD);
    bg.respond(0, undefined);
    bg.respondWith(async () => { throw new TypeError('Failed to fetch'); });
    r = await bg.external({ type: 'machina-connect', token: OTHER }, APP);
    check('offline connect says network and stores nothing new', r.reason === 'network' && bg.store.token === GOOD);
    r = await bg.external({ type: 'disconnect' }, APP);
    check('the web app cannot reach the popup-only messages', r === '<ignored>' && !!bg.store.token);
    r = await bg.external({ type: 'machina-ping' }, APP, { tab: undefined });
    check('a web-* message from no tab (not the content script) is refused', r.reason === 'untrusted');
    r = await bg.external({ type: 'machina-ping' }, APP, { id: 'another-extension' });
    check('a web-* message from another extension is refused', r.reason === 'untrusted');
    bg.respondWith(async () => ({ ok: false, status: 400, json: async () => ({}) }));
    await bg.external({ type: 'machina-connect', token: GOOD, account: 'x'.repeat(500) }, APP);
    check('the account label is capped', bg.store.account.length === 120);
}
{
    // What the store package ships: localhost stripped from the manifest.
    const storeManifest = { ...MANIFEST, content_scripts: [{ ...MANIFEST.content_scripts[0], matches: ['https://mymachina.app/*'] }] };
    const bg = await boot({ manifest: storeManifest });
    const r = await bg.external({ type: 'machina-connect', token: GOOD }, 'http://localhost:3100/');
    check('store build: a local page cannot connect', r.reason === 'untrusted' && bg.fetches.length === 0);
    const r2 = await bg.external({ type: 'machina-ping' }, 'https://mymachina.app/');
    check('store build: the real web app still can', r2.ok === true);
}

console.log('saving');
{
    const bg = await boot({ storage: { token: GOOD } });
    bg.respond(200, { success: true, queued: true, id: 'q1', url: 'https://example.com/link' });
    await bg.menu({ menuItemId: 'machina-save-link', linkUrl: 'https://example.com/link', pageUrl: 'https://example.com/' }, { title: 'Home', url: 'https://example.com/' });
    let f = bg.fetches.at(-1);
    check('right-click link saves the link, not the page', f.body.url === 'https://example.com/link' && !('note' in f.body));
    check('it authenticates with the stored token', f.init.headers['X-Ingest-Token'] === GOOD);
    check('a notification confirms it', bg.notifications.at(-1).title === 'Saved to Machina' && /reading it now/.test(bg.notifications.at(-1).message));
    check('badge: graphite check', bg.badge.text === '✓' && bg.badge.color === '#22222A');

    await bg.menu({ menuItemId: 'machina-save-selection', selectionText: '  a quote, tomorrow  ', pageUrl: 'https://example.com/post' }, { title: 'Post', url: 'https://example.com/post' });
    f = bg.fetches.at(-1);
    check('selection saves the page with the quote as a quote', f.body.url === 'https://example.com/post' && f.body.note === 'a quote, tomorrow' && f.body.noteKind === 'quote');
    check('the toast says it kept the selection', /selection/.test(bg.notifications.at(-1).message));

    await bg.menu({ menuItemId: 'machina-save-page', pageUrl: 'https://example.com/page' }, { title: 'A page', url: 'https://example.com/page' });
    check('right-click page saves the page', bg.fetches.at(-1).body.url === 'https://example.com/page');
    check('the toast names the page', bg.notifications.at(-1).message.startsWith('A page.'));

    const before = bg.fetches.length;
    await bg.menu({ menuItemId: 'machina-save-page', pageUrl: 'chrome://settings' }, { title: 'Settings', url: 'chrome://settings' });
    check('a browser page is refused without a request', bg.fetches.length === before && bg.notifications.at(-1).title === "Can't save this page" && bg.badge.color === '#DC2626');
    await bg.menu({ menuItemId: 'machina-save-link', linkUrl: 'mailto:me@example.com', pageUrl: 'https://example.com/' }, {});
    check('a mailto link is refused without a request', bg.fetches.length === before);

    bg.respond(200, { success: true, saved: true, queued: false, waiting: true, upgrade: true, message: 'Saved. Machina will read it on the 1st, or now with Pro.' });
    await bg.menu({ menuItemId: 'machina-save-page', pageUrl: 'https://example.com/late' }, { title: 'Late', url: 'https://example.com/late' });
    let n = bg.notifications.at(-1);
    check('waiting: toast says saved for later with the server message', n.title === 'Saved for later' && n.message === 'Saved. Machina will read it on the 1st, or now with Pro.');
    check('waiting: Get Pro button', n.buttons && n.buttons[0].title === 'Get Pro');
    check('waiting: its own badge color', bg.badge.color === '#8A6A12');
    bg.events.notifButton.fns[0]('machina-save', 0);
    await settle();
    check('Get Pro opens the paywall', bg.tabsOpened.at(-1) === 'https://mymachina.app/?paywall=saves');

    bg.respond(200, { success: true, duplicate: true, url: 'https://example.com/page' });
    await bg.menu({ menuItemId: 'machina-save-page', pageUrl: 'https://example.com/page' }, { title: 'A page', url: 'https://example.com/page' });
    check('duplicate: already in your library, grey check', bg.notifications.at(-1).title === 'Already in your library' && bg.badge.color === '#6B7280');

    bg.respond(403, { success: false, error: 'Invalid ingest token' });
    await bg.menu({ menuItemId: 'machina-save-page', pageUrl: 'https://example.com/x' }, { title: 'X', url: 'https://example.com/x' });
    n = bg.notifications.at(-1);
    check('revoked token: Reconnect, with a Connect button', n.title === 'Reconnect Machina' && n.buttons[0].title === 'Connect');
    bg.events.notifClicked.fns[0]('machina-save');
    await settle();
    check('clicking it opens the connect page', bg.tabsOpened.at(-1) === 'https://mymachina.app/?connect=extension');

    bg.respondWith(async () => { throw new TypeError('Failed to fetch'); });
    await bg.menu({ menuItemId: 'machina-save-page', pageUrl: 'https://example.com/x' }, { title: 'X', url: 'https://example.com/x' });
    check('network failure: could not reach', bg.notifications.at(-1).title === "Couldn't reach Machina");

    bg.respondWith(async () => { const e = new Error('aborted'); e.name = 'AbortError'; throw e; });
    await bg.menu({ menuItemId: 'machina-save-page', pageUrl: 'https://example.com/x' }, { title: 'X', url: 'https://example.com/x' });
    check('timeout: no answer, may still have saved', bg.notifications.at(-1).title === 'No answer from Machina');

    bg.respond(503, undefined);
    await bg.menu({ menuItemId: 'machina-save-page', pageUrl: 'https://example.com/x' }, { title: 'X', url: 'https://example.com/x' });
    check('503 with no JSON: Machina hit a problem', bg.notifications.at(-1).title === 'Machina hit a problem');
}
{
    const bg = await boot({ storage: { token: GOOD }, online: false });
    await bg.menu({ menuItemId: 'machina-save-page', pageUrl: 'https://example.com/x' }, { title: 'X', url: 'https://example.com/x' });
    check('offline: says so and sends nothing', bg.notifications.at(-1).title === "You're offline" && bg.fetches.length === 0);
}
{
    const bg = await boot();
    await bg.menu({ menuItemId: 'machina-save-page', pageUrl: 'https://example.com/x' }, { title: 'X', url: 'https://example.com/x' });
    check('no token: connect first, with a Connect button, nothing sent', bg.notifications.at(-1).title === 'Connect Machina first' && bg.notifications.at(-1).buttons[0].title === 'Connect' && bg.fetches.length === 0);
}

console.log('popup port');
{
    const bg = await boot({ storage: { token: GOOD } });
    bg.respond(200, { success: true, queued: true, id: 'q1' });
    const posted = [];
    const port = { name: 'machina-popup', sender: { id: EXT_ID, url: `chrome-extension://${EXT_ID}/popup.html` }, onDisconnect: ev(), onMessage: ev(), postMessage: (m) => posted.push(m) };
    bg.events.onConnect.fns[0](port);
    port.onMessage.fns[0]({ type: 'save', url: 'https://example.com/p', title: 'P' });
    await settle();
    check('the popup gets the result on its port', posted[0] && posted[0].type === 'result' && posted[0].view.state === 'saved');
    check('no notification while the popup is showing it', bg.notifications.length === 0);

    let release;
    bg.respondWith(() => new Promise((r) => { release = () => r({ ok: true, status: 200, json: async () => ({ success: true, queued: true, id: 'q2' }) }); }));
    port.onMessage.fns[0]({ type: 'save', url: 'https://example.com/q', title: 'Q' });
    await settle();
    port.onDisconnect.fns[0]();
    release();
    await settle();
    check('popup closed before the answer: a notification says it instead', bg.notifications.at(-1) && bg.notifications.at(-1).title === 'Saved to Machina');
    const other = { name: 'someone-else', onDisconnect: ev(), onMessage: ev(), postMessage: () => {} };
    bg.events.onConnect.fns[0](other);
    check('ports with another name are ignored', other.onMessage.fns.length === 0);
    const page = { name: 'machina-popup', sender: { id: EXT_ID, url: 'https://mymachina.app/', tab: { id: 1 } }, onDisconnect: ev(), onMessage: ev(), postMessage: () => {} };
    bg.events.onConnect.fns[0](page);
    check('a popup port from a web page is ignored', page.onMessage.fns.length === 0);
}

console.log('popup messages');
{
    const bg = await boot();
    let r = await bg.internal({ type: 'connect-token', token: GOOD }, 'some-other-extension');
    check('messages from other extensions are ignored', r === '<ignored>' && !bg.store.token);
    r = await bg.internal({ type: 'connect-token', token: GOOD }, EXT_ID, 'https://mymachina.app/');
    check('popup-only messages from a content script are ignored', r === '<ignored>' && !bg.store.token);
    bg.respond(403, {});
    r = await bg.internal({ type: 'connect-token', token: GOOD });
    check('paste fallback: a rejected token is not stored', r.ok === false && !bg.store.token && /doesn't work/.test(r.message));
    bg.respond(400, {});
    r = await bg.internal({ type: 'connect-token', token: ` ${GOOD} ` });
    check('paste fallback: a good token is stored trimmed', r.ok === true && bg.store.token === GOOD);
    r = await bg.internal({ type: 'disconnect' });
    check('disconnect forgets the token', r.ok && !bg.store.token);
}

console.log('install');
{
    const bg = await boot();
    await Promise.all(bg.events.onInstalled.fire({ reason: 'install' }));
    await settle();
    check('first install opens the connect page', bg.tabsOpened[0] === 'https://mymachina.app/?connect=extension');
    const up = await boot();
    await Promise.all(up.events.onInstalled.fire({ reason: 'update' }));
    await settle();
    check('an update opens nothing', up.tabsOpened.length === 0);
}

console.log('safari: no notifications, no menus');
{
    const bg = await boot({ storage: { token: GOOD }, noNotifications: true });
    bg.respond(200, { success: true, saved: true, waiting: true, upgrade: true, message: 'Saved. Machina will read it on the 1st, or now with Pro.' });
    await bg.menu({ menuItemId: 'machina-save-page', pageUrl: 'https://example.com/x' }, { id: 42, title: 'X', url: 'https://example.com/x' });
    const t = bg.toasts.at(-1);
    check('no notifications API: a toast is drawn on that tab instead', t && t.target.tabId === 42 && typeof t.func === 'function');
    check('the toast carries the result and the upgrade link', t.args[0].title === 'Saved for later' && t.args[0].ok === true && t.args[1].url === 'https://mymachina.app/?paywall=saves' && t.args[1].text === 'Get Pro');
    bg.respond(403, {});
    await bg.menu({ menuItemId: 'machina-save-page', pageUrl: 'https://example.com/x' }, { id: 42, title: 'X', url: 'https://example.com/x' });
    check('a revoked token toast links to Connect', bg.toasts.at(-1).args[1].url === 'https://mymachina.app/?connect=extension' && bg.toasts.at(-1).args[0].ok === false);
    check('and no notification was attempted', bg.notifications.length === 0);
}
{
    const bg = await boot({ storage: { token: GOOD }, noNotifications: true, scriptingFails: true });
    bg.respond(200, { success: true, queued: true, id: 'q' });
    let threw = false;
    try { await bg.menu({ menuItemId: 'machina-save-page', pageUrl: 'https://example.com/x' }, { id: 4, title: 'X', url: 'https://example.com/x' }); } catch { threw = true; }
    check('a tab the toast cannot reach: no crash, the badge still says it', !threw && bg.badge.text === '✓');
}
{
    let threw = false;
    let bg;
    try {
        bg = await boot({ noContextMenus: true, noNotifications: true });
        await Promise.all(bg.events.onInstalled.fire({ reason: 'update' }));
        await settle();
    } catch (e) { threw = e; }
    check('no contextMenus API (iOS Safari): the worker still loads', !threw && bg.events.onMessage.fns.length === 1, String(threw));
}
{
    // The toast function itself, in a tiny fake DOM: text only, link, close.
    const el = (tag) => {
        const node = {
            tag, style: {}, children: [], attrs: {}, listeners: {}, textContent: '',
            appendChild(c) { this.children.push(c); return c; },
            setAttribute(k, v) { this.attrs[k] = v; },
            addEventListener(e, f) { this.listeners[e] = f; },
            remove() { this.removed = true; },
            attachShadow() { node.shadow = el('#shadow'); return node.shadow; },
        };
        return node;
    };
    const body = el('body');
    const fakeDoc = { getElementById: () => null, createElement: el, body, documentElement: body };
    const c = { document: fakeDoc, window: { matchMedia: () => ({ matches: true }) }, setTimeout: () => 0 };
    vm.createContext(c);
    const bgCtx = (await boot()).ctx;
    vm.runInContext(`(${bgCtx.machinaToast.toString()})(${JSON.stringify({ ok: false, title: '<b>Reconnect</b>', detail: 'x' })}, ${JSON.stringify({ url: 'https://mymachina.app/?connect=extension', text: 'Connect' })})`, c);
    const host = body.children[0];
    const box = host.shadow.children[0];
    check('toast: mounted in a shadow root, fixed at the top right', host.style.position === 'fixed' && host.style.right === '16px');
    check('toast: markup in titles is shown as text, never parsed', box.children[0].textContent === '! <b>Reconnect</b>');
    const link = box.children.find((n) => n.tag === 'a');
    check('toast: the action is a real link that opens in a new tab', link && link.href === 'https://mymachina.app/?connect=extension' && link.target === '_blank' && /noopener/.test(link.rel));
    check('toast: announced to screen readers and closable', box.attrs.role === 'status' && box.children.some((n) => n.attrs['aria-label'] === 'Close'));
}

console.log('connect.js (content script)');
{
    const connectSrc = readFileSync(`${DIR}/connect.js`, 'utf8');
    const posted = [];
    const forwarded = [];
    let listener = null;
    const win = {
        location: { origin: 'https://mymachina.app' },
        addEventListener: (t, fn) => { if (t === 'message') listener = fn; },
        postMessage: (data, target) => posted.push({ data, target }),
    };
    win.top = win;
    const c = {
        window: win,
        chrome: { runtime: { lastError: undefined, sendMessage: (m, cb) => { forwarded.push(m); cb({ ok: true, connected: false, tokenTag: null }); } } },
    };
    vm.createContext(c);
    vm.runInContext(connectSrc, c);
    check('announces itself to the page on load, to its own origin only', posted[0].data.type === 'machina-ready' && posted[0].target === 'https://mymachina.app');
    const send = (data, extra = {}) => listener({ source: win, origin: 'https://mymachina.app', data, ...extra });
    send({ source: 'machina-web', id: 'a1', type: 'machina-ping' });
    check('relays a ping as web-ping and answers with the same id', forwarded.at(-1).type === 'web-ping' && posted.at(-1).data.id === 'a1' && posted.at(-1).data.reply.ok === true && posted.at(-1).target === 'https://mymachina.app');
    send({ source: 'machina-web', id: 'a2', type: 'machina-connect', token: GOOD, account: 'me@example.com' });
    check('relays a connect with the token and account', forwarded.at(-1).type === 'web-connect' && forwarded.at(-1).token === GOOD && forwarded.at(-1).account === 'me@example.com');
    const before = forwarded.length;
    send({ source: 'machina-web', id: 'b1', type: 'machina-ping' }, { source: {} });
    check('ignores messages from another window (an iframe, an opener)', forwarded.length === before);
    send({ source: 'machina-web', id: 'b2', type: 'machina-ping' }, { origin: 'https://evil.example' });
    check('ignores messages from another origin', forwarded.length === before);
    send({ source: 'machina-extension', id: 'b3', type: 'machina-ping' });
    send({ source: 'machina-web', id: 'b4', type: 'disconnect' });
    send({ source: 'machina-web', type: 'machina-ping' });
    send('machina-ping');
    check('ignores its own echoes, unknown types, missing ids, non-objects', forwarded.length === before);
    const answer = JSON.stringify(posted.at(-1));
    check('never posts a token back to the page', !answer.includes(GOOD));
}
{
    const posted = [];
    const win = { location: { origin: 'https://mymachina.app' }, addEventListener: () => { throw new Error('should not listen'); }, postMessage: (d) => posted.push(d) };
    win.top = {};
    const c = { window: win, chrome: { runtime: {} } };
    vm.createContext(c);
    vm.runInContext(readFileSync(`${DIR}/connect.js`, 'utf8'), c);
    check('does nothing inside a frame', posted.length === 0);
}

console.log('manifest');
check('permissions are exactly the documented five', JSON.stringify([...MANIFEST.permissions].sort()) === JSON.stringify(['activeTab', 'contextMenus', 'notifications', 'scripting', 'storage']));
check('no host permissions at all (share_ingest admits extension origins)', !MANIFEST.host_permissions && !MANIFEST.optional_host_permissions);
check('one content script, connect.js, on the web app (plus local dev)', MANIFEST.content_scripts.length === 1
    && JSON.stringify(MANIFEST.content_scripts[0].js) === '["connect.js"]'
    && MANIFEST.content_scripts[0].matches.every((m) => /^(https:\/\/mymachina\.app|http:\/\/localhost|http:\/\/127\.0\.0\.1)\/\*$/.test(m))
    && MANIFEST.content_scripts[0].all_frames === false);
check('no externally_connectable, no key, no background.scripts', !MANIFEST.externally_connectable && !MANIFEST.key && !MANIFEST.background.scripts);
check('no tabs permission, no <all_urls>', !JSON.stringify(MANIFEST).includes('<all_urls>') && !MANIFEST.permissions.includes('tabs'));
check('Safari keys kept: notifications permission and open_in_tab', MANIFEST.permissions.includes('notifications') && MANIFEST.options_ui.open_in_tab === false);
check('the shortcut opens the popup', !!MANIFEST.commands._execute_action);

console.log(failures === 0 ? '\nAll background checks passed.' : `\n${failures} FAILURES`);
process.exit(failures === 0 ? 0 : 1);
