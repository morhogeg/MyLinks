import { LINK_SCAN_STEPS } from '@/lib/scanPhases';

/**
 * The demo library the landing page's scenes are built from.
 *
 * TWO RULES GOVERN THIS FILE, and both have bitten before:
 *
 * 1. **`docs/BRANDING.md` D-3.** The strings "second brain" and "ai" must not
 *    appear on a user-visible surface, and this is the most visible one in the
 *    product.
 *
 * 2. **Internal consistency is the difference between a demo and a mock-up.**
 *    Every Ask answer is assemblable from the saves it cites, every cited save
 *    is on the shelf, and the graph runs over these same cards.
 *
 * THE LIBRARY (v4, round 10 — owner: drop the trip and the espresso gear,
 * "this is a knowledge app"): a curious mind's month, three threads of actual
 * KNOWLEDGE, each from a different field —
 *    Roman concrete   (why it self-heals; the Pantheon's unreinforced dome)
 *    typography       (serifs on screens, Swiss grids — feeding a real deck)
 *    attention        (variable reward, focus as environment, boredom as data)
 * plus one save that connects to nothing yet (free-diving) — real libraries
 * have those, and the graph drops it exactly as the app would. Exactly ONE
 * note-to-self, and it earns its place: it is the save two others resolve into.
 *
 * CARDS CARRY REAL `Link`-ish FIELDS because the landing renders them through
 * the app's OWN `SourceByline` and category colours (round 8: "wherever we
 * show something from the app, use the actual app").
 */

/** Kind drives the citation chips' leading mark; the CARD rendering derives
 *  everything from the Link-ish fields below. */
export type DemoKind = 'instagram' | 'x' | 'youtube' | 'web' | 'shot' | 'note';

export interface DemoCard {
    kind: DemoKind;
    title: string;
    summary: string;
    category: string;
    tags: string[];
    url?: string;
    sourceName?: string;
    youtubeChannel?: string;
    sourceType?: 'image' | 'note' | 'youtube';
    /** The real card's footer metadata, shown exactly as the app shows them.
     *  Static strings — a landing page has no live clock. */
    minutes: number;
    ago: string;
}

/* ------------------------------------------------------- act one: the silos */

/** The five places a save disappears into. Counts read as a life, not a demo.
 *  Offsets are a wide shallow ellipse in `vmin`; `landing.css` scales the
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
 * THE CAPTURE DEMO: one SUBJECT, three SHAPES (round 11). The three kinds are
 * back — a link, a screenshot, a video — but they are no longer three
 * unrelated saves: all three are the Roman-concrete thread. The same curiosity
 * arrives as an article, an annotated screenshot, and a documentary — which is
 * the product's actual claim (the shape doesn't matter, the thread does), and
 * it hands the page one continuous story: these captures are the island the
 * graph assembles two scenes later, and the saves Ask cites in between.
 *
 * `steps` is the REAL pipeline (`LINK_SCAN_STEPS`, the array the in-app
 * stepper reads) with the two source-specific labels swapped: what arrives,
 * and how it is read.
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
        tab: 'Link',
        handle: 'news.mit.edu/roman-concrete',
        steps: stepsFor('Fetching the link', 'Reading the page'),
        card: {
            kind: 'web',
            url: 'https://news.mit.edu/roman-concrete',
            sourceName: 'MIT News',
            title: 'Why Roman concrete heals itself',
            summary:
                'Lime clasts act as crack-healing reservoirs — the “flaw” was the '
                + 'feature all along.',
            category: 'Engineering',
            tags: ['materials', 'antiquity'],
            minutes: 6, ago: 'just now',
        },
    },
    {
        id: 'shot',
        tab: 'Screenshot',
        handle: 'Screenshot · 6 Aug, 21:14',
        steps: stepsFor('Receiving the screenshot', 'Looking at the screenshot'),
        card: {
            kind: 'shot',
            sourceType: 'image',
            title: 'Pantheon section, annotated',
            summary:
                'Load paths sketched over a scanned engraving: coffers cut dead weight, '
                + 'and the aggregate grades lighter with height.',
            category: 'Engineering',
            tags: ['dome', 'sketch'],
            minutes: 1, ago: 'just now',
        },
    },
    {
        id: 'video',
        tab: 'Video',
        handle: 'youtube.com · The Pantheon’s impossible dome',
        steps: stepsFor('Fetching the video', 'Watching the video'),
        card: {
            kind: 'youtube',
            url: 'https://www.youtube.com/watch?v=demo1',
            sourceType: 'youtube',
            youtubeChannel: 'Brick & Arch',
            title: 'The Pantheon’s impossible dome',
            summary:
                'Grading the aggregate lighter with height is what lets an unreinforced '
                + 'dome stand for nineteen centuries.',
            category: 'Engineering',
            tags: ['dome', 'structures'],
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
        q: 'What did I save about Roman concrete?',
        a: 'Four saves, one argument: the flaws were the engineering. The article '
            + 'shows lime clasts healing cracks from the inside, the thread explains '
            + 'the hot mixing that made them, and your annotated Pantheon section maps '
            + 'how coffers and graded aggregate let an unreinforced dome stand for '
            + 'nineteen centuries.',
        citations: [
            { kind: 'web', label: 'Why Roman concrete heals itself' },
            { kind: 'x', label: 'Hot mixing, the missing step' },
            { kind: 'shot', label: 'Pantheon section, annotated' },
            { kind: 'youtube', label: 'The impossible dome' },
        ],
    },
    {
        q: 'What should the deck look like?',
        a: 'Your note already decided, and two saves back it: body text in a screen '
            + 'serif — the essay’s whole case — on the three-column grid from the '
            + 'Swiss poster video. The letterpress reel is the mood board, not the '
            + 'spec.',
        citations: [
            { kind: 'note', label: 'Deck: serif body, Swiss grid' },
            { kind: 'web', label: 'Why serifs survived the screen' },
            { kind: 'youtube', label: 'The grid behind Swiss design' },
            { kind: 'instagram', label: 'Letterpress, frame by frame' },
        ],
    },
    {
        q: 'Why do I keep reaching for my phone?',
        a: 'Three saves, three angles on one itch. The essay traces variable reward '
            + 'back a century before slot machines, the thread reframes focus as an '
            + 'environment you design once, and the boredom video argues the wandering '
            + 'is your mind consolidating — the itch is the signal, not the noise.',
        citations: [
            { kind: 'web', label: 'The oldest trick in attention' },
            { kind: 'x', label: 'Focus is an environment' },
            { kind: 'youtube', label: 'Boredom is data' },
        ],
    },
];

/* ------------------------------------------------------ act four: the shelf */

/**
 * The library, as a shelf — rendered through the app's real card anatomy.
 * Everything the Ask answers cite is here; exactly ONE note-to-self.
 */
export const SHELF: DemoCard[] = [
    {
        kind: 'web', url: 'https://news.mit.edu/roman-concrete', sourceName: 'MIT News',
        title: 'Why Roman concrete heals itself',
        summary: 'Lime clasts act as crack-healing reservoirs — the “flaw” was the feature all along.',
        category: 'Engineering', tags: ['materials', 'antiquity'], minutes: 6, ago: '2d ago',
    },
    {
        kind: 'x', url: 'https://x.com/materialnotes/status/1',
        title: 'Hot mixing, the missing step',
        summary: 'Quicklime mixed hot, not slaked — the chemistry nobody copied for centuries.',
        category: 'Engineering', tags: ['materials', 'chemistry'], minutes: 2, ago: '2d ago',
    },
    {
        kind: 'youtube', url: 'https://www.youtube.com/watch?v=demo1', sourceType: 'youtube',
        youtubeChannel: 'Brick & Arch',
        title: 'The Pantheon’s impossible dome',
        summary: 'Grading the aggregate lighter with height is what lets an unreinforced dome stand.',
        category: 'Engineering', tags: ['dome', 'structures'], minutes: 14, ago: '4d ago',
    },
    {
        kind: 'shot', sourceType: 'image',
        title: 'Pantheon section, annotated',
        summary: 'Load paths sketched over a scanned engraving; coffers cut the dead weight.',
        category: 'Engineering', tags: ['dome', 'sketch'], minutes: 1, ago: '1d ago',
    },
    {
        kind: 'web', url: 'https://practicaltype.net/serifs-on-screens', sourceName: 'Practical Type',
        title: 'Why serifs survived the screen',
        summary: 'Hinting died and retina won — the case for serifs at body sizes again.',
        category: 'Design', tags: ['type', 'screens'], minutes: 8, ago: '3d ago',
    },
    {
        kind: 'instagram', url: 'https://www.instagram.com/p/demo2', sourceName: '@kernpress',
        title: 'Letterpress, frame by frame',
        summary: 'A wood-type poster from lockup to print, in ninety seconds.',
        category: 'Design', tags: ['print', 'craft'], minutes: 1, ago: '5d ago',
    },
    {
        kind: 'youtube', url: 'https://www.youtube.com/watch?v=demo3', sourceType: 'youtube',
        youtubeChannel: 'Baseline',
        title: 'The grid behind Swiss design',
        summary: 'Müller-Brockmann’s system, rebuilt poster by poster.',
        category: 'Design', tags: ['grids', 'history'], minutes: 16, ago: '1w ago',
    },
    {
        kind: 'note', sourceType: 'note',
        title: 'Deck: serif body, Swiss grid',
        summary: 'Body in the screen serif from that essay; steal the three-column grid from the poster video.',
        category: 'Design', tags: ['deck', 'type'], minutes: 1, ago: '1d ago',
    },
    {
        kind: 'web', url: 'https://quietreview.org/attention-trick', sourceName: 'Quiet Review',
        title: 'The oldest trick in attention',
        summary: 'Slot machines didn’t invent variable reward — newspapers did, a century earlier.',
        category: 'Ideas', tags: ['attention', 'history'], minutes: 9, ago: '4d ago',
    },
    {
        kind: 'x', url: 'https://x.com/stillnessforms/status/2',
        title: 'Focus is an environment',
        summary: 'Not willpower — a room you design once and get to reuse every day.',
        category: 'Ideas', tags: ['focus', 'practice'], minutes: 2, ago: '6d ago',
    },
    {
        kind: 'youtube', url: 'https://www.youtube.com/watch?v=demo4', sourceType: 'youtube',
        youtubeChannel: 'Slow Lane',
        title: 'Boredom is data',
        summary: 'Mind-wandering is consolidation — the itch to reach for the phone is the signal.',
        category: 'Ideas', tags: ['boredom', 'mind'], minutes: 11, ago: '1w ago',
    },
    {
        kind: 'x', url: 'https://x.com/twominutewall/status/3',
        title: 'Free-diving’s two-minute wall',
        summary: 'The wall is CO₂ panic, not oxygen — training is learning to relax through it.',
        category: 'Body', tags: ['breath', 'focus'], minutes: 2, ago: '3w ago',
    },
];

/* ------------------------------------------------- act five: the connections */

/**
 * The graph scene's seeds — the shelf run through the REAL pipeline
 * (`buildGraphModel` → `tick`). Titles are short graph HANDLES. Ties are
 * `relatedLinks` (the stored-AI-relations path; no embeddings, so the edge set
 * is exactly what is written here). `concepts` exist so `clusterLabel` names
 * each island the way it names a real library's — ROMAN CONCRETE / TYPOGRAPHY
 * / ATTENTION are the pipeline's own captions.
 *
 * The two edges that carry the section's claim: `section ↔ heal` (a screenshot
 * tied to the article that explains what it shows) and `note ↔ serifs` +
 * `note ↔ swiss` (a note that two saves from different weeks resolve into).
 * `freedive` is seeded UNTIED on purpose — the builder drops degree-0 nodes
 * exactly as the app does.
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
    { id: 'heal', title: 'Self-healing concrete', category: 'Engineering', tags: ['materials', 'antiquity'], concepts: ['Roman concrete'], ties: [['hotmix', 0.84], ['section', 0.76]] },
    { id: 'hotmix', title: 'Hot mixing', category: 'Engineering', tags: ['materials', 'chemistry'], concepts: ['Roman concrete'] },
    { id: 'dome', title: 'The dome', category: 'Engineering', tags: ['dome', 'structures'], concepts: ['Roman concrete'], ties: [['section', 0.72], ['heal', 0.66]] },
    { id: 'section', title: 'Pantheon section', category: 'Engineering', tags: ['dome', 'sketch'], concepts: ['Roman concrete'] },
    { id: 'serifs', title: 'Serifs on screens', category: 'Design', tags: ['type', 'screens'], concepts: ['Typography'], ties: [['note', 0.8]] },
    { id: 'letterpress', title: 'Letterpress reel', category: 'Design', tags: ['print', 'craft'], concepts: ['Typography'] },
    { id: 'swiss', title: 'Swiss grid', category: 'Design', tags: ['grids', 'history'], concepts: ['Typography'], ties: [['note', 0.78], ['letterpress', 0.64]] },
    { id: 'note', title: 'Deck note', category: 'Design', tags: ['deck', 'type'], concepts: ['Typography'] },
    { id: 'trick', title: 'Variable reward', category: 'Ideas', tags: ['attention', 'history'], concepts: ['Attention'], ties: [['practice', 0.74]] },
    { id: 'practice', title: 'Focus as place', category: 'Ideas', tags: ['focus', 'practice'], concepts: ['Attention'] },
    { id: 'boredom', title: 'Boredom as data', category: 'Ideas', tags: ['boredom', 'mind'], concepts: ['Attention'], ties: [['practice', 0.7]] },
    { id: 'freedive', title: 'Free-diving', category: 'Body', tags: ['breath', 'focus'], concepts: ['Breath'] },
];

/** `Link`-shaped, minimally: only the fields `buildGraphModel` and the draw
 *  pass read. Typed as the app's real `Link` so a model change breaks THIS
 *  file at compile time instead of the scene at runtime. */
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
