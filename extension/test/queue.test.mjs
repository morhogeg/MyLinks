import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeChrome, setOnline } from './fake-chrome.mjs';
import { Outcome } from '../src/lib/api.js';
import * as queue from '../src/lib/queue.js';

let fake;
beforeEach(() => {
    fake = installFakeChrome();
    setOnline(true);
});

const page = (url, extra = {}) => ({ kind: 'page', url, title: url, ...extra });
const shot = () => ({ kind: 'screenshot', image: { data: 'AAAA', mimeType: 'image/jpeg' }, title: 's' });

test('add keeps a save with backoff and arms the alarm', async () => {
    const now = 1_000_000;
    assert.deepEqual(await queue.add(page('https://a.com'), Outcome.OFFLINE, now), { added: true });
    const [item] = await queue.list();
    assert.equal(item.status, 'pending');
    assert.equal(item.attempts, 1);
    assert.equal(item.nextAttemptAt, now + 30_000);
    assert.equal(item.lastOutcome, Outcome.OFFLINE);
    assert.ok(fake.alarmMap.has(queue.RETRY_ALARM));
});

test('add: a rate limit waits minutes; a reconnect is held, not scheduled', async () => {
    const now = 2_000_000;
    await queue.add(page('https://a.com'), Outcome.RATE_LIMITED, now);
    await queue.add(page('https://b.com'), Outcome.RECONNECT, now);
    const [a, b] = await queue.list();
    assert.equal(a.nextAttemptAt, now + 5 * 60_000);
    assert.equal(b.status, 'reconnect');
});

test('add: the same page twice is one save; caps hold', async () => {
    await queue.add(page('https://a.com'), Outcome.OFFLINE);
    await queue.add(page('https://a.com'), Outcome.OFFLINE);
    assert.equal((await queue.list()).length, 1);
    // Different quote = different save.
    await queue.add(page('https://a.com', { quote: 'q' }), Outcome.OFFLINE);
    assert.equal((await queue.list()).length, 2);

    for (let i = 0; i < queue.LIMITS.screenshots; i += 1) {
        assert.equal((await queue.add(shot(), Outcome.OFFLINE)).added, true);
    }
    assert.deepEqual(await queue.add(shot(), Outcome.OFFLINE), { added: false, reason: 'full' });

    await queue.clear();
    for (let i = 0; i < queue.LIMITS.items; i += 1) await queue.add(page(`https://a.com/${i}`), Outcome.OFFLINE);
    assert.deepEqual(await queue.add(page('https://z.com'), Outcome.OFFLINE), { added: false, reason: 'full' });
});

test('backoff grows and caps', () => {
    assert.equal(queue.backoffMs(1), 30_000);
    assert.equal(queue.backoffMs(2), 60_000);
    assert.equal(queue.backoffMs(5), 15 * 60_000);
    assert.equal(queue.backoffMs(50), 4 * 3600_000);
});

test('flush sends what is due, oldest first, and removes delivered saves', async () => {
    const past = Date.now() - 60_000;
    await queue.add(page('https://first.com'), Outcome.OFFLINE, past - 1000);
    await queue.add(page('https://second.com'), Outcome.OFFLINE, past);
    const sent = [];
    const res = await queue.flush(async (item) => {
        sent.push(item.url);
        return { outcome: item.url.includes('first') ? Outcome.SAVED : Outcome.DUPLICATE };
    }, { connected: true });
    assert.deepEqual(sent, ['https://first.com', 'https://second.com']);
    assert.equal(res.sent, 2);
    assert.equal((await queue.list()).length, 0);
    assert.equal(fake.alarmMap.has(queue.RETRY_ALARM), false, 'nothing left, no alarm');
});

test('flush: not due waits unless forced; not connected or offline sends nothing', async () => {
    await queue.add(page('https://a.com'), Outcome.OFFLINE);
    let calls = 0;
    const send = async () => { calls += 1; return { outcome: Outcome.SAVED }; };
    await queue.flush(send, { connected: true });
    assert.equal(calls, 0, 'not due yet');
    await queue.flush(send, { connected: false, force: true });
    assert.equal(calls, 0, 'no token');
    setOnline(false);
    await queue.flush(send, { connected: true, force: true });
    assert.equal(calls, 0, 'offline');
    setOnline(true);
    await queue.flush(send, { connected: true, force: true });
    assert.equal(calls, 1);
});

test('flush: retryable failure backs off; rate limit stops the round', async () => {
    const past = Date.now() - 60_000;
    await queue.add(page('https://a.com'), Outcome.OFFLINE, past);
    await queue.add(page('https://b.com'), Outcome.OFFLINE, past + 1);
    const sent = [];
    await queue.flush(async (item) => { sent.push(item.url); return { outcome: Outcome.RATE_LIMITED }; }, { connected: true });
    assert.deepEqual(sent, ['https://a.com'], 'stopped after the rate limit');
    const [a, b] = await queue.list();
    assert.equal(a.attempts, 2);
    assert.ok(a.nextAttemptAt > Date.now() + 4 * 60_000);
    assert.equal(b.attempts, 1);

    await queue.flush(async () => ({ outcome: Outcome.SERVER }), { connected: true, force: true });
    const [a2] = await queue.list();
    assert.equal(a2.attempts, 3);
    assert.equal(a2.status, 'pending');
});

test('flush: a refused token holds everything for reconnect', async () => {
    await queue.add(page('https://a.com'), Outcome.OFFLINE);
    await queue.add(page('https://b.com'), Outcome.OFFLINE);
    let calls = 0;
    await queue.flush(async () => { calls += 1; return { outcome: Outcome.RECONNECT }; }, { connected: true, force: true });
    assert.equal(calls, 1);
    assert.deepEqual((await queue.list()).map((i) => i.status), ['reconnect', 'reconnect']);
    await queue.releaseReconnectHolds();
    assert.deepEqual((await queue.list()).map((i) => i.status), ['pending', 'pending']);
});

test('flush: a final failure is kept, marked, and not retried', async () => {
    await queue.add(page('https://a.com'), Outcome.OFFLINE);
    await queue.flush(async () => ({ outcome: Outcome.TOO_LARGE, error: 'Image is too large' }), { connected: true, force: true });
    const [item] = await queue.list();
    assert.equal(item.status, 'failed');
    assert.equal(item.error, 'Image is too large');
    let calls = 0;
    await queue.flush(async () => { calls += 1; return { outcome: Outcome.SAVED }; }, { connected: true, force: true });
    assert.equal(calls, 0);
    assert.deepEqual(await queue.counts(), { waiting: 0, failed: 1 });
});

test('flush: a screenshot timeout is final (it may have arrived)', async () => {
    await queue.add(shot(), Outcome.NETWORK);
    await queue.flush(async () => ({ outcome: Outcome.TIMEOUT }), { connected: true, force: true });
    const [item] = await queue.list();
    assert.equal(item.status, 'failed');
});

test('flush: gives up after a day', async () => {
    await queue.add(page('https://a.com'), Outcome.OFFLINE, Date.now() - queue.GIVE_UP_MS - 1);
    await queue.flush(async () => ({ outcome: Outcome.SERVER }), { connected: true, force: true });
    const [item] = await queue.list();
    assert.equal(item.status, 'failed');
    assert.equal(item.error, 'expired');
});

test('flush: concurrent calls share one run; a discarded save is skipped', async () => {
    await queue.add(page('https://a.com'), Outcome.OFFLINE);
    await queue.add(page('https://b.com'), Outcome.OFFLINE);
    const [, b] = await queue.list();
    const sent = [];
    const send = async (item) => {
        sent.push(item.url);
        if (item.url === 'https://a.com') await queue.remove(b.id);
        return { outcome: Outcome.SAVED };
    };
    const one = queue.flush(send, { connected: true, force: true });
    const two = queue.flush(send, { connected: true, force: true });
    assert.equal(one, two);
    await one;
    assert.deepEqual(sent, ['https://a.com']);
});
