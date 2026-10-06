/**
 * The date range of an ISO week id ("2026-W30" → "20–26 Jul" / "Jul 20–26",
 * in the reader's locale), or null when the id isn't one.
 *
 * The range is two calendar days, built at UTC midnight, so they are
 * formatted in UTC. Formatted in local time, every reader west of UTC saw the
 * week start on Sunday and end on Saturday (REC-18).
 */
export function isoWeekLabel(weekId: string, locale?: string): string | null {
    const m = /^(\d{4})-W(\d{2})$/.exec(weekId);
    if (!m) return null;
    // ISO-8601: week 1 is the week containing 4 January; weeks start Monday.
    const jan4 = new Date(Date.UTC(Number(m[1]), 0, 4));
    const isoDow = jan4.getUTCDay() || 7; // Sunday(0) → 7
    const week1Mon = jan4.getTime() - (isoDow - 1) * 86_400_000;
    const start = new Date(week1Mon + (Number(m[2]) - 1) * 7 * 86_400_000);
    const end = new Date(start.getTime() + 6 * 86_400_000);
    const day = (d: Date) => d.toLocaleDateString(locale, { day: 'numeric', timeZone: 'UTC' });
    const dayMonth = (d: Date) => d.toLocaleDateString(locale, { day: 'numeric', month: 'short', timeZone: 'UTC' });
    return start.getUTCMonth() === end.getUTCMonth()
        ? `${day(start)}–${dayMonth(end)}`
        : `${dayMonth(start)} – ${dayMonth(end)}`;
}
