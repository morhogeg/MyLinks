/**
 * Meta ad 3 of 3 (compositions MachinaAdTodo*): its single source of time.
 * Picture (src/reels/ads/todo/), score (audio/ads/todo-score.mjs), narrator
 * (audio/synth-vo.py adtodo), mix (audio/mix-vo.mjs adtodo / adtodo-music)
 * and `npm run verify` (audio/ads/todo-verify.mjs) all read this file.
 *
 * ROUND 4 (owner: "why are we focusing on advice? It sounds absurd. Machina
 * saves articles, YouTube videos, Instagram posts, any post, screenshots, and
 * they are saved, categorized, analyzed and summarized: focus on that"). The
 * to-do story is gone; the ad is now "save anything, and Machina makes sense
 * of it":
 *
 *  1 HOOK     the pain, on frame 0: real saves of every kind, scattered where
 *             they were kept; "You save it. You never see it again.": they
 *             bleach into the paper
 *  2 SHARE    "Share it to Machina instead.": they rush into one point, the
 *             brackets snap round it (the mark, 2.9s); the point opens as an
 *             iris onto the app
 *  3 ANY KIND "Screenshots, articles, posts, videos.": four saves land at the
 *             top of the feed, each on its word, each already with its source
 *             and its topic
 *  4 STANDOUT "A whole video, down to its key moments.": the video's card
 *             opens on its Key moments, with timestamps; they lift one by one
 *  5 SORTED   "Sorted by topic, all on its own.": cut to the list, every save
 *             with its source and its colour-coded topic; the four new rows lift
 *  6 CTA      the lockup: "Download Machina." in the band to the end, and the
 *             tagline, `Everything you save, finally useful.`
 *
 * Video key moments are a Pro feature (YouTube ingestion); the ad names no
 * plan and never says "free" (as ad 1, CAMPAIGN.md §8). OUTPUT frames at
 * 30fps on the reel's grid (112.5 BPM, 16 frames a beat). The app is one take,
 * `adTodo` (capture/shoot.mjs), recorded at 60fps and played at its real
 * speed (`rate: 2`).
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
 * THE CUT. Every scene reads these numbers, and so does the score, so
 * picture and sound move together. Taps, lifts and cuts on 8ths (the four
 * landings follow the narrator's words instead).
 */
export const HITS = {
  // 1 HOOK (Hook.tsx): the saves are already there on frame 0 (the poster)
  bleach: 40, // "…never see it again.": they bleach into the paper
  // 2 SHARE
  gather: [64, 80], // the saves rush into one point
  snap: 88, // the brackets snap round it: the mark (2.9s)
  iris: [96, 112], // the point opens onto the feed
  // 3 ANY KIND: each save lands at the top of the feed on its word
  // ("Screenshots," "articles," "posts," "videos.")
  // (each a few frames before its word, so the card is arriving as it is said)
  lands: [134, 158, 176, 189],
  // 4 STANDOUT
  cardTap: 224, // the video's card, tapped: it opens on its Key moments
  moments: 280, // …which lift one by one on "key moments", 6 frames apart
  // 5 SORTED
  list: 328, // cut on the beat to the list
  rows: 344, // the four new rows lift one by one, 6 frames apart
  // 6 CTA
  out: 408, // thrown out of frame
  markStrike: 440, // the lockup's mark strikes (the impact)
};

/** the four landings, in take order (capture/ad-todo.mjs sourceCards) */
export const LANDS = ['screenshot', 'article', 'instagram', 'youtube'];

/**
 * The app's take, by stretch: which capture mark plays from which output
 * frame, how many captured frames it has, and at what rate (2 = the app's
 * real speed).
 */
export const PLAY = {
  ...Object.fromEntries(LANDS.map((k, i) => [`${k}Land`, { at: HITS.lands[i], n: 36, rate: 2 }])),
  open: { at: HITS.cardTap, n: 40, rate: 2 },
};

export const THROW_LEN = 24;
/** the tagline holds ~1.7s once its last word has landed (spec: ≥ 1.6s);
 *  verify measures it */
export const TOTAL_FRAMES = 608;
export const TOTAL_SEC = TOTAL_FRAMES / FPS;

/**
 * The narrator = the captions, line for line (the kit's voice, Kokoro
 * af_heart 0.95, "Machina" spoken "Makeena"). `at` is the frame the voice
 * starts (on a beat or an 8th), `to` the frame the line leaves: 0.3 to 1.2s
 * after the voice, or up to 4s with `until` while the action it names still
 * plays. At most 8 words on screen at once. `hook: true` is on screen whole
 * from frame 0 (the poster), the voice starting at frame 8.
 * NO em dashes, no literal "AI", no "second brain", no "library", never
 * "share sheet" or "bookmarks", no "free", no price, no plan, nothing about
 * the viewer's health or money.
 */
export const CAPTIONS = [
  // the pain, on the poster
  { at: 8, to: 78, hook: true, text: 'You save it.\nYou never see it again.' },
  // the turn: everything goes to one place
  { at: 80, to: 136, text: 'Share it to Machina\ninstead.', until: 'the mark opens onto the app' },
  // any kind of save: each lands on its word
  { at: 136, to: 220, text: 'Screenshots, articles,\nposts, videos.' },
  // the standout: a video becomes its key moments
  { at: 232, to: 320, text: 'A whole video, down to\nits key moments.', until: 'the Key moments lift' },
  // sorted, on its own
  { at: 328, to: 400, text: 'Sorted by topic,\nall on its own.', until: 'the four new rows lift' },
  // the CTA and the close: "Download Machina." sits in the caption band to the
  // end; the wordmark wipes in on "Machina"; the tagline, exactly, closes
  // (owner, 2026-09-28: every film ends on it)
  { at: HITS.markStrike + 8, to: TOTAL_FRAMES, place: 'lockup', text: 'Download Machina.\nEverything you save, finally useful.', duck: 0.4 },
];

/** no chapter words: the ad keeps the words on screen to the narration */
export const KICKERS = [];

/**
 * THE SCORE (audio/ads/todo-score.mjs): one chord per bar from the reel's
 * C-major vocabulary. The pain hangs on IV, the mark resolves home, the
 * landings and the video walk I V IV, the list lands home, the lockup holds C.
 */
export const BAR_CHORDS = ['Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'G6', 'Cmaj7', 'Fmaj7', 'Cmaj7', 'Cmaj7', 'Cmaj7'];
/** the drums: in with the landings, out for the lockup */
export const DRUMS = [2 * BAR_FRAMES, HITS.out];
/** risers END on the reveal they lead into: the mark, the cut, the strike */
export const RISERS = [
  [HITS.gather[0] - 32, HITS.snap],
  [HITS.list - 24, HITS.list],
  [HITS.out - 16, HITS.markStrike],
];
