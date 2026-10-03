/**
 * Meta ad 3 of 3 (compositions MachinaAdTodo*): its single source of time.
 * Picture (src/reels/ads/todo/), score (audio/ads/todo-score.mjs), narrator
 * (audio/synth-vo.py adtodo), mix (audio/mix-vo.mjs adtodo / adtodo-music)
 * and `npm run verify` (audio/ads/todo-verify.mjs) all read this file.
 *
 * ROUND 6, the owner's approved script (2026-10-03): one real person talking
 * to a friend, not an ad reading out features (owner: "the narration sounds
 * robotic … explain further and talk more"). Every line is spoken whole, at a
 * natural pace (`speed`), and set on screen in short chunks (`chunks`, at
 * most 8 words each), each arriving as its first word is said.
 *
 *  1 THE PAIN     "Okay, be honest…": real saves of every kind, scattered;
 *                 they grey out on "never open again"; each lights up as it
 *                 is named (the video, the post, the article, the
 *                 screenshot); they drift apart and fade on "buried"
 *  2 THE ANSWER   "That's exactly why we made Machina.": they rush into one
 *                 point, the brackets snap round it on "Machina"
 *  3 SAVE         "From any app, just share to Machina…": the mark opens onto
 *                 the app; a video, a post, an article and a screenshot land
 *                 in the feed, one per word
 *  4 WHAT IT DOES "Then Machina gets to work…": a glide down the feed, every
 *                 save summarized; one card opens to its Key Points, which lift
 *  5 LINKED       "It even connects each save…": the Graph view zooming onto
 *                 a cluster of linked saves, then a second cluster
 *  6 CLOSE        the kit's lockup: "Machina. Everything you save, finally
 *                 useful." (no "Download Machina" anywhere: owner, round 5)
 *
 * OUTPUT frames at 30fps on the reel's grid (112.5 BPM, 16 frames a beat). The
 * app is one take, `adTodo` (capture/shoot.mjs), recorded at 60fps and played
 * at its real speed (`rate: 2`).
 */

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
/** the Feed edition (4:5) */
export const FEED_HEIGHT = 1350;

export const BPM = 112.5;
export const BEAT_FRAMES = 16;
export const BAR_FRAMES = 64;
export const BEAT = BEAT_FRAMES / FPS;
export const BAR = BAR_FRAMES / FPS;

/** the nearest beat */
export const onBeat = (f) => Math.round(f / BEAT_FRAMES) * BEAT_FRAMES;

export const TAKE = 'adTodo';

/** the narrator's delivery: a touch quicker than the kit's 0.95, the pace of
 *  someone talking rather than announcing */
const SPEED = 1.1;

/**
 * THE CUT, in output frames. Every scene reads these numbers, and so does the
 * score. Most follow the narrator's words (src/reels/ads/todo/vo.json): each
 * is noted with the word it lands on.
 */
export const HITS = {
  // 1 THE PAIN (Hook.tsx): the saves are already there on frame 0 (the poster)
  stir: 48, // "How many things…": the saves ripple, one after another
  grey: 108, // "…and never open again?": they grey out ("never" 110)
  named: [148, 196, 232, 260], // each lights up as it is named: "video" 151, "post" 198, "article" 235, "screenshot" 262
  bury: [344, 400], // "…out there, buried across a dozen different apps": they drift apart and fade
  // 2 THE ANSWER
  gather: [424, 444], // they rush into one point
  snap: 448, // the brackets snap round it on "Machina" (449)
  iris: [460, 476], // the point opens onto the app
  // 3 SAVE: four saves land at the top of the feed, each on its word
  lands: [532, 548, 560, 576], // "Videos" 536, "posts" 550, "articles" 562, "screenshots" 578
  // 4 WHAT IT DOES
  glide: [656, 776], // down the feed, every save summarized ("Then Machina gets to work… summarizes it")
  kpOpen: 784, // one card opens…
  kpScroll: [800, 824], // …down to its Key Points
  keyPoints: 824, // which lift on "key points" (821)
  // 5 LINKED
  cluster: 912, // cut on "It even connects" into the graph as it zooms onto a lit cluster
  cluster2: 1000, // a second cluster lights up, into "so your ideas" (1018)
  // 6 CLOSE
  out: 1072, // thrown out of frame as "…each other." ends
  markStrike: 1096, // the lockup's mark strikes
};

/** the four landings, in take order (capture/ad-todo.mjs sourceCards) */
export const LANDS = ['youtube', 'instagram', 'article', 'screenshot'];

/**
 * The app's take, by stretch: which capture mark plays from which output
 * frame, how many captured frames it has, at what rate (2 = the app's real
 * speed) and from which captured frame (`from`).
 */
export const PLAY = {
  ...Object.fromEntries(LANDS.map((k, i) => [`${k}Land`, { at: HITS.lands[i], n: 36, rate: 2, from: 0 }])),
  kpOpen: { at: HITS.kpOpen, n: 40, rate: 2, from: 0 },
  cluster: { at: HITS.cluster, n: 60, rate: 2, from: 0 },
  cluster2: { at: HITS.cluster2, n: 60, rate: 2, from: 0 },
};

export const THROW_LEN = 24;
/** the tagline holds ~1.7s once its last word has landed; verify measures it */
export const TOTAL_FRAMES = 1232;
export const TOTAL_SEC = TOTAL_FRAMES / FPS;

/**
 * The narrator: each line is spoken whole (`say`, verbatim; "Machina"
 * respelled for the voice only) and set on screen in `chunks`: [index of the
 * chunk's first spoken word, the text shown]. A chunk stays up until the next
 * one arrives, the last until `to`. `text` is the chunks joined (what the
 * screen says). (A spoken pause is written "..." so the word aligner splits
 * the phrase there; the screen shows "…".) The hook's first chunk is on screen from frame 0 (the poster);
 * "Okay, be honest." is spoken over it. At most 8 words per chunk.
 * NO em dashes, no literal "AI", no "second brain", no "library", never
 * "share sheet" or "bookmarks", no "free", no price, no plan, nothing about
 * the viewer's health or money.
 */
const line = (at, to, say, chunks, extra = {}) => ({
  at,
  to,
  say,
  speed: SPEED,
  chunks,
  text: chunks.map(([, t]) => t).join('\n'),
  ...extra,
});

export const CAPTIONS = [
  line(8, 140, 'Okay, be honest. How many things did you save this month... and never open again?', [
    [3, 'How many things did you save\nthis month…'],
    [11, '…and never open again?'],
  ], { hook: true }),
  line(144, 310, 'That video you’d watch later. The post you loved. That article. The screenshot you swore you’d remember.', [
    [0, 'That video you’d watch later.'],
    [5, 'The post you loved.'],
    [9, 'That article.'],
    [11, 'The screenshot you swore\nyou’d remember.'],
  ]),
  line(312, 406, 'They’re all still out there, buried across a dozen different apps.', [
    [0, 'They’re all still out there,'],
    [5, 'buried across a dozen\ndifferent apps.'],
  ]),
  line(408, 464, 'That’s exactly why we made Machina.', [[0, 'That’s exactly why\nwe made Machina.']]),
  line(472, 652, 'From any app, just share to Machina. Videos, posts, articles, screenshots... it all lands in one place.', [
    [0, 'From any app,\njust share to Machina.'],
    [7, 'Videos, posts, articles,\nscreenshots…'],
    [11, '…it all lands in one place.'],
  ]),
  line(656, 904, 'Then Machina gets to work. It analyzes every save, summarizes it, and pulls out the key points, so you’ll always remember why you kept it.', [
    [0, 'Then Machina gets to work.'],
    [5, 'It analyzes every save,\nsummarizes it,'],
    [11, 'and pulls out the key points,'],
    [17, 'so you’ll always remember\nwhy you kept it.'],
  ]),
  line(912, 1076, 'It even connects each save to related ones you’ve kept before, so your ideas start building on each other.', [
    [0, 'It even connects each save'],
    [5, 'to related ones\nyou’ve kept before,'],
    [11, 'so your ideas start\nbuilding on each other.'],
  ]),
  // the close, on the lockup: the wordmark wipes in on "Machina"; the tagline,
  // exactly, closes (owner, 2026-09-28: every film ends on it)
  { at: HITS.markStrike + 8, to: TOTAL_FRAMES, place: 'lockup', text: 'Machina.\nEverything you save, finally useful.', speed: SPEED, duck: 0.4, showFirstLine: false },
];

/** no chapter words */
export const KICKERS = [];

/**
 * THE SCORE (audio/ads/todo-score.mjs): one chord per bar from the reel's
 * C-major vocabulary. The pain hangs on IV and vi-less V, the answer resolves
 * home, the app walks I V IV I, the links lift, the lockup holds C.
 */
export const BAR_CHORDS = [
  'Fmaj7', 'Fmaj7', 'G6', 'Fmaj7', 'G6', 'Fmaj7', 'G6', // the pain (0–6)
  'Cmaj7', // the answer (7)
  'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', // the app (8–14)
  'Fmaj7', 'G6', 'Cmaj7', 'Cmaj7', 'Cmaj7', // linked, the close (15–19)
];
/** the drums: in as the app opens, out for the lockup */
export const DRUMS = [HITS.iris[0], HITS.out];
/** risers END on the reveal they lead into: the mark, the graph, the strike */
export const RISERS = [
  [HITS.gather[0] - 32, HITS.snap],
  [HITS.cluster - 24, HITS.cluster],
  [HITS.out - 16, HITS.markStrike],
];
