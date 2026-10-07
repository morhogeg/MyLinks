import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isReminderDue, snoozeTarget, whenLabel } from '../reminderTime.ts';

// Wed 7 Oct 2026, 10:30 local.
const now = new Date(2026, 9, 7, 10, 30);
const at = (d: number, h: number, m = 0) => new Date(2026, 9, d, h, m).getTime();

test('a fired or past reminder is due; a future one is not', () => {
    assert.equal(isReminderDue({ reminderDue: true, nextReminderAt: at(9, 9) }, now.getTime()), true);
    assert.equal(isReminderDue({ nextReminderAt: at(7, 9) }, now.getTime()), true);
    assert.equal(isReminderDue({ nextReminderAt: at(7, 13) }, now.getTime()), false);
});

test('snooze lands tomorrow 9:00 for a due or later-today reminder', () => {
    assert.equal(snoozeTarget({ reminderDue: true, nextReminderAt: at(7, 9) }, now), at(8, 9));
    assert.equal(snoozeTarget({ nextReminderAt: at(7, 13) }, now), at(8, 9));
});

test('snooze moves a later reminder one day past its own time, never earlier', () => {
    assert.equal(snoozeTarget({ nextReminderAt: at(10, 9) }, now), at(11, 9));
    assert.equal(snoozeTarget({ nextReminderAt: at(8, 9) }, now), at(9, 9));
});

test('whenLabel shortens by distance', () => {
    assert.match(whenLabel(at(7, 13), now), /^1:00/);
    assert.match(whenLabel(at(8, 9), now), /^Tomorrow, 9:00/);
    assert.match(whenLabel(at(10, 9), now), /^Sat, 9:00/);
    assert.match(whenLabel(at(20, 9), now), /^Oct 20, 9:00/);
});
