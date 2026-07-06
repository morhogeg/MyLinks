/**
 * Shared time helpers. Card timestamps arrive as either an ISO string, a
 * millisecond number, or a Firestore-ish value, so normalization + relative
 * formatting lived copy-pasted in Card, LinkDetailModal, and Feed. Centralized
 * here so the three stay in sync.
 */

export type TimestampLike = number | string | { seconds?: number; toMillis?: () => number } | null | undefined;

/** Normalize any stored timestamp to epoch milliseconds (0 when unparseable). */
export function toMillis(val: TimestampLike): number {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') {
    const ms = new Date(val).getTime();
    return isNaN(ms) ? 0 : ms;
  }
  if (typeof val === 'object') {
    if (typeof val.toMillis === 'function') return val.toMillis();
    if (typeof val.seconds === 'number') return val.seconds * 1000;
  }
  return 0;
}

/**
 * Human "time ago" label, localized for RTL (Hebrew) vs LTR (English).
 * `now` is passed in (not read from Date.now) so callers can share one clock
 * tick across a list and keep renders deterministic.
 */
export function formatTimeAgo(timestamp: TimestampLike, now: number, isRtl: boolean): string {
  if (!timestamp || !now) return '...';

  const time = toMillis(timestamp);
  if (!time) return isRtl ? 'לאחרונה' : 'recently';

  const seconds = Math.floor((now - time) / 1000);
  if (seconds < 60) return isRtl ? 'זה עתה' : 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return isRtl ? `לפני ${minutes} דק׳` : `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return isRtl ? `לפני ${hours} שע׳` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return isRtl ? `לפני ${days} ימים` : `${days}d ago`;
}
