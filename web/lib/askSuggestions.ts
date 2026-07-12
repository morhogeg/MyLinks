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
//
// These must be about what was ACTUALLY discussed — the card(s) the answer was
// grounded in — not a generic rotating pool. "Give me an action item" is wrong
// on a tweet about political corruption; "What ingredients do I need?" is wrong
// on anything but a recipe. So we classify the cited card(s) into a content
// ANGLE and draw the chips from that angle's template set, mixing in
// conversation state (what was already asked, how deep we are) and a
// knowledge-graph nudge when the topic recurs across the library.

/** The content "angle" of the card(s) an answer was grounded in. Topical angles
 *  win over the medium — a political *video* is `news` (→ "What's the
 *  counterargument?"), never `video` (→ "key takeaways") — so we never offer an
 *  action-oriented chip on op-ed / news / politics content that has no such angle. */
export type ContentAngle = 'recipe' | 'news' | 'howto' | 'research' | 'video' | 'general';

/** The minimal card shape the classifier reads. A `Link` satisfies it directly;
 *  a citation chip (`ChatSource`, which only carries id/title/category) can be
 *  adapted to it, so a deleted-but-cited card still classifies by its category. */
export interface ClassifiableCard {
    id: string;
    title?: string;
    category?: string;
    tags?: string[];
    concepts?: string[];
    summary?: string;
    sourceType?: string;
    recipe?: { ingredients?: string[] } | null;
    metadata?: { videoId?: string } | null;
}

export interface FollowUpContext {
    /** The cards the latest answer was grounded in (its citations, resolved to
     *  full library cards where possible). Empty → general chips. */
    citedCards: ClassifiableCard[];
    /** The whole library — powers the "what else have I saved on X?" nudge. */
    allLinks: Link[];
    /** Every question the user has asked or chip they've tapped this session, so
     *  we never re-offer one they've used. */
    askedTexts: string[];
    /** Completed answers so far — after a couple we prefer deepening/branching
     *  chips over restart-y ones. */
    exchangeCount: number;
}

// Signal keywords. `strong` text (category/tags/concepts/title) is matched for
// medium-defining angles; `news`/`research` also scan the summary since the
// topic often only shows there.
const NEWS_RE = /\b(politic|election|govern|policy|policies|congress|senate|parliament|president|minister|geopolit|corrupt|scandal|protest|activis|war|conflict|opinion|editorial|op-?ed|news|journalis|current affairs|breaking|democrac|dictator|immigration|regulation|lawmaker|campaign|voter)\b/;
const HOWTO_RE = /\b(tutorial|how-?to|guide|walkthrough|step-?by-?step|setup|set up|install|configur|framework|library|sdk|api|tooling|toolkit|software|plugin|productivity|workflow|tips|tricks|cheat ?sheet|getting started|build a|building)\b/;
const RECIPE_RE = /\b(recipe|recipes|cooking|baking|ingredient|dish|meal|cuisine|dinner|breakfast|lunch|dessert)\b/;
const RESEARCH_RE = /\b(research|study|studies|paper|academic|scientific|findings|experiment|clinical|journal|hypothesis|dataset|meta-analysis)\b/;

/** Classify a single card into its dominant content angle. */
export function classifyCard(card: ClassifiableCard): ContentAngle {
    const strong = [card.category, ...(card.tags ?? []), ...(card.concepts ?? []), card.title]
        .filter(Boolean).join(' ').toLowerCase();
    const hay = `${strong} ${(card.summary ?? '').toLowerCase()}`;
    const hasRecipeData = !!card.recipe?.ingredients?.length;
    const isVideo = card.sourceType === 'youtube' || !!card.metadata?.videoId;

    if (hasRecipeData || RECIPE_RE.test(strong)) return 'recipe';
    if (NEWS_RE.test(hay)) return 'news';       // topical — beats the medium
    if (HOWTO_RE.test(strong)) return 'howto';
    if (RESEARCH_RE.test(hay)) return 'research';
    if (isVideo) return 'video';                // medium — only when no topic won
    return 'general';
}

// Angle precedence when cited cards disagree (also breaks count ties).
const ANGLE_PRIORITY: ContentAngle[] = ['recipe', 'news', 'howto', 'research', 'video', 'general'];

/** The dominant angle across the cited cards (most common, ties by precedence). */
function dominantAngle(cards: ClassifiableCard[]): ContentAngle {
    const counts = new Map<ContentAngle, number>();
    for (const c of cards) {
        const a = classifyCard(c);
        counts.set(a, (counts.get(a) ?? 0) + 1);
    }
    let best: ContentAngle = 'general';
    let bestCount = -1;
    for (const a of ANGLE_PRIORITY) {
        const n = counts.get(a) ?? 0;
        if (n > bestCount) { best = a; bestCount = n; }
    }
    return best;
}

/** A concept/tag on the cited card(s) that also appears on OTHER library cards —
 *  the hook for a "what else have I saved on X?" chip. Short labels only, so the
 *  chip stays compact. Returns the display label, or null. */
function findRelatedConcept(cards: ClassifiableCard[], allLinks: Link[]): string | null {
    const citedIds = new Set(cards.map(c => c.id));
    const own = new Map<string, string>(); // lowercased key → display label
    for (const c of cards) {
        for (const raw of [...(c.concepts ?? []), ...(c.tags ?? [])]) {
            const label = raw?.trim().replace(/\s+/g, ' ');
            if (label && label.length <= 14) own.set(label.toLowerCase(), label);
        }
    }
    if (own.size === 0) return null;
    const others = readyLinks(allLinks).filter(l => !citedIds.has(l.id));
    let best: string | null = null;
    let bestCount = 0;
    for (const [key, label] of own) {
        let count = 0;
        for (const l of others) {
            const bag = new Set([...(l.concepts ?? []), ...(l.tags ?? [])].map(x => x.trim().toLowerCase()));
            if (bag.has(key)) count += 1;
        }
        if (count > bestCount) { best = label; bestCount = count; }
    }
    return bestCount > 0 ? best : null;
}

/** The template chips for an angle (before conversation-state adjustments). */
function angleChips(angle: ContentAngle): string[] {
    switch (angle) {
        case 'recipe':
            return ['What ingredients do I need?', 'Walk me through the steps', 'Can I make this simpler?'];
        case 'news':
            // News / opinion / politics: reflect, contextualize — never "action item".
            return ["What's the counterargument?", "What's the bigger picture?", 'Why does this matter?'];
        case 'howto':
            return ['Summarize the steps', 'What do I need to try this?', "What's the catch?"];
        case 'research':
            return ['What are the key findings?', 'How solid is the evidence?', 'Why does this matter?'];
        case 'video':
            return ['What are the key takeaways?', 'Give me the highlights', 'Was it worth watching?'];
        default:
            return ['Give me the key points', 'How does this fit my other saves?', 'Explain it more simply'];
    }
}

// Chips that deepen/branch the thread (vs. restart it) — floated to the front
// once the conversation has a couple of exchanges behind it.
const DEEPENING_RE = /counter|bigger picture|common thread|compare|what else|fit my|why does this matter|how solid|catch|other side/i;

// Neutral deepening chips used only to top up when the angle set is exhausted.
const GENERIC_DEEPENING = [
    'How does this fit my other saves?',
    'Why does this matter?',
    'What should I look into next?',
];

/**
 * Up to 3 content-aware follow-up chips derived from what the answer actually
 * discussed. Pure and deterministic (no salt) — the variety comes from the
 * content and the conversation, not a shuffle. Short, sentence-case, natural.
 */
export function buildFollowUps(ctx: FollowUpContext): string[] {
    const { citedCards, allLinks, askedTexts, exchangeCount } = ctx;
    const angle = dominantAngle(citedCards);
    const related = findRelatedConcept(citedCards, allLinks);
    const multiCard = new Set(citedCards.map(c => c.id)).size >= 2;

    const candidates: string[] = [];
    // Multiple cited cards → let the user pull them together first.
    if (multiCard) candidates.push('Compare these', "What's the common thread?");
    candidates.push(...angleChips(angle));
    // A recurring topic in the library → offer the knowledge-graph jump.
    if (related) candidates.push(`What else did I save on ${related}?`);

    // Dedupe (case-insensitive) and drop anything already asked/tapped this session.
    const asked = new Set(askedTexts.map(t => t.trim().toLowerCase()));
    const seen = new Set<string>();
    let chips = candidates.filter(c => {
        const k = c.toLowerCase();
        if (seen.has(k) || asked.has(k)) return false;
        seen.add(k);
        return true;
    });

    // Deeper into the thread, prefer deepening/branching over restart-y chips.
    if (exchangeCount >= 2) {
        chips = [...chips.filter(c => DEEPENING_RE.test(c)), ...chips.filter(c => !DEEPENING_RE.test(c))];
    }

    // Top up toward 3 without repeating anything used or already shown.
    if (chips.length < 3) {
        for (const f of GENERIC_DEEPENING) {
            if (chips.length >= 3) break;
            const k = f.toLowerCase();
            if (!seen.has(k) && !asked.has(k)) { chips.push(f); seen.add(k); }
        }
    }
    return chips.slice(0, 3);
}
