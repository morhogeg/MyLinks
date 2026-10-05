import { test, expect, type Page, type Route } from '@playwright/test';
import {
    adminList, adminUpdate, collectPageErrors, FREE_ENTITLEMENT, openAsNewUser, openAsReturningUser,
    readyCard, type ApiCall, type TestUser,
} from '../helpers';

// Capture is the product's front door. The placeholder card is written by the
// client through the live rules, then handed to the (stubbed) pipeline; the
// test plays the pipeline's part by flipping the card the way
// process_link_background does.

async function saveLink(page: Page, url: string) {
    await page.getByRole('button', { name: 'Add to Machina' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add link' });
    await dialog.getByRole('textbox').fill(url);
    await dialog.getByRole('button', { name: 'Save' }).click();
    return dialog;
}

async function onlyCard(user: TestUser) {
    await expect.poll(async () => (await adminList(`users/${user.uid}/links`)).length).toBe(1);
    return (await adminList(`users/${user.uid}/links`))[0];
}

/** What process_link_background writes when analysis succeeds. */
async function finishAnalysis(user: TestUser, cardId: string, title: string) {
    await adminUpdate(`users/${user.uid}/links/${cardId}`, {
        status: 'ready',
        title,
        summary: 'A two-sentence summary the model wrote.',
        category: 'Technology',
        tags: ['testing', 'quality'],
        metadata: { originalTitle: title, estimatedReadTime: 4 },
    });
}

test('first link: placeholder → queued with the card id → ready card in the feed @desktop', async ({ page }) => {
    const errors = collectPageErrors(page);
    const { user, calls } = await openAsNewUser(page);
    const dialog = await saveLink(page, 'example.com/great-article');

    // Durable the moment the placeholder lands (written by the client, under rules).
    const card = await onlyCard(user);
    expect(card.data.status).toBe('processing');
    expect(card.data.url).toBe('https://example.com/great-article');
    await expect(dialog.getByRole('list', { name: 'Link analysis progress' })).toBeVisible();

    // Handed to the pipeline with the token and the card it must fill.
    await expect.poll(() => calls.find((c) => c.path === '/api/share')).toBeTruthy();
    const share = calls.find((c) => c.path === '/api/share')!;
    expect(share.auth).toMatch(/^Bearer /);
    expect(share.body).toMatchObject({ url: 'https://example.com/great-article', cardId: card.id });

    await finishAnalysis(user, card.id, 'A Great Article About Testing');
    await expect(page.getByRole('heading', { name: 'A Great Article About Testing' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Your Machina is empty' })).toHaveCount(0);
    expect(errors).toEqual([]);
});

test('pipeline unreachable: the link is kept as a retryable card, never lost', async ({ page }) => {
    const { user } = await openAsNewUser(page, {
        handlers: { '/api/share': (_c, route) => route.fulfill({ status: 503, body: '{"error":"Service unavailable"}' }) },
    });
    await saveLink(page, 'https://example.com/flaky');
    await expect(page.getByText(/analysis couldn.t start/i)).toBeVisible();
    await expect.poll(async () => (await adminList(`users/${user.uid}/links`))[0]?.data.status).toBe('failed');
    await expect(page.getByRole('button', { name: /retry/i }).first()).toBeVisible();
});

// ── The free save limit: the save is kept, only the analysis waits ─────────
// (SOURCE_OF_TRUTH §4 26a / E2.) Past the limit /api/share answers 200
// {waiting: true} and the server turns the placeholder into a `waiting` card
// (functions/deferred_capture.py). The stub plays that write.

const WAITING_ENTITLEMENT = { ...FREE_ENTITLEMENT, waiting: 3 };

const keepWaiting = async (call: ApiCall, route: Route) => {
    const { uid, cardId } = call.body as { uid: string; cardId: string };
    await adminUpdate(`users/${uid}/links/${cardId}`, { status: 'waiting', waitingAt: Date.now() });
    await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
            success: true, saved: true, queued: false, waiting: true, id: cardId, kind: 'saves',
            upgrade: true, used: 100, limit: 100, waitingCount: 3,
            message: 'Saved. Machina will read it on the 1st, or now with Pro.',
        }),
    });
};

test('free plan at its save limit: the save is kept and the paywall says what is waiting', async ({ page }) => {
    const errors = collectPageErrors(page);
    const { user } = await openAsNewUser(page, {
        entitlement: WAITING_ENTITLEMENT,
        handlers: { '/api/share': keepWaiting },
    });
    await saveLink(page, 'https://example.com/one-too-many');
    const paywall = page.getByRole('dialog', { name: 'Machina Pro' });
    await expect(paywall).toBeVisible();
    await expect(paywall.getByText('3 saves are waiting to be read. Machina reads them on the 1st, or right away with Pro.')).toBeVisible();
    // The card is kept, with its URL, waiting for its read: never failed.
    const card = await onlyCard(user);
    expect(card.data.status).toBe('waiting');
    expect(card.data.url).toBe('https://example.com/one-too-many');
    expect(errors).toEqual([]);
});

test('a waiting card reads as saved: no Retry, no error, one way to read it now', async ({ page }) => {
    await openAsNewUser(page, {
        entitlement: WAITING_ENTITLEMENT,
        handlers: { '/api/share': keepWaiting },
    });
    await saveLink(page, 'https://example.com/read-on-the-first');
    const paywall = page.getByRole('dialog', { name: 'Machina Pro' });
    await expect(paywall).toBeVisible();
    await paywall.getByRole('button', { name: 'Close' }).click();
    await expect(paywall).toHaveCount(0);

    const card = page.getByRole('article').filter({ hasText: 'Waiting to be read' });
    await expect(card).toBeVisible();
    await expect(card.getByText(/Saved\. Machina will read it on the 1st, or/)).toBeVisible();
    await expect(card.getByRole('button', { name: /retry/i })).toHaveCount(0);
    await expect(page.getByText(/Couldn.t analyze/i)).toHaveCount(0);
    // The capture flow showed the paywall and nothing else: no error toast.
    await expect(page.getByText(/couldn.t (start|finish)|tap the card to retry|limit reached/i)).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Add link' })).toHaveCount(0);

    // "now with Pro" is the one action besides Delete.
    await card.getByRole('button', { name: 'now with Pro' }).click();
    await expect(page.getByRole('dialog', { name: 'Machina Pro' })).toBeVisible();
});

test('upgrade: the waiting card is enqueued, then lands as a ready card', async ({ page }) => {
    const { user } = await openAsReturningUser(page, {
        later: {
            url: 'https://example.com/tide-tables', title: 'example.com', summary: '', tags: [],
            category: '', status: 'waiting', sourceType: 'web', isRead: false,
            createdAt: Date.now() - 3_600_000, waitingAt: Date.now() - 3_600_000,
            metadata: { originalTitle: '', estimatedReadTime: 0 },
        },
    }, { entitlement: { ...FREE_ENTITLEMENT, waiting: 1 } });
    await expect(page.getByRole('article').filter({ hasText: 'Waiting to be read' })).toBeVisible();

    // Going Pro: release_waiting_on_upgrade flips the card to queued and puts
    // its job on the normal queue (deferred_capture._enqueue_one).
    await adminUpdate(`users/${user.uid}/links/later`, { status: 'processing', queuedAt: Date.now(), waitingAt: null });
    await expect(page.getByText('Waiting to be read')).toHaveCount(0);
    await expect(page.getByText('Queued')).toBeVisible();

    // The worker reads the saved snapshot and writes the analysis.
    await finishAnalysis(user, 'later', 'How Tide Tables Work');
    await expect(page.getByRole('heading', { name: 'How Tide Tables Work' })).toBeVisible();
    await expect(page.getByText('Queued')).toHaveCount(0);
});

test('note: saved instantly, enriched in the background', async ({ page }) => {
    const errors = collectPageErrors(page);
    const { user } = await openAsNewUser(page);
    await page.getByRole('button', { name: 'Add to Machina' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add link' });
    await dialog.getByRole('button', { name: 'Note' }).click();
    await dialog.getByRole('textbox').fill('Remember to test the share sheet on a real iPhone before launch.');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Note saved')).toBeVisible();
    const card = await onlyCard(user);
    expect(card.data.sourceType).toBe('note');
    await expect(page.getByText(/test the share sheet on a real iPhone/).first()).toBeVisible();
    expect(errors).toEqual([]);
});

test('saving a link you already have opens the existing card instead of duplicating', async ({ page }) => {
    const url = 'https://example.com/already-saved';
    const { user } = await openAsReturningUser(page, {
        dup: readyCard({ url, urlKey: url, title: 'The One You Already Saved' }),
    });
    await saveLink(page, url);
    await expect(page.getByText('You already saved this. Opening it now.')).toBeVisible();
    await expect(page.getByRole('dialog').getByText('The One You Already Saved').first()).toBeVisible();
    expect((await adminList(`users/${user.uid}/links`)).length).toBe(1);
});

test('offline save: card shows at once, reaches the pipeline when back online', async ({ page, context }) => {
    const { user, calls } = await openAsNewUser(page);
    await context.setOffline(true);
    await saveLink(page, 'https://example.com/read-on-the-subway');
    await expect(page.getByText(/Saved offline/)).toBeVisible();
    await expect(page.getByRole('article').first()).toBeVisible();
    expect(calls.some((c) => c.path === '/api/share')).toBe(false);

    await context.setOffline(false);
    await expect.poll(() => calls.some((c) => c.path === '/api/share'), { timeout: 30_000 }).toBe(true);
    const card = await onlyCard(user);
    expect((calls.find((c) => c.path === '/api/share')!.body as { cardId: string }).cardId).toBe(card.id);
});

// ── Fixed bugs (found by this suite, 2026-10-04; SOURCE_OF_TRUTH §4 11b) ──
// These were test.fail() "known bugs" (E1, E2) until the fix landed.

test('E1: a failed hand-off shows exactly one error toast', async ({ page }) => {
    await openAsNewUser(page, {
        handlers: { '/api/share': (_c, route) => route.fulfill({ status: 503, body: '{"error":"Service unavailable"}' }) },
    });
    await saveLink(page, 'https://example.com/flaky-again');
    await expect(page.getByText(/analysis couldn.t (start|finish)/i).first()).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByText(/analysis couldn.t (start|finish)/i)).toHaveCount(1, { timeout: 1000 });
});

test('E2: at the free save limit the user is not told to "retry"', async ({ page }) => {
    // A server that still answers the save wall with a 429 (the deploy window,
    // or an older backend): the client keeps the card waiting itself.
    const { user } = await openAsNewUser(page, {
        entitlement: FREE_ENTITLEMENT,
        handlers: {
            '/api/share': (_c, route) => route.fulfill({
                status: 429,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Monthly save limit reached', upgrade: true, kind: 'saves', used: 100, limit: 100 }),
            }),
        },
    });
    await saveLink(page, 'https://example.com/over-the-limit');
    await expect(page.getByRole('dialog', { name: 'Machina Pro' })).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByText(/tap the card to retry/i)).toHaveCount(0, { timeout: 1000 });
    await expect.poll(async () => (await adminList(`users/${user.uid}/links`))[0]?.data.status).toBe('waiting');
});
