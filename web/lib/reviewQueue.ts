import { Link } from '@/lib/types';
import { getTimestampNumber, isPending } from '@/lib/feedUtils';

/**
 * Review mode (SwipeDeck): a short, bounded resurfacing session — the
 * interactive twin of the digest. One smart order, no user-facing queue
 * selection: forgotten cards first (saved >30 days ago, never/least recently
 * opened — mirrors the SHAPE of digest_service.curate()'s rediscover branch;
 * constants intentionally differ), then the newest unread saves, then the
 * remaining open cards. Built from the already-filtered feed list so active
 * feed filters narrow the session rather than being fought.
 *
 * Pure (no I/O, `now` injectable) so it's unit-testable.
 */

/** Cards dealt per bounded review session — a short session, not a firehose. */
export const REVIEW_SESSION_SIZE = 12;

const FORGOTTEN_MIN_AGE_DAYS = 30;
const DAY_MS = 86_400_000;

const created = (l: Link): number => getTimestampNumber(l.createdAt);
const viewed = (l: Link): number => getTimestampNumber(l.lastViewedAt);

/**
 * A card is a live review candidate only while it's still "open" — not already
 * kept (favorite), archived, awaiting a reminder, or mid-capture. Acting on a
 * card in the deck flips one of these, which is exactly how it leaves the pool
 * (and how Undo, by reversing the flip, brings it back). Exported so the deck
 * can also skip cards acted on OUTSIDE its gestures mid-session (e.g. a
 * reminder set from the detail modal).
 */
export function isOpen(link: Link): boolean {
    return !isPending(link)
        && link.status !== 'archived'
        && link.status !== 'favorite'
        && link.reminderStatus !== 'pending';
}

/** The full ordered candidate pool for review sessions. */
export function reviewSessionQueue(links: Link[], now: number = Date.now()): Link[] {
    const open = links.filter(isOpen);
    const cutoff = now - FORGOTTEN_MIN_AGE_DAYS * DAY_MS;

    // Dustiest first: saved >30d ago and not opened in 30d.
    const forgotten = open
        .filter((l) => created(l) > 0 && created(l) < cutoff && viewed(l) < cutoff)
        .sort((a, b) => Math.max(viewed(a), created(a)) - Math.max(viewed(b), created(b)));
    const dealt = new Set(forgotten.map((l) => l.id));

    // Then the newest unread saves, then whatever open cards remain — every
    // open card is eventually reachable, so the deck never dead-ends while
    // the library has anything left to review.
    const unread = open
        .filter((l) => !dealt.has(l.id) && !l.isRead)
        .sort((a, b) => created(b) - created(a));
    for (const l of unread) dealt.add(l.id);
    const rest = open
        .filter((l) => !dealt.has(l.id))
        .sort((a, b) => created(b) - created(a));

    return [...forgotten, ...unread, ...rest];
}
