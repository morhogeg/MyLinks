import { Link } from '@/lib/types';
import { getSourceInfo } from '@/lib/source';
import { getNotes } from '@/lib/notes';

/**
 * Library insights (Settings → Insights), computed entirely on-device.
 *
 * One `getDocs` over the user's links when the screen is opened, then pure
 * aggregation in memory — no backend endpoint, no AI calls. The fetch is cached
 * per uid for the session (module-level) so reopening the screen is free; a new
 * save simply isn't reflected until the next session, which is fine for a
 * birds-eye view.
 *
 * Private cards are excluded from EVERYTHING (including totals): the vault is
 * PIN-gated in the feed, so its tags/domains/categories must not leak here.
 * In-flight `processing`/`failed` placeholders aren't saves yet and are skipped.
 */

export interface WeekBucket {
    /** Start of the week (local, Monday) in epoch ms — for labeling. */
    start: number;
    count: number;
}

export interface CountedName {
    name: string;
    count: number;
}

export interface CountedSource extends CountedName {
    /** The feed's source-facet key (`getSourceInfo().key`) — lets an Insights
        row open the library already filtered to this exact source. */
    key: string;
}

/** A tap on an Insights row → open the library filtered to this facet.
    `value` is the category name, the tag, or the source-facet key. The
    'notes' kind opens the My Notes view instead of a filtered grid (no
    value). */
export interface LibraryFacetRequest {
    kind: 'category' | 'tag' | 'source' | 'notes';
    value: string;
}

export interface LibraryStats {
    total: number;
    savedThisMonth: number;
    readCount: number;
    /** Epoch ms of the earliest save, or null for an empty library. */
    firstSaveAt: number | null;
    /** Consecutive days (ending today or yesterday) with at least one save. */
    streakDays: number;
    /** Sum of `metadata.estimatedReadTime` across the library, in minutes. */
    totalReadMinutes: number;
    /** Weekday (0=Sun … 6=Sat) with the most saves — null until the pattern is
        meaningful (≥ 14 dated saves) or when there's no single winner. */
    busiestWeekday: number | null;
    /** Last 12 calendar weeks, oldest → newest (current week last). */
    weeks: WeekBucket[];
    /** All categories, count desc. */
    categories: CountedName[];
    topTags: CountedName[];
    /** Top publishers/channels/sites, by the SAME identity the feed's Sources
        facet uses (lib/source.ts getSourceInfo) — "@naval", "MKBHD", "Ynet" —
        so labels match the cards and rows can open the filtered library. */
    topSources: CountedSource[];
    /** Capture-surface mix, count desc: web / youtube / image / note. */
    sourceMix: CountedName[];
    /** Total personal notes written across the library (both storage shapes). */
    noteCount: number;
    /** How many cards carry at least one note. */
    notedCards: number;
}

/** createdAt arrives as epoch ms, an ISO string, or a Firestore Timestamp. */
function toMillis(value: unknown): number | null {
    if (value && typeof value === 'object' && typeof (value as { toMillis?: unknown }).toMillis === 'function') {
        return (value as { toMillis: () => number }).toMillis();
    }
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
    if (typeof value === 'string') {
        const parsed = Date.parse(value);
        if (Number.isFinite(parsed)) return parsed;
    }
    return null;
}

/** Local-midnight day key (days since epoch) — for streak counting. */
function dayKey(ms: number): number {
    const d = new Date(ms);
    return Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / 86_400_000);
}

/** Start of the local week (Monday 00:00) containing `ms`. */
function weekStart(ms: number): number {
    const d = new Date(ms);
    const day = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() - day).getTime();
}

function topN(counts: Map<string, number>, n: number): CountedName[] {
    return [...counts.entries()]
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
        .slice(0, n);
}

function bump(map: Map<string, number>, key: string) {
    map.set(key, (map.get(key) ?? 0) + 1);
}

const SOURCE_LABEL: Record<string, string> = {
    web: 'Web pages',
    youtube: 'YouTube',
    image: 'Images',
    note: 'Notes',
};

export function computeStats(links: Link[], now = Date.now()): LibraryStats {
    const cards = links.filter(
        (l) => !l.isPrivate && l.status !== 'processing' && l.status !== 'failed',
    );

    const monthStart = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), 1).getTime();
    const currentWeek = weekStart(now);
    const WEEK_MS = 7 * 86_400_000;
    const weeks: WeekBucket[] = Array.from({ length: 12 }, (_, i) => ({
        start: currentWeek - (11 - i) * WEEK_MS,
        count: 0,
    }));

    const categories = new Map<string, number>();
    const tags = new Map<string, number>();
    // Source identity → count, plus key → display label (first one wins; labels
    // are stable per key by construction).
    const sourceCounts = new Map<string, number>();
    const sourceLabels = new Map<string, string>();
    const sources = new Map<string, number>();
    const saveDays = new Set<number>();

    let savedThisMonth = 0;
    let readCount = 0;
    let firstSaveAt: number | null = null;
    let totalReadMinutes = 0;
    let datedSaves = 0;
    let noteCount = 0;
    let notedCards = 0;
    const weekdayCounts = new Array(7).fill(0) as number[];

    for (const card of cards) {
        if (card.isRead) readCount++;
        const readTime = card.metadata?.estimatedReadTime;
        if (typeof readTime === 'number' && Number.isFinite(readTime) && readTime > 0) {
            totalReadMinutes += readTime;
        }
        bump(categories, card.category || 'General');
        for (const tag of card.tags) bump(tags, tag);

        const cardNotes = getNotes(card).length;
        if (cardNotes > 0) {
            noteCount += cardNotes;
            notedCards++;
        }

        const source = card.sourceType || (card.url ? 'web' : 'note');
        bump(sources, SOURCE_LABEL[source] ?? source);

        // URL-less notes have no meaningful source identity; everything else
        // resolves through the same publisher/channel/site resolution the
        // feed's Sources facet uses.
        if (card.url || card.sourceType === 'image') {
            const info = getSourceInfo(card);
            bump(sourceCounts, info.key);
            if (!sourceLabels.has(info.key)) sourceLabels.set(info.key, info.label);
        }

        const ms = toMillis(card.createdAt);
        if (ms === null) continue;
        datedSaves++;
        if (firstSaveAt === null || ms < firstSaveAt) firstSaveAt = ms;
        if (ms >= monthStart) savedThisMonth++;
        saveDays.add(dayKey(ms));
        weekdayCounts[new Date(ms).getDay()]++;
        const bucket = Math.floor((weekStart(ms) - weeks[0].start) / WEEK_MS);
        if (bucket >= 0 && bucket < 12) weeks[bucket].count++;
    }

    // Streak: walk back day-by-day from today; a quiet today doesn't break a
    // streak that ran through yesterday.
    let streakDays = 0;
    let cursor = dayKey(now);
    if (!saveDays.has(cursor)) cursor--;
    while (saveDays.has(cursor)) {
        streakDays++;
        cursor--;
    }

    // Busiest weekday — only once there's a real pattern (2+ weeks of dated
    // saves) and a strict winner, so the screen never over-claims from noise.
    let busiestWeekday: number | null = null;
    if (datedSaves >= 14) {
        const max = Math.max(...weekdayCounts);
        const winners = weekdayCounts.filter((c) => c === max).length;
        if (max > 0 && winners === 1) busiestWeekday = weekdayCounts.indexOf(max);
    }

    return {
        total: cards.length,
        savedThisMonth,
        readCount,
        firstSaveAt,
        streakDays,
        totalReadMinutes,
        busiestWeekday,
        weeks,
        categories: topN(categories, Infinity),
        topTags: topN(tags, 5),
        topSources: topN(sourceCounts, 5).map((s) => ({
            key: s.name,
            name: sourceLabels.get(s.name) ?? s.name,
            count: s.count,
        })),
        sourceMix: topN(sources, Infinity),
        noteCount,
        notedCards,
    };
}

// ---- session cache: one Firestore read per uid per session ----

const cache = new Map<string, LibraryStats>();

export async function loadStats(uid: string, force = false): Promise<LibraryStats> {
    const hit = cache.get(uid);
    if (hit && !force) return hit;
    // Lazy import: lib/storage pulls in lib/firebase (import-time SDK init), and
    // this module's aggregation half must stay importable without it (pure, unit
    // testable in Node). The chunk is already loaded in practice — Settings only
    // opens after the app has used Firestore.
    const { getLinksFromFirestore } = await import('./storage');
    const links = await getLinksFromFirestore(uid);
    const stats = computeStats(links);
    cache.set(uid, stats);
    return stats;
}
