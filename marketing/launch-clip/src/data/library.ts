/**
 * The library the film shows.
 *
 * Round 13 made it UNIVERSAL: a recipe, an apartment listing, a workout, a
 * gift idea, a trip being circled, an article a friend sent — the saves of
 * someone's actual week, in dinner-table words, so the film lands on people
 * who have never once thought about "saving links" as a problem.
 *
 * It is still one coherent life, not a grab-bag, because three scenes depend
 * on that: the Ask answer is genuinely assemblable from the three travel
 * saves; the search query shares NOT ONE word with the one card it retrieves;
 * and the feed visibly mixes YouTube, Instagram, X and articles, which is what
 * proves "one place for all of it" instead of merely captioning it.
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
    id: 'lisbonvid',
    category: 'Travel',
    title: 'Three days in Lisbon',
    summary:
      'A tight itinerary that skips the queues: morning markets, the ferry across the Tagus, and where to eat in Alfama.',
    source: 'Beautiful Destinations',
    sourceKind: 'youtube',
    tags: ['lisbon', 'itinerary'],
    readTime: 11,
    age: '5d ago',
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
    id: 'rent',
    category: 'Home',
    title: 'How to actually negotiate rent',
    summary:
      'A thread of scripts that work: ask after the renewal notice lands, name a number, offer a longer term.',
    source: '@rentwise',
    sourceKind: 'x',
    tags: ['apartment-hunt', 'money'],
    readTime: 4,
    age: '1w ago',
  },
  {
    id: 'miradouros',
    category: 'Travel',
    title: 'Lisbon’s quiet viewpoints',
    summary:
      'A carousel of miradouros without the crowds — go at sunrise, bring coffee, the river does the rest.',
    source: '@quietplaces',
    sourceKind: 'instagram',
    tags: ['lisbon', 'places'],
    readTime: 2,
    age: '2w ago',
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
    id: 'shoulder',
    category: 'Travel',
    title: 'The case for the shoulder-season trip',
    summary:
      'October gets you the same city at half the crowds and a third off the flights. The catch: you have to book before summer ends.',
    source: 'theatlantic.com',
    tags: ['lisbon', 'when-to-go'],
    readTime: 9,
    age: '2mo ago',
    note: 'Maya sent this — she’s right about October.',
  },
];


/**
 * Feed order matters to the film: the search's one survivor is deliberately
 * NOT at the top. With the match already on screen the search beat had no
 * visible work to do; buried mid-feed, the non-matches collapse and the match
 * pulls up, which is what a filter actually looks like.
 */
export const FEED_ORDER = ['apartment', 'lisbonvid', 'recipe', 'rent', 'miradouros', 'gift', 'workout', 'shoulder'];

export const byId = (id: string) => {
  const c = CARDS.find((x) => x.id === id);
  if (!c) throw new Error(`no card ${id}`);
  return c;
};

/** The capture scene's incoming article — the one a friend sent. */
export const INCOMING = {
  site: 'theatlantic.com',
  url: 'theatlantic.com/travel/shoulder-season',
  headline: 'The case for the shoulder-season trip',
  standfirst:
    'Same city, half the crowds, a third off the flights — if you can commit before the summer rush does.',
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

/** The Ask exchange. */
export const ASK_QUESTION = 'Where was that place I wanted to go this fall?';

export const ASK_ANSWER = [
  'Lisbon — three of your saves point the same way.',
  '',
  'The video you saved lays out three days there, the carousel is the quiet viewpoints at sunrise, and the article Maya sent makes the case for going in October — before flights jump.',
].join('\n');

export const ASK_SOURCES = [
  { id: 'lisbonvid', label: 'Beautiful Destinations', kind: 'youtube' as const, title: 'Three days in Lisbon' },
  { id: 'miradouros', label: '@quietplaces', kind: 'instagram' as const, title: 'Lisbon’s quiet viewpoints' },
  { id: 'shoulder', label: 'theatlantic.com', kind: 'link' as const, title: 'The case for the shoulder-season trip' },
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
  // The caption's claim lives in cluster 0: the video saved days ago and the
  // article saved two months ago sit on the same island.
  { id: 'lisbonvid', x: 0.33, y: 0.36, r: 15, cluster: 0, category: 'Travel', label: 'Three days in Lisbon' },
  { id: 'shoulder', x: 0.47, y: 0.27, r: 13, cluster: 0, category: 'Travel', label: 'The October case' },
  { id: 'miradouros', x: 0.24, y: 0.5, r: 11, cluster: 0, category: 'Travel' },
  { id: 'flights', x: 0.42, y: 0.5, r: 9, cluster: 0, category: 'Travel' },
  { id: 'packing', x: 0.35, y: 0.62, r: 8, cluster: 0, category: 'Travel' },
  { id: 'apartment', x: 0.7, y: 0.42, r: 12, cluster: 1, category: 'Home', label: 'Balcony two-bed' },
  { id: 'rent', x: 0.79, y: 0.56, r: 11, cluster: 1, category: 'Home' },
  { id: 'neighborhood', x: 0.66, y: 0.62, r: 10, cluster: 1, category: 'Home' },
  { id: 'commute', x: 0.81, y: 0.33, r: 8, cluster: 1, category: 'Home' },
  // NOT labelled with the cluster's own words — label and island caption
  // stacked read as the same words twice (the same dedup the app itself does).
  { id: 'recipe', x: 0.55, y: 0.78, r: 11, cluster: 2, category: 'Cooking', label: 'Lemon chicken orzo' },
  { id: 'marketlist', x: 0.44, y: 0.86, r: 8, cluster: 2, category: 'Cooking' },
  { id: 'pasta', x: 0.66, y: 0.86, r: 8, cluster: 2, category: 'Cooking' },
];

export const GRAPH_EDGES: [string, string][] = [
  ['lisbonvid', 'shoulder'],
  ['lisbonvid', 'miradouros'],
  ['shoulder', 'flights'],
  ['miradouros', 'flights'],
  ['lisbonvid', 'packing'],
  ['packing', 'shoulder'],
  ['apartment', 'rent'],
  ['apartment', 'commute'],
  ['rent', 'neighborhood'],
  ['neighborhood', 'apartment'],
  ['shoulder', 'apartment'],
  ['recipe', 'marketlist'],
  ['recipe', 'pasta'],
  ['recipe', 'shoulder'],
  ['marketlist', 'pasta'],
  ['rent', 'recipe'],
];

/** Island captions. The app draws these in textSecondary, NOT in a cluster
 *  colour — they are type, not legend. */
export const CLUSTERS = [
  { name: 'Lisbon, this fall', x: 0.35, y: 0.19 },
  { name: 'The apartment hunt', x: 0.74, y: 0.24 },
  { name: 'Weeknight cooking', x: 0.55, y: 0.93 },
];

/** The digest beat. (No "library" anywhere in the film — standing owner rule.) */
export const SYNTHESIS = {
  kicker: 'This week in your saves',
  title: 'You keep circling one trip',
  body: 'Three of your six saves this week were about Lisbon — the itinerary, the viewpoints, and the article Maya sent. The city is chosen. The dates are not.',
};

export const REVIEW = {
  title: 'Gift idea: the ceramic pour-over set',
  meta: 'Saved 30 days ago · never revisited',
};
