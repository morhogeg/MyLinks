/**
 * saves.js paths the browser suite can't reach: private windows (never
 * written to disk), a full queue, a held reconnect, unsavable targets.
 */
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeChrome, setOnline, stubFetch } from './fake-chrome.mjs';

const fake = installFakeChrome();
const saves = await import('../src/lib/saves.js');
const queue = await import('../src/lib/queue.js');

const TOKEN = 'tok_ABCDEFGHIJ1234567890';
const tab = (over = {}) => ({ id: 5, windowId: 1, url: 'https://example.com/a', title: 'A page', incognito: false, ...over });

beforeEach(async () => {
    for (const k of Object.keys(fake.store)) delete fake.store[k];
    fake.store.token = TOKEN;
    setOnline(true);
    fake.executeScript = async () => [{ result: null }];
});

test('not connected: nothing is sent', async () => {
    delete fake.store.token;
    const f = stubFetch(() => ({ status: 200, body: { success: true, queued: true } }));
    assert.equal((await saves.savePage(tab())).outcome, 'not-connected');
    assert.equal(f.calls.length, 0);
    f.restore();
});

test('a private window is never queued on disk', async () => {
    const f = stubFetch(() => { throw new TypeError('offline'); });
    const res = await saves.savePage(tab({ incognito: true }));
    assert.equal(res.outcome, 'private-failed');
    assert.equal(fake.store.queue, undefined);
    f.restore();
});

test('a normal window queues the same failure', async () => {
    const f = stubFetch(() => { throw new TypeError('offline'); });
    const res = await saves.savePage(tab());
    assert.deepEqual([res.outcome, res.cause, res.kind], ['queued', 'network', 'page']);
    assert.equal(fake.store.queue.length, 1);
    f.restore();
});

test('a full queue says so instead of dropping silently', async () => {
    setOnline(false);
    for (let i = 0; i < queue.LIMITS.items; i += 1) {
        await queue.add({ kind: 'page', url: `https://x.com/${i}`, title: '' }, 'offline');
    }
    const res = await saves.saveLink(tab(), 'https://example.com/new');
    assert.equal(res.outcome, 'queue-full');
});

test('a token marked for reconnect holds new saves without sending', async () => {
    fake.store.needsReconnect = true;
    const f = stubFetch(() => ({ status: 200, body: { success: true, queued: true } }));
    const res = await saves.savePage(tab());
    assert.deepEqual([res.outcome, res.queued], ['reconnect', true]);
    assert.equal(f.calls.length, 0);
    assert.equal(fake.store.queue[0].status, 'reconnect');
    const priv = await saves.savePage(tab({ incognito: true, url: 'https://example.com/b' }));
    assert.deepEqual([priv.outcome, priv.queued], ['reconnect', false]);
    f.restore();
});

test('a 403 marks the connection and keeps the save', async () => {
    const f = stubFetch(() => ({ status: 403, body: { success: false, error: 'Invalid ingest token' } }));
    const res = await saves.saveLink(tab(), 'https://example.com/l');
    assert.equal(res.outcome, 'reconnect');
    assert.equal(fake.store.needsReconnect, true);
    assert.equal(fake.store.queue[0].status, 'reconnect');
    f.restore();
});

test('unsavable targets are refused before sending', async () => {
    const f = stubFetch(() => ({ status: 200, body: { success: true, queued: true } }));
    assert.equal((await saves.savePage(tab({ url: 'chrome://settings' }))).reason, 'browser');
    assert.equal((await saves.saveLink(tab(), 'file:///etc/hosts')).outcome, 'unsavable');
    assert.equal((await saves.saveImage(tab(), 'data:image/png;base64,AAAA')).outcome, 'image-unsavable');
    assert.equal((await saves.savePage(undefined)).outcome, 'no-tab');
    assert.equal((await saves.saveScreenshot(undefined)).outcome, 'no-tab');
    assert.equal(f.calls.length, 0);
    f.restore();
});

test('a screenshot the browser refuses is reported, not sent', async () => {
    const f = stubFetch(() => ({ status: 200, body: { success: true, queued: true } }));
    fake.captureVisibleTab = async () => { throw new Error('Cannot access contents of the page'); };
    const res = await saves.saveScreenshot(tab());
    assert.equal(res.outcome, 'screenshot-failed');
    assert.equal(f.calls.length, 0);
    f.restore();
});

test('a page save carries the selection the page reports, and the preview only for social posts', async () => {
    fake.executeScript = async () => [{ result: { url: 'https://example.com/a', title: 'Real title', selection: '  Picked   words ', og: {}, canonical: '' } }];
    const f = stubFetch(() => ({ status: 200, body: { success: true, queued: true } }));
    const res = await saves.savePage(tab());
    assert.equal(res.outcome, 'saved');
    assert.equal(res.title, 'Real title');
    assert.equal(res.quote, 'Picked words');
    assert.deepEqual(f.calls[0].body, { shared: 'https://example.com/a\n\nPicked words', noteKind: 'quote' });
    f.restore();
});
