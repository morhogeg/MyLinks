import { test, expect, type Page } from '@playwright/test';
import { collectPageErrors, expectNoHorizontalOverflow, openAsNewUser, openAsReturningUser, readyCard } from '../helpers';

// My notes = everything the user wrote themselves (finding E3, 2026-10-04): a
// note saved via + → Note used to toast "Note saved" and then be missing from
// My notes, which listed only the notes added inside cards. Both kinds now
// show, the in-view search covers both, and private cards stay out.

async function openMyNotes(page: Page) {
    await page.getByRole('button', { name: /^View:/ }).click();
    await page.getByRole('radio', { name: 'My notes' }).click();
    const close = page.getByRole('button', { name: 'Close view options' });
    if (await close.isVisible().catch(() => false)) await close.click();
}

/** NotesView's own visible root (Feed also mounts a hidden desktop copy), so the library behind the overlay can't satisfy an assertion. */
function notesView(page: Page) {
    return page.getByPlaceholder('Search your notes…').locator('xpath=ancestor::div[contains(@class,"max-w-2xl")][1]').filter({ visible: true });
}

test('a note saved from + → Note shows up in My notes', async ({ page }) => {
    const errors = collectPageErrors(page);
    await openAsNewUser(page);

    // Empty first: the copy has to name BOTH ways to write a note.
    await openMyNotes(page);
    await expect(page.getByText(/No notes yet\. Tap \+ and choose Note to write one, or open any card and tap “Add a note”/).filter({ visible: true })).toBeVisible();
    await page.getByRole('button', { name: 'Back to your library' }).click();

    await page.getByRole('button', { name: 'Add to Machina' }).click();
    const dialog = page.getByRole('dialog', { name: 'Add link' });
    await dialog.getByRole('button', { name: 'Note' }).click();
    await dialog.getByRole('textbox').fill('Ask the bakery whether they sell rye flour by the kilo.');
    await dialog.getByRole('button', { name: 'Save' }).click();
    await expect(page.getByText('Note saved')).toBeVisible();

    await openMyNotes(page);
    const view = notesView(page);
    await expect(view.getByRole('button', { name: /^Note: Ask the bakery whether they sell rye flour/ })).toBeVisible();
    await expect(view.getByText('1 note', { exact: true })).toBeVisible();
    await expect(page.getByText(/No notes yet/)).toHaveCount(0);
    await expectNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
});

test('returning user: note cards (old ones too) and card notes both list, privately-kept ones do not', async ({ page }) => {
    const DAY = 86_400_000;
    // 150 newer cards push the old note out of the live feed window
    // (useLinks PAGE_SIZE), so it can only arrive via the full-library fetch.
    const filler: Record<string, Record<string, unknown>> = {};
    for (let i = 0; i < 150; i++) filler[`f${i}`] = readyCard({ title: `Filler article ${i}`, createdAt: Date.now() - DAY - i * 60_000 });
    const errors = collectPageErrors(page);
    await openAsReturningUser(page, {
        ...filler,
        oldNote: readyCard({ sourceType: 'note', url: '', title: 'Order rye flour from the mill', summary: '', category: '', tags: [], createdAt: Date.now() - 400 * DAY }),
        heNote: readyCard({ sourceType: 'note', url: '', title: 'לקנות שמרים לפני שבת', summary: '', category: '', tags: [], createdAt: Date.now() - 2 * 3_600_000 }),
        commented: readyCard({
            title: 'Sourdough starter guide',
            userNotes: [{ id: 'c1', text: 'Feed the starter twice a day.', createdAt: Date.now() - 3_600_000 }],
        }),
        privateNote: readyCard({ sourceType: 'note', url: '', title: 'Private thought about the vault', summary: '', isPrivate: true, createdAt: Date.now() - 60_000 }),
        privateCommented: readyCard({
            title: 'Private article',
            isPrivate: true,
            userNotes: [{ id: 'c2', text: 'A private comment', createdAt: Date.now() - 60_000 }],
        }),
        // Shared text is kept, not written: not a note entry of its own.
        sharedText: readyCard({ sourceType: 'note', captureType: 'text', url: '', title: 'A kept quote', summary: 'Someone else wrote these words.', createdAt: Date.now() - 120_000 }),
    });

    await openMyNotes(page);
    const view = notesView(page);
    const oldNote = view.getByRole('button', { name: /^Note: Order rye flour from the mill/ });
    const heNote = view.getByRole('button', { name: /^Note: לקנות שמרים לפני שבת/ });
    const commented = view.getByRole('button', { name: 'Sourdough starter guide: one note' });
    await expect(oldNote).toBeVisible();
    await expect(heNote).toBeVisible();
    await expect(commented).toBeVisible();
    await expect(commented.getByText('Feed the starter twice a day.')).toBeVisible();
    await expect(view.getByText('2 notes · 1 more on 1 card')).toBeVisible();

    // Hebrew reads right-to-left on its own.
    await expect(heNote.getByText('לקנות שמרים לפני שבת')).toHaveAttribute('dir', 'auto');

    // Private cards stay out, locked or not; shared text is not a written note.
    await expect(view.getByText('Private thought about the vault')).toHaveCount(0);
    await expect(view.getByText('A private comment')).toHaveCount(0);
    await expect(view.getByText('Someone else wrote these words.')).toHaveCount(0);

    // Newest activity first: card note (1h) → Hebrew note (2h) → old note (400d).
    const order = await view.getByRole('button').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label') ?? ''));
    const idx = (re: RegExp) => order.findIndex((l) => re.test(l));
    expect(idx(/^Sourdough starter guide/)).toBeLessThan(idx(/^Note: לקנות/));
    expect(idx(/^Note: לקנות/)).toBeLessThan(idx(/^Note: Order rye/));

    // In-view search finds note-card text and card-note text alike.
    const search = view.getByPlaceholder('Search your notes…');
    await search.fill('rye flour');
    await expect(oldNote).toBeVisible();
    await expect(commented).toHaveCount(0);
    await expect(heNote).toHaveCount(0);
    await expect(view.getByText('1 matching note')).toBeVisible();
    await search.fill('twice a day');
    await expect(commented).toBeVisible();
    await expect(oldNote).toHaveCount(0);

    // Tapping a note card opens the note.
    await search.fill('');
    await oldNote.click();
    const detail = page.getByRole('dialog', { name: 'Link details' });
    await expect(detail).toBeVisible();
    await expect(detail.getByText('Order rye flour from the mill').first()).toBeVisible();

    await expectNoHorizontalOverflow(page);
    expect(errors).toEqual([]);
});
