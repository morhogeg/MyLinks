import { test, expect, type Page } from '@playwright/test';
import {
    adminGet, collectPageErrors, createAuthUser, hideDevChrome, installBackend,
    openAsNewUser, readyCard, seedCard, seedWorkspace, signIn,
} from '../helpers';

// First-run honesty and cost (SOURCE_OF_TRUTH §4 11b, findings E4/E5/E6):
//   E4  the web first run promises only capture paths that exist today;
//   E5  a new workspace never runs the graph migration on an empty library;
//   E6  "How Machina works" is shown once per account, not once per device.

const tour = (page: Page) => page.getByRole('dialog', { name: 'How Machina works' });
// POSTs only: the callable's CORS preflight (OPTIONS) is logged too.
const rebuildCalls = (calls: Array<{ path: string; method: string; body: unknown }>) =>
    calls.filter((c) => c.method === 'POST' && c.path.endsWith('/rebuild_connections'));
// innerText, not textContent: only what a user can actually read.
const expectNoExtension = (page: Page) =>
    expect(page.locator('body')).not.toContainText(/extension/i, { useInnerText: true });

// ── E4 ────────────────────────────────────────────────────────────────────

test('web first run never mentions the browser extension @desktop', async ({ page }) => {
    const errors = collectPageErrors(page);
    const user = await createAuthUser('noext');
    await hideDevChrome(page);
    await installBackend(page, user);
    await page.goto('/');
    await signIn(page, user);
    await page.getByRole('button', { name: 'I understand, continue' }).click();

    // Welcome, both states: the three choices, then "Save your first thing" expanded.
    await expect(page.getByRole('heading', { name: /Bring what you/ })).toBeVisible();
    await expectNoExtension(page);
    await page.getByRole('button', { name: /Save your first thing/ }).click();
    await expect(page.getByText('Use the plus button')).toBeVisible();
    await expect(page.getByText('Share from your iPhone')).toBeVisible();
    await expectNoExtension(page);
    await page.getByRole('button', { name: /Start saving/ }).click();

    // Tour step 1 (Capture).
    await expect(tour(page).getByRole('heading', { name: 'Save anything, from anywhere' })).toBeVisible();
    await expectNoExtension(page);
    await tour(page).getByRole('button', { name: 'Skip' }).click();

    // The empty library.
    await expect(page.getByRole('heading', { name: 'Your Machina is empty' })).toBeVisible();
    await expectNoExtension(page);
    expect(errors).toEqual([]);
});

// ── E5 ────────────────────────────────────────────────────────────────────

test('a new account is born at the current graph version and never calls rebuild_connections', async ({ page }) => {
    const { user, calls } = await openAsNewUser(page);
    expect((await adminGet(`users/${user.uid}`))?.graphVersion).toBe(2);
    // ensureGraphVersion runs 4s after boot (app/page.tsx). Nothing observable
    // happens when the stamp is already current, so wait past that point.
    await page.waitForTimeout(6_000);
    expect(rebuildCalls(calls)).toEqual([]);
});

test('self-serve workspace (claim down): the empty library is stamped without the callable', async ({ page }) => {
    // The client-side fallback can't carry graphVersion (locked create rule),
    // so ensureGraphVersion stamps it after seeing an empty library.
    const user = await createAuthUser('selfserve');
    await hideDevChrome(page);
    const calls = await installBackend(page, user, { claim: 'down' });
    await page.goto('/');
    await signIn(page, user);
    await page.getByRole('button', { name: 'I understand, continue' }).click({ timeout: 30_000 });
    await page.getByRole('button', { name: /^Not now/ }).click();
    await tour(page).getByRole('button', { name: 'Skip' }).click();
    await expect.poll(async () => (await adminGet(`users/${user.uid}`))?.graphVersion, { timeout: 20_000 }).toBe(2);
    expect(rebuildCalls(calls)).toEqual([]);
});

test('control: an unstamped library WITH cards still runs the migration', async ({ page }) => {
    // Proves the two tests above would see a call if one were made, and that
    // the empty-library shortcut doesn't skip a real migration.
    const user = await createAuthUser('legacygraph');
    await seedWorkspace(user, { onboarded: true, aiConsentAt: Date.now() - 86_400_000, tourSeenAt: 1, graphVersion: null });
    await seedCard(user, 'c1', readyCard());
    await hideDevChrome(page);
    const calls = await installBackend(page, user, { claim: 'down' });
    await page.goto('/');
    await signIn(page, user);
    await expect.poll(async () => (await adminGet(`users/${user.uid}`))?.graphVersion, { timeout: 20_000 }).toBe(2);
    expect(rebuildCalls(calls).map((c) => (c.body as { data?: { phase?: string } })?.data?.phase)).toEqual(['embed', 'relate']);
});

// ── E6 ────────────────────────────────────────────────────────────────────

test('a returning user on a new device (no local tour key) does not see the tour', async ({ page }) => {
    const user = await createAuthUser('seconddevice');
    await seedWorkspace(user, { onboarded: true, aiConsentAt: Date.now() - 86_400_000, tourSeenAt: Date.now() - 86_400_000 });
    await hideDevChrome(page);
    await installBackend(page, user, { claim: 'down' });
    await page.goto('/');
    await signIn(page, user);
    await expect(page.getByRole('heading', { name: 'Your Machina is empty' })).toBeVisible();
    // The tour opens 600ms after the feed; give it well past that.
    await page.waitForTimeout(2_000);
    await expect(tour(page)).toHaveCount(0);
    // The doc's record was cached locally, so the next boot doesn't wait on it.
    expect(await page.evaluate(() => localStorage.getItem('machina_onboarding_v1'))).toBe('1');
});

test('a brand-new user sees the tour once, and the doc remembers it for other devices', async ({ page, browser }) => {
    const { user } = await openAsNewUser(page); // asserts the tour opened, then skips it
    await expect.poll(async () => (await adminGet(`users/${user.uid}`))?.tourSeenAt).toEqual(expect.any(Number));

    // Same account, a fresh browser (another device): straight to the library.
    const ctx = await browser.newContext();
    const other = await ctx.newPage();
    await hideDevChrome(other);
    await installBackend(other, user, { claim: 'down' });
    await other.goto('/');
    await signIn(other, user);
    await expect(other.getByRole('heading', { name: 'Your Machina is empty' })).toBeVisible();
    await other.waitForTimeout(2_000);
    await expect(tour(other)).toHaveCount(0);
    await ctx.close();
});

test('a brand-new account still gets the tour on a browser another account already used', async ({ page }) => {
    // The local key is device-wide; a previous account on this browser left it set.
    await page.addInitScript(() => { try { localStorage.setItem('machina_onboarding_v1', '1'); } catch { /* */ } });
    const { user } = await openAsNewUser(page); // fails if the tour doesn't open
    await expect.poll(async () => (await adminGet(`users/${user.uid}`))?.tourSeenAt).toEqual(expect.any(Number));
});

test('Settings → Take the tour again still opens the tour', async ({ page }) => {
    const user = await createAuthUser('replay');
    await seedWorkspace(user, { onboarded: true, aiConsentAt: Date.now() - 86_400_000, tourSeenAt: 1 });
    await hideDevChrome(page);
    await installBackend(page, user, { claim: 'down' });
    await page.goto('/');
    await signIn(page, user);
    await expect(page.getByRole('heading', { name: 'Your Machina is empty' })).toBeVisible();
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('dialog', { name: 'Settings' }).getByRole('button', { name: 'Take the tour again' }).click();
    await expect(tour(page)).toBeVisible();
    await tour(page).getByRole('button', { name: 'Skip' }).click();
    await expect(tour(page)).toHaveCount(0);
});
