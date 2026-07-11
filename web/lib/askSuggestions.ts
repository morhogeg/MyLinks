import { Link } from './types';

/**
 * The living suggestion engine for Ask Machina.
 *
 * Builds prompt chips from what's ACTUALLY in the library right now — the
 * newest save, this week's activity, concepts that recur across cards,
 * top categories, and a forgotten card worth rediscovering — so the empty
 * state reacts the moment a new card lands. Pure functions over the already-
 * loaded links array: no fetches, no extra tokens, recomputed on every
 * Firestore snapshot for free.
 */

export type AskSuggestionKind =
    | 'latest'      // the newest ready card
    | 'week'        // catch-up on this week's saves
    | 'concept'     // a concept shared by 2+ cards (knowledge-graph flavored)
    | 'category'    // takeaways from a top category
    | 'rediscover'  // an old never-opened card
    | 'recap';      // generic fallback

export interface AskSuggestion {
    text: string;
    kind: AskSuggestionKind;
    /** Stable identity for chip animations — changes when the underlying card
     *  changes, so a fresh save visibly re-enters. */
    key: string;
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function toMs(createdAt: number | string | undefined): number {
    if (typeof createdAt === 'number') return createdAt;
    if (typeof createdAt === 'string') {
        const t = Date.parse(createdAt);
        return Number.isFinite(t) ? t : 0;
    }
    return 0;
}

/** Cards that are fully analyzed (skip in-flight and failed captures). */
function readyLinks(links: Link[]): Link[] {
    return links.filter(l => l.status !== 'processing' && l.status !== 'failed');
}

/** A title short enough to sit inside a chip; null if unusable. */
function chipTitle(raw: string | undefined, max = 46): string | null {
    const t = raw?.trim().replace(/\s+/g, ' ');
    if (!t || t.toLowerCase() === 'untitled') return null;
    return t.length > max ? `${t.slice(0, max).trimEnd()}…` : t;
}

/** The newest ready card with a usable title, or null. */
export function newestReadyLink(links: Link[]): Link | null {
    let best: Link | null = null;
    let bestTs = -1;
    for (const l of readyLinks(links)) {
        if (!chipTitle(l.title)) continue;
        const ts = toMs(l.createdAt);
        if (ts > bestTs) { best = l; bestTs = ts; }
    }
    return best;
}

/** Rotate `arr` so it starts at index `salt % length` (no-op when short). */
function rotate<T>(arr: T[], salt: number): T[] {
    if (arr.length < 2) return arr;
    const start = ((salt % arr.length) + arr.length) % arr.length;
    return [...arr.slice(start), ...arr.slice(0, start)];
}

/**
 * Build up to 4 suggestion chips from the live library. `salt` rotates the
 * mix and the phrasing — bump it for a fresh set ("More ideas").
 */
export function buildAskSuggestions(links: Link[], salt: number): AskSuggestion[] {
    const ready = readyLinks(links);
    if (ready.length === 0) return [];
    const now = Date.now();

    // ── Latest save — always first, keyed by card id so a new save animates in.
    const latest = newestReadyLink(links);
    const latestChips: AskSuggestion[] = [];
    if (latest) {
        const t = chipTitle(latest.title)!;
        const phrasings = [
            `What's the gist of "${t}"?`,
            `Give me the key points from "${t}"`,
            `Why is "${t}" worth my time?`,
        ];
        latestChips.push({
            text: rotate(phrasings, salt)[0],
            kind: 'latest',
            key: `latest:${latest.id}`,
        });
    }

    // ── The rotating pool the remaining 3 slots draw from ────────────────────
    const pool: AskSuggestion[] = [];

    // This week's activity (only when there's enough to be worth a catch-up).
    const weekCount = ready.filter(l => now - toMs(l.createdAt) < WEEK_MS).length;
    if (weekCount >= 3) {
        pool.push({
            text: `Catch me up on the ${weekCount} things I saved this week`,
            kind: 'week',
            key: `week:${weekCount}`,
        });
    }

    // A concept that recurs across cards — the knowledge-graph angle.
    const conceptCounts = new Map<string, { label: string; count: number }>();
    for (const l of ready) {
        for (const c of new Set((l.concepts ?? []).map(x => x.trim()).filter(Boolean))) {
            const k = c.toLowerCase();
            const cur = conceptCounts.get(k);
            if (cur) cur.count += 1;
            else conceptCounts.set(k, { label: c, count: 1 });
        }
    }
    const sharedConcepts = [...conceptCounts.values()]
        .filter(c => c.count >= 2)
        .sort((a, b) => b.count - a.count)
        .slice(0, 6);
    if (sharedConcepts.length > 0) {
        const pick = rotate(sharedConcepts, salt)[0];
        const phrasings = [
            `Connect the dots across my saves about ${pick.label}`,
            `What do my saves say about ${pick.label}?`,
        ];
        pool.push({
            text: rotate(phrasings, salt)[0],
            kind: 'concept',
            key: `concept:${pick.label}`,
        });
    }

    // Top categories (most-saved first), rotated so shuffle surfaces new ones.
    const catCounts = new Map<string, number>();
    for (const l of ready) {
        const c = l.category?.trim();
        if (c) catCounts.set(c, (catCounts.get(c) ?? 0) + 1);
    }
    const cats = [...catCounts.entries()]
        .filter(([, n]) => n >= 2)
        .sort((a, b) => b[1] - a[1])
        .map(([c]) => c)
        .slice(0, 5);
    rotate(cats, salt).slice(0, 2).forEach((cat, i) => {
        const phrasings = i === 0
            ? [`What are the key takeaways from my ${cat} saves?`, `Summarize what I've saved on ${cat}`]
            : [`What's the latest I saved about ${cat}?`, `Anything surprising in my ${cat} saves?`];
        pool.push({
            text: rotate(phrasings, salt)[0],
            kind: 'category',
            key: `category:${cat}`,
        });
    });

    // Rediscovery: the dustiest card that was never opened.
    const dusty = ready
        .filter(l => !l.isRead && !l.lastViewedAt && chipTitle(l.title) && now - toMs(l.createdAt) > WEEK_MS)
        .sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt))[0];
    if (dusty) {
        const t = chipTitle(dusty.title)!;
        pool.push({
            text: `I saved "${t}" a while back — what was it about?`,
            kind: 'rediscover',
            key: `rediscover:${dusty.id}`,
        });
    }

    // Generic fallback so there are always chips, even in a tiny library.
    pool.push({
        text: 'Give me a quick recap of my recent saves',
        kind: 'recap',
        key: 'recap',
    });

    return [...latestChips, ...rotate(pool, salt).slice(0, 4 - latestChips.length)];
}

// ── Follow-up chips (shown under a completed answer) ─────────────────────────

const FOLLOW_UPS = [
    'Give me the practical takeaways',
    'Condense that into 3 bullets',
    'What else have I saved on this topic?',
    'Turn this into action items',
    'How does this connect to my other saves?',
    "Explain it like I'm new to this",
];

/** Three one-tap follow-ups, rotated by `salt` so each turn feels fresh. */
export function buildFollowUps(salt: number): string[] {
    return rotate(FOLLOW_UPS, salt).slice(0, 3);
}
