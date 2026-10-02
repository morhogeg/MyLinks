/**
 * Meta ad 3 of 3, "The screenshot that becomes a to-do" (TODO): its single
 * source of time. Picture (src/reels/ads/todo/), score
 * (audio/ads/todo-score.mjs), narrator (audio/synth-vo.py adtodo), mix
 * (audio/mix-vo.mjs adtodo / adtodo-music) and `npm run verify`
 * (audio/ads/todo-verify.mjs) all read this file.
 *
 * The idea: people screenshot advice and never act on it. Machina reads the
 * text in the screenshots, keeps the key points, and when a save calls for
 * action turns it into a to-do in Revisit that you tick off. Both features
 * are free (screenshots: up to 5 per card; "Do this"); the ad names no plan
 * and shows no Pro surface (no Daily Brew, no weekly recap).
 *
 * Written in OUTPUT frames at 30fps on the reel's grid (112.5 BPM, 16 frames
 * a beat, 64 a bar). The app is one take, `adTodo` (capture/shoot.mjs),
 * recorded at 60fps and played one captured frame per output frame (the
 * reel's K = 2: the app moves at half speed, the kit's steady pace).
 *
 *  1 HOOK      a pile of screenshots (the raise carousel among them), the
 *              hook line on screen from frame 0; they gather into the point,
 *              the brackets snap round it: the Machina mark (~3.4s)
 *  2 SAVE      the point drops to become the + (the reel's match cut); the
 *              iris opens on Home; + tapped; the real Add dialog, Image tab,
 *              the three slides picked, Save
 *  3 READ      the feed's own "Reading 3 screenshots…" card becomes the card;
 *              opened on the screenshots and the gist, read down to the Key
 *              Points (lifted)
 *  4 DO THIS   cut to Revisit's "Do this": the new task on top; it lifts on
 *              "to-do"
 *  5 TICK      the ring is tapped: it fills with the accent and a check, the
 *              task strikes, holds, the row folds; "Marked as done"; the task
 *              is under "Done 1"
 *  6 CLOSE     thrown into the kit's lockup: "Machina." / the tagline
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
 * THE CUT. Taps, lifts and landings on beats or 8ths; every scene reads
 * these numbers, and so does the score, so picture and sound move together.
 * A tap lands on the frame the app responds.
 */
export const HITS = {
  // 1 HOOK (Hook.tsx): the pile is already there on frame 0 (the poster)
  gather: [80, 96], // the screenshots rush into one point
  snap: 104, // the brackets snap round it: the mark (3.5s)
  // 2 SAVE: the point drops onto the + and the screen irises open round it
  part: 104,
  iris: [112, 128],
  plusTap: 136,
  dialog: 144, // the dialog's own entrance (60fps)
  imageTap: 168,
  pick: 192, // the three slides land in the dialog
  saveTap: 216,
  // 3 READ: the dialog drops away; the feed's working card, the card it becomes
  cardDone: 256,
  cardTap: 296,
  scroll: [336, 368], // read down to the Key Points
  keyPoints: 368, // …which lift
  // 4 DO THIS: a cut on the beat to Revisit
  revisit: 392,
  todoLift: 496, // the new task lifts on "to-do"
  todoDrop: 520,
  // 5 TICK: the ring, tapped on "tick" (the app: fill 200ms, hold 650ms,
  // fold 280ms, then the write and its toast; 60fps, one captured frame per
  // output frame)
  tick: 544,
  toToast: [600, 624], // the camera goes down with the fold to the toast
  // 6 CLOSE
  out: 640, // thrown out of frame
  markStrike: 680, // the lockup's mark strikes (the impact)
};

/**
 * The app's take, by stretch: which capture mark plays from which output
 * frame (one captured 60fps frame per output frame), and for how long.
 */
export const PLAY = {
  dialogOpen: { at: HITS.dialog, n: 24 },
  modeImage: { at: HITS.imageTap, n: 24 },
  picked: { at: HITS.pick, n: 24 },
  saving: { at: HITS.saveTap, n: HITS.cardDone - HITS.saveTap },
  done: { at: HITS.cardDone, n: 48 },
  detail: { at: HITS.cardTap, n: 40 },
  revisit: { at: HITS.revisit, n: 24 },
  tick: { at: HITS.tick, n: 132 },
};

export const THROW_LEN = 24;
/** the tagline holds ~1.7s once its last word has landed (spec: ≥ 1.6s);
 *  verify measures it */
export const TOTAL_FRAMES = 824;
export const TOTAL_SEC = TOTAL_FRAMES / FPS;

/**
 * The narrator = the captions, line for line (the kit's voice, Kokoro
 * af_heart 0.95, "Machina" spoken "Makeena"). `at` is the frame the voice
 * starts (on a beat or an 8th), `to` the frame the line leaves: 0.3 to 1.2s
 * after the voice, or up to 4s with `until` while the action it names still
 * plays. At most ~8 words on screen at once (the hook, the owner's line, is
 * 10: it is the poster). `hook: true` is on screen whole from frame 0.
 * NO em dashes, no literal "AI", no "second brain", no "library", never
 * "share sheet" or "bookmarks"; nothing about the viewer's health or money.
 */
export const CAPTIONS = [
  { at: 8, to: 112, hook: true, text: 'Your camera roll is full\nof advice you never took.' },
  { at: 112, to: 216, text: 'Save the screenshots\nto Machina.', until: 'the slides are picked and Save is tapped' },
  { at: 232, to: 376, text: 'It reads them, and keeps\nthe key points.', until: 'the card opens and its Key Points lift' },
  { at: 392, to: 452, text: 'When a save\ncalls for action,' },
  { at: 456, to: 520, text: 'Machina turns it\ninto a to-do.' },
  { at: 520, to: 632, text: 'Then do it,\nand tick it off.', until: 'the row folds and "Marked as done" shows' },
  // the close, on the lockup: the name (the drawn wordmark wipes in as it is
  // said), then the tagline, exactly (owner, 2026-09-28: every film ends on it)
  { at: HITS.markStrike + 8, to: TOTAL_FRAMES, place: 'lockup', text: 'Machina.\nEverything you save, finally useful.', duck: 0.4 },
];

/** no chapter words: the ad keeps the words on screen to the narration */
export const KICKERS = [];

/**
 * THE SCORE (audio/ads/todo-score.mjs): one chord per bar from the reel's
 * C-major vocabulary. The hook hangs on IV, the mark resolves home, the save
 * and the read walk I V vi-less (Cmaj7 G6 Fmaj7 Cmaj7), the to-do leans on
 * V and the tick lands home; the lockup holds C.
 */
export const BAR_CHORDS = ['Fmaj7', 'Cmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'Fmaj7', 'Cmaj7', 'Cmaj7', 'Cmaj7'];
/** the drums: in from the save (bar 2), out for the lockup */
export const DRUMS = [2 * BAR_FRAMES, HITS.out];
/** risers END on the reveal they lead into: the mark, the lockup's strike */
export const RISERS = [
  [HITS.gather[0] - 32, HITS.snap],
  [HITS.out - 16, HITS.markStrike],
];
