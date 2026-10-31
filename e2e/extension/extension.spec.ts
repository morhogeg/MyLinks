import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { ACCOUNT, EXTENSION_SRC, GOOD_TOKEN, launchExtension, type Ext } from './fixtures';

const REPO = dirname(EXTENSION_SRC);

let ext: Ext;
test.beforeEach(async () => { ext = await launchExtension(); });
test.afterEach(async () => { await ext.close(); });

const IG_POST = `<!doctype html><html><head><title>Instagram</title>
<meta property="og:title" content="Chef Ana on Instagram: &quot;Five-minute pasta&quot;">
<meta property="og:description" content="1,204 likes - chefana: Five-minute pasta, here is how.">
<meta property="og:image" content="https://scontent.cdninstagram.com/v/t51/pasta.jpg">
<meta property="og:url" content="https://www.instagram.com/chefana/p/ABC123/">
</head><body><main><p>post</p></main></body></html>`;

const LINKEDIN_POST = `<!doctype html><html><head><title>A post | LinkedIn</title></head>
<body><main><p>Hiring news from the team.</p></main></body></html>`;

async function article(): Promise<Page> {
    const page = await ext.context.newPage();
    await page.goto(`${ext.stub.origin}/article`);
    return page;
}

const title = (popup: Page) => popup.locator('#result-title');
const detail = (popup: Page) => popup.locator('#result-detail');

async function badge(tabId?: number) {
    return ext.worker.evaluate((id) => chrome.action.getBadgeText(id === undefined ? {} : { tabId: id }), tabId);
}

async function a11y(page: Page) {
    const res = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
        .analyze();
    expect(res.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

test('not connected: the popup offers one-click connect and saves nothing', async () => {
    const page = await article();
    const popup = await ext.openPopup(page);
    await expect(title(popup)).toHaveText('Connect Machina');
    await expect(popup.locator('#hint')).toHaveText(/reads a page only when you save it/);
    await expect(popup.getByRole('button', { name: 'Use a token instead' })).toBeVisible();
    await expect(popup.getByRole('button', { name: 'Read the privacy policy' })).toBeVisible();
    await a11y(popup);
    const [opened] = await Promise.all([
        ext.context.waitForEvent('page', (p) => p.url().includes('connect=extension')),
        popup.getByRole('button', { name: 'Connect to Machina' }).click(),
    ]);
    expect(new URL(opened.url()).origin).toBe(ext.stub.origin);
    expect(ext.stub.shareCalls()).toHaveLength(0);
});

test('one click saves the page, says so, and marks the badge', async () => {
    await ext.connect();
    const page = await article();
    const popup = await ext.openPopup(page);
    await expect(title(popup)).toHaveText('Saved to Machina');
    await expect(detail(popup)).toContainText('reading it now');
    await expect(popup.locator('#result-svg')).toBeVisible();
    await expect(popup.locator('#spinner')).toBeHidden();
    const [call] = ext.stub.shareCalls();
    expect(call.headers['x-ingest-token']).toBe(GOOD_TOKEN);
    expect(call.headers.cookie).toBeUndefined();
    expect(call.body).toEqual({ url: `${ext.stub.origin}/article` });
    await expect(popup.locator('#page-title')).toHaveText('The quiet power of spaced review');
    await expect(popup.locator('#account-line')).toHaveText(`Saving to ${ACCOUNT}`);
    await expect(popup.locator('#shortcut-line')).toContainText('Ctrl+Shift+S');
    await expect(popup.getByRole('button', { name: 'Open Machina' })).toBeFocused();
    expect(await badge(await ext.tabIdOf(page))).toBe('✓');
    await a11y(popup);
    await popup.emulateMedia({ colorScheme: 'dark' });
    await a11y(popup);
});

test('selected text rides along as a quote, never as a reminder', async () => {
    await ext.connect();
    const page = await article();
    await page.evaluate(() => {
        const range = document.createRange();
        range.selectNodeContents(document.getElementById('quote')!);
        getSelection()!.removeAllRanges();
        getSelection()!.addRange(range);
    });
    const popup = await ext.openPopup(page);
    await expect(title(popup)).toHaveText('Saved to Machina');
    await expect(detail(popup)).toHaveText('Saved with the text you selected. Machina is reading it now.');
    await expect(popup.locator('#quote-text')).toContainText('Coming back to an idea after a day');
    const [call] = ext.stub.shareCalls();
    expect(call.body.noteKind).toBe('quote');
    expect(call.body.url).toBeUndefined();
    expect(String(call.body.shared)).toMatch(new RegExp(`^${ext.stub.origin}/article\\n\\nComing back to an idea`));
});

test('already saved, saved for later, and final errors read plainly', async () => {
    await ext.connect();
    const page = await article();
    const cases: Array<[number, unknown, string, string]> = [
        [200, { success: true, duplicate: true }, 'Already in your library', 'nothing new was added'],
        [200, { success: true, saved: true, waiting: true, message: 'Machina will read it next month, or now with Pro.' },
            'Saved for later', 'Machina will read it next month, or now with Pro.'],
        [413, { success: false, error: 'Image is too large' }, 'Too large to save', 'Image is too large'],
        [400, { success: false, error: 'URL is too long' }, "Couldn't save this", 'URL is too long'],
    ];
    for (const [status, body, heading, words] of cases) {
        ext.stub.reply = () => ({ status, body });
        const popup = await ext.openPopup(page);
        await expect(title(popup)).toHaveText(heading);
        await expect(detail(popup)).toContainText(words);
        await popup.close();
    }
    expect((await ext.storage()).queue ?? []).toHaveLength(0);
});

test('offline: kept on this computer, sent when Machina answers again', async () => {
    await ext.connect();
    const page = await article();
    ext.stub.down = true;
    const popup = await ext.openPopup(page);
    await expect(title(popup)).toHaveText('Saved on this computer');
    await expect(popup.locator('#queue-text')).toHaveText('1 save is waiting to be sent.');
    expect(((await ext.storage()).queue as unknown[]).length).toBe(1);
    expect(await badge()).toBe('1');

    ext.stub.down = false;
    await popup.getByRole('button', { name: 'Send now' }).click();
    await expect(popup.locator('#queue-line')).toBeHidden();
    expect(ext.stub.shareCalls().map((c) => c.body.url)).toEqual([`${ext.stub.origin}/article`]);
    expect((await ext.storage()).queue).toEqual([]);
    expect(await badge()).toBe('');
});

test('server trouble and rate limits queue the save; the retry alarm sends it', async () => {
    await ext.connect();
    const page = await article();
    ext.stub.reply = () => ({ status: 503, body: null });
    let popup = await ext.openPopup(page);
    await expect(title(popup)).toHaveText('Saved on this computer');
    await expect(detail(popup)).toContainText("didn't answer");
    await popup.close();

    ext.stub.reply = () => ({ status: 429, body: { success: false, error: 'Too many requests. Please slow down.' } });
    const other = await ext.context.newPage();
    await other.goto(`${ext.stub.origin}/article?second`);
    popup = await ext.openPopup(other);
    await expect(detail(popup)).toContainText('a lot of saves at once');

    // The alarm is armed; fire the same handler it runs.
    expect(await ext.worker.evaluate(async () => Boolean(await chrome.alarms.get('machina-retry')))).toBe(true);
    ext.stub.reply = () => ({ status: 200, body: { success: true, queued: true } });
    await ext.worker.evaluate(() => (globalThis as any).__machina.flushQueue({ force: true }));
    expect((await ext.storage()).queue).toEqual([]);
});

test('a reset token: save kept, Reconnect offered, sent after connecting again', async () => {
    await ext.connect();
    const page = await article();
    ext.stub.reply = (c) => (Object.keys(c.body).length ? { status: 403, body: { success: false, error: 'Invalid ingest token' } } : { status: 403, body: {} });
    const popup = await ext.openPopup(page);
    await expect(title(popup)).toHaveText('Reconnect Machina');
    await expect(popup.getByRole('button', { name: 'Reconnect' })).toBeVisible();
    const stored = await ext.storage();
    expect(stored.needsReconnect).toBe(true);
    expect(stored.queue.map((i: { status: string }) => i.status)).toEqual(['reconnect']);

    // Connect again from the website: the held save goes out.
    ext.stub.reply = (c) => (Object.keys(c.body).length ? { status: 200, body: { success: true, queued: true } } : { status: 400, body: {} });
    const site = await ext.context.newPage();
    await site.goto(`${ext.stub.origin}/`);
    expect(await site.evaluate(([t, a]) => (window as any).machina.connect(t, a), ['e2e_NewToken_9876543210xyz', ACCOUNT])).toEqual({ ok: true });
    await expect.poll(async () => (await ext.storage()).queue?.length).toBe(0);
    expect(ext.stub.shareCalls().at(-1)!.headers['x-ingest-token']).toBe('e2e_NewToken_9876543210xyz');
});

test('one-click connect: ping, connect (token checked first), disconnect by tag', async () => {
    const site = await ext.context.newPage();
    await site.goto(`${ext.stub.origin}/`);
    await site.waitForFunction(() => (window as any).ready === true);
    const before = await site.evaluate(() => (window as any).machina.ping());
    expect(before).toMatchObject({ ok: true, connected: false, tokenTag: null });

    expect(await site.evaluate(([t, a]) => (window as any).machina.connect(t, a), [GOOD_TOKEN, ACCOUNT])).toEqual({ ok: true });
    expect(ext.stub.calls[0].body).toEqual({});
    expect(ext.stub.calls[0].headers['x-ingest-token']).toBe(GOOD_TOKEN);
    expect(await ext.storage()).toMatchObject({ token: GOOD_TOKEN, account: ACCOUNT });

    const after = await site.evaluate(() => (window as any).machina.ping());
    expect(after.connected).toBe(true);
    expect(after.tokenTag).toBe(await site.evaluate((t) => (window as any).machina.tokenTag(t), GOOD_TOKEN));
    expect(JSON.stringify(after)).not.toContain(GOOD_TOKEN);

    expect(await site.evaluate(() => (window as any).machina.disconnect('e2e_SomeoneElse_000000000'))).toEqual({ ok: false });
    expect(await site.evaluate((t) => (window as any).machina.disconnect(t), GOOD_TOKEN)).toEqual({ ok: true });
    expect((await ext.storage()).token).toBeUndefined();

    ext.stub.reply = () => ({ status: 403, body: { success: false } });
    expect(await site.evaluate(([t, a]) => (window as any).machina.connect(t, a), [GOOD_TOKEN, ACCOUNT]))
        .toEqual({ ok: false, reason: 'invalid' });
});

test('share pages on the same site cannot connect the extension', async () => {
    const page = await ext.context.newPage();
    await page.goto(`${ext.stub.origin}/s/abc123`);
    const reply = await page.evaluate(() => new Promise((resolve) => {
        addEventListener('message', (e) => {
            if (e.data?.source === 'machina-extension' && e.data.id === 'x1') resolve(e.data.reply);
        });
        postMessage({ source: 'machina-web', id: 'x1', type: 'machina-connect', token: 'e2e_Attacker_000000000000', account: 'a' }, location.origin);
    }));
    expect(reply).toEqual({ ok: false, reason: 'untrusted' });
    expect(ext.stub.calls).toHaveLength(0);
});

test('Instagram: the post as the page shows it travels as pagePreview', async () => {
    await ext.connect();
    await ext.context.route('https://www.instagram.com/**', (route) => route.fulfill({ contentType: 'text/html', body: IG_POST }));
    const page = await ext.context.newPage();
    await page.goto('https://www.instagram.com/p/ABC123/');
    const popup = await ext.openPopup(page);
    await expect(title(popup)).toHaveText('Saved to Machina');
    const [call] = ext.stub.shareCalls();
    expect(call.body).toEqual({
        url: 'https://www.instagram.com/p/ABC123/',
        pagePreview: {
            url: 'https://www.instagram.com/chefana/p/ABC123/',
            title: 'Chef Ana on Instagram: "Five-minute pasta"',
            description: '1,204 likes - chefana: Five-minute pasta, here is how.',
            image: 'https://scontent.cdninstagram.com/v/t51/pasta.jpg',
            author: 'chefana',
        },
    });
});

test('LinkedIn: honest hint, and a screenshot from the popup becomes an image save', async () => {
    await ext.connect();
    await ext.context.route('https://www.linkedin.com/**', (route) => route.fulfill({ contentType: 'text/html', body: LINKEDIN_POST }));
    const page = await ext.context.newPage();
    await page.goto('https://www.linkedin.com/posts/team-hiring-123');
    const popup = await ext.openPopup(page);
    await expect(title(popup)).toHaveText('Saved to Machina');
    await expect(popup.locator('#hint')).toHaveText(/only read a preview of posts on LinkedIn/);

    await popup.getByRole('button', { name: 'Save a screenshot' }).click();
    await expect(title(popup)).toHaveText('Screenshot saved');
    const shot = ext.stub.shareCalls().at(-1)!.body;
    expect(Object.keys(shot).sort()).toEqual(['image', 'mimeType']);
    expect(shot.mimeType).toBe('image/jpeg');
    const bytes = Buffer.from(String(shot.image), 'base64');
    expect(bytes.subarray(0, 3).toString('hex')).toBe('ffd8ff');
    expect(bytes.length).toBeLessThan(5 * 1024 * 1024);
});

test('browser pages are refused before anything is sent', async () => {
    await ext.connect();
    // A tab the harness can't read the address of without a toolbar click
    // (about:blank): the popup refuses it the same way it refuses chrome:// pages.
    const tabId = await ext.worker.evaluate(async () => (await chrome.tabs.create({ url: 'about:blank' })).id!);
    const popup = await ext.openPopupForTab(tabId);
    await expect(title(popup)).toHaveText("Can't save this page");
    await expect(popup.getByRole('button', { name: 'Open Machina' })).toBeVisible();
    expect(ext.stub.calls).toHaveLength(0);
});

test('right-click saves: link, selection, image, page; toast and badge confirm', async () => {
    await ext.connect();
    const page = await article();
    const tabId = await ext.tabIdOf(page);
    const click = (info: Record<string, unknown>) => ext.worker.evaluate(async ([i, id]) => {
        const tab = await chrome.tabs.get(id as number);
        await (globalThis as any).__machina.onMenuClick(i, tab);
    }, [info, tabId] as const);

    await click({ menuItemId: 'machina-link', linkUrl: 'https://example.com/linked', frameId: 0 });
    expect(ext.stub.shareCalls().at(-1)!.body).toEqual({ url: 'https://example.com/linked' });
    await expect(page.locator('machina-save-toast')).toHaveCount(1);
    expect(await badge(tabId)).toBe('✓');

    await page.evaluate(() => {
        const range = document.createRange();
        range.selectNodeContents(document.getElementById('lede')!);
        getSelection()!.removeAllRanges();
        getSelection()!.addRange(range);
    });
    await click({ menuItemId: 'machina-selection', selectionText: 'fallback text', frameId: 0 });
    const sel = ext.stub.shareCalls().at(-1)!.body;
    expect(sel.noteKind).toBe('quote');
    expect(String(sel.shared)).toContain('Most of what we read is gone within a week.');

    await click({ menuItemId: 'machina-image', srcUrl: 'https://example.com/photo.jpg', frameId: 0 });
    expect(ext.stub.shareCalls().at(-1)!.body).toEqual({ url: 'https://example.com/photo.jpg' });

    await page.evaluate(() => getSelection()!.removeAllRanges());
    await click({ menuItemId: 'machina-page', frameId: 0 });
    expect(ext.stub.shareCalls().at(-1)!.body).toEqual({ url: `${ext.stub.origin}/article` });

    // Only one toast at a time.
    await expect(page.locator('machina-save-toast')).toHaveCount(1);
});

test('screenshot shortcut: captures what is visible, without our own toast in it', async () => {
    await ext.connect();
    const page = await article();
    const tabId = await ext.tabIdOf(page);
    await ext.worker.evaluate(async (id) => {
        const tab = await chrome.tabs.get(id);
        await (globalThis as any).__machina.onMenuClick({ menuItemId: 'machina-page', frameId: 0 }, tab);
        await (globalThis as any).__machina.onCommand('save-screenshot', tab);
    }, tabId);
    const shot = ext.stub.shareCalls().at(-1)!.body;
    expect(shot.mimeType).toBe('image/jpeg');
    expect(Buffer.from(String(shot.image), 'base64').subarray(0, 2).toString('hex')).toBe('ffd8');
    await expect(page.locator('machina-save-toast')).toHaveCount(1); // the screenshot's own confirmation
});

test('menu and shortcuts are registered as planned', async () => {
    const commands = await ext.worker.evaluate(() => chrome.commands.getAll());
    expect(commands.map((c) => [c.name, c.shortcut])).toEqual([
        ['_execute_action', 'Ctrl+Shift+S'],
        ['save-screenshot', 'Alt+Shift+S'],
    ]);
    await ext.worker.evaluate(() => (globalThis as any).__machina.createMenus());
});

test('settings: token form, waiting saves, two-step disconnect, accessible in both themes', async () => {
    const page = await ext.context.newPage();
    await page.goto(`chrome-extension://${ext.id}/src/options/options.html`);
    await expect(page.locator('#account-status')).toHaveText("This browser isn't connected to Machina yet.");

    await page.getByText('Connect with a token').click();
    await page.getByLabel('Token').fill('nope');
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(page.locator('#token-message')).toContainText("doesn't look like a Machina token");

    await page.getByLabel('Token').fill(GOOD_TOKEN);
    await page.getByRole('button', { name: 'Connect', exact: true }).click();
    await expect(page.locator('#token-message')).toHaveText('Connected. You can start saving.');
    await expect(page.locator('#account-status')).toHaveText('This browser is connected to Machina.');
    expect((await ext.storage()).token).toBe(GOOD_TOKEN);

    ext.stub.down = true;
    const target = await article();
    const popup = await ext.openPopup(target);
    await expect(title(popup)).toHaveText('Saved on this computer');
    await popup.close();
    await expect(page.locator('#queue-list li')).toHaveCount(1);
    await expect(page.locator('#queue-list li')).toContainText('Page: The quiet power of spaced review');
    await a11y(page);
    await page.emulateMedia({ colorScheme: 'dark' });
    await a11y(page);

    await page.getByRole('button', { name: 'Disconnect' }).click();
    await expect(page.locator('#disconnect-warning')).toContainText("1 saves haven't reached Machina yet");
    await page.getByRole('button', { name: 'Disconnect and discard waiting saves' }).click();
    await expect(page.locator('#account-status')).toHaveText("This browser isn't connected to Machina yet.");
    expect((await ext.storage()).queue).toEqual([]);
});

test('the web app\'s own connect code (web/lib/extension.ts) drives this extension', async () => {
    // Transpile the real module (web/node_modules/typescript; CI installs web first).
    const ts = createRequire(import.meta.url)(join(REPO, 'web/node_modules/typescript'));
    const cjs = ts.transpileModule(readFileSync(join(REPO, 'web/lib/extension.ts'), 'utf8'), {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText;
    const site = await ext.context.newPage();
    await site.goto(`${ext.stub.origin}/`);
    await site.addScriptTag({
        content: `(function (exports, process) { ${cjs} })(window.machinaWeb = {}, { env: {} });`,
    });
    const web = (fn: string, ...args: unknown[]) => site.evaluate(
        ([f, a]) => (window as any).machinaWeb[f as string](...(a as unknown[])), [fn, args] as const);

    expect(await web('detectExtension')).toEqual({ version: '1.0.0', connected: false, tokenTag: null });
    expect(await web('connectExtension', GOOD_TOKEN, ACCOUNT)).toEqual({ ok: true });
    expect(await ext.storage()).toMatchObject({ token: GOOD_TOKEN, account: ACCOUNT });
    const status = await web('detectExtension') as { connected: boolean; tokenTag: string };
    expect(status.connected).toBe(true);
    expect(status.tokenTag).toBe(await web('tokenTag', GOOD_TOKEN));

    expect(await web('disconnectExtensionFor', 'e2e_SomeoneElse_000000000')).toBe(false);
    expect((await ext.storage()).token).toBe(GOOD_TOKEN);
    expect(await web('disconnectExtensionFor', GOOD_TOKEN)).toBe(true);
    expect((await ext.storage()).token).toBeUndefined();

    ext.stub.reply = () => ({ status: 403, body: { success: false, error: 'Invalid ingest token' } });
    expect(await web('connectExtension', GOOD_TOKEN, ACCOUNT)).toEqual({ ok: false, reason: 'invalid' });
});
