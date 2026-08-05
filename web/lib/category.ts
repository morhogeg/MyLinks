/**
 * Category canonicalisation — ONE spelling per category, in Title Case.
 *
 * Categories used to be stored exactly as written, so `sports` and `Sports`
 * were two different categories with two separate counts, and the filter sheet
 * listed both (owner, 2026-08-05: `international relations 1` sitting next to
 * `International Relations 1`). Matching is now case-insensitive and the stored
 * form is always canonical, so a category can only exist once.
 *
 * MIRRORED IN `functions/link_service.py` (`canonical_category`). Both sides
 * write categories — the backend when analysis produces one, the client when
 * the user edits one — so both must agree or they'd re-split what the other
 * merged. `tests/test_category_case.py` reads THIS file and checks the two
 * lists stay identical; if you touch ACRONYMS or MINOR_WORDS, touch both.
 */

/** Words kept fully upper-case. Title-casing alone gives "Tv Series", which
 *  reads as a typo. Deliberately short — only forms plausible as a category
 *  word, because anything here overrides normal casing wherever it appears. */
const ACRONYMS = new Set([
    'AI', 'API', 'AR', 'VR', 'UI', 'UX', 'TV', 'US', 'UK', 'EU', 'DIY',
    'F1', 'NBA', 'NFL', 'PC', 'IT', 'HR',
]);

/** Kept lower-case unless they lead — real title case, so "cost of living"
 *  becomes "Cost of Living" rather than the robotic "Cost Of Living". */
const MINOR_WORDS = new Set([
    'a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'nor',
    'of', 'on', 'or', 'the', 'to', 'vs', 'with',
]);

/**
 * The key two categories share when they differ only by case or spacing.
 * Used to group existing cards during the merge and to look up whether a
 * canonical spelling already exists.
 */
export function categoryKey(category: string): string {
    return category.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Canonical Title Case form of a category.
 *
 * Empty / whitespace-only input returns '' — callers decide the fallback
 * ('General' on the write paths), so this never invents a category.
 */
export function canonicalCategory(category: string): string {
    const cleaned = (category ?? '').trim().replace(/\s+/g, ' ');
    if (!cleaned) return '';

    return cleaned
        .split(' ')
        .map((word, i) => {
            const bare = word.toLowerCase();
            if (ACRONYMS.has(bare.toUpperCase())) return bare.toUpperCase();
            if (i > 0 && MINOR_WORDS.has(bare)) return bare;
            // Hyphenated compounds capitalise each part ("Sci-Fi"), and the
            // slice keeps the rest lower so "SPORTS" normalises like "sports".
            return bare
                .split('-')
                .map((part) => (part ? part[0].toUpperCase() + part.slice(1) : part))
                .join('-');
        })
        .join(' ');
}
