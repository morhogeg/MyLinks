import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installFakeChrome } from './fake-chrome.mjs';
import {
    displayUrl, hostIs, httpsOn, previewOnlySite, savability, socialHandle, socialPostId, socialPostSite,
} from '../src/lib/urls.js';
import { cleanFacts, socialPreview } from '../src/lib/capture.js';
import { decodeDataUrl, toBase64 } from '../src/lib/image.js';

installFakeChrome();

test('savability: only web pages are sent', () => {
    assert.deepEqual(savability('https://example.com/a'), { ok: true });
    assert.deepEqual(savability('http://example.com'), { ok: true });
    assert.equal(savability('chrome://settings').reason, 'browser');
    assert.equal(savability('chrome-extension://abc/popup.html').reason, 'browser');
    assert.equal(savability('edge://newtab').reason, 'browser');
    assert.equal(savability('about:blank').reason, 'browser');
    assert.equal(savability('view-source:https://a.com').reason, 'browser');
    assert.equal(savability('file:///Users/me/a.pdf').reason, 'file');
    assert.equal(savability('data:text/html,hi').reason, 'other');
    assert.equal(savability('javascript:alert(1)').reason, 'other');
    assert.equal(savability('not a url').reason, 'other');
    assert.equal(savability(undefined).reason, 'other');
});

test('host helpers', () => {
    assert.equal(hostIs('www.linkedin.com', 'linkedin.com'), true);
    assert.equal(hostIs('evil-linkedin.com', 'linkedin.com'), false);
    assert.equal(previewOnlySite('https://www.linkedin.com/posts/x'), 'LinkedIn');
    assert.equal(previewOnlySite('https://m.facebook.com/story.php'), 'Facebook');
    assert.equal(previewOnlySite('https://example.com'), null);
    assert.equal(displayUrl('https://www.example.com/a/b?x=1'), 'example.com/a/b');
    assert.equal(displayUrl('https://example.com/'), 'example.com');
    assert.equal(httpsOn('https://scontent.cdninstagram.com/v/x.jpg', ['cdninstagram.com']), 'https://scontent.cdninstagram.com/v/x.jpg');
    assert.equal(httpsOn('http://scontent.cdninstagram.com/v/x.jpg', ['cdninstagram.com']), '');
    assert.equal(httpsOn('https://evil.com/cdninstagram.com.jpg', ['cdninstagram.com']), '');
});

test('Instagram and TikTok post ids and handles', () => {
    assert.equal(socialPostSite('https://www.instagram.com/p/ABC_1-x/'), 'instagram');
    assert.equal(socialPostSite('https://www.tiktok.com/@a/video/1'), 'tiktok');
    assert.equal(socialPostSite('https://example.com'), null);
    assert.equal(socialPostId('https://www.instagram.com/p/ABC_1-x/'), 'ABC_1-x');
    assert.equal(socialPostId('https://www.instagram.com/reel/RE1/?igsh=x'), 'RE1');
    assert.equal(socialPostId('https://www.instagram.com/someone/p/ABC/'), 'ABC');
    assert.equal(socialPostId('https://www.instagram.com/someone/'), null);
    assert.equal(socialPostId('https://www.tiktok.com/@chef/video/7351234567890'), '7351234567890');
    assert.equal(socialPostId('https://www.tiktok.com/@chef/photo/42'), '42');
    assert.equal(socialHandle('https://www.tiktok.com/@chef.co/video/1'), 'chef.co');
    assert.equal(socialHandle('https://www.instagram.com/someone/p/ABC/'), 'someone');
    assert.equal(socialHandle('https://www.instagram.com/p/ABC/'), '');
});

const igFacts = (over = {}) => cleanFacts({
    url: 'https://www.instagram.com/p/ABC/',
    title: 'Instagram',
    selection: '',
    og: {
        title: 'Chef Ana on Instagram: "Five-minute pasta"',
        description: '1,204 likes - chefana on May 2: "Five-minute pasta, here is how…"',
        image: 'https://scontent-lhr8-1.cdninstagram.com/v/t51/abc.jpg',
        url: 'https://www.instagram.com/chefana/p/ABC/',
    },
    canonical: '',
    ...over,
});

test('socialPreview: the post on screen, in the server\'s shape', () => {
    const preview = socialPreview('https://www.instagram.com/p/ABC/?img_index=1', igFacts());
    assert.deepEqual(preview, {
        url: 'https://www.instagram.com/chefana/p/ABC/',
        title: 'Chef Ana on Instagram: "Five-minute pasta"',
        description: '1,204 likes - chefana on May 2: "Five-minute pasta, here is how…"',
        image: 'https://scontent-lhr8-1.cdninstagram.com/v/t51/abc.jpg',
        author: 'chefana',
    });
});

test('socialPreview: nothing when the tags describe another post or a login page', () => {
    // In-app navigation left the previous post's tags behind.
    assert.equal(socialPreview('https://www.instagram.com/p/NEW/', igFacts()), null);
    // Logged-out wall: no post url in the tags.
    assert.equal(socialPreview('https://www.instagram.com/p/ABC/', igFacts({
        og: { title: 'Instagram', description: 'Log in', image: '', url: 'https://www.instagram.com/' },
    })), null);
    // Not a social site, or no facts (restricted page).
    assert.equal(socialPreview('https://example.com/p/ABC/', igFacts()), null);
    assert.equal(socialPreview('https://www.instagram.com/p/ABC/', null), null);
    // An image off the platform's CDN is dropped, the rest kept.
    const p = socialPreview('https://www.instagram.com/p/ABC/', igFacts({
        og: { ...igFacts().og, image: 'https://tracker.example/x.jpg' },
    }));
    assert.equal(p.image, undefined);
    assert.ok(p.title);
});

test('socialPreview: TikTok via the canonical link', () => {
    const facts = cleanFacts({
        url: 'https://www.tiktok.com/@chef/video/123',
        title: 'TikTok',
        og: { title: 'Crispy rice | TikTok', description: 'Recipe below', image: 'https://p16-sign.tiktokcdn-us.com/a.jpeg', url: '' },
        canonical: 'https://www.tiktok.com/@chef/video/123',
    });
    assert.deepEqual(socialPreview('https://www.tiktok.com/@chef/video/123?lang=en', facts), {
        url: 'https://www.tiktok.com/@chef/video/123',
        title: 'Crispy rice | TikTok',
        description: 'Recipe below',
        image: 'https://p16-sign.tiktokcdn-us.com/a.jpeg',
        author: 'chef',
    });
});

test('cleanFacts treats the page as untrusted', () => {
    assert.equal(cleanFacts(null), null);
    assert.equal(cleanFacts('x'), null);
    const f = cleanFacts({ title: 'x'.repeat(2000), og: { description: 42 }, selection: 7 });
    assert.equal(f.title.length, 500);
    assert.equal(f.og.description, '');
    assert.equal(f.selection, '');
    assert.equal(f.og.url, '');
});

test('image: data URL decode and base64 round trip', () => {
    const bytes = new Uint8Array(70000).map((_, i) => (i * 31) % 256);
    const b64 = toBase64(bytes);
    assert.equal(b64, Buffer.from(bytes).toString('base64'));
    const back = decodeDataUrl(`data:image/jpeg;base64,${b64}`);
    assert.equal(back.mimeType, 'image/jpeg');
    assert.deepEqual(Buffer.from(back.bytes), Buffer.from(bytes));
    assert.throws(() => decodeDataUrl('data:text/plain,hello'));
});
