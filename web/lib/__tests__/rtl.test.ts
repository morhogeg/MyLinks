/**
 * contentLang: Hebrew content is marked lang="he" so VoiceOver reads it with
 * a Hebrew voice (R-1). Run with
 * `node --test --experimental-strip-types lib/__tests__/rtl.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { contentLang } from '../rtl.ts';

test('Hebrew-led text is "he"', () => {
    assert.equal(contentLang('לקנות שמרים לפני שבת'), 'he');
    assert.equal(contentLang('איך עובד ה-API של Gemini'), 'he');
});

test('English, mixed English-led and empty text get no lang', () => {
    assert.equal(contentLang('Kubernetes networking explained'), undefined);
    assert.equal(contentLang('A note about "שבת שלום" in English'), undefined);
    assert.equal(contentLang(''), undefined);
    assert.equal(contentLang(null), undefined);
    assert.equal(contentLang(undefined), undefined);
});

test('Arabic is RTL but not Hebrew, so it is not marked "he"', () => {
    assert.equal(contentLang('مرحبا بالعالم'), undefined);
});
