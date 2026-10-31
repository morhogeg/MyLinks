import { test, expect, type Page } from '@playwright/test';
import {
    collectPageErrors, createAuthUser, hideDevChrome, installBackend, openAsReturningUser, seedReturningUser, signIn,
} from '../helpers';
import { launchExtension } from '../extension/fixtures';

// Settings → Browser extension, for a normal person (SOURCE_OF_TRUTH §4 item
// 24, "Chrome Web Store listing for the extension"):
//   - no store listing yet: an honest "Coming soon", never load-unpacked steps,
//     and nothing else (no How to save, no Advanced) until an extension is here;
//   - once one is here, the token and Reset live under Advanced;
//   - with the real extension installed, one click (or the extension's own
//     Connect button) connects it, no copy and paste.

const TOKEN = 'e2e_WebToken_abcdefghijklmnop';

const openExtensionSettings = async (page: Page) => {
    await page.getByRole('button', { name: 'Settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await dialog.getByRole('button', { name: /Browser extension/ }).click();
    return dialog;
};

test('no listing yet: coming soon alone, no developer steps, no usage or Advanced @desktop', async ({ page }) => {
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
        await expect(status).toContainText('Coming soon to Chrome, Edge, Brave, and Safari');
    }
    await expect(status.getByRole('button', { name: 'Add to Chrome' })).toHaveCount(0);
    // The old dead end for normal users.
    await expect(dialog).not.toContainText(/Load unpacked|Developer mode|chrome:\/\/extensions|extension folder/i);

    // Nothing to install and nothing here: no instructions for a button that
    // doesn't exist, and saving stays possible through the + button.
    await expect(dialog).toContainText('pasting its link with the + button');
    await expect(dialog).not.toContainText(/How to save|Pin Machina|Connect with a token/);
    await expect(dialog.getByTestId('extension-token')).toHaveCount(0);
    expect(errors).toEqual([]);
});

// Desktop only: the runner applies the project's device to every context it
// launches, and the extension lives on desktop Chromium.
const desktopOnly = () => test.skip(test.info().project.name !== 'desktop', 'desktop browser extension');

test('/?settings=extension opens the screen and connects nothing @desktop', async ({ page }) => {
    desktopOnly();
    const user = await createAuthUser('extlink');
    await seedReturningUser(user);
    await page.addInitScript(() => { try { localStorage.setItem('machina_onboarding_v1', '1'); } catch { /* */ } });
    await hideDevChrome(page);
    await installBackend(page, user, { claim: 'down', shareToken: TOKEN });
    await page.goto('/?settings=extension');
    await signIn(page, user);
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog.getByRole('heading', { name: 'Browser extension' })).toBeVisible();
    expect(new URL(page.url()).searchParams.get('settings')).toBeNull();
});

test('Safari on a Mac: Mac App Store placeholder, no site hint for an app nobody has @desktop', async ({ browser }) => {
    desktopOnly();
    const ctx = await browser.newContext({
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    });
    const page = await ctx.newPage();
    // Chromium still reports its own brands; a real Safari has none.
    await page.addInitScript(() => { Object.defineProperty(navigator, 'userAgentData', { get: () => undefined }); });
    await openAsReturningUser(page, {}, { shareToken: TOKEN });
    await page.getByRole('button', { name: 'Settings' }).click();
    const dialog = page.getByRole('dialog', { name: 'Settings' });
    await expect(dialog.getByRole('button', { name: /Browser extension/ })).toContainText('Coming soon to Safari');
    await dialog.getByRole('button', { name: /Browser extension/ }).click();
    const status = dialog.getByTestId('extension-status');
    await expect(status).toContainText('Coming soon to the Mac App Store');
    await expect(status).not.toContainText(/Already have it|allow it on mymachina\.app/);
    await expect(status).not.toContainText(/Chrome Web Store|Xcode/);
    await ctx.close();
});

test('with the extension installed: one click connects it, and a deep link connects it by itself @desktop', async () => {
    desktopOnly();
    const baseURL = String(test.info().project.use.baseURL);
    const ext = await launchExtension({ appOrigin: baseURL });
    try {
        // The extension checks a token against share_ingest before keeping it;
        // the stub server answers that check (empty POST, 400) like the real one.
        // Its connect bridge runs on this dev server (fixtures.ts, appOrigin).
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
        // With an extension here, usage and Advanced (token, Reset) come back.
        await expect(dialog).toContainText('How to save');
        await expect(dialog.getByText('Connect with a token')).toBeVisible();
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
        await ext.close();
    }
});

test('signed out, the deep link waits for sign-in @desktop', async () => {
    desktopOnly();
    const baseURL = String(test.info().project.use.baseURL);
    const ext = await launchExtension({ appOrigin: baseURL });
    try {
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
        await ext.close();
    }
});

declare const chrome: { storage: { local: { set(o: object): Promise<void> } } };
