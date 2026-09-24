import { test } from 'node:test';
import assert from 'node:assert/strict';
import { tagMatches, canonicalTagSpellings, retagList } from '../tags.ts';

test('tags match case-insensitively, including nested children', () => {
    assert.equal(tagMatches('AI', 'ai'), true);
    assert.equal(tagMatches('Work/Project', 'work'), true);
    assert.equal(tagMatches('Workshop', 'work'), false);
});

test('the most-used spelling names a case-variant group', () => {
    const m = canonicalTagSpellings([['AI', 'recipes'], ['ai'], ['AI']]);
    assert.equal(m.get('ai'), 'AI');
    assert.equal(m.get('recipes'), 'recipes');
});

test('rename rewrites the tag and its children, merging duplicates', () => {
    assert.deepEqual(retagList(['ml', 'ML/papers', 'news'], 'ml', 'AI'), ['AI', 'AI/papers', 'news']);
    // Merging into a tag the card already has collapses to one.
    assert.deepEqual(retagList(['AI', 'ai-stuff', 'ml'], 'ml', 'ai'), ['AI', 'ai-stuff']);
    assert.deepEqual(retagList(['a', 'B', 'b/c'], 'b', null), ['a']);
});
