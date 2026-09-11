import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getActionableTakeaway, isTakeawayDone, openTakeaways } from '../takeaway.ts';

test('reads the takeaway from either shape and trims it', () => {
    assert.equal(getActionableTakeaway({ actionableTakeaway: '  Buy 4 items  ' }), 'Buy 4 items');
    assert.equal(getActionableTakeaway({ metadata: { actionableTakeaway: 'Keep the receipt' } }), 'Keep the receipt');
    assert.equal(getActionableTakeaway({ actionableTakeaway: '   ', metadata: { actionableTakeaway: 'nested' } }), 'nested');
    assert.equal(getActionableTakeaway({ metadata: { actionableTakeaway: '  ' } }), '');
    assert.equal(getActionableTakeaway(null), '');
});

test('done is a positive timestamp, nothing else', () => {
    assert.equal(isTakeawayDone({ takeawayDoneAt: 1_700_000_000_000 }), true);
    assert.equal(isTakeawayDone({ takeawayDoneAt: null }), false);
    assert.equal(isTakeawayDone({}), false);
    assert.equal(isTakeawayDone(undefined), false);
});

test('the Revisit list keeps open takeaways only, newest save first', () => {
    const cards = [
        { id: 'old', createdAt: 1, metadata: { actionableTakeaway: 'Old task' } },
        { id: 'none', createdAt: 5, metadata: { actionableTakeaway: '' } },
        { id: 'done', createdAt: 4, actionableTakeaway: 'Done task', takeawayDoneAt: 9 },
        { id: 'answer', createdAt: 6, actionableTakeaway: 'From an answer', captureType: 'answer' },
        { id: 'new', createdAt: 3, actionableTakeaway: 'New task' },
        { id: 'iso', createdAt: '1970-01-01T00:00:00.002Z', actionableTakeaway: 'Legacy ISO date' },
    ];
    assert.deepEqual(openTakeaways(cards).map((c) => c.id), ['new', 'iso', 'old']);
    // Pure: the input order is untouched.
    assert.deepEqual(cards.map((c) => c.id), ['old', 'none', 'done', 'answer', 'new', 'iso']);
    assert.deepEqual(openTakeaways([]), []);
});
