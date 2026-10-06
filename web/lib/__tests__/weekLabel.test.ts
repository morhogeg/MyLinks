/**
 * isoWeekLabel: an ISO week reads Monday to Sunday in every timezone
 * (REC-18). Run with `node --test --experimental-strip-types lib/__tests__/weekLabel.test.ts`.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';

import { isoWeekLabel } from '../weekLabel.ts';

for (const tz of ['UTC', 'America/Los_Angeles', 'America/New_York', 'Asia/Jerusalem', 'Pacific/Auckland']) {
    test(`2026-W30 is Mon 20 Jul to Sun 26 Jul in ${tz}`, () => {
        const before = process.env.TZ;
        process.env.TZ = tz;
        try {
            assert.equal(isoWeekLabel('2026-W30', 'en-GB'), '20–26 Jul');
            assert.equal(isoWeekLabel('2026-W30', 'en-US'), '20–Jul 26');
            // A week across a month boundary names both months.
            assert.equal(isoWeekLabel('2026-W31', 'en-GB'), '27 Jul – 2 Aug');
            // ISO week 1 of 2027 starts on Monday 4 January.
            assert.equal(isoWeekLabel('2027-W01', 'en-GB'), '4–10 Jan');
        } finally {
            process.env.TZ = before;
        }
    });
}

test('not a week id', () => {
    assert.equal(isoWeekLabel('2026-07-20'), null);
    assert.equal(isoWeekLabel(''), null);
});
