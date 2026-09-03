/**
 * The card's ACTIONABLE TAKEAWAY — the one concrete thing the reader can go do.
 *
 * The backend generates this only when the content genuinely supports a
 * specific action (see `functions/ai_service.py`: the field is OPTIONAL and is
 * omitted for news, opinion, and anything else where a "do this" would be
 * invented filler). So a card without one is the NORMAL case, not a gap —
 * every caller must render nothing rather than a placeholder.
 *
 * WHERE IT LIVES. Every backend save path writes it inside the card's
 * `metadata` (one builder: `functions/main.py _build_link_data`), so
 * `metadata.actionableTakeaway` is the canonical stored location. A top-level
 * `actionableTakeaway` is the shape Ask's card slimmer already reads, and is
 * where a flattened card would put it, so this reader accepts BOTH and prefers
 * the top-level value. Old documents are deliberately not migrated: reading
 * both shapes IS the compatibility story.
 */

/** The loosest shape this reader needs: a `Link`, or a raw Firestore doc. */
export interface TakeawaySource {
    actionableTakeaway?: unknown;
    metadata?: { actionableTakeaway?: unknown } | null;
}

/**
 * The card's takeaway, trimmed — or `''` when it has none.
 *
 * Always a string (never null/undefined) so every caller's emptiness test is
 * the same one, and a whitespace-only value counts as absent: a "Do this"
 * heading over a blank line is worse than no heading at all.
 */
export function getActionableTakeaway(link: TakeawaySource | null | undefined): string {
    if (!link) return '';
    const top = link.actionableTakeaway;
    if (typeof top === 'string' && top.trim()) return top.trim();
    const nested = link.metadata?.actionableTakeaway;
    return typeof nested === 'string' ? nested.trim() : '';
}
