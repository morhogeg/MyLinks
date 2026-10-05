import { test, expect } from '@playwright/test';
import {
    adminGet, adminList, collectPageErrors, expectNoHorizontalOverflow, openAsReturningUser, readyCard,
} from '../helpers';

// A returning user with a small library: find things, change things, remove
// things. Each mutation is checked in Firestore, so a rules change that
// silently rejects a client write (the UI is optimistic) fails here.

const LIBRARY = {
    sourdough: readyCard({ title: 'Sourdough starter guide', category: 'Food', tags: ['baking'] }),
    k8s: readyCard({ title: 'Kubernetes networking explained', category: 'Technology', tags: ['k8s'] }),
    marathon: readyCard({ title: 'Marathon training plan', category: 'Health', tags: ['running'] }),
};

test('returning user lands straight in their library @desktop', async ({ page }) => {
    const errors = collectPageErrors(page);
    await openAsReturningUser(page, LIBRARY);
    for (const c of Object.values(LIBRARY)) {
        await expect(page.getByRole('heading', { name: c.title as string })).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: 'Machina uses AI' })).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
});

test('search narrows the library to what matches', async ({ page }) => {
    await openAsReturningUser(page, LIBRARY);
    await page.getByRole('textbox', { name: 'Search your saves' }).fill('sourdough');
    await expect(page.getByRole('heading', { name: 'Sourdough starter guide' }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Kubernetes networking explained' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Marathon training plan' })).toHaveCount(0);
});

test('card detail: favorite and a personal note persist', async ({ page }) => {
    const { user } = await openAsReturningUser(page, LIBRARY);
    await page.getByRole('heading', { name: 'Sourdough starter guide' }).click();
    const detail = page.getByRole('dialog', { name: 'Link details' });
    await expect(detail).toBeVisible();

    await detail.getByRole('button', { name: 'Add to favorites' }).click();
    // favorite / archived / unread are values of the one `status` field.
    await expect.poll(async () => (await adminGet(`users/${user.uid}/links/sourdough`))?.status).toBe('favorite');

    await detail.getByRole('button', { name: 'Add a note' }).click();
    await detail.getByRole('textbox', { name: 'Edit your note' }).fill('Feed it twice a day.');
    // The note autosaves (no Save button); leaving the field commits it.
    await detail.getByRole('heading', { name: 'My note' }).click();
    await expect.poll(async () => JSON.stringify(await adminGet(`users/${user.uid}/links/sourdough`))).toContain('Feed it twice a day.');

    // Survives a reload (it's in Firestore, not just in React state).
    await page.reload();
    await page.getByRole('heading', { name: 'Sourdough starter guide' }).click();
    await expect(page.getByRole('dialog', { name: 'Link details' }).getByText('Feed it twice a day.')).toBeVisible();
});

test('delete a card: confirm, gone from the feed and from the database', async ({ page }) => {
    const { user } = await openAsReturningUser(page, LIBRARY);
    await page.getByRole('heading', { name: 'Marathon training plan' }).click();
    const detail = page.getByRole('dialog', { name: 'Link details' });
    await detail.getByRole('button', { name: 'Delete' }).click();
    // A destructive action asks first (or offers Undo). Accept whichever appears.
    const confirm = page.getByRole('alertdialog').or(page.getByRole('dialog').filter({ hasText: /delete/i }).last())
        .getByRole('button', { name: /^Delete/ }).last();
    if (await confirm.isVisible().catch(() => false)) await confirm.click();
    await expect(page.getByRole('heading', { name: 'Marathon training plan' })).toHaveCount(0);
    await expect.poll(async () => (await adminList(`users/${user.uid}/links`)).map((d) => d.id).sort(), { timeout: 20_000 })
        .toEqual(['k8s', 'sourdough']);
});

test('archive removes a card from Home but keeps it', async ({ page }) => {
    const { user } = await openAsReturningUser(page, LIBRARY);
    const card = page.getByRole('article').filter({ hasText: 'Kubernetes networking explained' });
    await card.getByRole('button', { name: 'Actions' }).click();
    await page.getByRole('menuitem', { name: /^Archive/ }).click();
    await expect(page.getByRole('heading', { name: 'Kubernetes networking explained' })).toHaveCount(0);
    await expect.poll(async () => (await adminGet(`users/${user.uid}/links/k8s`))?.status).toBe('archived');
});

test('collections: make one from a card, find it under Collections, card is inside', async ({ page }) => {
    const { user } = await openAsReturningUser(page, LIBRARY);
    await page.getByRole('article').filter({ hasText: 'Sourdough starter guide' }).getByRole('button', { name: 'Actions' }).click();
    await page.getByRole('menuitem', { name: /collection/i }).click();
    const sheet = page.getByRole('dialog', { name: 'Add to collection' });
    await sheet.getByRole('button', { name: 'New collection' }).click();
    await sheet.getByRole('textbox', { name: 'Collection name' }).fill('Bread');
    await sheet.getByRole('button', { name: 'Create' }).click();

    await expect.poll(async () => (await adminList(`users/${user.uid}/collections`)).map((c) => c.data.name)).toContain('Bread');
    const close = sheet.getByRole('button', { name: 'Close' });
    if (await close.isVisible().catch(() => false)) await close.click();

    await page.getByRole('navigation', { name: 'Main' }).getByRole('button', { name: 'Collections' }).click();
    await page.getByRole('heading', { name: 'Bread', exact: true }).locator('visible=true').first().click();
    await expect(page.getByRole('heading', { name: 'Sourdough starter guide' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Kubernetes networking explained' })).toHaveCount(0);
});
