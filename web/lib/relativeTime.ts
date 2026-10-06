/**
 * One relative-time rule for every surface that shows when something was
 * saved or written: cards, the card detail, My notes and the chat list each
 * had their own, with no upper bound ("412d ago") and ungrammatical Hebrew
 * ("לפני 1 ימים") (launch audit L-2).
 *
 * EN: just now · 5m ago · 3h ago · yesterday · 4d ago · then a date
 *     ("Mar 4"; with the year when it isn't this year) from a week on.
 * HE: זה עתה · לפני 5 דק׳ · לפני שעה / שעתיים / 3 שע׳ · אתמול · לפני יומיים /
 *     4 ימים · then the date in he-IL.
 *
 * `input` may be epoch ms, epoch seconds (some legacy ingest paths) or an
 * ISO string. Lowercase on purpose: it usually sits mid-line ("Example ·
 * 2h ago"); a caller showing it on its own capitalizes.
 */
export function relativeTime(input: number | string | null | undefined, now: number, rtl = false): string {
    let ms = typeof input === 'string' ? Date.parse(input) : (input ?? NaN);
    if (!Number.isFinite(ms) || ms <= 0) return rtl ? 'לאחרונה' : 'recently';
    if (ms < 1e12) ms *= 1000; // Unix seconds, not ms
    const seconds = Math.max(0, Math.floor((now - ms) / 1000));
    if (seconds < 60) return rtl ? 'זה עתה' : 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return rtl ? `לפני ${minutes} דק׳` : `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) {
        if (!rtl) return `${hours}h ago`;
        return hours === 1 ? 'לפני שעה' : hours === 2 ? 'לפני שעתיים' : `לפני ${hours} שע׳`;
    }
    const days = Math.floor(hours / 24);
    if (days === 1) return rtl ? 'אתמול' : 'yesterday';
    if (days < 7) {
        if (!rtl) return `${days}d ago`;
        return days === 2 ? 'לפני יומיים' : `לפני ${days} ימים`;
    }
    const d = new Date(ms);
    const sameYear = d.getFullYear() === new Date(now).getFullYear();
    return d.toLocaleDateString(rtl ? 'he-IL' : undefined, sameYear
        ? { month: 'short', day: 'numeric' }
        : { month: 'short', day: 'numeric', year: 'numeric' });
}
