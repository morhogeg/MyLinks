import { test, expect, type Page } from '@playwright/test';
import { adminList, collectPageErrors, FREE_ENTITLEMENT, openAsReturningUser, readyCard, sseAnswer } from '../helpers';

// Ask Machina, the hero feature. The answer itself is the backend's job
// (covered by functions/tests/test_ask_*.py); here we check the app asks with
// the right credentials, renders a streamed answer with its sources, lets the
// user jump to a cited card, keeps the conversation, and handles the free cap.

const LIBRARY = {
    sourdough: readyCard({ title: 'Sourdough starter guide', category: 'Food', tags: ['baking'] }),
    k8s: readyCard({ title: 'Kubernetes networking explained', category: 'Technology' }),
};

async function ask(page: Page, question: string) {
    // Phone: bottom tab bar. Desktop: the toolbar's "Ask your brain".
    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Ask' })
        .or(page.getByRole('button', { name: 'Ask your brain' })).first().click();
    const box = page.getByRole('textbox').last();
    await box.fill(question);
    await box.press('Enter');
}

test('ask: streamed answer with a source that opens the card @desktop', async ({ page }) => {
    const errors = collectPageErrors(page);
    const { calls } = await openAsReturningUser(page, LIBRARY, {
        handlers: {
            '/api/chat': (_c, route) => sseAnswer(
                route,
                'Feed your starter twice a day and keep it warm.',
                [{ id: 'sourdough', title: 'Sourdough starter guide', category: 'Food' }],
            ),
        },
    });
    await ask(page, 'How do I keep a sourdough starter alive?');

    await expect(page.getByText('Feed your starter twice a day and keep it warm.')).toBeVisible();
    const chat = calls.find((c) => c.path === '/api/chat')!;
    expect(chat.auth).toMatch(/^Bearer /);
    expect(chat.body).toMatchObject({ question: 'How do I keep a sourdough starter alive?' });

    const source = page.getByRole('button', { name: /Sourdough starter guide/ }).last();
    await expect(source).toBeVisible();
    await source.click();
    await expect(page.getByRole('dialog', { name: 'Link details' })).toBeVisible();
    expect(errors).toEqual([]);
});

test('ask: the conversation is kept in the chat history', async ({ page }) => {
    const { user } = await openAsReturningUser(page, LIBRARY, {
        // Real answers take seconds; an instant one can beat the chat-history
        // snapshot, before which AskBrain doesn't persist (by design).
        handlers: {
            '/api/chat': async (_c, route) => {
                await new Promise((r) => setTimeout(r, 1500));
                return sseAnswer(route, 'Kubernetes uses a flat pod network.', [{ id: 'k8s', title: 'Kubernetes networking explained' }]);
            },
        },
    });
    await ask(page, 'What did I save about Kubernetes?');
    await expect(page.getByText('Kubernetes uses a flat pod network.')).toBeVisible();
    // The chat doc is created on the QUESTION and updated with the answer a
    // debounce later, so wait for the answer itself, not just for a doc.
    await expect.poll(
        async () => JSON.stringify((await adminList(`users/${user.uid}/chats`)).map((c) => c.data)),
        { timeout: 20_000 },
    ).toContain('flat pod network');
});

test('ask: backend down shows a recoverable error, not a blank screen', async ({ page }) => {
    await openAsReturningUser(page, LIBRARY, {
        handlers: { '/api/chat': (_c, route) => route.fulfill({ status: 500, body: '{"error":"boom"}' }) },
    });
    await ask(page, 'Anything about bread?');
    await expect(page.getByText(/couldn.t|try again|something went wrong/i).first()).toBeVisible();
    // The question is still there to retry.
    await expect(page.getByText('Anything about bread?').first()).toBeVisible();
});

test('ask: free plan at its question limit opens the paywall', async ({ page }) => {
    await openAsReturningUser(page, LIBRARY, {
        entitlement: FREE_ENTITLEMENT,
        handlers: {
            '/api/chat': (_c, route) => route.fulfill({
                status: 429,
                contentType: 'application/json',
                body: JSON.stringify({ error: 'Monthly question limit reached', upgrade: true, kind: 'asks', used: 20, limit: 20 }),
            }),
        },
    });
    await ask(page, 'One more question');
    await expect(page.getByRole('dialog', { name: 'Machina Pro' })).toBeVisible();
});
