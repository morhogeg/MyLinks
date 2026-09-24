/**
 * lib/urlKey.ts must produce the SAME key as functions/url_key.py (the backend
 * writes `urlKey`, this side dedupes against it). The cases mirror
 * functions/tests/test_url_key.py. Run with `npm run test:urlkey`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { urlKey } from '../urlKey.ts';

const SAME: [string, string][] = [
    ['http://www.example.com/a/', 'https://example.com/a'],
    ['https://EXAMPLE.com/a#section', 'https://example.com/a'],
    ['https://m.example.com/a', 'https://example.com/a'],
    ['https://example.com:443/a', 'https://example.com/a'],
    ['https://example.com/a?utm_source=x&utm_medium=y', 'https://example.com/a'],
    ['https://example.com/a?b=2&a=1', 'https://example.com/a?a=1&b=2'],
    ['https://mobile.twitter.com/jack/status/20?s=20&t=abc', 'https://x.com/jack/status/20'],
    ['https://www.instagram.com/p/ABC123/?igsh=xyz', 'https://instagram.com/p/ABC123'],
    ['https://youtu.be/dQw4w9WgXcQ?si=abc&t=30', 'https://youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'https://youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share', 'https://youtube.com/watch?v=dQw4w9WgXcQ'],
    ['https://open.spotify.com/track/123?si=abc', 'https://open.spotify.com/track/123'],
];

test('equivalent URLs share a key', () => {
    for (const [a, b] of SAME) {
        assert.ok(urlKey(a), a);
        assert.equal(urlKey(a), urlKey(b), `${a} vs ${b}`);
    }
});

test('exact shapes match the Python normalizer', () => {
    assert.equal(urlKey('http://www.Example.com/Path/?utm_source=a#x'), 'https://example.com/Path');
    assert.equal(urlKey('https://example.com/a?b=hello world'), 'https://example.com/a?b=hello+world');
    assert.equal(urlKey('https://www.ynet.co.il/כתבה/1'), 'https://ynet.co.il/%D7%9B%D7%AA%D7%91%D7%94/1');
});

test('distinct pages keep distinct keys', () => {
    assert.notEqual(urlKey('https://example.com/A'), urlKey('https://example.com/a'));
    assert.notEqual(urlKey('https://example.com/search?s=cats'), urlKey('https://example.com/search'));
    assert.notEqual(urlKey('https://example.com:8080/a'), urlKey('https://example.com/a'));
});

test('non-URLs have no key', () => {
    for (const bad of [null, '', '   ', 'ftp://example.com/x', 'javascript:alert(1)', 'not a url', 42]) {
        assert.equal(urlKey(bad), '');
    }
});
