/**
 * Chrome Web Store images, rendered from the REAL extension UI (popup,
 * on-page confirmation, settings) over a demo article, so the listing never
 * shows anything the extension doesn't do. No text is added on top.
 *
 *   cd e2e && npm run extension:assets      (writes extension/store/*.png)
 *
 * Sizes follow the Web Store: screenshots 1280×800, small promo tile
 * 440×280, marquee 1400×560 (extension/store/LISTING.md, "Images").
 */
import { test, expect, type Page } from '@playwright/test';
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { ARTICLE, EXTENSION_SRC, launchExtension, type Ext } from './fixtures';

test.skip(!process.env.STORE_ASSETS, 'set STORE_ASSETS=1 (npm run extension:assets)');

const OUT = join(EXTENSION_SRC, 'store');
const W = 1280;
const H = 800;
const ACCOUNT = 'you@example.com';

/** A believable address for the demo article (.example is reserved for docs). */
const DEMO_URL = 'https://fieldnotes.example/spaced-review';

let ext: Ext;
test.beforeEach(async () => {
    ext = await launchExtension();
    await ext.connect(undefined, ACCOUNT);
    await ext.context.route('https://fieldnotes.example/**', (route) => route.fulfill({ contentType: 'text/html', body: ARTICLE }));
    mkdirSync(OUT, { recursive: true });
});
test.afterEach(async () => { await ext.close(); });

const b64 = (buf: Buffer) => `data:image/png;base64,${buf.toString('base64')}`;

async function demoArticle(scheme: 'light' | 'dark', select = false): Promise<Page> {
    const page = await ext.context.newPage();
    await page.setViewportSize({ width: W, height: H });
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto(DEMO_URL);
    if (select) {
        await page.evaluate(() => {
            const range = document.createRange();
            range.selectNodeContents(document.getElementById('quote')!);
            getSelection()!.removeAllRanges();
            getSelection()!.addRange(range);
        });
    }
    return page;
}

/** The popup's own pixels, at 2x for crisp text. */
async function popupShot(popup: Page, scheme: 'light' | 'dark'): Promise<Buffer> {
    await popup.emulateMedia({ colorScheme: scheme });
    await popup.mouse.move(1, 1);
    await popup.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    return popup.locator('main.popup').screenshot({ scale: 'device' });
}

/**
 * The page with the popup where Chrome draws it (under the toolbar, at the
 * right). Only real captures are composed; nothing is drawn or written.
 */
async function compose(name: string, pageShot: Buffer, popup: Buffer, scheme: 'light' | 'dark') {
    const stage = await ext.context.newPage();
    await stage.setViewportSize({ width: W, height: H });
    const shadow = scheme === 'dark'
        ? '0 24px 60px rgba(0,0,0,.55), 0 0 0 1px rgba(255,255,255,.08)'
        : '0 24px 60px rgba(17,24,39,.22), 0 0 0 1px rgba(17,24,39,.08)';
    await stage.setContent(`<html><body style="margin:0;width:${W}px;height:${H}px;overflow:hidden;position:relative">
        <img src="${b64(pageShot)}" style="position:absolute;inset:0;width:${W}px;height:${H}px">
        <img id="popup" src="${b64(popup)}" style="position:absolute;top:16px;right:24px;width:360px;border-radius:12px;box-shadow:${shadow}">
        </body></html>`);
    await stage.locator('#popup').evaluate((img: HTMLImageElement) => img.decode());
    writeFileSync(join(OUT, name), await stage.screenshot({ type: 'png' }));
    await stage.close();
}

test('screenshot 1: one click saves the page', async () => {
    const page = await demoArticle('light');
    const popup = await ext.openPopup(page);
    await expect(popup.locator('#result-title')).toHaveText('Saved to Machina');
    await compose('screenshot-1-save-page.png', await page.screenshot(), await popupShot(popup, 'light'), 'light');
});

test('screenshot 2: the text you selected is kept with the page', async () => {
    const page = await demoArticle('dark', true);
    const popup = await ext.openPopup(page, { colorScheme: 'dark' });
    await expect(popup.locator('#quote-text')).toBeVisible();
    await compose('screenshot-2-save-quote.png', await page.screenshot(), await popupShot(popup, 'dark'), 'dark');
});

test('screenshot 3: right-click save, confirmed on the page', async () => {
    const page = await demoArticle('light');
    const tabId = await ext.tabIdOf(page);
    await ext.worker.evaluate(async (id) => {
        const tab = await chrome.tabs.get(id);
        await (globalThis as any).__machina.onMenuClick({ menuItemId: 'machina-link', linkUrl: 'https://example.com/read-later', frameId: 0 }, tab);
    }, tabId);
    await expect(page.locator('machina-save-toast')).toHaveCount(1);
    await page.waitForTimeout(400); // entrance animation
    writeFileSync(join(OUT, 'screenshot-3-right-click.png'), await page.screenshot());
});

test('screenshot 4: a screenshot of what you see', async () => {
    const page = await demoArticle('light');
    const popup = await ext.openPopup(page);
    await expect(popup.locator('#result-title')).toHaveText('Saved to Machina');
    await popup.getByRole('button', { name: 'Save a screenshot' }).click();
    await expect(popup.locator('#result-title')).toHaveText('Screenshot saved');
    await compose('screenshot-4-screenshot.png', await page.screenshot(), await popupShot(popup, 'light'), 'light');
});

test('screenshot 5: offline saves wait, settings show where they go', async () => {
    ext.stub.down = true;
    const article = await demoArticle('dark');
    const popup = await ext.openPopup(article, { colorScheme: 'dark' });
    await expect(popup.locator('#result-title')).toHaveText('Saved on this computer');
    await popup.close();
    const settings = await ext.context.newPage();
    await settings.setViewportSize({ width: W, height: H });
    await settings.emulateMedia({ colorScheme: 'dark' });
    await settings.goto(`chrome-extension://${ext.id}/src/options/options.html`);
    await expect(settings.locator('#queue-list li')).toHaveCount(1);
    writeFileSync(join(OUT, 'screenshot-5-settings.png'), await settings.screenshot());
});

/** Promo tiles: the mark on its own ground, no words (Web Store: "avoid text"). */
test('promo tiles: small 440x280 and marquee 1400x560', async () => {
    const svg = readFileSync(join(EXTENSION_SRC, '..', 'web/public/icon.svg'), 'utf8');
    const mark = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    const page = await ext.context.newPage();
    for (const [name, w, h, size] of [['promo-small-440x280.png', 440, 280, 132], ['promo-marquee-1400x560.png', 1400, 560, 248]] as const) {
        await page.setViewportSize({ width: w, height: h });
        // Saved "cards" drift in toward the mark: the product in one image.
        const cards = [
            [-0.36, -0.22, 0.9, -8], [-0.30, 0.20, 0.75, 6], [0.30, -0.24, 0.8, 7], [0.34, 0.18, 0.95, -5],
        ].map(([x, y, s, r]) => `<div style="position:absolute;left:${w / 2 + x * w - size * 0.42 * s}px;top:${h / 2 + y * h - size * 0.28 * s}px;
            width:${size * 0.84 * s}px;height:${size * 0.56 * s}px;border-radius:${size * 0.08 * s}px;transform:rotate(${r}deg);
            background:linear-gradient(160deg,rgba(242,245,250,.16),rgba(203,210,224,.05));
            box-shadow:inset 0 0 0 1px rgba(242,245,250,.14),0 10px 30px rgba(0,0,0,.35)">
            <div style="margin:${size * 0.09 * s}px;height:${size * 0.05 * s}px;width:60%;border-radius:4px;background:rgba(242,245,250,.28)"></div>
            <div style="margin:0 ${size * 0.09 * s}px;height:${size * 0.035 * s}px;width:78%;border-radius:4px;background:rgba(242,245,250,.14)"></div></div>`).join('');
        await page.setContent(`<html><body style="margin:0;width:${w}px;height:${h}px;overflow:hidden;position:relative;
            background:radial-gradient(120% 140% at 50% 30%,#282833 0%,#16161D 45%,#07070A 100%)">${cards}
            <img id="mark" src="${mark}" style="position:absolute;left:${(w - size) / 2}px;top:${(h - size) / 2}px;width:${size}px;height:${size}px;
            filter:drop-shadow(0 18px 40px rgba(0,0,0,.6))"></body></html>`);
        await page.locator('#mark').evaluate((img: HTMLImageElement) => img.decode());
        writeFileSync(join(OUT, name), await page.screenshot({ type: 'png' }));
    }
});
