/**
 * Meta ad 3 of 3 (compositions MachinaAdTodo*): its single source of time.
 * Picture (src/reels/ads/todo/), score (audio/ads/todo-score.mjs), narrator
 * (audio/synth-vo.py adtodo), mix (audio/mix-vo.mjs adtodo / adtodo-music)
 * and `npm run verify` (audio/ads/todo-verify.mjs) all read this file.
 *
 * ROUND 5, the owner's approved script (2026-10-02): the ad is about saving
 * from everywhere; no beat singles out one kind of save; "Download Machina."
 * is said but never shown.
 *
 *  1 HOOK     the pain, on frame 0: real saves of every kind, scattered where
 *             they were kept: "You save it. You never see it again.": they
 *             bleach into the paper
 *  2 SHARE    "Share anything to Machina.": they rush into one point, the
 *             brackets snap round it (the mark, 2.9s); the point opens as an
 *             iris onto the app
 *  3 ANYWHERE "From any app. Even screenshots.": a YouTube video, an
 *             Instagram post, an article and a screenshot land at the top of
 *             the feed one after another, the screenshot on "screenshots"
 *  4 MADE     "Analyzed, summarized, and linked to related saves.": a glide
 *    SENSE    down the feed, every save already summarized; on "linked" a cut
 *             into the Graph view as the app zooms onto its largest cluster,
 *             the saves it links lit up together, framed tight
 *  5 CLOSE    the kit's lockup: the mark, the wordmark, the tagline (the
 *             narrator says "Download Machina." first; on screen, only the
 *             tagline)
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
 * THE CUT. Every scene reads these numbers, and so does the score, so
 * picture and sound move together. Taps and cuts on 8ths (the landings follow
 * the narrator's words instead).
 */
export const HITS = {
  // 1 HOOK (Hook.tsx): the saves are already there on frame 0 (the poster)
  bleach: 40, // "…never see it again.": they bleach into the paper
  // 2 SHARE
  gather: [64, 80], // the saves rush into one point
  snap: 88, // the brackets snap round it: the mark (2.9s)
  iris: [96, 112], // the point opens onto the feed
  // 3 ANYWHERE: four saves land at the top of the feed
  // (on the words: the first as the app opens, then "From", "app.", "screenshots")
  lands: [112, 136, 150, 168],
  // 4 MADE SENSE
  glide: [192, 264], // down the feed, every save summarized
  // cut on "linked" into the Graph view as the app zooms onto its largest
  // cluster, the saves it links lit up together (the cluster's own focus)
  graph: 264,
  // 5 CLOSE
  out: 344, // thrown out of frame
  markStrike: 376, // the lockup's mark strikes (the impact)
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
  // the cluster lighting up and the app's zoom onto it
  cluster: { at: HITS.graph, n: 60, rate: 2, from: 0 },
};

export const THROW_LEN = 24;
/** the tagline holds ~1.7s once its last word has landed (spec: ≥ 1.6s);
 *  verify measures it */
export const TOTAL_FRAMES = 544;
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
  { at: 80, to: 132, text: 'Share anything\nto Machina.' },
  // from anywhere
  { at: 136, to: 204, text: 'From any app.\nEven screenshots.' },
  // what Machina makes of it
  { at: 208, to: 336, text: 'Analyzed, summarized, and\nlinked to related saves.', until: 'the cluster lights up' },
  // the close, on the lockup: "Download Machina." is SAID, never shown (owner,
  // 2026-10-02); the wordmark wipes in on "Machina"; the tagline, exactly,
  // closes (owner, 2026-09-28: every film ends on it)
  { at: HITS.markStrike + 8, to: TOTAL_FRAMES, place: 'lockup', text: 'Download Machina.\nEverything you save, finally useful.', showFirstLine: false, duck: 0.4 },
];

/** no chapter words: the ad keeps the words on screen to the narration */
export const KICKERS = [];

/**
 * THE SCORE (audio/ads/todo-score.mjs): one chord per bar from the reel's
 * C-major vocabulary. The pain hangs on IV, the mark resolves home, the
 * landings walk V IV, the graph lands home, the lockup holds C.
 */
export const BAR_CHORDS = ['Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'G6', 'Cmaj7', 'Cmaj7', 'Cmaj7', 'Cmaj7'];
/** the drums: in with the landings, out for the lockup */
export const DRUMS = [HITS.iris[0], HITS.out];
/** risers END on the reveal they lead into: the mark, the graph, the strike */
export const RISERS = [
  [HITS.gather[0] - 32, HITS.snap],
  [HITS.graph - 24, HITS.graph],
  [HITS.out - 16, HITS.markStrike],
];
