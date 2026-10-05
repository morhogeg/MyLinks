import { test, expect, type Page } from '@playwright/test';
import {
    collectPageErrors, createAuthUser, hideDevChrome, installBackend, openAsReturningUser, seedReturningUser, signIn,
} from '../helpers';
import { launchExtension } from '../extension/fixtures';

// Settings → Browser extension, for a normal person (SOURCE_OF_TRUTH §4 item
// 24, "Chrome Web Store listing for the extension"):
//   - no store listing yet: an honest "Coming soon", never load-unpacked steps;
//   - the token and Reset live under Advanced;
//   - with the real extension installed, one click (or the extension's own
//     Connect button) connects it, no copy and paste.

const TOKEN = 'e2e_WebToken_abcdefghijklmnop';

const openExtensionSettings = async (page: Page) => {
    await page.getByRole('button', { name: 'Settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await dialog.getByRole('button', { name: /Browser extension/ }).click();
    return dialog;
};

test('no listing yet: coming soon, no developer steps, token under Advanced @desktop', async ({ page }) => {
    const errors = collectPageErrors(page);
    await openAsReturningUser(page, {}, { shareToken: TOKEN });
    const desktop = test.info().project.name === 'desktop';

    await page.getByRole('button', { name: 'Settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog.getByRole('button', { name: /Browser extension/ })).toContainText('Coming soon to Chrome');
    await dialog.getByRole('button', { name: /Browser extension/ }).click();

    const status = dialog.getByTestId('extension-status');
    if (desktop) {
        await expect(status).toContainText('Coming soon to the Chrome Web Store');
        await expect(status.getByRole('button', { name: 'Coming soon' })).toBeDisabled();
    } else {
        await expect(status).toContainText('Works in Chrome, Edge, and Brave');
    }
    await expect(status.getByRole('button', { name: 'Add to Chrome' })).toHaveCount(0);
    // The old dead end for normal users.
    await expect(dialog).not.toContainText(/Load unpacked|Developer mode|chrome:\/\/extensions|extension folder/i);

    // Advanced: masked until asked, then the real token.
    const token = dialog.getByTestId('extension-token');
    await expect(token).toBeHidden();
    await dialog.getByText('Connect with a token').click();
    await expect(token).toBeVisible();
    await expect(token).not.toContainText(TOKEN);
    await dialog.getByRole('button', { name: 'Reveal' }).click();
    await expect(token).toHaveText(TOKEN);
    await expect(dialog.getByRole('button', { name: 'Reset token' })).toBeVisible();
    expect(errors).toEqual([]);
});

// Desktop only: the runner applies the project's device to every context it
// launches, and the extension lives on desktop Chromium.
const desktopOnly = () => test.skip(test.info().project.name !== 'desktop', 'desktop browser extension');

test('with the extension installed: one click connects it, and a deep link connects it by itself @desktop', async () => {
    desktopOnly();
    const baseURL = String(test.info().project.use.baseURL);
    const ext = await launchExtension();
    try {
        // The extension checks a token against share_ingest before keeping it;
        // the stub server answers that check (empty POST, 400) like the real one.
        await ext.worker.evaluate((b) => chrome.storage.local.set({ baseUrl: b }), ext.stub.origin);
        const user = await createAuthUser('ext');
        await seedReturningUser(user);
        const page = await ext.context.newPage();
        await page.addInitScript(() => { try { localStorage.setItem('machina_onboarding_v1', '1'); } catch { /* */ } });
        await hideDevChrome(page);
        await installBackend(page, user, { claim: 'down', shareToken: TOKEN });

        // 1. The extension's Connect button sends people to /?connect=extension.
        await page.goto(`${baseURL}/?connect=extension`);
        await signIn(page, user);
        const dialog = page.getByRole('dialog', { name: 'Settings' });
        await expect(dialog.getByTestId('extension-status')).toContainText('Connected in this browser', { timeout: 20_000 });
        await expect.poll(async () => (await ext.storage()).token).toBe(TOKEN);
        expect((await ext.storage()).account).toBe(user.email);
        // The param is consumed, so a reload doesn't reconnect.
        expect(new URL(page.url()).searchParams.get('connect')).toBeNull();
        // The token was checked with the server before it was kept.
        expect(ext.stub.calls.some((c) => c.headers['x-ingest-token'] === TOKEN)).toBe(true);

        // 2. Connected to some other account: says so, and one click fixes it.
        await ext.worker.evaluate(() => chrome.storage.local.set({ token: 'e2e_SomeoneElse_0000000000' }));
        await page.reload();
        await expect(page.getByRole('button', { name: 'Add to Machina' })).toBeVisible();
        const again = await openExtensionSettings(page);
        await expect(again.getByTestId('extension-status')).toContainText('Connected to another account');
        await again.getByRole('button', { name: 'Connect this browser' }).click();
        await expect(again.getByTestId('extension-status')).toContainText('Connected in this browser');
        expect((await ext.storage()).token).toBe(TOKEN);
    } finally {
        await ext.context.close();
        await ext.stub.stop();
    }
});

test('signed out, the deep link waits for sign-in @desktop', async () => {
    desktopOnly();
    const baseURL = String(test.info().project.use.baseURL);
    const ext = await launchExtension();
    try {
        await ext.worker.evaluate((b) => chrome.storage.local.set({ baseUrl: b }), ext.stub.origin);
        const user = await createAuthUser('extlater');
        await seedReturningUser(user);
        const page = await ext.context.newPage();
        await page.addInitScript(() => { try { localStorage.setItem('machina_onboarding_v1', '1'); } catch { /* */ } });
        await hideDevChrome(page);
        await installBackend(page, user, { claim: 'down', shareToken: TOKEN });
        await page.goto(`${baseURL}/?connect=extension`);
        await page.waitForTimeout(1500);
        expect((await ext.storage()).token).toBeUndefined();
        await signIn(page, user);
        await expect.poll(async () => (await ext.storage()).token, { timeout: 20_000 }).toBe(TOKEN);
    } finally {
        await ext.context.close();
        await ext.stub.stop();
    }
});

declare const chrome: { storage: { local: { set(o: object): Promise<void> } } };
