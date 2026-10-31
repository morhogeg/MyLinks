/**
 * The service worker's wiring, connect flow and sender checks, against the
 * fake chrome. Importing background.js registers its listeners on the fake.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakeChrome, setOnline, stubFetch } from './fake-chrome.mjs';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const fake = installFakeChrome();
setOnline(true);
const bg = await import('../src/background.js');
const account = await import('../src/lib/account.js');
const queue = await import('../src/lib/queue.js');
const { describe } = await import('../src/lib/describe.js');

const ID = fake.runtime.id;
const TOKEN = 'tok_ABCDEFGHIJ1234567890';
const bridgeSender = (url = 'https://mymachina.app/?settings=extension', over = {}) => ({
    id: ID, frameId: 0, tab: { id: 7 }, url, origin: new URL(url).origin, ...over,
});

beforeEach(async () => {
    for (const k of Object.keys(fake.store)) delete fake.store[k];
    fake.created.length = 0;
    setOnline(true);
});

test('every listener is registered at top level', () => {
    for (const ev of [fake.runtime.onInstalled, fake.runtime.onStartup, fake.runtime.onMessage, fake.runtime.onConnect,
        fake.alarms.onAlarm, fake.contextMenus.onClicked, fake.commands.onCommand]) {
        assert.equal(ev.listeners.length, 1);
    }
    assert.deepEqual(fake.accessLevel, { accessLevel: 'TRUSTED_CONTEXTS' }, 'token storage locked to extension pages');
});

test('menu: one parent, items per context, web pages only, safe to recreate', async () => {
    await bg.createMenus();
    await bg.createMenus(); // onInstalled fires again on updates: no duplicate-id error
    const byId = Object.fromEntries(fake.menus.map((m) => [m.id, m]));
    assert.deepEqual(Object.keys(byId), Object.values(bg.MENU));
    assert.deepEqual(byId.machina.documentUrlPatterns, ['http://*/*', 'https://*/*']);
    assert.deepEqual(byId['machina-page'].contexts, ['page']);
    assert.deepEqual(byId['machina-link'].contexts, ['link']);
    assert.deepEqual(byId['machina-link'].targetUrlPatterns, ['http://*/*', 'https://*/*']);
    assert.deepEqual(byId['machina-selection'].contexts, ['selection']);
    assert.deepEqual(byId['machina-image'].contexts, ['image']);
    assert.deepEqual(byId['machina-screenshot'].contexts, ['page', 'link', 'selection', 'image']);
    for (const m of fake.menus) assert.ok(m.title && !m.title.startsWith('menu'), `localized title for ${m.id}`);
});

test('install opens the connect page once, only when not connected', async () => {
    await fake.runtime.onInstalled.dispatch({ reason: 'install' });
    assert.deepEqual(fake.created, [{ url: 'https://mymachina.app/?connect=extension' }]);
    fake.created.length = 0;
    await fake.runtime.onInstalled.dispatch({ reason: 'update' });
    assert.equal(fake.created.length, 0);
});

test('bridge sender checks: Machina\'s root page, top frame, this extension', () => {
    assert.equal(bg.isTrustedBridge(bridgeSender()), true);
    assert.equal(bg.isTrustedBridge(bridgeSender('https://mymachina.app/')), true);
    assert.equal(bg.isTrustedBridge(bridgeSender('https://mymachina.app/s/abc123')), false, 'share pages');
    assert.equal(bg.isTrustedBridge(bridgeSender('https://mymachina.app/c/xyz')), false);
    assert.equal(bg.isTrustedBridge(bridgeSender('https://evil.example/')), false);
    assert.equal(bg.isTrustedBridge(bridgeSender('http://mymachina.app/')), false);
    assert.equal(bg.isTrustedBridge(bridgeSender(undefined, { frameId: 3 })), false, 'iframes');
    assert.equal(bg.isTrustedBridge(bridgeSender(undefined, { id: 'someoneelse' })), false);
    assert.equal(bg.isTrustedBridge(bridgeSender(undefined, { tab: undefined })), false);
    assert.equal(bg.isTrustedBridge(bridgeSender(undefined, { origin: 'https://evil.example' })), false);
    assert.equal(bg.isTrustedBridge(null), false);
});

test('extension-page sender check', () => {
    assert.equal(bg.isExtensionPage({ id: ID, url: `chrome-extension://${ID}/src/popup/popup.html` }), true);
    assert.equal(bg.isExtensionPage({ id: ID, url: 'https://mymachina.app/' }), false);
    assert.equal(bg.isExtensionPage({ id: 'x', url: `chrome-extension://${ID}/src/popup/popup.html` }), false);
});

test('token tag matches the web app\'s algorithm', async () => {
    const expected = createHash('sha256').update(`machina-ext:${TOKEN}`).digest().subarray(0, 6).toString('hex');
    assert.equal(await account.tokenTag(TOKEN), expected);
    const web = readFileSync(join(REPO, 'web/lib/extension.ts'), 'utf8');
    assert.ok(web.includes('`machina-ext:${token}`'), 'web tokenTag prefix');
    assert.ok(web.includes('digest.slice(0, 6)'), 'web tokenTag length');
    for (const type of ['machina-ping', 'machina-connect', 'machina-disconnect', 'machina-ready']) {
        assert.ok(web.includes(`'${type}'`), `web speaks ${type}`);
    }
    assert.ok(web.includes("const FROM_PAGE = 'machina-web'") && web.includes("const FROM_EXT = 'machina-extension'"));
});

test('connect: checks the token with the server, keeps it, never echoes it', async () => {
    const f = stubFetch(() => ({ status: 400, body: { success: false, error: 'No URL or text found in shared content' } }));
    try {
        const reply = await bg.handleBridge({ type: 'machina-connect', token: TOKEN, account: 'mor@example.com' }, bridgeSender());
        assert.deepEqual(reply, { ok: true });
        assert.equal(f.calls[0].headers['X-Ingest-Token'], TOKEN);
        assert.deepEqual(f.calls[0].body, {});
        assert.equal(fake.store.token, TOKEN);
        assert.equal(fake.store.account, 'mor@example.com');

        const ping = await bg.handleBridge({ type: 'machina-ping' }, bridgeSender());
        assert.equal(ping.ok, true);
        assert.equal(ping.connected, true);
        assert.equal(ping.version, fake.runtime.getManifest().version);
        assert.equal(ping.tokenTag, await account.tokenTag(TOKEN));
        assert.ok(!JSON.stringify(ping).includes(TOKEN), 'the token never goes back to the page');
    } finally {
        f.restore();
    }
});

test('connect: failures map to the web app\'s reasons', async () => {
    const table = [[403, 'invalid'], [429, 'rate-limited'], [500, 'server']];
    for (const [status, reason] of table) {
        const f = stubFetch(() => ({ status, body: { success: false } }));
        assert.deepEqual(await bg.handleBridge({ type: 'machina-connect', token: TOKEN }, bridgeSender()), { ok: false, reason });
        f.restore();
    }
    assert.deepEqual(await bg.handleBridge({ type: 'machina-connect', token: 'short' }, bridgeSender()), { ok: false, reason: 'bad-token' });
    assert.deepEqual(await bg.handleBridge({ type: 'machina-connect', token: TOKEN }, bridgeSender('https://mymachina.app/s/x')),
        { ok: false, reason: 'untrusted' });
    setOnline(false);
    assert.deepEqual(await bg.handleBridge({ type: 'machina-connect', token: TOKEN }, bridgeSender()), { ok: false, reason: 'offline' });
    assert.equal(fake.store.token, undefined, 'nothing kept after a failed check');
});

test('connect to a different account drops the previous account\'s waiting saves', async () => {
    let f = stubFetch(() => ({ status: 400, body: {} }));
    await bg.handleBridge({ type: 'machina-connect', token: TOKEN, account: 'a@example.com' }, bridgeSender());
    f.restore();
    setOnline(false); // keep the queued save from being sent by the reconnect flush
    await queue.add({ kind: 'page', url: 'https://a.com', title: 'A' }, 'offline');
    setOnline(true);
    f = stubFetch((call) => (Object.keys(call.body).length ? { status: 200, body: { success: true, queued: true } } : { status: 400, body: {} }));
    await bg.handleBridge({ type: 'machina-connect', token: 'tok_SOMEONEELSE_123456', account: 'b@example.com' }, bridgeSender());
    f.restore();
    assert.equal((await queue.list()).length, 0);
    assert.ok(!f.calls.some((c) => c.body.url === 'https://a.com'), 'A\'s save never went to B');
});

test('disconnect only for the matching tag; clears the queue', async () => {
    const f = stubFetch(() => ({ status: 400, body: {} }));
    await bg.handleBridge({ type: 'machina-connect', token: TOKEN }, bridgeSender());
    f.restore();
    assert.deepEqual(await bg.handleBridge({ type: 'machina-disconnect', tokenTag: 'deadbeef0000' }, bridgeSender()), { ok: false });
    assert.equal(fake.store.token, TOKEN);
    setOnline(false);
    await queue.add({ kind: 'page', url: 'https://a.com', title: 'A' }, 'offline');
    const tag = await account.tokenTag(TOKEN);
    assert.deepEqual(await bg.handleBridge({ type: 'machina-disconnect', tokenTag: tag }, bridgeSender()), { ok: true });
    assert.equal(fake.store.token, undefined);
    assert.equal((await queue.list()).length, 0);
});

test('page messages: status, queue list without image bytes, discard', async () => {
    fake.store.token = TOKEN;
    fake.store.account = 'mor@example.com';
    setOnline(false);
    await queue.add({ kind: 'screenshot', image: { data: 'AAAA', mimeType: 'image/jpeg' }, title: 'Shot' }, 'offline');
    const status = await bg.handlePageMessage({ type: 'status' });
    assert.equal(status.connected, true);
    assert.equal(status.account, 'mor@example.com');
    assert.equal(status.waiting, 1);
    const items = await bg.handlePageMessage({ type: 'queue-list' });
    assert.equal(items[0].image, undefined, 'bytes stay in the worker');
    await bg.handlePageMessage({ type: 'queue-discard', id: items[0].id });
    assert.equal((await queue.list()).length, 0);
    assert.deepEqual(await bg.handlePageMessage({ type: 'nope' }), { ok: false, reason: 'unknown' });
});

test('onMessage ignores pages that are neither ours nor the bridge', async () => {
    const [listener] = fake.runtime.onMessage.listeners;
    let answered = false;
    const keepOpen = listener({ type: 'status' }, { id: ID, url: 'https://evil.example/' }, () => { answered = true; });
    assert.equal(keepOpen, false);
    assert.equal(answered, false);
});

test('popup port: only our popup may connect', () => {
    const [listener] = fake.runtime.onConnect.listeners;
    let disconnected = false;
    listener({ name: 'popup', sender: { id: ID, url: 'https://evil.example/' }, disconnect: () => { disconnected = true; } });
    assert.equal(disconnected, true);
});

test('describe: every outcome has real words (no missing message keys)', () => {
    const outcomes = ['saved', 'duplicate', 'waiting', 'reconnect', 'queued', 'unsure', 'timeout', 'unexpected', 'too-large',
        'rejected', 'quota', 'private-failed', 'queue-full', 'not-connected', 'unsavable', 'image-unsavable',
        'screenshot-failed', 'no-tab', 'offline', 'network', 'server', 'rate-limited', 'anything-else'];
    for (const outcome of outcomes) {
        for (const extra of [{}, { kind: 'screenshot' }, { quote: 'q' }, { cause: 'offline' }, { cause: 'rate-limited' },
            { queued: false }, { reason: 'file' }, { reason: 'browser' }]) {
            const d = describe({ outcome, ...extra });
            assert.ok(d.title && d.detail, outcome);
            assert.ok(!/^[a-z][A-Za-z]+$/.test(d.title) && !/^[a-z][A-Za-z]+$/.test(d.detail), `missing key for ${outcome}`);
            assert.ok(['ok', 'neutral', 'warn', 'error'].includes(d.tone));
        }
    }
    assert.equal(describe({ outcome: 'waiting', message: 'Server words' }).detail, 'Server words');
    assert.equal(describe({ outcome: 'rejected', error: 'URL is too long' }).detail, 'URL is too long');
});
