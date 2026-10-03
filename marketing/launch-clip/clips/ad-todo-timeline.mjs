/**
 * Meta ad 3 of 3 (compositions MachinaAdTodo*): its single source of time.
 * Picture (src/reels/ads/todo/), score (audio/ads/todo-score.mjs), narrator
 * (audio/synth-vo.py adtodo), mix (audio/mix-vo.mjs adtodo / adtodo-music)
 * and `npm run verify` (audio/ads/todo-verify.mjs) all read this file.
 *
 * ROUND 6, the owner's approved script (2026-10-03): one real person talking
 * to a friend, not an ad reading out features (owner: "the narration sounds
 * robotic … explain further and talk more"). Read like the other ads (owner:
 * "the other videos' narration is perfect"): the house voice at the house
 * pace, in SHORT lines, each synthesized on its own with air around it (the
 * first cut read long lines at 1.1× and sounded rushed and flat). Each line is
 * set on screen in chunks (`chunks`, at most 8 words), each arriving as its
 * first word is said.
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

/**
 * THE CUT, in output frames. Every scene reads these numbers, and so does the
 * score. Most follow the narrator's words (src/reels/ads/todo/vo.json): each
 * is noted with the word it lands on.
 */
export const HITS = {
  // 1 THE PAIN (Hook.tsx): the saves are already there on frame 0 (the poster)
  stir: 43, // "How many things…": the saves ripple, one after another ("How" 39)
  grey: 117, // "…and never open again?": they grey out ("never" 119)
  named: [174, 228, 270, 301], // each lights up as it is named: "video" 177, "post" 231, "article" 273, "screenshot" 304
  bury: [403, 459], // "…buried across a dozen different apps" ("buried" 411): they drift apart and fade
  // 2 THE ANSWER
  gather: [512, 532], // they rush into one point
  snap: 536, // the brackets snap round it as "Machina" lands (532)
  iris: [548, 564], // the point opens onto the app
  // 3 SAVE: four saves land at the top of the feed, each on its word
  lands: [638, 653, 666, 685], // "Videos" 642, "posts" 657, "articles" 670, "screenshots" 689
  // 4 WHAT IT DOES
  glide: [784, 912], // down the feed, every save summarized ("Then Machina gets to work… summarizes it")
  kpOpen: 920, // one card opens…
  kpScroll: [945, 969], // …down to its Key Points
  keyPoints: 972, // which lift on "key points" (969)
  // 5 LINKED
  cluster: 1080, // cut on "It even connects" into the graph as it zooms onto a lit cluster
  cluster2: 1184, // a second cluster lights up, into "so your ideas" (1200)
  // 6 CLOSE
  out: 1264, // thrown out of frame as "…each other." ends
  markStrike: 1288, // the lockup's mark strikes
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
export const TOTAL_FRAMES = 1440;
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
  chunks,
  text: chunks.map(([, t]) => t).join('\n'),
  ...extra,
});

export const CAPTIONS = [
  line(8, 168, 'Okay, be honest. How many things did you save this month… and never open again?', [
    [3, 'How many things did you save\nthis month…'],
    [11, '…and never open again?'],
  ], { hook: true }),
  line(168, 224, 'That video you’d watch later.', [[0, 'That video you’d watch later.']]),
  line(224, 264, 'The post you loved.', [[0, 'The post you loved.']]),
  line(264, 296, 'That article.', [[0, 'That article.']]),
  line(296, 368, 'The screenshot you swore you’d remember.', [[0, 'The screenshot you swore\nyou’d remember.']]),
  line(368, 488, 'They’re all still out there, buried across a dozen different apps.', [
    [0, 'They’re all still out there,'],
    [5, 'buried across a dozen\ndifferent apps.'],
  ]),
  line(488, 568, 'That’s exactly why we made Machina.', [[0, 'That’s exactly why\nwe made Machina.']]),
  line(568, 640, 'From any app, just share to Machina.', [[0, 'From any app,\njust share to Machina.']]),
  line(640, 784, 'Videos, posts, articles, screenshots… it all lands in one place.', [
    [0, 'Videos, posts, articles,\nscreenshots…'],
    [4, '…it all lands in one place.'],
  ]),
  line(784, 848, 'Then Machina gets to work.', [[0, 'Then Machina gets to work.']]),
  line(848, 1080, 'It analyzes every save, summarizes it, and pulls out the key points… so you’ll always remember why you kept it.', [
    [0, 'It analyzes every save,\nsummarizes it,'],
    [6, 'and pulls out the key points,'],
    [12, 'so you’ll always remember\nwhy you kept it.'],
  ]),
  line(1080, HITS.out, 'It even connects each save to related ones you’ve kept before… so your ideas start building on each other.', [
    [0, 'It even connects each save'],
    [5, 'to related ones\nyou’ve kept before,'],
    [11, 'so your ideas start\nbuilding on each other.'],
  ]),
  // the close, on the lockup: the wordmark wipes in on "Machina"; the tagline,
  // exactly, closes (owner, 2026-09-28: every film ends on it)
  { at: HITS.markStrike + 8, to: TOTAL_FRAMES, place: 'lockup', text: 'Machina.\nEverything you save, finally useful.', duck: 0.4, showFirstLine: false },
];

/** no chapter words */
export const KICKERS = [];

/**
 * THE SCORE (audio/ads/todo-score.mjs): one chord per bar from the reel's
 * C-major vocabulary. The pain hangs on IV and vi-less V, the answer resolves
 * home, the app walks I V IV I, the links lift, the lockup holds C.
 */
export const BAR_CHORDS = [
  'Fmaj7', 'Fmaj7', 'G6', 'Fmaj7', 'G6', 'Fmaj7', 'G6', 'Fmaj7', // the pain (0–7)
  'Cmaj7', // the answer (8)
  'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'G6', // the app (9–16)
  'Fmaj7', 'G6', 'Cmaj7', 'Cmaj7', 'Cmaj7', 'Cmaj7', // linked, the close (17–22)
];
/** the drums: in as the app opens, out for the lockup */
export const DRUMS = [HITS.iris[0], HITS.out];
/** risers END on the reveal they lead into: the mark, the graph, the strike */
export const RISERS = [
  [HITS.gather[0] - 32, HITS.snap],
  [HITS.cluster - 24, HITS.cluster],
  [HITS.out - 16, HITS.markStrike],
];
