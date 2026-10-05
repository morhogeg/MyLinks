import { test, expect, type Page } from '@playwright/test';
import { collectPageErrors, expectNoHorizontalOverflow, openAsReturningUser, readyCard } from '../helpers';

// Breadth over depth: open every main screen and view mode with a realistic
// mixed library (English + Hebrew, long titles, a failed card, a note, a
// processing card) in light and dark, and fail on any crash, console error, or
// sideways scroll at iPhone width. This is the net for "a screen nobody
// opened since the last refactor".

const LONG = 'An unusually long article title that keeps going well past what fits on one line of a phone screen, to check wrapping';
const LIBRARY = {
    en: readyCard({ title: 'Sourdough starter guide', category: 'Food', tags: ['baking'], metadata: { originalTitle: 'x', estimatedReadTime: 5, actionableTakeaway: 'Feed the starter twice a day.' } }),
    he: readyCard({ title: 'מדריך לאפיית לחם מחמצת', summary: 'סיכום קצר בעברית על לחם מחמצת ואיך לשמור על המחמצת.', category: 'Food', tags: ['אפייה'] }),
    long: readyCard({ title: LONG, summary: 'word '.repeat(80), category: 'Ideas', tags: ['averyveryverylongtagwithoutanyspacesatall'] }),
    failed: readyCard({ status: 'failed', title: 'example.org', summary: '', error: 'Page could not be read', failedAt: Date.now() }),
    processing: readyCard({ status: 'processing', title: 'example.net', summary: '', processingStartedAt: Date.now() }),
    note: readyCard({ sourceType: 'note', url: '', title: 'A note to self', summary: 'Call the bakery about the rye flour.' }),
};

async function sweep(page: Page, label: string) {
    const nav = page.getByRole('navigation', { name: 'Main' });
    const check = async (where: string) => {
        await page.waitForTimeout(600);
        await expectNoHorizontalOverflow(page).catch((e) => { throw new Error(`${label} / ${where}: ${e.message}`); });
    };

    await check('home (card view)');
    for (const mode of ['List', 'Graph', 'My notes', 'Card']) {
        // Full-screen views (graph, notes) cover the header with their own
        // "Back to your library" bar.
        const back = page.getByRole('button', { name: 'Back to your library' });
        if (await back.isVisible().catch(() => false)) await back.click();
        await page.getByRole('button', { name: /^View:/ }).click();
        await page.getByRole('radio', { name: mode }).click();
        const close = page.getByRole('button', { name: 'Close view options' });
        if (await close.isVisible().catch(() => false)) await close.click();
        await check(`view: ${mode}`);
    }
    await page.getByRole('button', { name: 'View, sort, and filter options' }).click();
    await check('sort/filter sheet');
    await page.keyboard.press('Escape');
    const closeSheet = page.getByRole('button', { name: /^Close/ }).last();
    if (await closeSheet.isVisible().catch(() => false)) await closeSheet.click();

    for (const tab of ['Collections', 'Revisit', 'Ask', 'Home']) {
        await nav.getByRole('button', { name: tab }).click();
        await check(`tab: ${tab}`);
        if (tab === 'Ask') await page.getByRole('button', { name: 'Back' }).click().catch(() => {});
    }

    await page.getByRole('heading', { name: 'מדריך לאפיית לחם מחמצת' }).click();
    await expect(page.getByRole('dialog', { name: 'Link details' })).toBeVisible();
    await check('card detail (Hebrew)');
    await page.getByRole('dialog', { name: 'Link details' }).getByRole('button', { name: 'Close' }).click();

    await page.getByRole('button', { name: 'Settings' }).click();
    await check('settings');
    await page.getByRole('button', { name: 'Close settings' }).click();
}

for (const scheme of ['light', 'dark'] as const) {
    test(`every main screen renders cleanly (${scheme})`, async ({ page }) => {
        // The app's theme is its own setting (localStorage `theme`, default
        // dark), not the OS preference, so set it directly.
        await page.addInitScript((t) => { try { localStorage.setItem('theme', t); } catch { /* */ } }, scheme);
        await page.emulateMedia({ colorScheme: scheme });
        const errors = collectPageErrors(page);
        await openAsReturningUser(page, LIBRARY);
        await expect(page.getByRole('heading', { name: 'Sourdough starter guide' })).toBeVisible();
        // Light mode is a `light` class on <html>; dark is the default (no class).
        const html = page.locator('html');
        if (scheme === 'light') await expect(html).toHaveClass(/\blight\b/);
        else await expect(html).not.toHaveClass(/\blight\b/);
        await sweep(page, scheme);
        expect(errors).toEqual([]);
    });
}
