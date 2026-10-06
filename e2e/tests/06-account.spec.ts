import { test, expect } from '@playwright/test';
import { pbkdf2Sync } from 'node:crypto';
import {
    adminGet, adminUpdate, collectPageErrors, createAuthUser, hideDevChrome, installBackend, openAccountSettings,
    openAsReturningUser, readyCard, seedCard, seedReturningUser, signIn,
} from '../helpers';

// Account-level promises: you can leave and take everything with you (App
// Store 5.1.1(v)), and nobody else can see your library.

test('delete account: confirm → server wipes the workspace → back to the landing page', async ({ page }) => {
    const errors = collectPageErrors(page);
    const { user, calls } = await openAsReturningUser(page, { a: readyCard({ title: 'Something private' }) });
    await openAccountSettings(page, user.email);
    await page.getByRole('button', { name: 'Delete account' }).click();

    const confirm = page.getByRole('alertdialog').filter({ hasText: 'Delete account?' });
    await expect(confirm).toContainText('cannot be undone');
    await expect(confirm.getByRole('button', { name: 'Export your data first' })).toBeVisible();
    await Promise.all([
        page.waitForEvent('load', { timeout: 30_000 }),
        confirm.getByRole('button', { name: 'Delete account' }).click(),
    ]);

    const del = calls.find((c) => c.path.endsWith('/delete_account') || c.path === '/api/delete-account');
    expect(del?.auth).toMatch(/^Bearer /);
    expect(await adminGet(`users/${user.uid}`)).toBeNull();
    await expect(page.getByRole('button', { name: 'Get started' }).first()).toBeVisible();
    expect(errors).toEqual([]);
});

test('delete account: a server failure keeps the user signed in with an honest error', async ({ page }) => {
    const { user } = await openAsReturningUser(page, {}, {});
    await page.route('http://localhost:5001/**/delete_account', (route) => route.fulfill({
        status: 500,
        contentType: 'application/json',
        headers: { 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ error: { message: 'internal', status: 'INTERNAL' } }),
    }));
    await openAccountSettings(page, user.email);
    await page.getByRole('button', { name: 'Delete account' }).click();
    const confirm = page.getByRole('alertdialog').filter({ hasText: 'Delete account?' });
    await confirm.getByRole('button', { name: 'Delete account' }).click();
    await expect(page.getByText('Could not delete your account. Please try again.')).toBeVisible();
    expect(await adminGet(`users/${user.uid}`)).not.toBeNull();
});

test('two accounts never see each other\'s library', async ({ browser }) => {
    const alice = await createAuthUser('alice');
    const bob = await createAuthUser('bob');
    await seedReturningUser(alice);
    await seedReturningUser(bob);
    await seedCard(alice, 'a1', readyCard({ title: 'Alice private diary entry' }));
    await seedCard(bob, 'b1', readyCard({ title: 'Bob grocery list' }));

    for (const [me, mine, theirs] of [[alice, 'Alice private diary entry', 'Bob grocery list'], [bob, 'Bob grocery list', 'Alice private diary entry']] as const) {
        const ctx = await browser.newContext();
        const page = await ctx.newPage();
        await page.addInitScript(() => { try { localStorage.setItem('machina_onboarding_v1', '1'); } catch { /* */ } });
        await hideDevChrome(page);
        await installBackend(page, me, { claim: 'down' });
        await page.goto('/');
        await signIn(page, me);
        await expect(page.getByRole('heading', { name: mine })).toBeVisible();
        await expect(page.getByRole('heading', { name: theirs })).toHaveCount(0);
        await page.getByRole('textbox', { name: 'Search your saves' }).fill(theirs.split(' ')[1]);
        await expect(page.getByRole('heading', { name: theirs })).toHaveCount(0);
        await ctx.close();
    }
});

test('export my data downloads a file with the library in it', async ({ page }) => {
    const { user } = await openAsReturningUser(page, { a: readyCard({ title: 'Worth keeping forever' }) });
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: /^Export my data/ }).click();
    const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 20_000 }),
        page.getByRole('button', { name: /export|download/i }).last().click(),
    ]);
    const path = await download.path();
    expect(path).toBeTruthy();
    const fs = await import('node:fs');
    const bytes = fs.readFileSync(path!);
    expect(bytes.length).toBeGreaterThan(100);
    // JSON or a zip; either way the title is in there (zip entries may be compressed,
    // so only assert on uncompressed formats).
    if (!download.suggestedFilename().endsWith('.zip')) {
        expect(bytes.toString('utf8')).toContain('Worth keeping forever');
    }
    void user;
});

test('with the privacy lock on, export asks for the PIN before it hands over private cards', async ({ page }) => {
    const { user } = await openAsReturningUser(page, {
        a: readyCard({ title: 'Ordinary article' }),
        p: readyCard({ title: 'Vault: passport scan notes', isPrivate: true }),
    });
    // The PIN 1234 in lib/privacyLock.ts's format (PBKDF2-SHA256, 32 bytes).
    const salt = '00112233445566778899aabbccddeeff';
    const pinHash = pbkdf2Sync('1234', Buffer.from(salt, 'hex'), 100_000, 32, 'sha256').toString('hex');
    await adminUpdate(`users/${user.uid}`, { privacyLock: { pinHash, salt, iterations: 100_000, updatedAt: Date.now() } });
    await page.reload();
    await expect(page.getByRole('button', { name: 'Add to Machina' })).toBeVisible();

    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: /^Export my data/ }).click();
    const pin = page.getByRole('dialog', { name: 'Enter your PIN' });
    await expect(pin).toContainText('Your export includes your private collections.');

    const [download] = await Promise.all([
        page.waitForEvent('download', { timeout: 20_000 }),
        pin.getByLabel(/^Enter your PIN: 4 digits$/).fill('1234'),
    ]);
    const fs = await import('node:fs');
    const text = fs.readFileSync((await download.path())!).toString('utf8');
    expect(text).toContain('Vault: passport scan notes');
});
