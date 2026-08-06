import { LINK_SCAN_STEPS } from '@/lib/scanPhases';

/**
 * The demo library the landing page's scenes are built from.
 *
 * TWO RULES GOVERN THIS FILE, and both have bitten before:
 *
 * 1. **`docs/BRANDING.md` D-3.** The strings "second brain" and "ai" must not
 *    appear on a user-visible surface, and this is the most visible one in the
 *    product. That is why this library is written fresh rather than ported from
 *    the launch film's demo week, which is built around an AI trio.
 *
 * 2. **Internal consistency is the difference between a demo and a mock-up.**
 *    Every Ask answer is assemblable from the saves it cites, every cited save
 *    is on the shelf, and the graph runs over these same cards.
 *
 * THE LIBRARY (v3, round 8 — the previous version had two food-flavoured
 * islands, which read as one interest twice): a curious person's month, three
 * genuinely different threads —
 *    an April trip to Tokyo    (a forecast, a reel, a documentary, ONE note)
 *    a home-espresso rabbit hole (a technique video, a contrarian thread, a
 *                               review, a screenshot of a shortlist)
 *    a first trail 50k         (a pacing guide, a shoe thread, a taper video)
 * plus one save that connects to nothing yet (free-diving) — real libraries
 * have those, and the graph drops it exactly as the app would.
 *
 * CARDS CARRY REAL `Link`-ish FIELDS (`url`, `sourceType`, `sourceName`,
 * `youtubeChannel`) because the landing renders them through the app's OWN
 * `SourceByline` and the app's own category colours — owner call, round 8:
 * "wherever we show something from the app, use the actual app".
 */

/** Kind is used by the citation chips' leading mark; the CARD rendering
 *  derives everything from the Link-ish fields below instead. */
export type DemoKind = 'instagram' | 'x' | 'youtube' | 'web' | 'shot' | 'note';

export interface DemoCard {
    kind: DemoKind;
    title: string;
    summary: string;
    category: string;
    tags: string[];
    /** Fields the app's SourceByline reads. Set per kind: `url` drives the
     *  platform branch (x/instagram/youtube/web host), `sourceName` carries
     *  the IG handle, `youtubeChannel` the channel, `sourceType` marks
     *  image/note captures. */
    url?: string;
    sourceName?: string;
    youtubeChannel?: string;
    sourceType?: 'image' | 'note' | 'youtube';
    /** The real card's footer metadata — read time and age, shown exactly as
     *  the app shows them. Static strings: a landing page has no live clock. */
    minutes: number;
    ago: string;
}

/* ------------------------------------------------------- act one: the silos */

/** The five places a save disappears into. Counts read as a life, not a demo:
 *  the messages-to-yourself pile is always the biggest. Offsets are a wide
 *  shallow ellipse in `vmin` (copy owns the lower third of the stage);
 *  `landing.css` scales the field by `--rs` on small screens. */
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
 * The three capture kinds. `steps` is the REAL pipeline (`LINK_SCAN_STEPS`,
 * the array the in-app stepper and the share-sheet banner read) with the two
 * source-specific labels swapped: what arrives (step 0) and how it is read
 * (step 1). "Fetching the link" on a screenshot was an owner-caught bug —
 * a screenshot has no link. (The APP's own banner has the same wart; flagged
 * as a separate task, not fixed from the marketing page.)
 */
function stepsFor(arriveLabel: string, readLabel: string): string[] {
    return LINK_SCAN_STEPS.map((s, i) =>
        i === 0 ? arriveLabel : i === 1 ? readLabel : s,
    );
}

export interface CaptureSource {
    id: 'link' | 'shot' | 'video';
    tab: string;
    handle: string;
    steps: string[];
    card: DemoCard;
}

export const CAPTURE_SOURCES: CaptureSource[] = [
    {
        id: 'link',
        tab: 'A link',
        handle: 'seriouseats.com/one-pan-lemon-chicken',
        steps: stepsFor('Fetching the link', 'Reading the page'),
        card: {
            kind: 'web',
            url: 'https://www.seriouseats.com/one-pan-lemon-chicken',
            sourceName: 'Serious Eats',
            title: 'One-pan lemon chicken with orzo',
            summary:
                'Sheet-pan dinner in 35 minutes: chicken thighs roasted over orzo so the '
                + 'starch takes the pan juices. Needs one tray and no browning step.',
            category: 'Recipes',
            tags: ['weeknight', 'one-pan', '35 min'],
            minutes: 6, ago: 'just now',
        },
    },
    {
        id: 'shot',
        tab: 'A screenshot',
        handle: 'Screenshot · 4 Aug, 21:14',
        steps: stepsFor('Receiving the screenshot', 'Looking at the screenshot'),
        card: {
            kind: 'shot',
            sourceType: 'image',
            title: 'Grinder shortlist, two circled',
            summary:
                'Two finalists circled out of a comparison table, prices noted in the '
                + 'margin. The cheaper one is the grinder your saved videos actually use.',
            category: 'Coffee',
            tags: ['espresso', 'gear', 'shortlist'],
            minutes: 1, ago: 'just now',
        },
    },
    {
        id: 'video',
        tab: 'A video',
        handle: 'youtube.com · Sourdough, no starter',
        steps: stepsFor('Fetching the video', 'Watching the video'),
        card: {
            kind: 'youtube',
            url: 'https://www.youtube.com/watch?v=demo',
            sourceType: 'youtube',
            youtubeChannel: 'Bake with Jack',
            title: 'Sourdough without a starter, honestly explained',
            summary:
                'Argues the starter is the part people quit on, and substitutes a '
                + 'two-day preferment. Timeline matters more than technique: begin Friday '
                + 'to eat on Sunday.',
            category: 'Cooking',
            tags: ['bread', 'long process', 'weekend'],
            minutes: 14, ago: 'just now',
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
        q: 'How should I race the 50k?',
        a: 'Your three saves agree on boring discipline. The pacing guide says even '
            + 'splits — walk the climbs early so you can still run them late. The taper '
            + 'video halves volume but keeps intensity in the final two weeks. And the '
            + 'shoe thread is blunt: race in the pair you trained in.',
        citations: [
            { kind: 'web', label: 'Pacing your first 50k' },
            { kind: 'youtube', label: 'Taper week, explained' },
            { kind: 'x', label: 'The max-cushion trap' },
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
 * The library, as a shelf — rendered through the app's real card anatomy.
 * Everything the Ask answers cite is here; exactly ONE note-to-self (owner
 * call): the shelf should read as things FOUND, not things typed.
 */
export const SHELF: DemoCard[] = [
    {
        kind: 'web', url: 'https://www.japan-guide.com/sakura', sourceName: 'japan-guide.com',
        title: 'Cherry blossom forecast, ward by ward',
        summary: 'West Tokyo peaks first this year — the park you want is Inokashira, not Ueno.',
        category: 'Travel', tags: ['tokyo', 'april'], minutes: 4, ago: '2d ago',
    },
    {
        kind: 'instagram', url: 'https://www.instagram.com/p/demo1', sourceName: '@goldengai.records',
        title: 'Record bars of Shinjuku',
        summary: 'Six seats, one turntable, and no talking during side A.',
        category: 'Travel', tags: ['tokyo', 'music'], minutes: 1, ago: '5d ago',
    },
    {
        kind: 'youtube', url: 'https://www.youtube.com/watch?v=demo2', sourceType: 'youtube',
        youtubeChannel: 'Process X',
        title: 'How Tsukiji feeds Tokyo',
        summary: 'Logistics, not romance: the supply chain behind the world’s fish market.',
        category: 'Film', tags: ['tokyo', 'documentary'], minutes: 22, ago: '1w ago',
    },
    {
        kind: 'note', sourceType: 'note',
        title: 'Flights — land April 3',
        summary: 'In on the 3rd, out the 14th. Forecast peak bloom: the 6th.',
        category: 'Travel', tags: ['tokyo', 'dates'], minutes: 1, ago: '2d ago',
    },
    {
        kind: 'youtube', url: 'https://www.youtube.com/watch?v=demo3', sourceType: 'youtube',
        youtubeChannel: 'Pull & Pour',
        title: 'Dialing in espresso, honestly',
        summary: 'Fix the dose before touching pressure — most sour shots are a scale problem.',
        category: 'Coffee', tags: ['espresso', 'technique'], minutes: 11, ago: '3d ago',
    },
    {
        kind: 'x', url: 'https://x.com/pressureprofile/status/1',
        title: 'The 20-gram dose myth',
        summary: 'The “standard” basket is marketing; taste at 16 and work upward.',
        category: 'Coffee', tags: ['espresso', 'dose'], minutes: 2, ago: '4d ago',
    },
    {
        kind: 'web', url: 'https://thedailypull.com/flair-58', sourceName: 'The Daily Pull',
        title: 'Flair 58, six months in',
        summary: 'A lever machine you service with an allen key — and shots to match.',
        category: 'Coffee', tags: ['espresso', 'gear'], minutes: 9, ago: '1w ago',
    },
    {
        kind: 'shot', sourceType: 'image',
        title: 'Grinder shortlist, two circled',
        summary: 'Two finalists, prices in the margin. The cheaper one is the pick in every video.',
        category: 'Coffee', tags: ['espresso', 'gear'], minutes: 1, ago: '2d ago',
    },
    {
        kind: 'web', url: 'https://www.trailrunnermag.com/pacing-50k', sourceName: 'Trail Runner',
        title: 'Pacing your first 50k',
        summary: 'Even splits win: walk the climbs early so you can run them late.',
        category: 'Running', tags: ['50k', 'pacing'], minutes: 7, ago: '6d ago',
    },
    {
        kind: 'x', url: 'https://x.com/dirtmiles/status/2',
        title: 'The max-cushion trap',
        summary: 'Race-day shoes should be the ones you trained in, not the hype pair.',
        category: 'Running', tags: ['gear', 'race day'], minutes: 3, ago: '1w ago',
    },
    {
        kind: 'youtube', url: 'https://www.youtube.com/watch?v=demo4', sourceType: 'youtube',
        youtubeChannel: 'Koop Cast',
        title: 'Taper week, explained',
        summary: 'Halve the volume, keep the intensity — the fitness is already banked.',
        category: 'Running', tags: ['50k', 'taper'], minutes: 16, ago: '5d ago',
    },
    {
        kind: 'x', url: 'https://x.com/twominutewall/status/3',
        title: 'Free-diving’s two-minute wall',
        summary: 'The wall is CO₂ panic, not oxygen — training is learning to relax through it.',
        category: 'Ideas', tags: ['breath', 'focus'], minutes: 2, ago: '3w ago',
    },
];

/* ------------------------------------------------- act five: the connections */

/**
 * The graph scene's seeds — the shelf, one per card, run through the REAL
 * pipeline (`buildGraphModel` → `tick`). Titles are short graph HANDLES (a
 * canvas label is a handle, not a headline). Ties are `relatedLinks` — the
 * stored-AI-relations path; no embeddings, so the edge set is exactly what is
 * written here. `concepts` exist so `clusterLabel` names each island the way
 * it names a real library's — TOKYO / ESPRESSO / TRAIL 50K are the pipeline's
 * own captions, not strings typed onto the canvas.
 *
 * The two edges that carry the section's claim: `grinder ↔ dial-in` (a
 * screenshot tied to the video that explains it) and `tsukiji ↔ bloom` (a
 * documentary that found its way to a trip). `freedive` is seeded UNTIED on
 * purpose — the builder drops degree-0 nodes exactly as the app does.
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
    { id: 'tsukiji', title: 'Tsukiji film', category: 'Film', tags: ['tokyo', 'documentary'], concepts: ['Tokyo'], ties: [['bloom', 0.74]] },
    { id: 'flights', title: 'Flights', category: 'Travel', tags: ['tokyo', 'dates'], concepts: ['Tokyo'] },
    { id: 'dialin', title: 'Dialing in', category: 'Coffee', tags: ['espresso', 'technique'], concepts: ['Espresso'], ties: [['grinder', 0.86], ['dose', 0.78]] },
    { id: 'dose', title: 'Dose myth', category: 'Coffee', tags: ['espresso', 'dose'], concepts: ['Espresso'], ties: [['flair', 0.64]] },
    { id: 'flair', title: 'Flair 58', category: 'Coffee', tags: ['espresso', 'gear'], concepts: ['Espresso'], ties: [['grinder', 0.7]] },
    { id: 'grinder', title: 'Grinder shortlist', category: 'Coffee', tags: ['espresso', 'gear'], concepts: ['Espresso'] },
    { id: 'pacing', title: 'Pacing guide', category: 'Running', tags: ['50k', 'pacing'], concepts: ['Trail 50k'], ties: [['taper', 0.8], ['shoes', 0.68]] },
    { id: 'shoes', title: 'Shoe thread', category: 'Running', tags: ['gear', 'race day'], concepts: ['Trail 50k'], ties: [['taper', 0.62]] },
    { id: 'taper', title: 'Taper week', category: 'Running', tags: ['50k', 'taper'], concepts: ['Trail 50k'] },
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
