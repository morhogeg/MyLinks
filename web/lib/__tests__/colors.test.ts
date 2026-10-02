import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assignSlots, COLOR_KEYS } from '../colors.ts';

test('every category gets its own slot, case-insensitively', () => {
    const map = assignSlots(['Tech', 'Health', 'Career', 'Travel', 'Food', 'tech', 'Productivity'], {});
    assert.deepEqual(Object.keys(map).sort(), ['career', 'food', 'health', 'productivity', 'tech', 'travel']);
    assert.equal(new Set(Object.values(map)).size, 6);
});

test('existing slots are kept; a new category never recolors the rest', () => {
    const before = assignSlots(['Tech', 'Health', 'Travel'], {});
    const after = assignSlots(['Tech', 'Health', 'Travel', 'Sports'], before);
    for (const k of ['tech', 'health', 'travel']) assert.equal(after[k], before[k]);
    assert.ok(!['tech', 'health', 'travel'].some((k) => after[k] === after.sports));
});

test('a stored collision is repaired in favor of the more-used category', () => {
    const map = assignSlots(['Tech', 'Tech', 'Health'], { tech: 'orange', health: 'orange' });
    assert.equal(map.tech, 'orange');
    assert.notEqual(map.health, 'orange');
});

test('graphite is last resort; past the palette size categories share by hash', () => {
    const names = Array.from({ length: COLOR_KEYS.length + 3 }, (_, i) => `cat${i}`);
    const map = assignSlots(names, {});
    assert.equal(Object.keys(map).length, COLOR_KEYS.length);
    assert.equal(new Set(Object.values(map)).size, COLOR_KEYS.length);
    const fewer = assignSlots(['a', 'b', 'c'], {});
    assert.ok(!Object.values(fewer).includes('purple'));
});
