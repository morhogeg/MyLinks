import { Link } from '@/lib/types';

// Pending captures (M3): processing/failed cards are surfaced separately, pinned
// above the feed, and excluded from the normal filtered feed + every facet.
export const isPending = (l: Link) => l.status === 'processing' || l.status === 'failed';

// Consistent millisecond timestamp from a number, ISO string, or Firestore
// Timestamp. Module-scope + pure so it's a stable dependency for memoization.
export const getTimestampNumber = (val: unknown): number => {
    if (!val) return 0;
    if (typeof val === 'number') return val;
    if (typeof val === 'string') return new Date(val).getTime();
    if (typeof val === 'object') {
        const obj = val as { toMillis?: () => number; seconds?: number };
        if (typeof obj.toMillis === 'function') return obj.toMillis();
        if (obj.seconds) return obj.seconds * 1000;
    }
    return 0;
};
