import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { installFakeChrome, setOnline, stubFetch } from './fake-chrome.mjs';
import {
    Outcome, QUOTE_MAX, buildBody, classify, cleanQuote, isDelivered, isRetryable,
    postShare, survivesTextExtraction, verifyToken,
} from '../src/lib/api.js';
import { SHARE_ENDPOINT } from '../src/lib/config.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

installFakeChrome();

test('classify: every answer share_ingest gives', () => {
    const cases = [
        [200, { success: true, queued: true, id: 'q1', url: 'https://a.com' }, Outcome.SAVED],
        [200, { success: true, saved: true, id: 'n1', note: true }, Outcome.SAVED],
        [200, { success: true, queued: true, image: true }, Outcome.SAVED],
        [200, { success: true, duplicate: true, url: 'https://a.com' }, Outcome.DUPLICATE],
        [200, { success: true, saved: true, queued: false, waiting: true, message: 'Machina will read it next month.', upgrade: true }, Outcome.WAITING],
        [200, { success: false }, Outcome.UNEXPECTED],
        [200, null, Outcome.UNEXPECTED],
        [200, ['x'], Outcome.UNEXPECTED],
        [200, { success: true }, Outcome.UNEXPECTED],
        [401, { success: false, error: 'App Check verification failed' }, Outcome.RECONNECT],
        [403, { success: false, error: 'Invalid ingest token' }, Outcome.RECONNECT],
        [429, { success: false, error: 'Too many requests. Please slow down.' }, Outcome.RATE_LIMITED],
        [429, { success: false, error: 'Monthly limit', kind: 'saves', upgrade: true, used: 50, limit: 50 }, Outcome.QUOTA],
        [413, { success: false, error: 'Image is too large' }, Outcome.TOO_LARGE],
        [400, { success: false, error: 'URL is too long' }, Outcome.REJECTED],
        [404, { success: false, error: 'Card not found' }, Outcome.REJECTED],
        [409, { success: false, error: 'This card is already saved.' }, Outcome.REJECTED],
        [500, { success: false, error: 'Internal error' }, Outcome.SERVER],
        [503, null, Outcome.SERVER],
    ];
    for (const [status, body, expected] of cases) {
        assert.equal(classify(status, body).outcome, expected, `${status} ${JSON.stringify(body)}`);
    }
    const waiting = classify(200, { success: true, waiting: true, message: 'Kept for later', upgrade: true });
    assert.equal(waiting.message, 'Kept for later');
    assert.equal(waiting.upgrade, true);
    assert.equal(classify(400, { error: 'No URL or text found in shared content' }).error, 'No URL or text found in shared content');
});

test('isRetryable: heals later vs final; a screenshot timeout is never resent', () => {
    for (const o of [Outcome.OFFLINE, Outcome.NETWORK, Outcome.SERVER, Outcome.RATE_LIMITED]) {
        assert.equal(isRetryable(o, 'page'), true, o);
        assert.equal(isRetryable(o, 'screenshot'), true, o);
    }
    assert.equal(isRetryable(Outcome.TIMEOUT, 'page'), true);
    assert.equal(isRetryable(Outcome.TIMEOUT, 'link'), true);
    assert.equal(isRetryable(Outcome.TIMEOUT, 'screenshot'), false);
    for (const o of [Outcome.SAVED, Outcome.DUPLICATE, Outcome.WAITING, Outcome.RECONNECT, Outcome.QUOTA,
        Outcome.TOO_LARGE, Outcome.REJECTED, Outcome.UNEXPECTED]) {
        assert.equal(isRetryable(o, 'page'), false, o);
    }
    assert.equal(isDelivered(Outcome.WAITING), true);
    assert.equal(isDelivered(Outcome.REJECTED), false);
});

test('survivesTextExtraction mirrors the server', () => {
    assert.equal(survivesTextExtraction('https://example.com/a?b=1'), true);
    assert.equal(survivesTextExtraction('https://en.wikipedia.org/wiki/Mercury_(planet)'), true);
    assert.equal(survivesTextExtraction('https://example.com/odd)'), false);
    assert.equal(survivesTextExtraction('https://example.com/end.'), false);
    assert.equal(survivesTextExtraction('https://example.com/q?'), false);
    assert.equal(survivesTextExtraction('http://localhost/x'), false, 'server needs a dotted host');
    assert.equal(survivesTextExtraction('https://exa mple.com'), false);
    assert.equal(survivesTextExtraction(''), false);
});

test('the server patterns these mirror have not changed', () => {
    const main = readFileSync(join(REPO, 'functions/main.py'), 'utf8');
    assert.match(main, /_URL_IN_TEXT_RE = re\.compile\(r'https\?:\/\/\[\^\\s<>"\\u3000-\\u303f\\uff00-\\uffef\]\+', re\.I\)/);
    assert.ok(main.includes(`_URL_TRAILING_PUNCT = ').,;:!?"\\'”’»]>…\\u05f4\\u05f3'`), 'trailing punctuation set moved');
    assert.ok(main.includes('_PAGE_PREVIEW_HOSTS = ("instagram.com", "tiktok.com")'));
    assert.ok(main.includes('_INGEST_TOKEN_RE = re.compile(r"[A-Za-z0-9_-]{16,128}")'));
    assert.ok(main.includes("data.get('noteKind') == 'quote'"), 'quote saves must stay reminder-free');
    assert.ok(main.includes('chrome-extension://[a-p]{32}'), 'share_ingest must admit extension origins');
});

test('cleanQuote keeps paragraphs, trims spacing, caps length', () => {
    assert.equal(cleanQuote('  one  two \r\n\r\n\r\n three  '), 'one two\n\nthree');
    assert.equal(cleanQuote(42), '');
    const long = `${'word '.repeat(4000)}`;
    const out = cleanQuote(long);
    assert.ok(out.length <= QUOTE_MAX + 1);
    assert.ok(out.endsWith('…'));
});

test('buildBody: page, quote, preview, link, image, screenshot', () => {
    assert.deepEqual(buildBody({ kind: 'page', url: 'https://a.com/x' }), { url: 'https://a.com/x' });
    assert.deepEqual(buildBody({ kind: 'page', url: 'https://a.com/x', quote: 'Remember this tomorrow' }), {
        shared: 'https://a.com/x\n\nRemember this tomorrow',
        noteKind: 'quote',
    });
    // An address the server would trim can't ride in shared text.
    assert.deepEqual(buildBody({ kind: 'page', url: 'https://a.com/x.', quote: 'q' }), {
        url: 'https://a.com/x.', note: 'q', noteKind: 'quote',
    });
    const preview = { url: 'https://www.instagram.com/p/ABC/', title: 't' };
    assert.deepEqual(buildBody({ kind: 'page', url: 'https://www.instagram.com/p/ABC/', preview }), {
        url: 'https://www.instagram.com/p/ABC/', pagePreview: preview,
    });
    assert.deepEqual(buildBody({ kind: 'link', url: 'https://b.com' }), { url: 'https://b.com' });
    assert.deepEqual(buildBody({ kind: 'image', url: 'https://c.com/i.png' }), { url: 'https://c.com/i.png' });
    assert.deepEqual(buildBody({ kind: 'screenshot', image: { data: 'AAAA', mimeType: 'image/jpeg' }, title: 'x', sourceUrl: 'https://s.com' }), {
        image: 'AAAA', mimeType: 'image/jpeg',
    });
    assert.throws(() => buildBody({ kind: 'video' }));
});

test('postShare: header, no cookies, one endpoint', async () => {
    setOnline(true);
    const f = stubFetch(() => ({ status: 200, body: { success: true, queued: true } }));
    try {
        const res = await postShare({ url: 'https://a.com' }, 'tok_1234567890abcdef');
        assert.equal(res.outcome, Outcome.SAVED);
        assert.equal(f.calls.length, 1);
        assert.equal(f.calls[0].url, SHARE_ENDPOINT);
        assert.equal(SHARE_ENDPOINT, 'https://mymachina.app/api/share');
        assert.equal(f.calls[0].init.method, 'POST');
        assert.equal(f.calls[0].init.credentials, 'omit');
        assert.equal(f.calls[0].headers['X-Ingest-Token'], 'tok_1234567890abcdef');
        assert.equal(f.calls[0].headers['Content-Type'], 'application/json');
        assert.deepEqual(f.calls[0].body, { url: 'https://a.com' });
    } finally {
        f.restore();
    }
});

test('postShare: offline, network failure, timeout, non-JSON', async () => {
    setOnline(false);
    let f = stubFetch(() => ({ status: 200 }));
    assert.equal((await postShare({}, 't')).outcome, Outcome.OFFLINE);
    assert.equal(f.calls.length, 0, 'nothing sent while offline');
    f.restore();

    setOnline(true);
    f = stubFetch(() => { throw new TypeError('Failed to fetch'); });
    assert.equal((await postShare({}, 't')).outcome, Outcome.NETWORK);
    f.restore();

    const original = globalThis.fetch;
    globalThis.fetch = (url, init) => new Promise((_, reject) => {
        init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    });
    assert.equal((await postShare({}, 't', { timeoutMs: 30 })).outcome, Outcome.TIMEOUT);
    globalThis.fetch = original;

    f = stubFetch(() => ({ status: 502, raw: '<html>Bad gateway</html>' }));
    const res = await postShare({}, 't');
    assert.equal(res.outcome, Outcome.SERVER);
    assert.equal(res.status, 502);
    f.restore();
});

test('verifyToken reads share_ingest\'s answer to an empty body', async () => {
    setOnline(true);
    const table = [[400, 'valid'], [403, 'invalid'], [429, 'rate-limited'], [500, 'server']];
    for (const [status, expected] of table) {
        const f = stubFetch(() => ({ status, body: { success: false, error: 'x' } }));
        assert.equal(await verifyToken('tok_1234567890abcdef'), expected, String(status));
        assert.deepEqual(f.calls[0].body, {}, 'the check saves nothing');
        f.restore();
    }
    const f = stubFetch(() => { throw new TypeError('down'); });
    assert.equal(await verifyToken('tok_1234567890abcdef'), 'network');
    f.restore();
});
