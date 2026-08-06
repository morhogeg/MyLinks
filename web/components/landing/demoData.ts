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
 *    been saving about AI?" and its feed's top card is "The jobs AI actually
 *    changes". Defensible in the film, where it is a saved TOPIC. Not here.
 *
 * 2. **Diversity is the argument, not decoration.** One life produces saves
 *    this different — a recipe, a trip, a flat, a workout, a gift, a thread —
 *    and no single app holds them. A library that were all articles would prove
 *    the opposite of the page's claim. This is the same call the film's round 13
 *    made for the same reason.
 *
 * The Ask answers below are genuinely assemblable from the saves they cite —
 * every fact in an answer appears in a cited card. An answer that cited saves
 * it couldn't have been built from would be a lie told in the product's own
 * voice, on its home page.
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

/**
 * The five places a save disappears into. Counts are illustrative and read as a
 * life rather than a demo: the messages-to-yourself pile is always the biggest.
 *
 * The offsets are an ELLIPSE, wide and shallow, not a circle. The scene's copy
 * sits in the lower third of the stage, so the silo field has to stay in the
 * upper half or the piles land on the headline — which is exactly what the
 * first pass did. Wide-and-shallow also suits the shape of the viewport this is
 * usually read on. `landing.css` scales the whole field by `--rs` on small
 * screens rather than carrying a second set of numbers here.
 *
 * Units are `vmin` so the composition reframes with the viewport instead of
 * needing a separate mobile layout.
 */
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
 * The three capture paths, each with the pipeline it runs and the card it
 * produces.
 *
 * `steps` is `LINK_SCAN_STEPS` from `lib/scanPhases.ts` — the REAL pipeline the
 * app runs and the same array the in-app stepper and the share-sheet banner
 * read — with exactly one label swapped per source, because "Reading the page"
 * is not what happens to a video. That swap mirrors the hero's own sentence:
 * it reads the page, watches the video, looks at the screenshot. If the real
 * pipeline gains or loses a phase, this picks it up automatically; only the
 * swapped label is local.
 */
function stepsFor(readLabel: string): string[] {
    return LINK_SCAN_STEPS.map((s, i) => (i === 1 ? readLabel : s));
}

export interface CaptureSource {
    id: 'link' | 'shot' | 'video';
    /** The segmented-control label. */
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
            title: 'Kettlebell complex — 20 minutes, three rounds',
            summary:
                'A saved training block: swing, clean, press, squat, held for three '
                + 'rounds with 90 seconds between. Written for weeks with no gym time.',
            category: 'Fitness',
            tags: ['kettlebell', 'short session', 'strength'],
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
    /** Split into words at render time; kept as prose so it stays readable and
     *  editable here rather than as a pre-chopped array. */
    a: string;
    citations: DemoCitation[];
}

export const QUESTIONS: DemoQuestion[] = [
    {
        q: 'What did I save about Lisbon?',
        a: 'Three saves, and they point at the same neighbourhood. Your 36-hour guide '
            + 'puts Alfama first for the morning light, the reel is a pastelaria two '
            + 'streets below it, and the note to yourself has you landing Thursday — '
            + 'which is the day the flea market runs.',
        citations: [
            { kind: 'x', label: '36 hours in Lisbon' },
            { kind: 'instagram', label: 'Pastelaria in Alfama' },
            { kind: 'note', label: 'Flights — landing Thu' },
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
        q: 'What was that flat near the park?',
        a: 'Two-bed with a balcony on the north side of the park, saved three weeks '
            + 'ago. You noted the commute as one change and about forty minutes. The '
            + 'listing you saved the week before is on the same street and eight per '
            + 'cent cheaper.',
        citations: [
            { kind: 'web', label: 'Two-bed, balcony, north side' },
            { kind: 'note', label: 'Commute: 1 change, ~40 min' },
            { kind: 'web', label: 'Same street, listed earlier' },
        ],
    },
];

/* ------------------------------------------------------ act four: the shelf */

/**
 * The library, as a shelf. Everything the Ask answers cite appears here, so a
 * visitor who reads an answer and then scans the shelf finds the sources it
 * named — the page is internally consistent, which costs nothing and is the
 * difference between a demo and a mock-up.
 */
export const SHELF: DemoCard[] = [
    {
        kind: 'x', source: '@ondiscovery', title: '36 hours in Lisbon',
        summary: 'Alfama at first light, the rest of the day downhill.',
        category: 'Travel', tags: ['lisbon', 'city break'],
    },
    {
        kind: 'instagram', source: '@pasteis.diary', title: 'Pastelaria in Alfama',
        summary: 'Custard tarts two streets below the viewpoint.',
        category: 'Travel', tags: ['lisbon', 'food'],
    },
    {
        kind: 'note', source: 'Note to self', title: 'Flights — landing Thu',
        summary: 'In Thursday 14:20, out Sunday night. Flea market is Thursday.',
        category: 'Travel', tags: ['lisbon', 'dates'],
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
        kind: 'web', source: 'rightmove.co.uk', title: 'Two-bed, balcony, north side',
        summary: 'Park-facing, second floor, available from the 12th.',
        category: 'Home', tags: ['flat', 'shortlist'],
    },
    {
        kind: 'note', source: 'Note to self', title: 'Commute: 1 change, ~40 min',
        summary: 'Checked at 08:10 on a Tuesday, so it is the honest number.',
        category: 'Home', tags: ['flat', 'commute'],
    },
    {
        kind: 'shot', source: 'Screenshot', title: 'Kettlebell complex, 20 min',
        summary: 'Swing, clean, press, squat. Three rounds, 90 seconds rest.',
        category: 'Fitness', tags: ['kettlebell', 'short session'],
    },
    {
        kind: 'x', source: '@quietcraft', title: 'The case for boring tools',
        summary: 'Choose the thing that will still work in ten years.',
        category: 'Ideas', tags: ['making', 'longevity'],
    },
    {
        kind: 'youtube', source: 'Rest of World', title: 'How a night market feeds a city',
        summary: 'Logistics, not romance: the supply chain behind the stalls.',
        category: 'Ideas', tags: ['cities', 'food'],
    },
    {
        kind: 'web', source: 'wirecutter.com', title: 'Headphones for an open office',
        summary: 'The pick that is not the obvious one, and why.',
        category: 'Shopping', tags: ['audio', 'work'],
    },
];

/* ------------------------------------------------- act five: the connections */

/**
 * The graph scene's library — real `Link` objects, because the scene runs the
 * REAL graph pipeline (`buildGraphModel` → `tick`), not a mockup. Owner call,
 * 2026-08-06 round 5: "graph should be our own exact graph".
 *
 * It is the SHELF, one entry per shelf card, so a reader who scans the shelf
 * and then watches the constellation assemble sees the same twelve saves in
 * both. Ties are `relatedLinks` — the stored-AI-relations path, the same one a
 * real library's edges come from (these links carry no embeddings, so the
 * pairwise pass contributes nothing, which keeps the edge set exactly what is
 * written here). Similarity values sit in the real path's observed range;
 * >0.82 renders as a `strong` edge.
 *
 * The one edge that matters most is `night-market ↔ lisbon`: a food-logistics
 * video tied to a travel guide is a connection nobody would have filed, which
 * is the section's entire claim. `kettlebell` is seeded but UNTIED on purpose:
 * the builder drops degree-0 nodes exactly as it does in the app (a card with
 * no qualifying tie is counted, not drawn), and the honest options were worse —
 * a fake tie reads fine until someone asks why a workout connects to noodles.
 */
type GraphSeed = {
    id: string;
    title: string;
    category: string;
    tags: string[];
    ties?: [string, number][];
};

const GRAPH_SEEDS: GraphSeed[] = [
    { id: 'lisbon', title: '36 hours in Lisbon', category: 'Travel', tags: ['lisbon', 'city break'], ties: [['pastel', 0.86], ['flights', 0.8]] },
    { id: 'pastel', title: 'Pastelaria in Alfama', category: 'Travel', tags: ['lisbon', 'food'], ties: [['flights', 0.72]] },
    { id: 'flights', title: 'Flights — landing Thu', category: 'Travel', tags: ['lisbon', 'dates'] },
    { id: 'chicken', title: 'One-pan lemon chicken', category: 'Recipes', tags: ['weeknight', '35 min'], ties: [['noodles', 0.84], ['sourdough', 0.74]] },
    { id: 'noodles', title: '15-minute sesame noodles', category: 'Recipes', tags: ['weeknight', '15 min'] },
    { id: 'sourdough', title: 'Sourdough, no starter', category: 'Cooking', tags: ['bread', 'weekend'] },
    { id: 'flat', title: 'Two-bed, balcony, north side', category: 'Home', tags: ['flat', 'shortlist'], ties: [['commute', 0.9]] },
    { id: 'commute', title: 'Commute: 1 change, ~40 min', category: 'Home', tags: ['flat', 'commute'] },
    { id: 'kettlebell', title: 'Kettlebell complex, 20 min', category: 'Fitness', tags: ['kettlebell', 'short session'] },
    { id: 'tools', title: 'The case for boring tools', category: 'Ideas', tags: ['making', 'longevity'], ties: [['headphones', 0.68]] },
    { id: 'night-market', title: 'How a night market feeds a city', category: 'Ideas', tags: ['cities', 'food'], ties: [['tools', 0.7], ['lisbon', 0.64]] },
    { id: 'headphones', title: 'Headphones for an open office', category: 'Shopping', tags: ['audio', 'work'] },
];

/** `Link`-shaped, minimally: only the fields `buildGraphModel` and the draw
 *  pass read (id/title/category/status/relatedLinks). Typed as the app's real
 *  `Link` so a model change that adds a required field breaks THIS file at
 *  compile time instead of the scene at runtime. */
export const GRAPH_LINKS: import('@/lib/types').Link[] = GRAPH_SEEDS.map((s) => ({
    id: s.id,
    url: `https://example.com/${s.id}`,
    title: s.title,
    summary: '',
    tags: s.tags,
    category: s.category,
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
