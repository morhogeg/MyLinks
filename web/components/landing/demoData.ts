import { LINK_SCAN_STEPS } from '@/lib/scanPhases';

/**
 * The demo library the landing page's scenes are built from.
 *
 * TWO RULES GOVERN THIS FILE, and both have bitten before:
 *
 * 1. **`docs/BRANDING.md` D-3.** The strings "second brain" and "ai" must not
 *    appear on a user-visible surface, and this is the most visible one in the
 *    product. That is why this library is written fresh rather than ported from
 *    the launch film's `src/data/library.ts`: the film's demo week is built
 *    around an AI/what-stays-human trio, so its Ask scene reads "What have I
 *    been saving about AI?". Defensible in the film, where it is a saved TOPIC.
 *    Not here.
 *
 * 2. **Internal consistency is the difference between a demo and a mock-up.**
 *    Every Ask answer is assemblable from the saves it cites, every cited save
 *    is on the shelf, and the graph runs over these same cards. A visitor who
 *    reads an answer and then scans the shelf finds the sources it named.
 *
 * THE LIBRARY ITSELF (rewritten round 7 — owner: "more interesting examples,
 * these are very generic", "remove the notes examples, maybe leave one"): a
 * curious person's month, three real threads —
 *    an April trip to Tokyo   (a forecast, a reel, a documentary, ONE note)
 *    a home-espresso rabbit hole (a technique video, a contrarian thread, a
 *                              review, a screenshot of a shortlist)
 *    weeknight cooking        (two fast recipes and one slow project)
 * plus one save that connects to nothing yet (free-diving) — because real
 * libraries have those, and the graph treats it exactly as the app would.
 * Exactly ONE note-to-self remains, and it earns its place: its date is what
 * two Ask answers hinge on.
 */

/** How a save is displayed. Platform keys match `lib/platform.tsx`; the three
 *  extra kinds cover what has no platform: a plain page, a screenshot, a note
 *  to yourself. */
export type DemoKind = 'instagram' | 'x' | 'youtube' | 'web' | 'shot' | 'note';

export interface DemoCard {
    kind: DemoKind;
    /** Where it came from, as the app's byline would render it. */
    source: string;
    title: string;
    summary: string;
    category: string;
    tags: string[];
}

/* ------------------------------------------------------- act one: the silos */

/** The five places a save disappears into. Counts are illustrative and read as
 *  a life, not a demo: the messages-to-yourself pile is always the biggest.
 *  Offsets are an ELLIPSE, wide and shallow — the scene's copy sits in the
 *  lower third of the stage, so the field stays in the upper half. `vmin` so
 *  the composition reframes with the viewport; `landing.css` scales the whole
 *  field by `--rs` on small screens. */
export const SILOS: {
    kind: DemoKind | 'whatsapp' | 'safari';
    label: string;
    count: number;
    x: string;
    y: string;
}[] = [
    { kind: 'instagram', label: 'Instagram', count: 24, x: '-33vmin', y: '-11vmin' },
    { kind: 'x', label: 'X', count: 32, x: '-3vmin', y: '-19vmin' },
    { kind: 'youtube', label: 'YouTube', count: 15, x: '32vmin', y: '-9vmin' },
    { kind: 'whatsapp', label: 'Messages to self', count: 59, x: '-23vmin', y: '13vmin' },
    { kind: 'safari', label: 'Open tabs', count: 48, x: '25vmin', y: '16vmin' },
];

/* ----------------------------------------------------- act two: the capture */

/**
 * The three capture kinds, each with the pipeline it runs and the card it
 * produces. The scene cycles them itself and the labels are also buttons.
 *
 * `steps` is `LINK_SCAN_STEPS` from `lib/scanPhases.ts` — the REAL pipeline the
 * app runs, the same array the in-app stepper and the share-sheet banner read —
 * with exactly one label swapped per source ("Reading the page" / "Looking at
 * the screenshot" / "Watching the video"), mirroring the hero's own line. If
 * the real pipeline gains or loses a phase, this picks it up automatically.
 */
function stepsFor(readLabel: string): string[] {
    return LINK_SCAN_STEPS.map((s, i) => (i === 1 ? readLabel : s));
}

export interface CaptureSource {
    id: 'link' | 'shot' | 'video';
    tab: string;
    /** What the user shared, as the app would show it mid-capture. */
    handle: string;
    steps: string[];
    card: DemoCard;
}

export const CAPTURE_SOURCES: CaptureSource[] = [
    {
        id: 'link',
        tab: 'A link',
        handle: 'seriouseats.com/one-pan-lemon-chicken',
        steps: stepsFor('Reading the page'),
        card: {
            kind: 'web',
            source: 'seriouseats.com',
            title: 'One-pan lemon chicken with orzo',
            summary:
                'Sheet-pan dinner in 35 minutes: chicken thighs roasted over orzo so the '
                + 'starch takes the pan juices. Needs one tray and no browning step.',
            category: 'Recipes',
            tags: ['weeknight', 'one-pan', '35 min'],
        },
    },
    {
        id: 'shot',
        tab: 'A screenshot',
        handle: 'Screenshot · 4 Aug, 21:14',
        steps: stepsFor('Looking at the screenshot'),
        card: {
            kind: 'shot',
            source: 'Screenshot',
            title: 'Grinder shortlist, two circled',
            summary:
                'Two finalists circled out of a comparison table, prices noted in the '
                + 'margin. The cheaper one is the grinder your saved videos actually use.',
            category: 'Coffee',
            tags: ['espresso', 'gear', 'shortlist'],
        },
    },
    {
        id: 'video',
        tab: 'A video',
        handle: 'youtube.com · Sourdough, no starter',
        steps: stepsFor('Watching the video'),
        card: {
            kind: 'youtube',
            source: 'YouTube · Bake with Jack',
            title: 'Sourdough without a starter, honestly explained',
            summary:
                'Argues the starter is the part people quit on, and substitutes a '
                + 'two-day preferment. Timeline matters more than technique: begin Friday '
                + 'to eat on Sunday.',
            category: 'Cooking',
            tags: ['bread', 'long process', 'weekend'],
        },
    },
];

/* ------------------------------------------------------ act three: the ask */

export interface DemoCitation {
    kind: DemoKind;
    label: string;
}

export interface DemoQuestion {
    q: string;
    a: string;
    citations: DemoCitation[];
}

export const QUESTIONS: DemoQuestion[] = [
    {
        q: 'What did I save about Tokyo?',
        a: 'Four saves, and they already plan the first morning. The forecast puts '
            + 'west Tokyo first — Inokashira, not Ueno — and your note has you landing '
            + 'April 3, three days ahead of peak bloom. The record bars are in Golden '
            + 'Gai, and the fish-market film is the one to watch on the flight.',
        citations: [
            { kind: 'web', label: 'Bloom forecast' },
            { kind: 'note', label: 'Flights — land April 3' },
            { kind: 'instagram', label: 'Record bars of Shinjuku' },
            { kind: 'youtube', label: 'How Tsukiji feeds Tokyo' },
        ],
    },
    {
        q: 'What can I actually cook tonight?',
        a: 'Two of your saves are weeknight-fast. The lemon chicken is 35 minutes on '
            + 'one tray; the sesame noodles are 15 and need nothing you would have to '
            + 'buy. The sourdough is the one to skip tonight — it starts two days out.',
        citations: [
            { kind: 'web', label: 'One-pan lemon chicken' },
            { kind: 'instagram', label: '15-minute sesame noodles' },
            { kind: 'youtube', label: 'Sourdough, no starter' },
        ],
    },
    {
        q: 'Where did I leave the espresso project?',
        a: 'Three saves deep. The video’s rule is to fix the dose before touching '
            + 'anything else, the thread argues the 20-gram basket is marketing, and '
            + 'your screenshot shortlist is down to two grinders — the cheaper one is '
            + 'the one the video uses.',
        citations: [
            { kind: 'youtube', label: 'Dialing in espresso' },
            { kind: 'x', label: 'The 20-gram dose myth' },
            { kind: 'shot', label: 'Grinder shortlist' },
        ],
    },
];

/* ------------------------------------------------------ act four: the shelf */

/**
 * The library, as a shelf. Everything the Ask answers cite appears here, and
 * everything here (minus the one untied save) appears in the graph. Exactly
 * ONE note-to-self, by owner call — the shelf should read as things FOUND, not
 * things typed.
 */
export const SHELF: DemoCard[] = [
    {
        kind: 'web', source: 'japan-guide.com', title: 'Cherry blossom forecast, ward by ward',
        summary: 'West Tokyo peaks first this year — the park you want is Inokashira, not Ueno.',
        category: 'Travel', tags: ['tokyo', 'april'],
    },
    {
        kind: 'instagram', source: '@goldengai.records', title: 'Record bars of Shinjuku',
        summary: 'Six seats, one turntable, and no talking during side A.',
        category: 'Travel', tags: ['tokyo', 'music'],
    },
    {
        kind: 'youtube', source: 'Process X', title: 'How Tsukiji feeds Tokyo',
        summary: 'Logistics, not romance: the supply chain behind the world’s fish market.',
        category: 'Food', tags: ['tokyo', 'documentary'],
    },
    {
        kind: 'note', source: 'Note to self', title: 'Flights — land April 3',
        summary: 'In on the 3rd, out the 14th. Forecast peak bloom: the 6th.',
        category: 'Travel', tags: ['tokyo', 'dates'],
    },
    {
        kind: 'youtube', source: 'Pull & Pour', title: 'Dialing in espresso, honestly',
        summary: 'Fix the dose before touching pressure — most sour shots are a scale problem.',
        category: 'Coffee', tags: ['espresso', 'technique'],
    },
    {
        kind: 'x', source: '@pressureprofile', title: 'The 20-gram dose myth',
        summary: 'The “standard” basket is marketing; taste at 16 and work upward.',
        category: 'Coffee', tags: ['espresso', 'dose'],
    },
    {
        kind: 'web', source: 'thedailypull.com', title: 'Flair 58, six months in',
        summary: 'A lever machine you service with an allen key — and shots to match.',
        category: 'Coffee', tags: ['espresso', 'gear'],
    },
    {
        kind: 'shot', source: 'Screenshot', title: 'Grinder shortlist, two circled',
        summary: 'Two finalists, prices in the margin. The cheaper one is the pick in every video.',
        category: 'Coffee', tags: ['espresso', 'gear'],
    },
    {
        kind: 'web', source: 'seriouseats.com', title: 'One-pan lemon chicken',
        summary: 'Thirty-five minutes, one tray, no browning step.',
        category: 'Recipes', tags: ['weeknight', '35 min'],
    },
    {
        kind: 'instagram', source: '@weeknightnoodles', title: '15-minute sesame noodles',
        summary: 'Store-cupboard only. The sauce is four things.',
        category: 'Recipes', tags: ['weeknight', '15 min'],
    },
    {
        kind: 'youtube', source: 'Bake with Jack', title: 'Sourdough, no starter',
        summary: 'A two-day preferment instead of the thing people quit on.',
        category: 'Cooking', tags: ['bread', 'weekend'],
    },
    {
        kind: 'x', source: '@twominutewall', title: 'Free-diving’s two-minute wall',
        summary: 'The wall is CO₂ panic, not oxygen — training is learning to relax through it.',
        category: 'Ideas', tags: ['breath', 'focus'],
    },
];

/* ------------------------------------------------- act five: the connections */

/**
 * The graph scene's library — real `Link` objects, because the scene runs the
 * REAL graph pipeline (`buildGraphModel` → `tick`), not a mockup.
 *
 * It is the SHELF, one seed per shelf card. Titles here are the graph's
 * LABELS, deliberately shorter than the shelf titles (a canvas label is a
 * handle, not a headline). Ties are `relatedLinks` — the stored-AI-relations
 * path, the same one a real library's edges come from; these links carry no
 * embeddings, so the edge set is exactly what is written here. `concepts`
 * exist for one reason: `clusterLabel` names each island from them, so the
 * canvas gets the app's own letterspaced captions — TOKYO, ESPRESSO, COOKING.
 *
 * The two edges that matter most are `grinder ↔ dial-in` (a screenshot tied to
 * the video that explains it) and `tsukiji ↔ bloom` (a documentary that found
 * its way to a trip) — connections between things saved WEEKS apart from
 * different apps, which is the section's whole claim. `freedive` is seeded but
 * UNTIED on purpose: the builder drops degree-0 nodes exactly as the app does
 * (a card with no qualifying tie is counted, not drawn), and a fake tie reads
 * fine until someone asks what free-diving has to do with espresso.
 */
type GraphSeed = {
    id: string;
    title: string;
    category: string;
    tags: string[];
    concepts: string[];
    ties?: [string, number][];
};

const GRAPH_SEEDS: GraphSeed[] = [
    { id: 'bloom', title: 'Bloom forecast', category: 'Travel', tags: ['tokyo', 'april'], concepts: ['Tokyo'], ties: [['flights', 0.82], ['records', 0.72]] },
    { id: 'records', title: 'Record bars', category: 'Travel', tags: ['tokyo', 'music'], concepts: ['Tokyo'], ties: [['flights', 0.66]] },
    { id: 'tsukiji', title: 'Tsukiji film', category: 'Food', tags: ['tokyo', 'documentary'], concepts: ['Tokyo'], ties: [['bloom', 0.74]] },
    { id: 'flights', title: 'Flights', category: 'Travel', tags: ['tokyo', 'dates'], concepts: ['Tokyo'] },
    { id: 'dialin', title: 'Dialing in', category: 'Coffee', tags: ['espresso', 'technique'], concepts: ['Espresso'], ties: [['grinder', 0.86], ['dose', 0.78]] },
    { id: 'dose', title: 'Dose myth', category: 'Coffee', tags: ['espresso', 'dose'], concepts: ['Espresso'], ties: [['flair', 0.64]] },
    { id: 'flair', title: 'Flair 58', category: 'Coffee', tags: ['espresso', 'gear'], concepts: ['Espresso'], ties: [['grinder', 0.7]] },
    { id: 'grinder', title: 'Grinder shortlist', category: 'Coffee', tags: ['espresso', 'gear'], concepts: ['Espresso'] },
    { id: 'chicken', title: 'Lemon chicken', category: 'Recipes', tags: ['weeknight', '35 min'], concepts: ['Cooking'], ties: [['noodles', 0.84], ['sourdough', 0.72]] },
    { id: 'noodles', title: 'Sesame noodles', category: 'Recipes', tags: ['weeknight', '15 min'], concepts: ['Cooking'] },
    { id: 'sourdough', title: 'Sourdough', category: 'Cooking', tags: ['bread', 'weekend'], concepts: ['Cooking'] },
    { id: 'freedive', title: 'Free-diving', category: 'Ideas', tags: ['breath', 'focus'], concepts: ['Breath'] },
];

/** `Link`-shaped, minimally: only the fields `buildGraphModel` and the draw
 *  pass read. Typed as the app's real `Link` so a model change that adds a
 *  required field breaks THIS file at compile time instead of the scene at
 *  runtime. */
export const GRAPH_LINKS: import('@/lib/types').Link[] = GRAPH_SEEDS.map((s) => ({
    id: s.id,
    url: `https://example.com/${s.id}`,
    title: s.title,
    summary: '',
    tags: s.tags,
    category: s.category,
    concepts: s.concepts,
    status: 'unread' as const,
    createdAt: 0,
    metadata: { originalTitle: s.title, estimatedReadTime: 1 },
    relatedLinks: (s.ties ?? []).map(([id, similarity]) => ({
        id,
        title: '',
        reason: '',
        similarity,
        commonConcepts: [],
    })),
}));
