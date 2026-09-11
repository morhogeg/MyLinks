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

/** The fields the Revisit list needs beyond the takeaway itself. */
export interface TakeawayCard extends TakeawaySource {
    captureType?: string;
    takeawayDoneAt?: number | null;
    // A Link's createdAt is `string | number` (legacy docs stored ISO strings).
    createdAt?: number | string;
}

/** createdAt as epoch ms whatever shape it was stored in; 0 when unreadable. */
function createdMs(v: number | string | undefined): number {
    if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
    if (typeof v === 'string') {
        const n = Number(v);
        if (Number.isFinite(n)) return n;
        const t = Date.parse(v);
        return Number.isFinite(t) ? t : 0;
    }
    return 0;
}

/** True once the user has ticked the takeaway off. */
export function isTakeawayDone(link: Pick<TakeawayCard, 'takeawayDoneAt'> | null | undefined): boolean {
    return typeof link?.takeawayDoneAt === 'number' && link.takeawayDoneAt > 0;
}

/**
 * The cards whose "Do this" is still open, newest save first: what the Revisit
 * tab lists. A saved Ask answer never carries one (it is already an answer to
 * the user's own question, same rule as the card detail), and a done takeaway
 * leaves the list but stays on its card. Pure, so the rule is testable.
 */
export function openTakeaways<T extends TakeawayCard>(links: readonly T[]): T[] {
    return links
        .filter((l) => !!getActionableTakeaway(l) && String(l.captureType) !== 'answer' && !isTakeawayDone(l))
        .sort((a, b) => createdMs(b.createdAt) - createdMs(a.createdAt));
}
