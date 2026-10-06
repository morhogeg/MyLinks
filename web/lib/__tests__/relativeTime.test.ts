/**
 * relativeTime: one rule for every surface (L-2). Run with
 * `node --test --experimental-strip-types lib/__tests__/relativeTime.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { relativeTime } from '../relativeTime.ts';

const NOW = Date.UTC(2026, 9, 6, 12, 0, 0);
const ago = (ms: number) => NOW - ms;
const MIN = 60_000, HOUR = 60 * MIN, DAY = 24 * HOUR;

test('English steps, then a date from a week on', () => {
    assert.equal(relativeTime(ago(20_000), NOW), 'just now');
    assert.equal(relativeTime(ago(5 * MIN), NOW), '5m ago');
    assert.equal(relativeTime(ago(3 * HOUR), NOW), '3h ago');
    assert.equal(relativeTime(ago(DAY + HOUR), NOW), 'yesterday');
    assert.equal(relativeTime(ago(4 * DAY), NOW), '4d ago');
    assert.match(relativeTime(ago(45 * DAY), NOW), /Aug 22/);
    assert.match(relativeTime(ago(412 * DAY), NOW), /2025/);
});

test('Hebrew forms are grammatical', () => {
    assert.equal(relativeTime(ago(HOUR + MIN), NOW, true), 'לפני שעה');
    assert.equal(relativeTime(ago(2 * HOUR + MIN), NOW, true), 'לפני שעתיים');
    assert.equal(relativeTime(ago(5 * HOUR), NOW, true), 'לפני 5 שע׳');
    assert.equal(relativeTime(ago(DAY + HOUR), NOW, true), 'אתמול');
    assert.equal(relativeTime(ago(2 * DAY + HOUR), NOW, true), 'לפני יומיים');
    assert.equal(relativeTime(ago(4 * DAY), NOW, true), 'לפני 4 ימים');
});

test('seconds, ISO strings and junk', () => {
    assert.equal(relativeTime(Math.floor(ago(3 * HOUR) / 1000), NOW), '3h ago');
    assert.equal(relativeTime(new Date(ago(5 * MIN)).toISOString(), NOW), '5m ago');
    assert.equal(relativeTime(0, NOW), 'recently');
    assert.equal(relativeTime('not a date', NOW), 'recently');
    assert.equal(relativeTime(null, NOW, true), 'לאחרונה');
    // A clock a little behind the server never says "-1m ago".
    assert.equal(relativeTime(NOW + 30_000, NOW), 'just now');
});
