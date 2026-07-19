import { AskHints, Link } from './types';

export type { AskHints } from './types';

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

// AskHints (re-exported above, defined in types.ts so ChatMessage can carry
// it): the structured intent a chip sends ALONGSIDE its prose question.
// Chips are machine-generated from provable library facts — the anchor card,
// the category, the concept, a recency window, the cards a "what else" must
// exclude. Sending only the prose forced the backend to re-infer that intent
// from text and sometimes lose it (the "what else did I save on X?" chip
// re-presenting the very card just discussed). Hints make the chip's contract
// explicit; the backend sanitizes and honors them, and free-typed questions
// simply don't carry any.

/** A full stored title, trimmed to the backend's hint cap (code-point safe). */
function hintTitle(raw: string | undefined): string | null {
    const t = raw?.trim().replace(/\s+/g, ' ');
    return t && t.toLowerCase() !== 'untitled' ? [...t].slice(0, 120).join('') : null;
}

export interface AskSuggestion {
    /** What the chip DISPLAYS (titles ellipsized to fit the pill). */
    text: string;
    /** What is SENT when tapped — same phrasing with the FULL title (bubbles
     *  have room; sent questions never truncate). Falls back to `text`. */
    question?: string;
    kind: AskSuggestionKind;
    /** Stable identity for chip animations — changes when the underlying card
     *  changes, so a fresh save visibly re-enters. */
    key: string;
    /** Structured intent sent with the question (see AskHints). */
    hints?: AskHints;
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

/** A title short enough to sit inside a chip; null if unusable.
 *  - Inner double quotes become apostrophes: chips QUOTE the title, and a
 *    title's own quotes broke quote-span parsing everywhere downstream
 *    (family dedup, intent grouping, backend anchor extraction).
 *  - Truncation is code-POINT safe (Array.from), so a cut can't split an
 *    emoji surrogate pair into a lone "�". */
export function chipTitle(raw: string | undefined, max = 46): string | null {
    const t = raw?.trim().replace(/\s+/g, ' ').replace(/["“”«»]/g, '’');
    if (!t || t.toLowerCase() === 'untitled') return null;
    const chars = [...t];
    return chars.length > max ? `${chars.slice(0, max).join('').trimEnd()}…` : t;
}

/** The card's FULL title for a SENT question — bubbles have room, so sent
 *  questions never truncate a title (owner rule, 2026-07-19); only the
 *  compact chip pills use chipTitle's ellipsis. Same quote/whitespace
 *  normalization so quote-span parsing stays intact everywhere. */
export function fullTitle(raw: string | undefined): string | null {
    const t = raw?.trim().replace(/\s+/g, ' ').replace(/["“”«»]/g, '’');
    return t && t.toLowerCase() !== 'untitled' ? t : null;
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
        // iso(): bidi-isolate the embedded title so a Hebrew title inside an
        // English chip/bubble renders as one intact run (defined below).
        // Display uses the ellipsized title (pill space); the SENT question
        // carries the full title (bubbles have room — no truncation).
        const phrasings = (t: string) => [
            `What's the gist of "${t}"?`,
            `Key points from "${t}"`,
            `Why is "${t}" worth my time?`,
        ];
        latestChips.push({
            text: rotate(phrasings(iso(chipTitle(latest.title)!)), salt)[0],
            question: rotate(phrasings(iso(fullTitle(latest.title)!)), salt)[0],
            kind: 'latest',
            key: `latest:${latest.id}`,
            hints: { anchorTitles: [hintTitle(latest.title)!] },
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
            hints: { recency: true },
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
            hints: { concept: pick.label },
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
            // The exact stored category string — the backend fetches that
            // category's newest cards directly instead of hoping semantic
            // retrieval lands on them.
            hints: { category: cat },
        });
    });

    // Rediscovery: the dustiest card that was never opened — but never the
    // same card as the latest-save chip (a tiny/stale library can make the
    // newest card also the dustiest, yielding two chips about one card).
    const dusty = ready
        .filter(l => l.id !== latest?.id && !l.isRead && !l.lastViewedAt && chipTitle(l.title) && now - toMs(l.createdAt) > WEEK_MS)
        .sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt))[0];
    if (dusty) {
        pool.push({
            text: `What was "${iso(chipTitle(dusty.title)!)}" about again?`,
            question: `What was "${iso(fullTitle(dusty.title)!)}" about again?`,
            kind: 'rediscover',
            key: `rediscover:${dusty.id}`,
            hints: { anchorTitles: [hintTitle(dusty.title)!] },
        });
    }

    // Generic fallback so there are always chips, even in a tiny library —
    // but never NEXT TO the week chip: both are the same recency ask, and a
    // salt rotation could seat them side by side.
    if (weekCount < 3) {
        pool.push({
            text: 'Recap my recent saves',
            kind: 'recap',
            key: 'recap',
            hints: { recency: true },
        });
    }

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
    recipe?: { ingredients?: string[]; instructions?: string[] } | null;
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
    /** Structured recipe data with actual step-by-step instructions. */
    hasSteps: boolean;
    /** A substantial stored long-form analysis (not just the short summary). */
    hasDetail: boolean;
}

function gatherEvidence(cards: ClassifiableCard[]): Evidence {
    return {
        hasIngredients: cards.some(c => !!c.recipe?.ingredients?.length),
        hasSteps: cards.some(c => !!c.recipe?.instructions?.length),
        hasDetail: cards.some(c => (c.detailedSummary?.trim().length ?? 0) >= 200),
    };
}

/** A follow-up chip: `label` is the short text on the chip; `question` is what
 *  is ACTUALLY sent. They differ on purpose — see SELF-CONTAINED RULE below. */
export interface FollowUpChip {
    label: string;
    question: string;
    /** Structured intent sent with the question (see AskHints). */
    hints?: AskHints;
}

/** Wrap an embedded title in Unicode first-strong isolates (FSI…PDI) so a
 *  Hebrew title inside an English question (or vice versa) renders as one
 *  intact run instead of scrambling the surrounding quotes/punctuation.
 *  Invisible; the backend's quote-extraction and tokenization both strip
 *  non-word characters, so retrieval is unaffected. */
export function iso(s: string): string {
    return `\u2068${s}\u2069`;
}

/** The most-related PAIR of cited cards: two cards that provably share a
 *  concept or tag. This is the only license for a "Compare these" chip — a
 *  multi-card answer (e.g. a weekly recap) cites cards from unrelated domains,
 *  and comparing two arbitrary ones ("a blood-gas report vs. a Messi opinion
 *  piece") is a chip with negative value. Returns the pair plus the shared
 *  label (shortest, for chip copy), or null when no pair shares anything. */
function findRelatedPair(cards: ClassifiableCard[]):
    { a: ClassifiableCard; b: ClassifiableCard; shared: string } | null {
    const bags = cards.map(c => {
        const bag = new Map<string, string>();
        for (const raw of [...(c.concepts ?? []), ...(c.tags ?? [])]) {
            const label = raw?.trim().replace(/\s+/g, ' ');
            if (label) bag.set(label.toLowerCase(), label);
        }
        return bag;
    });
    let best: { a: ClassifiableCard; b: ClassifiableCard; shared: string } | null = null;
    let bestCount = 0;
    for (let i = 0; i < cards.length; i++) {
        for (let j = i + 1; j < cards.length; j++) {
            if (cards[i].id === cards[j].id) continue;
            let count = 0;
            let shared: string | null = null;
            for (const [key, label] of bags[i]) {
                if (!bags[j].has(key)) continue;
                count += 1;
                // Prefer a display-cased label (concepts are Title Case, tags
                // are lowercase — "Compare the messi saves" read as sloppy);
                // among equals, shorter wins for chip compactness.
                const better = !shared
                    || (/^\p{Lu}/u.test(label) && !/^\p{Lu}/u.test(shared))
                    || (/^\p{Lu}/u.test(label) === /^\p{Lu}/u.test(shared) && label.length < shared.length);
                if (better) shared = label;
            }
            if (count > bestCount && shared) {
                best = { a: cards[i], b: cards[j], shared };
                bestCount = count;
            }
        }
    }
    return best;
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

/** The template chips for an angle, each gated on evidence the ANCHOR cards
 *  actually carry and anchored to the cited title `t` (bidi-isolated in the
 *  sent question). Everything here restates or reframes STORED content —
 *  nothing asks for material that might not exist. */
function angleChips(angle: ContentAngle, ev: Evidence, t: string): FollowUpChip[] {
    const q = iso(t);
    const keyPoints = { label: 'Give me the key points', question: `Give me the key points of "${q}"` };
    const simpler = { label: 'Explain it more simply', question: `Explain "${q}" more simply` };
    const whyMatters = { label: 'Why does this matter?', question: `Why does "${q}" matter?` };
    switch (angle) {
        case 'recipe':
            return [
                ...(ev.hasIngredients ? [{ label: 'What ingredients do I need?', question: `What ingredients do I need for "${q}"?` }] : []),
                // Steps require actual stored instructions (or a long-form
                // Detail section that carries the method) — ingredients alone
                // can't back a walkthrough, so they don't license this chip.
                ...(ev.hasSteps || ev.hasDetail ? [{ label: 'Walk me through the steps', question: `Walk me through the steps in "${q}"` }] : []),
                keyPoints,
            ];
        case 'news':
            // News / opinion / politics: restate and interpret the saved piece —
            // never debate prompts ("counterargument") the card can't answer.
            return [{ label: "What's the main argument?", question: `What's the main argument in "${q}"?` }, whyMatters];
        case 'howto':
            return [
                ...(ev.hasDetail ? [{ label: 'Summarize the steps', question: `Summarize the steps in "${q}"` }] : []),
                keyPoints,
                simpler,
            ];
        case 'research':
            return [{ label: 'What are the key findings?', question: `What are the key findings in "${q}"?` }, whyMatters];
        case 'video':
            return [
                { label: 'What are the key takeaways?', question: `What are the key takeaways from "${q}"?` },
                { label: 'Give me the highlights', question: `Give me the highlights of "${q}"` },
            ];
        default:
            return [keyPoints, simpler];
    }
}

// Chips (by label) that deepen/branch the thread (vs. restart it) — floated to
// the front once the conversation has a couple of exchanges behind it.
const DEEPENING_RE = /common thread|compare|what else|why does this matter|more detail|more on/i;

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

// PER-ANCHOR INTENT: an intent is consumed PER CARD, not globally — asking
// for detail on card A must not block ever offering detail on card B in the
// same conversation. The dedup key is therefore `intent:anchoredTitle` when
// the question quotes a title, and the bare intent otherwise (library-wide
// asks like "what else did I save on X?" stay globally consumed). Bidi
// isolate characters are stripped so a chip-built question (isolated titles)
// and a hand-typed one (bare titles) produce the same key.
function chipIntentKey(text: string): string {
    const intent = chipIntent(text);
    const m = (text || '').match(/["“”«»]([^"“”«»]{2,})["“”«»]/);
    if (!m) return intent;
    const anchor = m[1].replace(/[\u2066-\u2069\u200E\u200F]/g, '').trim().toLowerCase();
    return anchor ? `${intent}:${anchor}` : intent;
}

/**
 * Up to 3 content-aware follow-up chips derived from what the answer actually
 * discussed. Every chip is (a) gated on evidence the cited cards verifiably
 * carry (AIRTIGHT RULE) and (b) sent as a question anchored to the cited
 * card's title so retrieval can find it (SELF-CONTAINED RULE). Pure and
 * deterministic (no salt). Returns [] when the answer cited nothing, or when
 * no cited card has a usable title to anchor to — a chip whose retrieval we
 * can't guarantee is a chip we don't show.
 *
 * NO-PADDING RULE (owner, 2026-07-17): the row is NEVER topped up with generic
 * filler to look full. If the gated, intent-fresh set has two chips, show two;
 * one, show one; none, show nothing — even on the first exchange. A chip that
 * doesn't add value is worse than no chip; UI that doesn't help must not
 * appear. (A `safeFallbacks` top-up pool used to pad toward 3 — deliberately
 * removed; do not reintroduce it.)
 */
export function buildFollowUps(ctx: FollowUpContext): FollowUpChip[] {
    const { citedCards, allLinks, askedTexts, exchangeCount } = ctx;
    if (citedCards.length === 0) return [];
    // Cards that can serve as a retrieval anchor (usable title; 60 chars keeps
    // the sent bubble reasonable while giving retrieval plenty to match on).
    const withTitle = citedCards.filter(c => chipTitle(c.title, 60));
    if (withTitle.length === 0) return [];

    const angle = dominantAngle(citedCards);
    // ANCHOR RULE: every angle chip must be anchored to THE ONE card that
    // carries its evidence — never blindly to the first citation, and never
    // licensed by evidence pooled across cards (two recipe cards where only
    // the SECOND has stored steps must not produce "walk me through the steps
    // in <first>"). Pick the angle-matching card with the strongest stored
    // evidence, then gather evidence from that single card only, so a chip is
    // licensed exactly by the card it will ask about.
    const anchorCards = withTitle.filter(c => classifyCard(c) === angle);
    const anchorPool = anchorCards.length > 0 ? anchorCards : withTitle;
    const hasOwnEvidence = (c: ClassifiableCard) =>
        !!c.recipe?.instructions?.length || !!c.recipe?.ingredients?.length ||
        (c.detailedSummary?.trim().length ?? 0) >= 200;
    const anchorCard = anchorPool.find(hasOwnEvidence) ?? anchorPool[0];
    // Sent questions carry the FULL title — no truncation in bubbles.
    const t = fullTitle(anchorCard.title)!;
    const ev = gatherEvidence([anchorCard]);

    const related = findRelatedConcept(citedCards, allLinks);

    // LABEL-CONGRUENCE RULE (owner, 2026-07-19): a chip's label must NAME what
    // it operates on unless the referent is unambiguous. After a multi-card
    // answer, a pronoun label ("Explain it more simply", "Give me the key
    // points") reads as "…the whole answer" while the sent question secretly
    // names ONE card — observed: a 5-card recap's "Explain it more simply"
    // answering about a single Messi card. So pronoun-labeled angle chips are
    // offered ONLY when exactly one card was cited; multi-card rows carry
    // exclusively self-describing labels: the related-pair compare, ONE named
    // "More on <title>" drill-in, and the named concept jump. Drilling in
    // narrows the next answer to one card, where the full angle chips return.
    const multiCard = new Set(withTitle.map(c => c.id)).size >= 2;

    const candidates: FollowUpChip[] = [];
    // Compare/synthesize ONLY a provably related pair (shared concept/tag).
    // A recap answer cites many unrelated cards; comparing two arbitrary ones
    // produces "these cover entirely different domains" — worse than no chip.
    const pair = findRelatedPair(withTitle);
    if (pair) {
        const ta = iso(fullTitle(pair.a.title)!);
        const tb = iso(fullTitle(pair.b.title)!);
        const pairHints: AskHints = {
            anchorTitles: [hintTitle(pair.a.title), hintTitle(pair.b.title)].filter((x): x is string => !!x),
        };
        // Capitalize a lowercase (tag-derived) shared label for the chip copy.
        const sharedLabel = pair.shared.charAt(0).toUpperCase() + pair.shared.slice(1);
        const label = pair.shared.length <= 14 ? `Compare the ${sharedLabel} saves` : 'Compare two related saves';
        candidates.push(
            { label, question: `Compare "${ta}" with "${tb}"`, hints: pairHints },
            { label: "What's the common thread?", question: `What's the common thread between "${ta}" and "${tb}"?`, hints: pairHints },
        );
    }
    if (multiCard) {
        // One NAMED drill-in, anchored to the card that actually carries
        // stored depth — the natural next step after a recap.
        const drill = anchorPool.find(hasOwnEvidence) ?? withTitle.find(hasOwnEvidence);
        if (drill) {
            candidates.push({
                label: `More on "${iso(chipTitle(drill.title, 24)!)}"`,
                question: `Give me more detail on "${iso(fullTitle(drill.title)!)}"`,
                hints: hintTitle(drill.title) ? { anchorTitles: [hintTitle(drill.title)!] } : undefined,
            });
        }
    } else {
        const anchorHints: AskHints | undefined = hintTitle(anchorCard.title)
            ? { anchorTitles: [hintTitle(anchorCard.title)!] }
            : undefined;
        candidates.push(...angleChips(angle, ev, t).map(c => ({ ...c, hints: anchorHints })));
        // Depth is a guaranteed win when the card carries a stored long-form
        // analysis.
        if (ev.hasDetail) {
            candidates.push({
                label: 'Give me more detail',
                question: `Give me more detail on "${iso(t)}"`,
                hints: anchorHints,
            });
        }
    }
    // A concept that PROVABLY recurs on other cards → the knowledge-graph jump.
    // "Else" is a CONTRACT: the already-cited cards are sent as exclusions so
    // the backend demotes them and the model presents genuinely OTHER sources
    // (re-presenting the just-discussed card here was an observed, real bug).
    if (related) {
        candidates.push({
            label: `What else did I save on ${related}?`,
            question: `What else did I save on ${related}?`,
            hints: {
                concept: related,
                // Up to 8 (matches the backend hint cap) — capping at fewer
                // than the citations lets a just-discussed card slip back in
                // on exactly the multi-citation answers this chip appears on.
                excludeTitles: withTitle
                    .map(c => hintTitle(c.title))
                    .filter((x): x is string => !!x)
                    .slice(0, 8),
            },
        });
    }

    // Dedupe by template family (NO-REPEAT RULE) and by PER-ANCHOR intent key
    // (INTENT RULE, scoped: see chipIntentKey — detail-on-A must not consume
    // detail-on-B) — and drop anything whose family or intent key was already
    // asked this conversation. Both come from the persisted user messages, so
    // the rules survive reloads and re-anchoring.
    const asked = new Set(askedTexts.map(chipFamily));
    const askedIntentKeys = new Set(askedTexts.map(chipIntentKey));
    const seen = new Set<string>();
    const seenIntentKeys = new Set<string>();
    const admit = (c: FollowUpChip): boolean => {
        const qf = chipFamily(c.question);
        const lf = chipFamily(c.label);
        const key = chipIntentKey(c.question);
        if (seen.has(qf) || seen.has(lf) || asked.has(qf) || asked.has(lf)) return false;
        if (seenIntentKeys.has(key) || askedIntentKeys.has(key)) return false;
        seen.add(qf);
        seen.add(lf);
        seenIntentKeys.add(key);
        return true;
    };
    let chips = candidates.filter(admit);

    // Deeper into the thread, prefer deepening/branching over restart-y chips.
    if (exchangeCount >= 2) {
        chips = [...chips.filter(c => DEEPENING_RE.test(c.label)), ...chips.filter(c => !DEEPENING_RE.test(c.label))];
    }

    // NO-PADDING RULE: no top-up. Whatever survived the gates is the row.
    return chips.slice(0, 3);
}
