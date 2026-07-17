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
            `Key points from "${t}"`,
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
    // Count-free by design: the client's "this week" tally never matches what the
    // RAG retrieval actually pulls server-side, so a number here reads as a broken
    // promise. The threshold still gates on the real count; only the copy is mute.
    const weekCount = ready.filter(l => now - toMs(l.createdAt) < WEEK_MS).length;
    if (weekCount >= 3) {
        const phrasings = [
            `Catch me up on this week's saves`,
            `What did I save this week?`,
        ];
        pool.push({
            text: rotate(phrasings, salt)[0],
            kind: 'week',
            key: 'week',
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
            `Connect my saves on ${pick.label}`,
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
            ? [`Key takeaways from my ${cat} saves`, `Summarize what I saved on ${cat}`]
            : [`What's my latest ${cat} save about?`, `Anything surprising in my ${cat} saves?`];
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
            text: `What was "${t}" about again?`,
            kind: 'rediscover',
            key: `rediscover:${dusty.id}`,
        });
    }

    // Generic fallback so there are always chips, even in a tiny library.
    pool.push({
        text: 'Recap my recent saves',
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
// on anything but a recipe.
//
// AIRTIGHT RULE (the whole point of this section): the backend is strictly
// grounded — it answers only from retrieved card content and refuses when the
// material isn't there. So every chip we offer must be answerable from data we
// can VERIFY client-side on the cited cards (their stored summary /
// detailedSummary / recipe fields), or from library facts we've already
// counted (a concept that provably recurs, 2+ cited cards to compare).
// Speculative asks — "What's the counterargument?", "How solid is the
// evidence?", "Was it worth watching?" — are banned: they demand material the
// card usually doesn't contain, and the grounded backend answers "there's
// nothing on that", which reads as a broken product. A chip we can't
// guarantee is a chip we don't show; fewer, reliable chips beat clever ones.

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
    /** Long-form stored analysis — its presence is what licenses depth chips
     *  ("Give me more detail", "Summarize the steps"). */
    detailedSummary?: string;
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

/** What the cited cards can PROVABLY support — read straight off their stored
 *  fields, so every gated chip is answerable by the grounded backend. */
interface Evidence {
    /** Structured recipe data with actual ingredients. */
    hasIngredients: boolean;
    /** A substantial stored long-form analysis (not just the short summary). */
    hasDetail: boolean;
}

function gatherEvidence(cards: ClassifiableCard[]): Evidence {
    return {
        hasIngredients: cards.some(c => !!c.recipe?.ingredients?.length),
        hasDetail: cards.some(c => (c.detailedSummary?.trim().length ?? 0) >= 200),
    };
}

/** A follow-up chip: `label` is the short text on the chip; `question` is what
 *  is ACTUALLY sent. They differ on purpose — see SELF-CONTAINED RULE below. */
export interface FollowUpChip {
    label: string;
    question: string;
}

// SELF-CONTAINED RULE (the second half of airtight): the backend retrieves by
// the QUESTION TEXT alone — it does not resolve "this"/"it" from chat history
// into a retrieval query. A bare "Give me more detail" contains nothing to
// search with, retrieval comes back empty, and the grounded backend refuses —
// even though the card is right there in the thread. So every follow-up's
// sent question must carry the cited card's TITLE (the same reason the
// title-bearing home chips always work). The chip shows the short label; the
// sent bubble shows the full anchored question, which also reads clearer in
// the transcript.

/** The template chips for an angle, each gated on evidence the cited cards
 *  actually carry and anchored to the cited title `t`. Everything here
 *  restates or reframes STORED content — nothing asks for material that
 *  might not exist. */
function angleChips(angle: ContentAngle, ev: Evidence, t: string): FollowUpChip[] {
    const keyPoints = { label: 'Give me the key points', question: `Give me the key points of "${t}"` };
    const simpler = { label: 'Explain it more simply', question: `Explain "${t}" more simply` };
    const whyMatters = { label: 'Why does this matter?', question: `Why does "${t}" matter?` };
    switch (angle) {
        case 'recipe':
            return [
                ...(ev.hasIngredients ? [{ label: 'What ingredients do I need?', question: `What ingredients do I need for "${t}"?` }] : []),
                ...(ev.hasIngredients || ev.hasDetail ? [{ label: 'Walk me through the steps', question: `Walk me through the steps in "${t}"` }] : []),
                keyPoints,
            ];
        case 'news':
            // News / opinion / politics: restate and interpret the saved piece —
            // never debate prompts ("counterargument") the card can't answer.
            return [{ label: "What's the main argument?", question: `What's the main argument in "${t}"?` }, whyMatters];
        case 'howto':
            return [
                ...(ev.hasDetail ? [{ label: 'Summarize the steps', question: `Summarize the steps in "${t}"` }] : []),
                keyPoints,
                simpler,
            ];
        case 'research':
            return [{ label: 'What are the key findings?', question: `What are the key findings in "${t}"?` }, whyMatters];
        case 'video':
            return [
                { label: 'What are the key takeaways?', question: `What are the key takeaways from "${t}"?` },
                { label: 'Give me the highlights', question: `Give me the highlights of "${t}"` },
            ];
        default:
            return [keyPoints, simpler];
    }
}

// Chips (by label) that deepen/branch the thread (vs. restart it) — floated to
// the front once the conversation has a couple of exchanges behind it.
const DEEPENING_RE = /common thread|compare|what else|why does this matter|more detail/i;

// NO-REPEAT RULE: a chip the user has used must never be offered again in the
// same conversation — even when the regenerated question isn't byte-identical.
// Anchored questions embed cited-card TITLES, and the anchor comes from the
// latest answer's citations; citation order routinely flips between turns, so
// `Common thread between "A" and "B"` comes back as `…"B" and "A"` and exact-
// string dedup misses it (the chip visibly repeats). Identity is therefore the
// chip's template FAMILY: the question with its quoted titles removed. Two
// chips that differ only in which card they're anchored to (or the order of
// two titles) share a family — same visible label, so re-offering it reads as
// a repeat regardless of anchor.
function chipFamily(text: string): string {
    return text
        .toLowerCase()
        .replace(/["“”«»].*?["“”«»]/g, ' ')  // drop quoted titles (any quote style)
        .replace(/[^\p{L}\p{N}\s]/gu, ' ')   // punctuation-insensitive
        .replace(/\s+/g, ' ')
        .trim();
}

// INTENT RULE (one step above family): several templates are the SAME ask in
// different words — "key points", "key takeaways", "highlights", "sum it up"
// all mean "restate the answer". Family dedup sees distinct templates, so a
// row could offer three of them at once (observed: video angle's takeaways +
// highlights + the key-points fallback), and the next turn could offer yet
// another synonym of something already tapped. Intent identity fixes both:
//   - a single offered row holds at most ONE chip per intent;
//   - an intent the user already asked this conversation is consumed — no
//     synonym of it is offered again (mirrors the family NO-REPEAT RULE).
// Patterns run against chipFamily(text) (lowercased, titles stripped). Order
// matters: specific intents (steps/ingredients) before the broad restate
// catch-all. Unmatched text is its own intent — free-typed questions never
// accidentally consume a group.
const INTENT_PATTERNS: Array<[RegExp, string]> = [
    [/more detail|go deeper|tell me more/, 'expand'],
    [/ingredient/, 'ingredients'],
    [/steps/, 'steps'],
    [/compare|common thread/, 'synthesis'],
    [/what else did i save/, 'graph'],
    [/simpl/, 'simplify'],
    [/matter|important/, 'significance'],
    [/key points|takeaway|highlight|sum up|sum it up|one line|remember|main argument|key finding|gist|summar/, 'restate'],
];
function chipIntent(text: string): string {
    const f = chipFamily(text);
    for (const [re, intent] of INTENT_PATTERNS) {
        if (re.test(f)) return intent;
    }
    return f;
}

// Always-answerable top-ups (pure restatements of stored content, anchored to
// the cited title) used only when the gated angle set comes up short. Deep in
// a conversation most families are already consumed, so this pool carries a
// few extra restatement angles to keep fresh chips flowing.
function safeFallbacks(t: string): FollowUpChip[] {
    return [
        { label: 'Give me the key points', question: `Give me the key points of "${t}"` },
        { label: 'Explain it more simply', question: `Explain "${t}" more simply` },
        { label: 'Why does this matter?', question: `Why does "${t}" matter?` },
        { label: 'Sum it up in one line', question: `Sum up "${t}" in one line` },
        { label: 'What should I remember?', question: `What should I remember from "${t}"?` },
    ];
}

/**
 * Up to 3 content-aware follow-up chips derived from what the answer actually
 * discussed. Every chip is (a) gated on evidence the cited cards verifiably
 * carry (AIRTIGHT RULE) and (b) sent as a question anchored to the cited
 * card's title so retrieval can find it (SELF-CONTAINED RULE). Pure and
 * deterministic (no salt). Returns [] when the answer cited nothing, or when
 * no cited card has a usable title to anchor to — a chip whose retrieval we
 * can't guarantee is a chip we don't show.
 */
export function buildFollowUps(ctx: FollowUpContext): FollowUpChip[] {
    const { citedCards, allLinks, askedTexts, exchangeCount } = ctx;
    if (citedCards.length === 0) return [];
    // The anchor: the first cited card with a usable title (60 chars keeps the
    // sent bubble reasonable while giving retrieval plenty to match on).
    const titles = citedCards
        .map(c => chipTitle(c.title, 60))
        .filter((x): x is string => !!x);
    if (titles.length === 0) return [];
    const t = titles[0];

    const angle = dominantAngle(citedCards);
    const related = findRelatedConcept(citedCards, allLinks);
    const multiCard = new Set(citedCards.map(c => c.id)).size >= 2;
    const ev = gatherEvidence(citedCards);

    const candidates: FollowUpChip[] = [];
    // Multiple cited cards → pulling them together is grounded by definition;
    // both titles ride along so retrieval can find both cards.
    if (multiCard && titles.length >= 2) {
        candidates.push(
            { label: 'Compare these', question: `Compare "${titles[0]}" with "${titles[1]}"` },
            { label: "What's the common thread?", question: `What's the common thread between "${titles[0]}" and "${titles[1]}"?` },
        );
    }
    candidates.push(...angleChips(angle, ev, t));
    // A stored long-form analysis exists → depth is a guaranteed win.
    if (ev.hasDetail) candidates.push({ label: 'Give me more detail', question: `Give me more detail on "${t}"` });
    // A concept that PROVABLY recurs on other cards → the knowledge-graph jump
    // (already self-contained — the concept is the retrieval anchor).
    if (related) {
        candidates.push({ label: `What else did I save on ${related}?`, question: `What else did I save on ${related}?` });
    }

    // Dedupe by template family (NO-REPEAT RULE) and by intent group (INTENT
    // RULE) — and drop anything whose family OR intent was already asked this
    // conversation. Both come from the persisted user messages, so the rules
    // survive reloads and re-anchoring.
    const asked = new Set(askedTexts.map(chipFamily));
    const askedIntents = new Set(askedTexts.map(chipIntent));
    const seen = new Set<string>();
    const seenIntents = new Set<string>();
    const admit = (c: FollowUpChip): boolean => {
        const qf = chipFamily(c.question);
        const lf = chipFamily(c.label);
        const intent = chipIntent(c.label);
        if (seen.has(qf) || seen.has(lf) || asked.has(qf) || asked.has(lf)) return false;
        if (seenIntents.has(intent) || askedIntents.has(intent)) return false;
        seen.add(qf);
        seen.add(lf);
        seenIntents.add(intent);
        return true;
    };
    let chips = candidates.filter(admit);

    // Deeper into the thread, prefer deepening/branching over restart-y chips.
    if (exchangeCount >= 2) {
        chips = [...chips.filter(c => DEEPENING_RE.test(c.label)), ...chips.filter(c => !DEEPENING_RE.test(c.label))];
    }

    // Top up toward 3 without repeating any family OR intent used/shown.
    if (chips.length < 3) {
        for (const f of safeFallbacks(t)) {
            if (chips.length >= 3) break;
            if (admit(f)) chips.push(f);
        }
    }
    return chips.slice(0, 3);
}
