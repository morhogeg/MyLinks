import { Link } from '@/lib/types';
import { getTimestampNumber, isPending } from '@/lib/feedUtils';

/**
 * Curated review queues for the SwipeDeck (Review mode). Review mode is the
 * interactive twin of the digest — a short, curated resurfacing session, not an
 * endless deck over the current filter. These pure functions build the ordered
 * candidate list for each queue from the already-filtered feed list, so active
 * feed filters further narrow the queue rather than being fought.
 *
 * Everything here is pure (no I/O, `now` injectable) so it's unit-testable.
 */

export type ReviewQueue = 'forgotten' | 'recent' | 'tidying';

/** Cards dealt per bounded review session — a short session, not a firehose. */
export const REVIEW_SESSION_SIZE = 12;

/** Mirrors digest_service.REDISCOVER — but tuned for the in-app "Forgotten" queue. */
const FORGOTTEN_MIN_AGE_DAYS = 30;
const DAY_MS = 86_400_000;

const created = (l: Link): number => getTimestampNumber(l.createdAt);
const viewed = (l: Link): number => getTimestampNumber(l.lastViewedAt);

/**
 * A card is a live review candidate only while it's still "open" — not already
 * kept (favorite), archived, awaiting a reminder, or mid-capture. Acting on a
 * card in the deck flips one of these, which is exactly how it leaves the queue
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

/** The two triage gaps, shared by the queue predicate and its "why" line. */
function tidyingGaps(link: Link): { noTags: boolean; noCategory: boolean } {
    const cat = (link.category || '').trim().toLowerCase();
    return {
        noTags: !link.tags || link.tags.length === 0,
        noCategory: cat === '' || cat === 'general' || cat === 'uncategorized',
    };
}

/** No tags, or an empty / default ("General"/"Uncategorized") category. */
export function needsTidying(link: Link): boolean {
    const { noTags, noCategory } = tidyingGaps(link);
    return noTags || noCategory;
}

/**
 * "Forgotten" (default): saved > 30 days ago and never / least-recently opened.
 * Mirrors the `rediscover` branch of digest_service.curate() — prefer the cards
 * gathering the most dust (least recently touched) first.
 */
export function forgottenQueue(links: Link[], now: number = Date.now()): Link[] {
    const cutoff = now - FORGOTTEN_MIN_AGE_DAYS * DAY_MS;
    return links
        .filter(isOpen)
        .filter((l) => created(l) > 0 && created(l) < cutoff && viewed(l) < cutoff)
        .sort((a, b) => Math.max(viewed(a), created(a)) - Math.max(viewed(b), created(b)));
}

/** "Recent": newest unread saves first. */
export function recentQueue(links: Link[]): Link[] {
    return links
        .filter(isOpen)
        .filter((l) => !l.isRead)
        .sort((a, b) => created(b) - created(a));
}

/** "Needs tidying": untagged / uncategorized cards — a triage queue, newest first. */
export function tidyingQueue(links: Link[]): Link[] {
    return links
        .filter(isOpen)
        .filter(needsTidying)
        .sort((a, b) => created(b) - created(a));
}

/** Build the ordered candidate list for a queue. */
export function buildReviewQueue(links: Link[], queue: ReviewQueue, now: number = Date.now()): Link[] {
    switch (queue) {
        case 'recent':
            return recentQueue(links);
        case 'tidying':
            return tidyingQueue(links);
        case 'forgotten':
        default:
            return forgottenQueue(links, now);
    }
}

/** Human-readable "N units ago" from a ms timestamp (0 → empty string). */
export function relativeAge(ms: number, now: number = Date.now()): string {
    if (!ms) return '';
    const days = Math.floor(Math.max(0, now - ms) / DAY_MS);
    if (days <= 0) return 'today';
    if (days === 1) return 'yesterday';
    if (days < 7) return `${days} days ago`;
    const weeks = Math.floor(days / 7);
    if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
    const months = Math.floor(days / 30);
    if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
    const years = Math.floor(days / 365);
    return `${years} year${years === 1 ? '' : 's'} ago`;
}

/**
 * One muted line explaining why this card is in the session, built only from
 * data already on the card doc (no backend calls).
 */
export function whyThisCard(link: Link, queue: ReviewQueue, now: number = Date.now()): string {
    if (queue === 'tidying') {
        const { noTags, noCategory } = tidyingGaps(link);
        if (noTags && noCategory) return 'No tags or category yet';
        if (noTags) return 'No tags yet';
        return 'Needs a category';
    }

    const savedAge = relativeAge(created(link), now);
    const saved = savedAge ? `Saved ${savedAge}` : 'Saved recently';
    const viewedMs = viewed(link);
    if (!viewedMs) return `${saved} · never opened`;
    const related = link.relatedLinks?.length ?? 0;
    if (queue === 'recent' && related >= 2) return `${saved} · ${related} related saves`;
    return `${saved} · last opened ${relativeAge(viewedMs, now)}`;
}
