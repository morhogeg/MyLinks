/**
 * Meta ad 3 of 3, "The screenshot that becomes a to-do" (TODO): its single
 * source of time. Picture (src/reels/ads/todo/), score
 * (audio/ads/todo-score.mjs), narrator (audio/synth-vo.py adtodo), mix
 * (audio/mix-vo.mjs adtodo / adtodo-music) and `npm run verify`
 * (audio/ads/todo-verify.mjs) all read this file.
 *
 * ROUND 3 (owner: "the pacing feels off and it doesn't grab attention";
 * rewrite it as a scroll-stopping app promo that drives downloads). Three
 * features, pain to payoff, a new picture every two to three seconds:
 *
 *  1 HOOK      the pain, on frame 0: "You screenshot the advice." (three more
 *              screenshots land on the pile, a shutter click each) "You never
 *              use it." (the pile sinks grey). It gathers into the mark (3.3s)
 *  2 SAVE      "Save them to Machina instead.": the point becomes the +; the
 *              Add dialog, Image, three slides, Save, at the app's REAL speed
 *              (the app should feel quick; rounds 1–2 played it at half speed)
 *  3 READ      "It reads every slide," over the feed's "Reading 3
 *              screenshots…" card; "and pulls out the key points.": the card
 *              opens and the Key Points lift
 *  4 STANDOUT  "Then the advice becomes a to-do.": the card's own "Do this"
 *              lifts, and a MATCH CUT holds those words in place while the
 *              world around them becomes Revisit's to-do list
 *  5 TICK      "Do it. Tick it off.": the one beat at half speed (the
 *              satisfying one): the ring fills, the task strikes, the row
 *              folds, "Marked as done"
 *  6 CTA       the lockup: "Download Machina." (in the caption band, held to the
 *              end) and the tagline, `Everything you save, finally useful.`
 *
 * Both features are free (screenshots: up to 5 per card; "Do this"); the ad
 * names no plan and shows no Pro surface (no Daily Brew, no weekly recap).
 * OUTPUT frames at 30fps on the reel's grid (112.5 BPM, 16 frames a beat). The
 * app is one take, `adTodo` (capture/shoot.mjs), recorded at 60fps: `rate: 2`
 * plays it at real speed, `rate: 1` at half speed.
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
 * picture and sound move together. Taps, lifts and cuts on 8ths; a tap lands
 * on the frame the app responds.
 */
export const HITS = {
  // 1 HOOK (Hook.tsx): the pile is already there on frame 0 (the poster);
  // three more screenshots land on it, a shutter click each, on "You
  // screenshot the advice."
  drops: [8, 20, 32],
  bleach: 56, // "You never use it.": the pile sinks grey
  gather: [76, 92], // the screenshots rush into one point
  snap: 96, // the brackets snap round it: the mark (3.2s)
  // 2 SAVE: the point drops onto the + and Home irises open round it
  part: 104,
  iris: [116, 132], // (the point lands on the + at 116)
  plusTap: 136,
  dialog: 136, // the dialog's own entrance, real speed
  imageTap: 152,
  pick: 168, // the three slides land in the dialog
  saveTap: 184,
  // 3 READ: the dialog drops away; the feed's working card, the card it becomes
  reading: 214, // (the capture's second working-card roll)
  cardDone: 232,
  cardTap: 248,
  scroll: [264, 288], // read down to the Key Points
  keyPoints: 288, // …which lift
  // 4 STANDOUT: on to the card's own "Do this"; it lifts; the match cut
  scroll2: [316, 336],
  cardTodo: 336,
  revisit: 352, // the cut: the same words, now Revisit's first to-do
  todoDrop: 384,
  // 5 TICK: the ring, tapped on "Tick" (the app: fill 200ms, hold 650ms, fold
  // 280ms, then the write and its toast; half speed)
  tick: 400,
  toToast: [448, 472],
  // 6 CTA
  out: 488, // thrown out of frame
  markStrike: 520, // the lockup's mark strikes (the impact)
};

/**
 * The app's take, by stretch: which capture mark plays from which output
 * frame, how many captured frames it has, and at what rate (2 = the app's
 * real speed, 1 = half speed).
 */
export const PLAY = {
  dialogOpen: { at: HITS.dialog, n: 24, rate: 2 },
  modeImage: { at: HITS.imageTap, n: 24, rate: 2 },
  picked: { at: HITS.pick, n: 24, rate: 2 },
  saving: { at: HITS.saveTap, n: 60, rate: 2 },
  reading: { at: HITS.reading, n: 60, rate: 2 },
  done: { at: HITS.cardDone, n: 48, rate: 2 },
  detail: { at: HITS.cardTap, n: 40, rate: 2 },
  tick: { at: HITS.tick, n: 132, rate: 1 },
};

export const THROW_LEN = 24;
/** the tagline holds ~1.7s once its last word has landed (spec: ≥ 1.6s);
 *  verify measures it */
export const TOTAL_FRAMES = 688;
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
  { at: 8, to: 94, hook: true, text: 'You screenshot the advice.\nYou never use it.' },
  // feature 1: saving takes a tap
  { at: 96, to: 184, text: 'Save them to Machina\ninstead.', until: 'the slides are picked and Save is tapped' },
  // feature 2: it reads them for you
  { at: 192, to: 240, text: 'It reads every slide,' },
  { at: 240, to: 304, text: 'and pulls out\nthe key points.', until: 'the Key Points lift' },
  // feature 3, the standout: the step on the card becomes the to-do
  // (the standout line: the music ducks further under it, like the brand lines)
  { at: 312, to: 376, text: 'Then the advice\nbecomes a to-do.', until: 'the match cut lands on the to-do list', duck: 0.45 },
  // the payoff
  { at: 384, to: 480, text: 'Do it.\nTick it off.', until: 'the row folds and "Marked as done" shows' },
  // the CTA and the close: "Download Machina." sits in the caption band to the
  // end; the wordmark wipes in on "Machina"; the tagline, exactly, closes
  // (owner, 2026-09-28: every film ends on it)
  { at: HITS.markStrike + 8, to: TOTAL_FRAMES, place: 'lockup', text: 'Download Machina.\nEverything you save, finally useful.', duck: 0.4 },
];

/** no chapter words: the ad keeps the words on screen to the narration */
export const KICKERS = [];

/**
 * THE SCORE (audio/ads/todo-score.mjs): one chord per bar from the reel's
 * C-major vocabulary. The pain hangs on IV and V, the mark resolves home, the
 * features walk I V IV I, the tick lands home, the lockup holds C.
 */
export const BAR_CHORDS = ['Fmaj7', 'G6', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'G6', 'Cmaj7', 'Fmaj7', 'Cmaj7', 'Cmaj7'];
/** the drums: in with the save (bar 2), out for the lockup */
export const DRUMS = [2 * BAR_FRAMES, HITS.out];
/** risers END on the reveal they lead into: the mark, the cut, the strike */
export const RISERS = [
  [HITS.gather[0] - 32, HITS.snap],
  [HITS.revisit - 24, HITS.revisit],
  [HITS.out - 16, HITS.markStrike],
];
