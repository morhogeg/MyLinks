import type { Page } from '@playwright/test';
import { test, expect, article, DEV_ID, GOOD_TOKEN } from './fixtures';

// The real extension in real Chromium, against a stub share_ingest.
// `npm run test:extension` in e2e/. No emulators, no dev server, no shared ports.

const ARTICLE = article('How bridges carry their own weight', '<p>Arches push outward; cables pull inward.</p>');

test('loads with the pinned dev id the web app trusts', async ({ ext }) => {
    expect(ext.id).toBe(DEV_ID);
});

test('first install opens the web app connect page', async ({ ext }) => {
    await expect.poll(() => ext.context.pages().map((p) => p.url())).toContain('https://mymachina.app/?connect=extension');
});

test('not connected: the popup offers Connect, and saves nothing', async ({ ext }) => {
    const { tabId } = await ext.openPage('/bridges', ARTICLE);
    const popup = await ext.openPopup(tabId);
    await expect(popup.getByRole('heading', { name: 'Save anything in one click' })).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Connect to Machina' })).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Use a token instead' })).toBeVisible();
    expect(ext.stub.saves()).toHaveLength(0);
});

test('connected: opening the popup saves the page and says so', async ({ ext }) => {
    await ext.connect();
    const { tabId } = await ext.openPage('/bridges', ARTICLE);
    const popup = await ext.openPopup(tabId);
    await expect(popup.getByText('How bridges carry their own weight')).toBeVisible();
    await expect(popup.getByRole('status').filter({ hasText: 'Saved to Machina' })).toBeVisible();
    await expect(popup.getByText(/Machina is reading it now/)).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Open Machina' })).toBeVisible();
    const [call] = ext.stub.saves();
    expect(call.body).toEqual({ url: `${ext.stub.origin}/bridges` });
    expect(call.headers['x-ingest-token']).toBe(GOOD_TOKEN);
    expect(await ext.worker.evaluate(() => chrome.action.getBadgeText({}))).toBe('✓');
});

test('past the monthly limit: saved for later, with Get Pro', async ({ ext }) => {
    await ext.connect();
    ext.stub.reply = () => ({ status: 200, body: {
        success: true, saved: true, queued: false, waiting: true, id: 'c1', kind: 'saves', upgrade: true,
        used: 100, limit: 100, waitingCount: 1, message: 'Saved. Machina will read it on the 1st, or now with Pro.',
    } });
    const { tabId } = await ext.openPage('/bridges', ARTICLE);
    const popup = await ext.openPopup(tabId);
    await expect(popup.getByText('Saved for later')).toBeVisible();
    await expect(popup.getByText('Saved. Machina will read it on the 1st, or now with Pro.')).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Get Pro' })).toBeVisible();
    await expect(popup.getByText('Saved to Machina')).toHaveCount(0);
});

test('already saved reads as already saved', async ({ ext }) => {
    await ext.connect();
    ext.stub.reply = () => ({ status: 200, body: { success: true, duplicate: true } });
    const { tabId } = await ext.openPage('/bridges', ARTICLE);
    const popup = await ext.openPopup(tabId);
    await expect(popup.getByText('Already in your library')).toBeVisible();
});

test('a reset token asks to reconnect', async ({ ext }) => {
    await ext.connect();
    ext.stub.reply = () => ({ status: 403, body: { success: false, error: 'Invalid ingest token' } });
    const { tabId } = await ext.openPage('/bridges', ARTICLE);
    const popup = await ext.openPopup(tabId);
    await expect(popup.getByText('Reconnect Machina')).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Reconnect' })).toBeVisible();
});

test('server down, then Try again works', async ({ ext }) => {
    await ext.connect();
    ext.stub.reply = () => ({ status: 503, body: { success: false, error: 'busy' } });
    const { tabId } = await ext.openPage('/bridges', ARTICLE);
    const popup = await ext.openPopup(tabId);
    await expect(popup.getByText('Machina hit a problem')).toBeVisible();
    ext.stub.reply = () => ({ status: 200, body: { success: true, queued: true, id: 'q2' } });
    await popup.getByRole('button', { name: 'Try again' }).click();
    await expect(popup.getByText('Saved to Machina')).toBeVisible();
    expect(ext.stub.saves()).toHaveLength(2);
});

test('right-click a selection saves the page with the quote', async ({ ext }) => {
    await ext.connect();
    // The menu click itself can't be driven headlessly; fire the same handler
    // Chrome calls with the same info object.
    await ext.worker.evaluate((url) => (self as unknown as { handleMenuClick: (i: object, t: object) => Promise<unknown> })
        .handleMenuClick({ menuItemId: 'machina-save-selection', selectionText: 'Arches push outward', pageUrl: url }, { title: 'Bridges', url }),
    `${ext.stub.origin}/bridges`);
    const [call] = ext.stub.saves();
    expect(call.body).toEqual({ url: `${ext.stub.origin}/bridges`, note: 'Arches push outward', noteKind: 'quote' });
});

test('the web app root can connect; a share page and other sites cannot', async ({ ext }) => {
    // Through the stub server: it stands in for the real check (empty POST, 400).
    await ext.worker.evaluate((b) => chrome.storage.local.set({ baseUrl: b }), ext.stub.origin);
    const send = (page: Page, msg: object) => page.evaluate(([id, m]) => new Promise((resolve) => {
        const rt = (window as unknown as { chrome?: { runtime?: { sendMessage: (i: string, x: object, cb: (r: unknown) => void) => void } } }).chrome?.runtime;
        if (!rt) return resolve('no runtime');
        rt.sendMessage(id as string, m as object, (r) => resolve(r));
    }), [DEV_ID, msg] as const);

    // http://localhost is in the dev manifest's externally_connectable.
    const port = new URL(ext.stub.origin).port;
    ext.stub.pages.set('/', '<!doctype html><title>app</title>');
    ext.stub.pages.set('/s', '<!doctype html><title>share</title>');
    const app = await ext.context.newPage();
    await app.goto(`http://localhost:${port}/`);
    expect(await send(app, { type: 'machina-ping' })).toMatchObject({ ok: true, connected: false });

    const share = await ext.context.newPage();
    await share.goto(`http://localhost:${port}/s?id=1`);
    expect(await send(share, { type: 'machina-connect', token: GOOD_TOKEN })).toEqual({ ok: false, reason: 'untrusted' });
    expect((await ext.storage()).token).toBeUndefined();

    // 127.0.0.1 is listed too, but a page on another origin gets no runtime at all.
    const other = await ext.context.newPage();
    await other.goto('data:text/html,<title>x</title>');
    expect(await send(other, { type: 'machina-ping' })).toBe('no runtime');

    const r = await send(app, { type: 'machina-connect', token: GOOD_TOKEN, account: 'reader@example.com' });
    expect(r).toMatchObject({ ok: true });
    expect(JSON.stringify(r)).not.toContain(GOOD_TOKEN);
    expect(await ext.storage()).toMatchObject({ token: GOOD_TOKEN, account: 'reader@example.com' });
    expect(await send(app, { type: 'machina-ping' })).toMatchObject({ ok: true, connected: true });
});

test('the options page is settings and saves nothing', async ({ ext }) => {
    await ext.connect();
    const page = await ext.openPopup(undefined, { search: '?view=settings' });
    await expect(page.getByText('Connected', { exact: true })).toBeVisible();
    await expect(page.getByText('Saving to reader@example.com')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Disconnect this browser' })).toBeVisible();
    expect(ext.stub.saves()).toHaveLength(0);
});

test('paste a token: checked, then stored', async ({ ext }) => {
    await ext.worker.evaluate((b) => chrome.storage.local.set({ baseUrl: b }), ext.stub.origin);
    const { tabId } = await ext.openPage('/bridges', ARTICLE);
    const popup = await ext.openPopup(tabId);
    await popup.getByRole('button', { name: 'Use a token instead' }).click();
    await popup.getByLabel('Your token').fill(GOOD_TOKEN);
    await popup.getByRole('button', { name: 'Save and connect' }).click();
    await expect(popup.getByText(/^Connected\./)).toBeVisible();
    expect((await ext.storage()).token).toBe(GOOD_TOKEN);
    expect(ext.stub.saves()).toHaveLength(0);
});

test('keyboard: Connect is reachable and works from the keyboard', async ({ ext }) => {
    const popup = await ext.openPopup();
    // Header gear first, then the primary action.
    await popup.keyboard.press('Tab');
    await expect(popup.getByRole('button', { name: 'Settings' })).toBeFocused();
    await popup.keyboard.press('Tab');
    await expect(popup.getByRole('button', { name: 'Connect to Machina' })).toBeFocused();
    const opened = ext.context.waitForEvent('page', (p) => p.url().startsWith('https://mymachina.app/?connect=extension'));
    // Opening the tab closes the popup, so the key press can outlive its page.
    await popup.keyboard.press('Enter').catch(() => {});
    await opened;
});

declare const chrome: {
    storage: { local: { set(o: object): Promise<void> } };
    action: { getBadgeText(o: object): Promise<string> };
};
