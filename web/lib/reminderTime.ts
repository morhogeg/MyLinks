import type { Link } from './types';

/**
 * Small, pure helpers for showing and moving a card's reminder in Revisit.
 * Shared by DigestView (labels, the swipe's preview) and Feed (the write and
 * its toast), so both always agree on where a snooze lands.
 */

const timeLabel = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** A pending reminder is DUE once it has fired (the sweep sets reminderDue, the
 *  in-app delivery that works with or without push) or once its scheduled moment
 *  has passed and the next sweep simply hasn't run yet. */
export const isReminderDue = (l: Pick<Link, 'reminderDue' | 'nextReminderAt'>, now: number) =>
    l.reminderDue === true || (l.nextReminderAt ?? 0) <= now;

/** When a reminder fires, as short as the day allows: "1:00 PM" today,
 *  "Tomorrow, 9:00 AM", "Fri, 9:00 AM" this week, then "Oct 14, 9:00 AM"
 *  (with the year once it is not this one). */
export function whenLabel(ms: number, now: Date): string {
    const d = new Date(ms);
    const time = timeLabel(ms);
    const days = Math.round((startOfDay(d) - startOfDay(now)) / 86_400_000);
    if (days <= 0) return time;
    if (days === 1) return `Tomorrow, ${time}`;
    if (days < 7) return `${d.toLocaleDateString(undefined, { weekday: 'short' })}, ${time}`;
    const date = d.toLocaleDateString(undefined, d.getFullYear() === now.getFullYear()
        ? { month: 'short', day: 'numeric' }
        : { month: 'short', day: 'numeric', year: 'numeric' });
    return `${date}, ${time}`;
}

/** Where a snooze moves a reminder: tomorrow at 9:00 AM (the reminder sheet's
 *  "Tomorrow"), or, for one already set past that, one day after its own time.
 *  Always later than now and than the current time, never earlier. */
export function snoozeTarget(l: Pick<Link, 'reminderDue' | 'nextReminderAt'>, now: Date): number {
    const tomorrowNine = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 9, 0, 0, 0).getTime();
    const at = l.nextReminderAt ?? 0;
    if (!isReminderDue(l, now.getTime()) && at >= tomorrowNine) {
        const d = new Date(at);
        d.setDate(d.getDate() + 1);
        return d.getTime();
    }
    return tomorrowNine;
}
