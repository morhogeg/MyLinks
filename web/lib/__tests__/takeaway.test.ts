import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closedTakeaways, getActionableTakeaway, isTakeawayDismissed, isTakeawayDone, openTakeaways } from '../takeaway.ts';

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

test('dismissed is a positive timestamp, nothing else', () => {
    assert.equal(isTakeawayDismissed({ takeawayDismissedAt: 1_700_000_000_000 }), true);
    assert.equal(isTakeawayDismissed({ takeawayDismissedAt: null }), false);
    assert.equal(isTakeawayDismissed({}), false);
});

test('the Revisit list keeps open takeaways only, newest save first', () => {
    const cards = [
        { id: 'old', createdAt: 1, metadata: { actionableTakeaway: 'Old task' } },
        { id: 'none', createdAt: 5, metadata: { actionableTakeaway: '' } },
        { id: 'done', createdAt: 4, actionableTakeaway: 'Done task', takeawayDoneAt: 9 },
        { id: 'dismissed', createdAt: 7, actionableTakeaway: 'Not for me', takeawayDismissedAt: 9 },
        { id: 'answer', createdAt: 6, actionableTakeaway: 'From an answer', captureType: 'answer' },
        { id: 'new', createdAt: 3, actionableTakeaway: 'New task' },
        { id: 'iso', createdAt: '1970-01-01T00:00:00.002Z', actionableTakeaway: 'Legacy ISO date' },
    ];
    assert.deepEqual(openTakeaways(cards).map((c) => c.id), ['new', 'iso', 'old']);
    // Pure: the input order is untouched.
    assert.deepEqual(cards.map((c) => c.id), ['old', 'none', 'done', 'dismissed', 'answer', 'new', 'iso']);
    assert.deepEqual(openTakeaways([]), []);
});

test('the Done list holds done and dismissed takeaways, most recently closed first', () => {
    const cards = [
        { id: 'open', createdAt: 1, actionableTakeaway: 'Still open' },
        { id: 'done-old', createdAt: 2, actionableTakeaway: 'Done long ago', takeawayDoneAt: 10 },
        { id: 'skipped', createdAt: 3, actionableTakeaway: 'Not for me', takeawayDismissedAt: 30 },
        { id: 'done-new', createdAt: 4, actionableTakeaway: 'Done now', takeawayDoneAt: 40 },
        { id: 'answer', createdAt: 5, actionableTakeaway: 'Answer', captureType: 'answer', takeawayDoneAt: 50 },
        { id: 'none', createdAt: 6, actionableTakeaway: '', takeawayDoneAt: 60 },
    ];
    assert.deepEqual(closedTakeaways(cards).map((c) => c.id), ['done-new', 'skipped', 'done-old']);
});
