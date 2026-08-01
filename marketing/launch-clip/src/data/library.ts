/**
 * The library the film shows.
 *
 * Round 13 (owner call): DIVERSE on purpose — a recipe, an X thread about AI,
 * a philosophy video, a travel carousel, an apartment listing, a gift idea, a
 * workout, an article a friend sent. The whole point of the product is that
 * one life produces saves this different, across this many apps, and no single
 * app holds them.
 *
 * Three scenes still need internal coherence, and get it from one THREAD
 * running through the diversity: the AI/what-stays-human trio (the X thread,
 * the philosophy video, the article Maya sent) powers the Ask answer with
 * citations from three different platforms, gives the graph its months-apart
 * pair (the video is 2mo old, the thread 2d), and gives the digest the thing
 * "you keep circling". The search query — "easy dinner for guests" — shares
 * NOT ONE word with the one card it retrieves (the one-pan lemon chicken).
 */

export type Card = {
  id: string;
  category: string;
  title: string;
  summary: string;
  source: string;
  sourceKind?: 'link' | 'x' | 'youtube' | 'instagram' | 'facebook' | 'screenshot' | 'note';
  tags: string[];
  readTime: number;
  age: string;
  note?: string;
  /** Masonry column hint + relative height weight. */
  h?: number;
};

export const CARDS: Card[] = [
  {
    id: 'apartment',
    category: 'Home',
    title: 'Two-bed with a balcony, near the park',
    summary:
      'Top floor, morning light, laundry in the building. Fifteen minutes to work by bike. Viewing slots open Saturday.',
    source: 'zillow.com',
    tags: ['apartment-hunt'],
    readTime: 3,
    age: '2d ago',
    note: 'Call about the viewing before Friday.',
  },
  {
    id: 'aithread',
    category: 'AI',
    title: 'What AI actually changes about work',
    summary:
      'A thread arguing the models take the typing, not the judgment — and which skills to bet on either way.',
    source: '@futuretense',
    sourceKind: 'x',
    tags: ['ai', 'work'],
    readTime: 4,
    age: '2d ago',
  },
  {
    id: 'recipe',
    category: 'Cooking',
    title: 'One-pan lemon chicken with orzo',
    summary:
      'Bright, briny, twenty minutes start to finish — the whole thing happens in a single skillet.',
    source: '@sundaytable',
    sourceKind: 'instagram',
    tags: ['weeknight', 'to-try'],
    readTime: 4,
    age: '1w ago',
  },
  {
    id: 'travelgram',
    category: 'Travel',
    title: 'Hidden coves of Sardinia',
    summary:
      'A carousel of beaches you can only reach on foot — go in June, before the boats find them.',
    source: '@quietplaces',
    sourceKind: 'instagram',
    tags: ['places', 'summer'],
    readTime: 2,
    age: '1w ago',
  },
  {
    id: 'gift',
    category: 'Gifts',
    title: 'Gift idea: the ceramic pour-over set',
    summary:
      'Dana pointed at this twice in one conversation. Small-batch studio, ships in three days.',
    source: 'Screenshot',
    sourceKind: 'screenshot',
    tags: ['dana'],
    readTime: 1,
    age: '2w ago',
    note: 'Her birthday is the 14th.',
  },
  {
    id: 'workout',
    category: 'Fitness',
    title: 'The 20-minute no-equipment reset',
    summary:
      'Six moves, no gear, scaled by level. The point is showing up on the days you would rather skip.',
    source: 'Move Daily',
    sourceKind: 'youtube',
    tags: ['routine'],
    readTime: 8,
    age: '3w ago',
  },
  {
    id: 'aiarticle',
    category: 'AI',
    title: 'The jobs AI actually changes',
    summary:
      'A sober look past the hype at which work shifts first — and why the viral lists keep getting it wrong.',
    source: 'theatlantic.com',
    tags: ['ai', 'work'],
    readTime: 9,
    age: '3w ago',
    note: 'Maya sent this — the part about editors is us.',
  },
  {
    id: 'machineminds',
    category: 'Philosophy',
    title: 'What AI can’t take from you',
    summary:
      'Twenty blunt minutes on the one thing machines can’t do — care. Swearing included. Weirdly hopeful by the end.',
    source: 'IAmMarkManson',
    sourceKind: 'youtube',
    tags: ['minds', 'watch-again'],
    readTime: 21,
    age: '2mo ago',
  },
];


/**
 * Feed order matters to the film: the search's one survivor is deliberately
 * NOT at the top. With the match already on screen the search beat had no
 * visible work to do; buried mid-feed, the non-matches collapse and the match
 * pulls up, which is what a filter actually looks like.
 */
export const FEED_ORDER = ['apartment', 'machineminds', 'recipe', 'aithread', 'travelgram', 'gift', 'workout', 'aiarticle'];

export const byId = (id: string) => {
  const c = CARDS.find((x) => x.id === id);
  if (!c) throw new Error(`no card ${id}`);
  return c;
};

/** The capture scene's incoming article — the one a friend sent. */
export const INCOMING = {
  site: 'theatlantic.com',
  url: 'theatlantic.com/tech/jobs-ai-changes',
  headline: 'The jobs AI actually changes',
  standfirst:
    'Past the hype: which work actually shifts first, and why the viral lists keep getting it wrong.',
};

/**
 * The search demo. The query shares NOT ONE word with the card it retrieves —
 * that is the whole point of the scene, and it is why the phrasing here is
 * fixed rather than decorative. ("easy dinner for guests" → the one-pan lemon
 * chicken. No card in the library contains "easy", "dinner" or "guests".)
 *
 * ONE result, deliberately (owner call): three matches read as a filter doing
 * roughly the right thing; a single card left standing reads as the app
 * FINDING the thing you meant.
 */
export const SEARCH_QUERY = 'easy dinner for guests';
export const SEARCH_HITS = ['recipe'];

/** The Ask exchange — assembled from the AI trio, one card per platform. */
export const ASK_QUESTION = 'What have I been saving about AI?';

export const ASK_ANSWER = [
  'Your saves circle one question: what stays human.',
  '',
  'The thread you starred argues AI takes the typing and leaves the judgment, the article Maya sent maps which jobs actually shift, and Mark Manson’s video says the quiet part: the human bit was always the point.',
].join('\n');

export const ASK_SOURCES = [
  { id: 'aithread', label: '@futuretense', kind: 'x' as const, title: 'What AI actually changes about work' },
  { id: 'machineminds', label: 'IAmMarkManson', kind: 'youtube' as const, title: 'What AI can’t take from you' },
  { id: 'aiarticle', label: 'theatlantic.com', kind: 'link' as const, title: 'The jobs AI actually changes' },
];

/** The graph scene. Positions are hand-set — a force layout that never settles reads as noise. */
export const GRAPH_NODES: {
  id: string;
  x: number;
  y: number;
  r: number;
  cluster: number;
  /** Drives the node's colour through the app's own category hash. */
  category: string;
  label?: string;
}[] = [
  // The caption's claim lives in cluster 0: the thread saved two days ago and
  // the philosophy video saved two months ago sit on the same island.
  { id: 'aithread', x: 0.33, y: 0.36, r: 15, cluster: 0, category: 'AI', label: 'AI & work' },
  { id: 'machineminds', x: 0.47, y: 0.27, r: 13, cluster: 0, category: 'Philosophy', label: 'What AI can’t take' },
  { id: 'aiarticle', x: 0.24, y: 0.5, r: 11, cluster: 0, category: 'AI' },
  { id: 'agents', x: 0.42, y: 0.5, r: 9, cluster: 0, category: 'AI' },
  { id: 'ethics', x: 0.35, y: 0.62, r: 8, cluster: 0, category: 'Philosophy' },
  { id: 'apartment', x: 0.7, y: 0.42, r: 12, cluster: 1, category: 'Home', label: 'Balcony two-bed' },
  { id: 'renttips', x: 0.79, y: 0.56, r: 11, cluster: 1, category: 'Home' },
  { id: 'neighborhood', x: 0.66, y: 0.62, r: 10, cluster: 1, category: 'Home' },
  { id: 'commute', x: 0.81, y: 0.33, r: 8, cluster: 1, category: 'Home' },
  // NOT labelled with the cluster's own words — label and island caption
  // stacked read as the same words twice (the same dedup the app itself does).
  { id: 'recipe', x: 0.55, y: 0.78, r: 11, cluster: 2, category: 'Cooking', label: 'Lemon chicken orzo' },
  { id: 'marketlist', x: 0.44, y: 0.86, r: 8, cluster: 2, category: 'Cooking' },
  { id: 'pasta', x: 0.66, y: 0.86, r: 8, cluster: 2, category: 'Cooking' },
];

export const GRAPH_EDGES: [string, string][] = [
  ['aithread', 'machineminds'],
  ['aithread', 'aiarticle'],
  ['machineminds', 'agents'],
  ['aiarticle', 'agents'],
  ['aithread', 'ethics'],
  ['ethics', 'machineminds'],
  ['apartment', 'renttips'],
  ['apartment', 'commute'],
  ['renttips', 'neighborhood'],
  ['neighborhood', 'apartment'],
  ['machineminds', 'apartment'],
  ['recipe', 'marketlist'],
  ['recipe', 'pasta'],
  ['recipe', 'aiarticle'],
  ['marketlist', 'pasta'],
  ['renttips', 'recipe'],
];

/** Island captions. The app draws these in textSecondary, NOT in a cluster
 *  colour — they are type, not legend. */
export const CLUSTERS = [
  { name: 'AI & what stays human', x: 0.35, y: 0.19 },
  { name: 'The apartment hunt', x: 0.74, y: 0.24 },
  { name: 'Weeknight cooking', x: 0.55, y: 0.93 },
];

/** The digest beat. (No "library" anywhere in the film — standing owner rule.
 *  Kicker dropped "This week" when the VO stopped claiming a weekly cadence —
 *  the schedule is the user's.) */
export const SYNTHESIS = {
  kicker: 'In your saves',
  title: 'You keep circling one idea',
  body: 'The AI thread, Maya’s article, and Mark Manson’s video — three saves, one question: what stays human. You might be ready to write your own take.',
};

// The resurfaced card must RELATE to the write-up above it (owner note, 13f):
// the digest circles the AI/what-stays-human idea, so the card it brings back
// is the philosophy video from that same thread — saved months ago, unwatched.
export const REVIEW = {
  title: 'What AI can’t take from you',
  meta: 'Saved 2 months ago · never revisited',
};
