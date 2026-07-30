import {
    collection,
    query,
    orderBy,
    limit,
    onSnapshot,
    QueryDocumentSnapshot,
    DocumentData,
} from 'firebase/firestore';
import { db } from './firebase';
import { WeeklySynthesis } from './types';

/**
 * Read access to the weekly "What you learned" syntheses (M12).
 *
 * Syntheses are written server-side (functions/digest_service.py) to
 * users/{uid}/syntheses/{weekId} — one per ISO week. The feed surfaces the most
 * recent one as a special in-app card; the Digest section keeps the whole run
 * as a browsable archive, so dismissing this week's banner never loses the
 * write-up. Mirrors the onSnapshot style Feed.tsx uses for links and
 * lib/chats.ts uses for chats.
 */

const synthesesCol = (uid: string) => collection(db, 'users', uid, 'syntheses');

function toSynthesis(d: QueryDocumentSnapshot<DocumentData>): WeeklySynthesis {
    const data = d.data();
    return {
        weekId: data.weekId || d.id,
        title: data.title || 'What you learned this week',
        narrative: data.narrative || '',
        themes: (data.themes as WeeklySynthesis['themes']) || [],
        standoutCardId: data.standoutCardId ?? null,
        standoutReason: data.standoutReason || '',
        openQuestion: data.openQuestion || '',
        cards: (data.cards as WeeklySynthesis['cards']) || [],
        cardCount: data.cardCount || 0,
        createdAt: data.createdAt || 0,
    };
}

/** A year of weekly write-ups is plenty of history to hold in memory; older
 *  ones stay in Firestore and would need paging, which no one has asked for. */
const MAX_SYNTHESES = 52;

/**
 * Subscribe to the user's weekly syntheses, newest first. Calls `cb` with the
 * full list (empty if none exist yet) whenever it changes; `[0]` is the latest,
 * which is what the feed banner shows. Returns an unsubscribe function. Fails
 * soft — a listener error yields an empty list rather than throwing, so a
 * missing/empty subcollection never breaks the feed.
 */
export function subscribeSyntheses(
    uid: string,
    cb: (syntheses: WeeklySynthesis[]) => void,
): () => void {
    const q = query(synthesesCol(uid), orderBy('createdAt', 'desc'), limit(MAX_SYNTHESES));
    return onSnapshot(
        q,
        (snap) => cb(snap.docs.map(toSynthesis)),
        () => cb([]),
    );
}

/**
 * Human label for a synthesis's week — "20–26 Jul" for the ISO week in its id
 * ("2026-W30"), which is what distinguishes one archived write-up from the
 * next. Falls back to the createdAt date if the id isn't a parseable week.
 */
export function synthesisWeekLabel(s: WeeklySynthesis): string {
    const m = /^(\d{4})-W(\d{2})$/.exec(s.weekId);
    const day = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric' });
    const dayMonth = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    if (m) {
        // ISO-8601: week 1 is the week containing 4 January; weeks start Monday.
        const jan4 = new Date(Date.UTC(Number(m[1]), 0, 4));
        const isoDow = jan4.getUTCDay() || 7; // Sunday(0) → 7
        const week1Mon = jan4.getTime() - (isoDow - 1) * 86_400_000;
        const start = new Date(week1Mon + (Number(m[2]) - 1) * 7 * 86_400_000);
        const end = new Date(start.getTime() + 6 * 86_400_000);
        return start.getMonth() === end.getMonth()
            ? `${day(start)}–${dayMonth(end)}`
            : `${dayMonth(start)} – ${dayMonth(end)}`;
    }
    return s.createdAt ? dayMonth(new Date(s.createdAt)) : '';
}
