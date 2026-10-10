import { test, expect } from '@playwright/test';
import {
    adminGet, collectPageErrors, createAuthUser, expectNoHorizontalOverflow, hideDevChrome,
    installBackend, openAccountSettings, openAsNewUser, readyCard, seedCard, seedReturningUser, signIn,
} from '../helpers';

// The first five minutes of a brand-new account. Every write here goes through
// the live firestore.rules, so a rules regression that blocks a first-run write
// (consent, onboarding, graph stamp) fails these tests.

test('new account: consent → welcome → tour → empty library @desktop', async ({ page }) => {
    const errors = collectPageErrors(page);
    const user = await createAuthUser('signup');
    await hideDevChrome(page);
    const calls = await installBackend(page, user);
    await page.goto('/');
    await signIn(page, user);

    // 1. AI consent (App Review 5.1.1/5.1.2) comes before anything else.
    await expect(page.getByRole('heading', { name: 'Machina uses AI' })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    await page.getByRole('button', { name: 'I understand, continue' }).click();

    // 2. Welcome. Mentions the trial because the entitlement says trial.
    await expect(page.getByRole('heading', { name: /Bring what you/ })).toBeVisible();
    await expect(page.getByText(/free for your first 14 days/)).toBeVisible();
    await page.getByRole('button', { name: /^Not now/ }).click();

    // 3. Tour, then the empty library.
    const tour = page.getByRole('dialog', { name: 'How Machina works' });
    await expect(tour).toBeVisible();
    await tour.getByRole('button', { name: 'Skip' }).click();
    await expect(page.getByRole('heading', { name: 'Your Machina is empty' })).toBeVisible();
    await expectNoHorizontalOverflow(page);

    // The workspace claim carried a verified-token Bearer header.
    const claim = calls.find((c) => c.path.endsWith('/claim_workspace'));
    expect(claim?.auth).toMatch(/^Bearer /);

    // Consent and onboarding were persisted to the user doc (survive reinstall).
    await expect.poll(async () => (await adminGet(`users/${user.uid}`))?.aiConsentAt).toBeTruthy();
    await expect.poll(async () => (await adminGet(`users/${user.uid}`))?.onboarded).toBe(true);

    // Background graph migration stamps the doc, so it doesn't re-run every open.
    await expect.poll(async () => (await adminGet(`users/${user.uid}`))?.graphVersion, { timeout: 20_000 }).toBeTruthy();

    expect(errors).toEqual([]);
});

test('reload after sign-up goes straight to the library (no repeat screens)', async ({ page }) => {
    const { user } = await openAsNewUser(page);
    await expect.poll(async () => (await adminGet(`users/${user.uid}`))?.onboarded).toBe(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Your Machina is empty' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Machina uses AI' })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: /Bring what you/ })).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'How Machina works' })).toHaveCount(0);
});

test('sign-up survives the claim endpoints being down (self-serve workspace under locked rules)', async ({ page }) => {
    const errors = collectPageErrors(page);
    const user = await createAuthUser('claimdown');
    await hideDevChrome(page);
    await installBackend(page, user, { claim: 'down' });
    await page.goto('/');
    await signIn(page, user);

    // Lands on consent, not the "couldn't set up your workspace" screen.
    await expect(page.getByRole('heading', { name: 'Machina uses AI' })).toBeVisible({ timeout: 30_000 });
    const doc = await adminGet(`users/${user.uid}`);
    expect(doc?.authUids).toEqual([user.uid]);
    expect(doc?.onboarded).toBe(false);
    expect(errors).toEqual([]);
});

test('sign out returns to the landing page and stays signed out on reload', async ({ page }) => {
    const { user } = await openAsNewUser(page);
    await openAccountSettings(page, user.email);
    // signOutUser() reloads the page itself (clears in-memory state).
    await Promise.all([page.waitForEvent('load'), page.getByRole('button', { name: 'Sign out' }).click()]);
    await expect(page.getByRole('button', { name: 'Get started' }).first()).toBeVisible();
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Get started' }).first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add to Machina' })).toHaveCount(0);
});

// Owner report 2026-10-10: signing in from the landing page flashed the
// cold-launch boot screen (the landing's big glowing mark, always dark), which
// read as "sent back to the home page" before the app appeared. The sign-in
// screen must hold until the app takes over; the boot screen is cold-start only.
test('signing in from the landing page goes straight to the app (no boot screen in between) @desktop', async ({ page }) => {
    const user = await createAuthUser('handoff');
    await seedReturningUser(user);
    await seedCard(user, 'a', readyCard({ title: 'Already in my library' }));
    await page.addInitScript(() => { try { localStorage.setItem('machina_onboarding_v1', '1'); } catch { /* */ } });
    await hideDevChrome(page);
    await installBackend(page, user, { claim: 'down' });
    await page.goto('/');
    await page.getByRole('button', { name: 'Get started' }).first().click();
    await expect(page.getByRole('button', { name: /Continue with Google/ })).toBeVisible();

    // Record every screen the page passes through from here on.
    await page.evaluate(() => {
        const w = window as unknown as { __seen: Set<string> };
        w.__seen = new Set();
        const look = () => {
            const t = document.body.innerText;
            if (t.includes('Starting Machina')) w.__seen.add('boot');
            if (t.includes('finally useful') && t.includes('Get started')) w.__seen.add('landing');
        };
        new MutationObserver(look).observe(document.body, { childList: true, subtree: true, characterData: true });
    });
    await signIn(page, user);
    await expect(page.getByRole('heading', { name: 'Already in my library' })).toBeVisible();
    const seen = await page.evaluate(() => [...(window as unknown as { __seen: Set<string> }).__seen]);
    expect(seen, 'screens shown between sign-in and the app').toEqual([]);
});

test('a cold start with a saved session still shows the boot screen, then the app', async ({ page }) => {
    const { user } = await openAsNewUser(page);
    await expect.poll(async () => (await adminGet(`users/${user.uid}`))?.onboarded).toBe(true);
    await page.reload();
    await expect(page.getByText('Starting Machina')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add to Machina' })).toBeVisible();
});

// Web REDIRECT fallback (pop-up blocked: phones, in-app browsers). The tab comes
// back from Google as a fresh load and auth reports "signed out" before the
// redirect result lands, which used to show the landing page again first. The
// marker lib/auth.ts sets before leaving is simulated here.
async function returnFromRedirect(page: import('@playwright/test').Page) {
    await page.addInitScript(() => {
        try { sessionStorage.setItem('machina:redirectSignIn', 'google'); } catch { /* */ }
        const w = window as unknown as { __seen: Set<string> };
        w.__seen = new Set();
        const look = () => {
            const t = document.body?.innerText ?? '';
            if (t.includes('finally useful') && t.includes('Get started')) w.__seen.add('landing');
            if (t.includes('Signing in')) w.__seen.add('signing-in');
        };
        new MutationObserver(look).observe(document, { childList: true, subtree: true, characterData: true });
    });
}

test('returning from a redirect holds "Signing in…" first; an empty redirect ends on a usable landing', async ({ page }) => {
    // What a REAL return from Google does next (the redirect result carries
    // the user, the hold runs straight into the app) can't be produced
    // without a live Google round trip. The emulator answers "no redirect
    // happened" within ~0.5 s, which exercises the other branch: the hold
    // must come first, then give way to a working landing, never a stuck
    // spinner.
    await returnFromRedirect(page);
    await hideDevChrome(page);
    await installBackend(page, null);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Get started' }).first()).toBeVisible();
    const seen = await page.evaluate(() => [...(window as unknown as { __seen: Set<string> }).__seen]);
    expect(seen[0], 'first screen after the redirect return').toBe('signing-in');
    // The landing is usable: Get started opens a fresh sign-in screen.
    await page.getByRole('button', { name: 'Get started' }).first().click();
    await expect(page.getByRole('button', { name: /Continue with Google/ })).toBeEnabled();
});
