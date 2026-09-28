/**
 * The FIND feature clip's single source of truth for time. Its template is
 * the reel's (reel-timeline.mjs): picture (src/reels/clips/find/), score
 * (audio/find-score.mjs), narrator (audio/synth-vo.py find) and `npm run
 * verify` all read this file, so a cut cannot drift off its beat.
 *
 * FIND, ~31s, for someone seeing it for the first time: the problem (a feed
 * too long to scroll through, a save you cannot name), Machina named, then
 * four sides of the real search, each shown doing its job, then the
 * takeaway and the reel's lockup:
 *  1. your own words: a query that shares no word with the card it finds;
 *  2. close matches: a word no save has, and still the one that has the rest;
 *  3. where you saw it: a source offered as you type, one tap to all of it;
 *  4. open it: the summary and the saves related to it, right there.
 *
 * The clip is written straight in OUTPUT frames at the reel's pace: the
 * app's own motion plays at half its real speed (K = 2: a 60fps capture one
 * frame per output frame, a typed character K frames) on the reel's 112.5
 * BPM grid, 16 frames a beat. Every frame of app UI is the real app: the
 * take `clips/find/search` (capture/shoot.mjs `findClip`).
 */

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export const K = 2;
export const BPM = 112.5;
export const BEAT_FRAMES = 16;
export const BAR_FRAMES = BEAT_FRAMES * 4; // 64
export const BEAT = BEAT_FRAMES / FPS; // 0.5333s
export const BAR = BAR_FRAMES / FPS; // 2.1333s

/** Beat (quarter note, may be fractional) → frame. */
export const beat = (n) => Math.round(n * BEAT_FRAMES);
/** the nearest beat */
export const onBeat = (f) => Math.round(f / BEAT_FRAMES) * BEAT_FRAMES;

/** frames a typed character stays (K = 2: the capture's 30 a second at 15) */
export const TYPE_FRAMES = K;
/** frames each deleted word stays (a held delete key: faster than typing) */
export const DELETE_FRAMES = 3;

/**
 * Picture events, in frames. Taps, landings and cuts sit on the beat (verify
 * checks); typing, the delete and the scroll run between them.
 */
export const HITS = {
  scroll: 24, // the hook: the feed scrolled at speed…
  scrollBack: 84, // …and back up, nothing found
  fieldTap: 144, // "Search your saves", tapped
  type1: 160, // 1. "easy dinner, empty fridge"
  found1: 224, // Marcella Hazan's sauce lands (shares no word with it)
  back1: 288, // back to the field
  clear1: 300, // deleted a word at a time
  type2: 320, // 2. "sardinia swim spot" ("swim" is on no card)
  found2: 368, // Cala Goloritzé, under "Close matches"
  back2: 432,
  clear2: 444,
  type3: 464, // 3. "youtube": the Sources row offers YouTube as it types
  chipTap: 496, // one tap: every save from YouTube
  cardTap: 576, // 4. the first of them, opened
  throwOut: 768, // thrown out of frame…
  lockup: 784, // …into the lockup
  markStrike: 832, // the mark's point strikes (lockup + 48)
};

export const TOTAL_FRAMES = 976;
export const TOTAL_SEC = TOTAL_FRAMES / FPS;

/** The cut. One idea per scene. */
export const SCENES = [
  { id: 'hook', from: 0, dur: 144 }, // the feed, too long to scroll; "Machina finds it"
  { id: 'words', from: 144, dur: 144 }, // 1. your own words
  { id: 'close', from: 288, dur: 144 }, // 2. close matches
  { id: 'source', from: 432, dur: 144 }, // 3. where you saw it
  { id: 'open', from: 576, dur: 208 }, // 4. open it; the takeaway
  { id: 'lockup', from: 784, dur: 192 }, // the mark, the name, the subtitle
];

/**
 * The narrator's lines = the captions, line for line (the reel's `af_heart`
 * voice; "Machina" respelled for the voice). `at` is the frame the voice
 * starts, on a beat; `to` the frame the caption leaves. `kicker` names the
 * element on screen with its line.
 *
 * THE DWELL RULE (the reel's, round 11): a line leaves 0.3–1.2s after the
 * narrator finishes it; longer only while the action it names still plays
 * (`until`, at most 4s past the voice). `npm run verify` enforces it.
 *
 * "Search by meaning" is not the headline (brand rule): the lines say it in
 * plain words. A "\n" breaks the line on screen only. NO em dashes, no
 * literal "AI", no "second brain", no "library" (verify).
 */
export const CAPTIONS = [
  // the hook: the problem, over the feed scrolling past
  { at: 16, to: 100, text: 'You saved it.\nBut what was it called?', duck: 0.45 },
  // the name, as the camera goes to the search field
  { at: 128, to: 208, text: 'Machina finds it\nin your own words.', kicker: 'Your own words', duck: 0.4 },
  { at: 304, to: 416, text: 'Only half remember it?\nYou still get what’s close.', kicker: 'Close matches' },
  { at: 448, to: 560, text: 'Type where you saw it,\nand get everything from there.', kicker: 'Where you saw it' },
  { at: 576, to: 688, text: 'Open it: the gist,\nand the saves it connects to.', kicker: 'Open it' },
  // the takeaway
  { at: 688, to: 776, text: 'Type what you remember.\nGet the one you meant.' },
  // the close: the name (the drawn wordmark wipes in as it is said), then
  // the App Store subtitle, as the reel closes
  { at: onBeat(HITS.lockup + 60), to: TOTAL_FRAMES, place: 'lockup', text: 'Machina.\nNever lose another great find.', duck: 0.4 },
];

/**
 * The element's name above its line (the kicker), in 4 frames before the
 * line and out with it (the reel's rule: on screen only with its narration).
 */
const KICKER_LEAD = 4;
export const KICKER_BRIDGE = 24;
// (spaces as no-break spaces: the kicker sets each letter on its own)
export const KICKERS = CAPTIONS.filter((c) => c.kicker).map((c) => ({ at: c.at - KICKER_LEAD, to: c.to, text: c.kicker.replaceAll(' ', '\u00a0') }));

/** Risers END on the reveal they lead into. [from, to] in frames. */
export const RISERS = [
  [112, 144], // the tap into search
  [192, 224], // the first card
  [752, HITS.markStrike - 16], // into the lockup
];

/**
 * Harmony, [from frame, chord] (the reel's C-major vocabulary and voicings):
 * the hook hangs on IV, each element walks I → V, and the lockup resolves
 * home on I.
 */
export const CHORDS = [
  [0, 'Fmaj7'],
  [128, 'Cmaj7'],
  [192, 'G6'],
  [256, 'Fmaj7'],
  [320, 'Cmaj7'],
  [384, 'G6'],
  [448, 'Fmaj7'],
  [512, 'Cmaj7'],
  [576, 'G6'],
  [640, 'Fmaj7'],
  [704, 'G6'],
  [HITS.lockup, 'Cmaj7'],
];
