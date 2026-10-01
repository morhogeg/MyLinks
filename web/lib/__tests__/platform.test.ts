/**
 * The brand mark on a LinkedIn card's byline has gone missing repeatedly: each
 * time, a URL form the share sheet handed over (lnkd.in short link, redirect)
 * wasn't recognised, so the card fell through to the plain-publisher byline
 * (name, no icon). These pin every LinkedIn form we know of, plus the backend
 * `sourcePlatform` stamp that covers forms we don't. Run with
 * `npm run test:platform`.
 */

import test from 'node:test';
import assert from 'node:assert/strict';

import { getPlatform, linkPlatform } from '../platformKey.ts';

const LINKEDIN_URLS = [
    'https://www.linkedin.com/posts/pilipda-samattanawin_jobboards-activity-7300000000000000000-AbCd?utm_source=share&utm_medium=member_ios',
    'https://linkedin.com/feed/update/urn:li:activity:7300000000000000000/',
    'https://il.linkedin.com/posts/someone_x-activity-1-a',
    'https://www.linkedin.com/in/someone',
    'https://lnkd.in/e5zrAbaM',
    'https://www.lnkd.in/e5zrAbaM',
];

test('every LinkedIn URL form reads as LinkedIn', () => {
    for (const url of LINKEDIN_URLS) {
        assert.equal(getPlatform(url), 'linkedin', url);
        assert.equal(linkPlatform({ url, sourceType: 'web' }), 'linkedin', url);
    }
});

test('a lookalike host is not LinkedIn', () => {
    assert.equal(getPlatform('https://linkedin.com.evil.test/posts/x'), null);
    assert.equal(getPlatform('https://notlnkd.in/abc'), null);
});

test('backend stamp gives the mark when the URL host names no platform', () => {
    assert.equal(linkPlatform({ url: 'https://redirect.example/abc', sourceType: 'web', sourcePlatform: 'linkedin' }), 'linkedin');
    assert.equal(linkPlatform({ url: 'https://redirect.example/abc', sourceType: 'web', sourcePlatform: 'LinkedIn ' }), 'linkedin');
    assert.equal(linkPlatform({ url: 'https://redirect.example/abc', sourceType: 'web' }), null);
    assert.equal(linkPlatform({ url: 'https://redirect.example/abc', sourceType: 'web', sourcePlatform: 'tiktok' }), null);
});

test('the URL host wins over the stamp', () => {
    assert.equal(linkPlatform({ url: 'https://x.com/naval/status/1', sourceType: 'web', sourcePlatform: 'linkedin' }), 'x');
});

test('a screenshot card ignores the stamp (its sourcePlatform is the app read off the image)', () => {
    assert.equal(linkPlatform({ url: 'https://storage.example/shot.png', sourceType: 'image', sourcePlatform: 'linkedin' }), null);
});
