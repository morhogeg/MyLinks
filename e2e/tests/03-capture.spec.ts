import { test, expect, type Page } from '@playwright/test';
import {
    adminList, adminUpdate, collectPageErrors, FREE_ENTITLEMENT, openAsNewUser, openAsReturningUser,
    readyCard, type TestUser,
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

test('free plan at its save limit: the paywall opens', async ({ page }) => {
    await openAsNewUser(page, {
        entitlement: FREE_ENTITLEMENT,
        handlers: {
            '/api/share': (_c, route) => route.fulfill({
                status: 429,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Monthly save limit reached', upgrade: true, kind: 'saves', used: 100, limit: 100 }),
            }),
        },
    });
    await saveLink(page, 'https://example.com/one-too-many');
    await expect(page.getByRole('dialog', { name: /Machina Pro|Pro|Upgrade/i }).first()).toBeVisible();
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

// ── Known bugs (found by this suite, 2026-10-04) ───────────────────────────
// test.fail() = "this is expected to fail today". When the bug is fixed the
// test starts passing, Playwright reports it as an unexpected pass, and the
// annotation should be removed. See SOURCE_OF_TRUTH.md §4 (E2E findings).

test('KNOWN BUG: a failed hand-off shows exactly one error toast', async ({ page }) => {
    test.fail(true, 'AddLinkForm: the enqueue catch AND the card-snapshot "failed" effect both toast');
    await openAsNewUser(page, {
        handlers: { '/api/share': (_c, route) => route.fulfill({ status: 503, body: '{"error":"Service unavailable"}' }) },
    });
    await saveLink(page, 'https://example.com/flaky-again');
    await expect(page.getByText(/analysis couldn.t (start|finish)/i).first()).toBeVisible();
    await page.waitForTimeout(1500);
    await expect(page.getByText(/analysis couldn.t (start|finish)/i)).toHaveCount(1, { timeout: 1000 });
});

test('KNOWN BUG: at the free save limit the user is not told to "retry"', async ({ page }) => {
    test.fail(true, 'A quota 429 flips the card to failed with a Retry button + "Tap the card to retry" toasts; retry just 429s again');
    await openAsNewUser(page, {
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
});
