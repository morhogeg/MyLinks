/**
 * The library the film shows.
 *
 * It is one person's real-looking research trail on a single question — why
 * things you read don't stick — because that is what makes the Ask scene land:
 * the answer can genuinely be assembled out of these specific cards, and the
 * search scene can find them with a phrase that shares NO words with them.
 * A grab-bag of unrelated demo links would make every later scene a lie.
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
    id: 'sleep',
    category: 'Neuroscience',
    title: 'Sleep-dependent memory consolidation',
    summary:
      'Hippocampal replay during slow-wave sleep is what moves a fact from fragile to durable. Skip the stage and the fact never lands.',
    source: 'nature.com',
    tags: ['memory/consolidation', 'sleep'],
    readTime: 12,
    age: '2d ago',
  },
  {
    id: 'retrieval',
    category: 'Learning',
    title: 'Retrieval practice beats re-reading',
    summary:
      'Testing yourself once outperforms four passes of highlighting. The effort of pulling something back is the thing that strengthens it.',
    source: 'Veritasium',
    sourceKind: 'youtube',
    tags: ['recall', 'testing-effect'],
    readTime: 9,
    age: '5d ago',
    note: 'This is the one I never actually do.',
  },
  {
    id: 'curve',
    category: 'Research',
    title: 'The forgetting curve, replicated',
    summary:
      'A modern replication of Ebbinghaus: without a second exposure, most of what you read is gone inside a week.',
    source: '@neuro.explained',
    sourceKind: 'instagram',
    tags: ['memory', 'spacing'],
    readTime: 7,
    age: '1w ago',
  },
  {
    id: 'switch',
    category: 'Focus',
    title: 'The real cost of switching context',
    summary:
      'Each interruption carries a tail: the residue of the last task keeps consuming capacity long after you have moved on.',
    source: 'Cal Newport',
    sourceKind: 'facebook',
    tags: ['attention', 'deep-work'],
    readTime: 5,
    age: '1w ago',
  },
  {
    id: 'thread',
    category: 'Product',
    title: 'Why every second brain quietly dies',
    summary:
      'A thread on capture tools: collecting is frictionless and feels productive, so the tool optimises the half of the loop that was never the problem.',
    source: '@shreyas',
    sourceKind: 'x',
    tags: ['tools-for-thought'],
    readTime: 4,
    age: '2w ago',
  },
  {
    id: 'shot',
    category: 'Design',
    title: 'Whiteboard — the retention loop',
    summary:
      'Screenshot of the loop sketch: capture → resurface → retrieve → strengthen. The arrow back is the only one that matters.',
    source: 'Screenshot',
    sourceKind: 'screenshot',
    tags: ['loops', 'sketch'],
    readTime: 1,
    age: '2w ago',
  },
  {
    id: 'attention',
    category: 'Learning',
    title: 'How to actually read a paper',
    summary:
      'The three-pass method, walked through on a real paper. The second pass is the one everybody skips and the one that does the work.',
    source: 'Andrej Karpathy',
    sourceKind: 'youtube',
    tags: ['reading', 'method'],
    readTime: 14,
    age: '3w ago',
  },
  {
    id: 'depth',
    category: 'Reading',
    title: 'Deep reading is a learned posture',
    summary:
      'Fluent decoding is not comprehension. The slow, re-reading, argue-with-it posture has to be practised or it decays.',
    source: 'newyorker.com',
    tags: ['reading', 'attention'],
    readTime: 14,
    age: '3w ago',
  },
];


/**
 * Feed order matters to the film: the three semantic matches are deliberately
 * NOT adjacent. With them stacked at the top, the search beat had no visible
 * work to do — nothing moved, because everything that stayed was already on
 * screen. Interleaved, the non-matches collapse and the matches pull up, which
 * is what a filter actually looks like.
 */
export const FEED_ORDER = ['sleep', 'switch', 'retrieval', 'thread', 'curve', 'shot', 'attention', 'depth'];

export const byId = (id: string) => {
  const c = CARDS.find((x) => x.id === id);
  if (!c) throw new Error(`no card ${id}`);
  return c;
};

/** The capture scene's incoming article. */
export const INCOMING = {
  site: 'nature.com',
  url: 'nature.com/articles/sleep-consolidation',
  headline: 'Sleep-dependent memory consolidation',
  standfirst:
    'Slow-wave sleep replays the day’s hippocampal traces into cortex — the step that decides what you still know next week.',
};

/**
 * The search demo. The query shares NOT ONE word with the cards it retrieves —
 * that is the whole point of the scene, and it is why the phrasing here is
 * fixed rather than decorative.
 */
export const SEARCH_QUERY = 'why cramming never sticks';
export const SEARCH_HITS = ['sleep', 'retrieval', 'curve'];

/** The Ask exchange. */
export const ASK_QUESTION = 'Why do I keep forgetting what I read?';

export const ASK_ANSWER = [
  'Three of your saves land on the same answer: the bottleneck is retrieval, not storage.',
  '',
  'The Nature paper ties durability to sleep-stage replay, the Veritasium video shows one act of recall beating four re-reads, and the carousel you saved puts a curve on it. Your own note is the bridge — you wrote that this is the one you never actually do.',
].join('\n');

export const ASK_SOURCES = [
  { id: 'sleep', label: 'nature.com', kind: 'link' as const, title: 'Sleep-dependent memory consolidation' },
  { id: 'retrieval', label: 'Veritasium', kind: 'youtube' as const, title: 'Retrieval practice beats re-reading' },
  { id: 'curve', label: '@neuro.explained', kind: 'instagram' as const, title: 'The forgetting curve, replicated' },
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
  { id: 'sleep', x: 0.33, y: 0.36, r: 15, cluster: 0, category: 'Neuroscience', label: 'Sleep consolidation' },
  { id: 'retrieval', x: 0.47, y: 0.27, r: 13, cluster: 0, category: 'Learning', label: 'Retrieval practice' },
  { id: 'curve', x: 0.24, y: 0.5, r: 11, cluster: 0, category: 'Research' },
  { id: 'spacing', x: 0.42, y: 0.5, r: 9, cluster: 0, category: 'Learning' },
  { id: 'note', x: 0.35, y: 0.62, r: 8, cluster: 0, category: 'Neuroscience' },
  { id: 'switch', x: 0.7, y: 0.42, r: 12, cluster: 1, category: 'Focus', label: 'Cost of switching' },
  { id: 'depth', x: 0.79, y: 0.56, r: 11, cluster: 1, category: 'Reading' },
  { id: 'attention', x: 0.66, y: 0.62, r: 10, cluster: 1, category: 'Focus' },
  { id: 'focus', x: 0.81, y: 0.33, r: 8, cluster: 1, category: 'Reading' },
  // NOT labelled 'Tools for thought' — that is the cluster's label, and the two
  // stacked read as the same words twice (the same dedup the app itself does).
  { id: 'thread', x: 0.55, y: 0.78, r: 11, cluster: 2, category: 'Product', label: 'Why second brains die' },
  { id: 'shot', x: 0.44, y: 0.86, r: 8, cluster: 2, category: 'Design' },
  { id: 'loops', x: 0.66, y: 0.86, r: 8, cluster: 2, category: 'Product' },
];

export const GRAPH_EDGES: [string, string][] = [
  ['sleep', 'retrieval'],
  ['sleep', 'curve'],
  ['retrieval', 'spacing'],
  ['curve', 'spacing'],
  ['sleep', 'note'],
  ['note', 'retrieval'],
  ['switch', 'depth'],
  ['switch', 'focus'],
  ['depth', 'attention'],
  ['attention', 'switch'],
  ['retrieval', 'switch'],
  ['thread', 'shot'],
  ['thread', 'loops'],
  ['thread', 'retrieval'],
  ['shot', 'loops'],
  ['depth', 'thread'],
];

/** Island captions. The app draws these in textSecondary, NOT in a cluster
 *  colour — they are type, not legend. */
export const CLUSTERS = [
  { name: 'Memory · Retrieval', x: 0.35, y: 0.19 },
  { name: 'Attention · Focus', x: 0.74, y: 0.24 },
  { name: 'Tools for thought', x: 0.55, y: 0.93 },
];

/** The digest beat. */
export const SYNTHESIS = {
  kicker: 'This week in your library',
  title: 'You circled one idea all week',
  body: 'Five of your seven saves were about recall, not capture. The pattern you keep arriving at: nothing sticks without a second pass — and you have never scheduled one.',
};

export const REVIEW = {
  title: 'Retrieval practice beats re-reading',
  meta: 'Saved 30 days ago · never revisited',
};
