import type { Page } from '@playwright/test';
import { test, expect, article, GOOD_TOKEN } from './fixtures';

// The real extension in real Chromium, against a stub share_ingest.
// `npm run test:extension` in e2e/. No emulators, no dev server, no shared ports.

const ARTICLE = article('How bridges carry their own weight', '<p>Arches push outward; cables pull inward.</p>');

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

test('no notifications API (as in Safari): a toast on the page says it, with a link', async ({ ext }) => {
    await ext.connect();
    ext.stub.reply = () => ({ status: 200, body: {
        success: true, saved: true, waiting: true, upgrade: true, message: 'Saved. Machina will read it on the 1st, or now with Pro.',
    } });
    const { page, tabId } = await ext.openPage('/bridges', ARTICLE);
    await ext.worker.evaluate(async ([url, id]) => {
        // Newer Chromium also exposes the same APIs as `browser`; hide both.
        for (const ns of [chrome, (globalThis as { browser?: object }).browser]) {
            if (ns) Object.defineProperty(ns, 'notifications', { value: undefined, configurable: true });
        }
        await (self as unknown as { handleMenuClick: (i: object, t: object) => Promise<unknown> })
            .handleMenuClick({ menuItemId: 'machina-save-page', pageUrl: url }, { id, title: 'Bridges', url });
    }, [`${ext.stub.origin}/bridges`, tabId] as const);
    const toast = page.locator('#machina-extension-toast');
    await expect(toast).toBeAttached();
    await expect(toast.getByRole('status')).toContainText('Saved for later');
    await expect(toast.getByRole('link', { name: 'Get Pro' })).toHaveAttribute('href', 'https://mymachina.app/?paywall=saves');
    await toast.getByRole('button', { name: 'Close' }).click();
    await expect(toast).toHaveCount(0);
});

test('the web app root can connect; a share page and other sites cannot', async ({ ext }) => {
    // Through the stub server: it stands in for the real check (empty POST, 400).
    await ext.worker.evaluate((b) => chrome.storage.local.set({ baseUrl: b }), ext.stub.origin);
    // The web app's side of the handshake (web/lib/extension.ts): post to this
    // window, wait for the content script's answer with the same id.
    const send = (page: Page, msg: object) => page.evaluate((m) => new Promise((resolve) => {
        const id = String(Math.random());
        const t = setTimeout(() => resolve('no answer'), 1500);
        window.addEventListener('message', (e) => {
            const d = e.data as { source?: string; id?: string; reply?: unknown };
            if (e.source !== window || !d || d.source !== 'machina-extension' || d.id !== id) return;
            clearTimeout(t);
            resolve(d.reply);
        });
        window.postMessage({ source: 'machina-web', id, ...m }, location.origin);
    }), msg);

    // http://localhost is in the dev build's content-script matches.
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

    // A site the content script doesn't run on gets no answer at all.
    await ext.context.route('https://other.example/', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<title>x</title>' }));
    const other = await ext.context.newPage();
    await other.goto('https://other.example/');
    expect(await send(other, { type: 'machina-ping' })).toBe('no answer');

    // A frame on the web app's own origin: the content script doesn't run in frames.
    ext.stub.pages.set('/framed', `<!doctype html><iframe src="http://localhost:${port}/"></iframe>`);
    const framed = await ext.context.newPage();
    await framed.goto(`http://localhost:${port}/framed`);
    const frame = framed.frames()[1];
    await frame.waitForLoadState();
    expect(await send(frame as unknown as Page, { type: 'machina-ping' })).toBe('no answer');

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
    // Wait for the popup to pick its screen before tabbing through it.
    await expect(popup.getByRole('heading', { name: 'Save anything in one click' })).toBeVisible();
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
