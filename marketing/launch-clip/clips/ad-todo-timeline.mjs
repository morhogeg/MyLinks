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
 * is noted with the word it lands on. They are laid out FROM the read: when
 * the voice changes, the lines and these beats are re-derived from its
 * measured word times (round 6, Gemini Sulafat: 60.8s).
 */
export const HITS = {
  // 1 THE PAIN (Hook.tsx): the saves are already there on frame 0 (the poster)
  stir: 44, // "How many things…": the saves ripple, one after another
  grey: 91, // "…and never open again?": they grey out
  named: [134, 186, 220, 244], // each lights up as it is named
  bury: [352, 408], // "…buried across a dozen different apps": they drift apart and fade
  // 2 THE ANSWER
  gather: [448, 468], // they rush into one point
  snap: 472, // the brackets snap round it as "Machina" lands
  iris: [500, 516], // the point opens onto the app
  // 3 SAVE: four saves land at the top of the feed, each on its word
  lands: [565, 578, 593, 609], // "Videos", "posts", "articles", "screenshots"
  // 4 WHAT IT DOES
  glide: [704, 808], // down the feed, every save summarized ("Then Machina gets to work… summarizes it")
  kpOpen: 816, // one card opens…
  kpScroll: [842, 866], // …down to its Key Points
  keyPoints: 869, // which lift on "key points"
  // 5 LINKED
  cluster: 960, // cut on "It even connects" into the graph as it zooms onto a lit cluster
  cluster2: 1040, // a second cluster lights up, into "so your ideas"
  // 6 CLOSE
  out: 1136, // thrown out of frame as "…each other." ends
  markStrike: 1160, // the lockup's mark strikes
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
export const TOTAL_FRAMES = 1312;
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
/**
 * HEADLINE CAPTIONS (2026-10-04, owner: "headline captions", and the old
 * word-by-word reveal read "dated and laggy"). The narrator still says every
 * word (`say`); the screen carries each line's point in 2–5 words (`heads`:
 * [index of the spoken word it lands on, the headline]; `*…*` marks the phrase
 * the highlighter sweeps under). A headline arrives a beat before its word and
 * rolls out as the next rolls in (kit/Type.tsx `Headline`). `text` is the
 * headlines, plain (what verify scans).
 */
const line = (at, to, say, heads, extra = {}) => ({
  at,
  to,
  say,
  heads,
  text: heads.map(([, t]) => t.replaceAll('*', '')).join('\n'),
  ...extra,
});

/**
 * Gemini TTS direction (audio/gemini_tts.py, VO_ENGINE=gemini; Kokoro ignores
 * it): `style`, the line's acting note, and `tts`, the words as performed,
 * with inline vocal tags. The captions, word timing and verify keep the plain
 * words.
 */
const act = (style, tts) => (tts ? { style, tts } : { style });
/** the problem (owner: "a bit too slow… punchier, move a bit quicker"):
 *  brisk delivery, pauses capped tighter, and 10% quicker (the model barely
 *  quickens when asked, so the tempo is set after: gemini_tts.stretch) */
const punchy = (style, tts) => ({ ...act(`Punchy and quick, moving briskly, no lingering: ${style}`, tts), maxPause: 0.2, tempo: 1.1 });

export const CAPTIONS = [
  line(8, 128, 'Okay, be honest. How many things did you save this month… and never open again?', [[0, 'Saved it.\n*Never* opened it.']], { hook: true, ...punchy('Leaning in with a knowing, playful smile, gently teasing a friend; a touch of mock guilt on "and never open again?"') }),
  line(128, 184, 'That video you’d watch later.', [[1, 'That *video*…']], punchy('Wry and amused, naming the first familiar culprit, quick and light')),
  line(184, 216, 'The post you loved.', [[1, 'That *post*…']], punchy('Fond, a little wistful, still smiling')),
  line(216, 240, 'That article.', [[1, 'That *article*…']], punchy('Deadpan, knowing, a little smile in it')),
  line(240, 312, 'The screenshot you swore you’d remember.', [[1, 'That *screenshot*…']], punchy('Playfully incredulous, smiling: we both know how that went')),
  line(312, 432, 'They’re all still out there, buried across a dozen different apps.', [[0, 'Lost across *a dozen apps*']], punchy('Sympathetic and a touch lower, with a soft sigh before "buried"', 'They’re all still out there, <sigh> buried across a dozen different apps.')),
  line(432, 504, 'That’s exactly why we made Machina.', [[0, 'So we made *Machina*']], punchy('Turning bright: the reveal, warm and proud, the name landing with a smile')),
  line(504, 568, 'From any app, just share to Machina.', [[0, 'Share from *any app*']], act('Easy and reassuring, like it is the simplest thing in the world')),
  line(568, 704, 'Videos, posts, articles, screenshots… it all lands in one place.', [[0, 'Videos, posts, *articles*…'], [4, 'All in *one place*']], act('A quick, light rhythm through the list, then relaxed and satisfied on "it all lands in one place"')),
  line(704, 776, 'Then Machina gets to work.', [[0, 'Then it *gets to work*']], act('Playful anticipation, like about to show a friend a good trick')),
  line(776, 960, 'It analyzes every save, summarizes it, and pulls out the key points… so you’ll always remember why you kept it.', [[0, 'Every save *summarized*'], [10, 'The *key points*, pulled out'], [15, 'So you *remember why*']], act('Genuinely enthusiastic, explaining something you love, moving along; warm on "so you’ll always remember why you kept it"')),
  line(960, HITS.out, 'It even connects each save to related ones you’ve kept before… so your ideas start building on each other.', [[0, '*Linked* to related saves'], [11, 'Ideas that *build*']], act('Delighted, a little wonder on "It even", building gently to a satisfied "building on each other"')),
  // the close, on the lockup: the wordmark wipes in on "Machina"; the tagline,
  // exactly, closes (owner, 2026-09-28: every film ends on it)
  { at: HITS.markStrike + 8, to: TOTAL_FRAMES, place: 'lockup', text: 'Machina.\nEverything you save, finally useful.', duck: 0.4, showFirstLine: false, ...act('A confident, warm sign-off with a smile; the name proud, then the tagline unhurried and sincere', 'Machina. Everything you save, finally useful.') },
];

/**
 * THE FULL CAPTIONS (owner, 2026-10-04: "show me a version with the full
 * captions as we had them, but with the updated animation"): every narrated
 * line set on screen in chunks, as in round 6 before the headlines, one entry
 * per narrated line in CAPTIONS order: [index of the chunk's first spoken
 * word, the text]. Rendered by MachinaAdTodoFullCaptions with the same
 * Headline motion.
 */
export const FULL_CAPTIONS = [
  [[3, "How many things did you save\nthis month…"], [11, "…and never open again?"]],
  [[0, "That video you’d watch later."]],
  [[0, "The post you loved."]],
  [[0, "That article."]],
  [[0, "The screenshot you swore"], [4, "you’d remember."]],
  [[0, "They’re all still out there,"], [5, "buried across a dozen\ndifferent apps."]],
  [[0, "That’s exactly why\nwe made Machina."]],
  [[0, "From any app,"], [3, "just share to Machina."]],
  [[0, "Videos, posts, articles,\nscreenshots…"], [4, "…it all lands in one place."]],
  [[0, "Then Machina"], [2, "gets to work."]],
  [[0, "It analyzes every save,\nsummarizes it,"], [6, "and pulls out the key points,"], [12, "so you’ll always remember"], [16, "why you kept it."]],
  [[0, "It even connects each save"], [5, "to related ones\nyou’ve kept before,"], [11, "so your ideas start\nbuilding on each other."]],
];

/** no chapter words */
export const KICKERS = [];

/**
 * THE SCORE (audio/ads/todo-score.mjs): one chord per bar from the reel's
 * C-major vocabulary. The pain hangs on IV and vi-less V, the answer resolves
 * home, the app walks I V IV I, the links lift, the lockup holds C.
 */
const PAIN = ['Fmaj7', 'Fmaj7', 'G6', 'Fmaj7', 'G6', 'Fmaj7', 'G6', 'Fmaj7'];
const APP = ['Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'G6'];
const LINKED = ['Fmaj7', 'G6', 'Cmaj7'];
/** one chord a bar, by section, read off the beats (so a re-timed read keeps
 *  its harmony): the pain hangs on IV and V, the answer resolves home on the
 *  mark, the app walks I V IV I, the links lift, the lockup holds C */
export const BAR_CHORDS = Array.from({ length: Math.ceil(TOTAL_FRAMES / BAR_FRAMES) }, (_, bar) => {
  const f = bar * BAR_FRAMES;
  if (f >= HITS.out) return 'Cmaj7';
  if (f >= HITS.cluster - BAR_FRAMES / 2) return LINKED[Math.floor((f - HITS.cluster + BAR_FRAMES / 2) / BAR_FRAMES) % LINKED.length];
  if (f >= HITS.snap - BAR_FRAMES / 2) return APP[Math.floor((f - HITS.snap + BAR_FRAMES / 2) / BAR_FRAMES) % APP.length];
  return PAIN[bar % PAIN.length];
});
/** the drums: in as the app opens, out for the lockup */
export const DRUMS = [HITS.iris[0], HITS.out];
/** risers END on the reveal they lead into: the mark, the graph, the strike */
export const RISERS = [
  [HITS.gather[0] - 32, HITS.snap],
  [HITS.cluster - 24, HITS.cluster],
  [HITS.out - 16, HITS.markStrike],
];
