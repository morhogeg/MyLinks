import { test, expect } from '@playwright/test';
import { collectPageErrors, expectNoHorizontalOverflow, hideDevChrome, installBackend } from '../helpers';

// A visitor who has never signed in: the landing page, the way in, and the
// legal pages App Review and every privacy-minded user will open.

test.describe('signed-out visitor @desktop', () => {
    test('landing renders, offers Apple + Google, shows no app data', async ({ page }) => {
        const errors = collectPageErrors(page);
        await hideDevChrome(page);
        const calls = await installBackend(page, null);
        await page.goto('/');

        await expect(page.getByRole('heading', { level: 1 })).toContainText('finally useful');
        await expectNoHorizontalOverflow(page);

        await page.getByRole('button', { name: 'Get started' }).first().click();
        await expect(page.getByRole('button', { name: /Apple/ }).first()).toBeVisible();
        await expect(page.getByRole('button', { name: /Google/ }).first()).toBeVisible();

        // Signed out means no workspace calls at all.
        expect(calls.filter((c) => c.path !== '/api/client-error')).toEqual([]);
        expect(errors).toEqual([]);
    });

    for (const path of ['/privacy', '/terms']) {
        test(`${path} loads with real content`, async ({ page }) => {
            const errors = collectPageErrors(page);
            await hideDevChrome(page);
            const res = await page.goto(path);
            expect(res?.status()).toBe(200);
            await expect(page.getByRole('heading').first()).toBeVisible();
            const words = (await page.locator('body').innerText()).split(/\s+/).length;
            expect(words, `${path} looks empty`).toBeGreaterThan(300);
            await expectNoHorizontalOverflow(page);
            expect(errors).toEqual([]);
        });
    }

    test('footer links reach the legal pages and support', async ({ page }) => {
        await hideDevChrome(page);
        await installBackend(page, null);
        await page.goto('/');
        const footer = page.getByRole('contentinfo');
        await expect(footer.getByRole('link', { name: 'Privacy' })).toHaveAttribute('href', '/privacy');
        await expect(footer.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
        await expect(footer.getByRole('link', { name: /support@/ })).toHaveAttribute('href', /^mailto:support@/);
    });
});
