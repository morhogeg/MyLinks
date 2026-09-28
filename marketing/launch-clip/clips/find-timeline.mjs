/**
 * The FIND feature clip's single source of truth for time. Its template is
 * the reel's (reel-timeline.mjs): picture (src/reels/clips/find/), score
 * (audio/find-score.mjs), narrator (audio/synth-vo.py find) and `npm run
 * verify` all read this file, so a cut cannot drift off its beat.
 *
 * FIND: "type what you remember, get the one you meant". Two plain-words
 * searches in the real app, each sharing no word with the ONE card it lands
 * on (capture/library.mjs SEARCH and SEARCH.also), then the reel's lockup.
 *
 * The clip is written straight in OUTPUT frames. The reel plays a source cut
 * K = 2 times slower and stops that clock for its holds; the clip was cut
 * for that pace from the start, so it has no source cut, no holds and no
 * lingers, only the same speed: the app's own motion plays at half its real
 * pace (a 60fps capture one frame per output frame, a typed character K
 * frames) on the reel's 112.5 BPM grid, 16 frames a beat.
 *
 * Every frame of app UI is the real app: the take `clips/find/search`
 * (capture/shoot.mjs `findClip`), one continuous use of the search field.
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
/** Bar → frame. */
export const bar = (n) => Math.round(n * BAR_FRAMES);
/** the nearest beat */
export const onBeat = (f) => Math.round(f / BEAT_FRAMES) * BEAT_FRAMES;

/** frames a typed character stays (the capture types one a frame at 30
 *  characters a second; K = 2 plays that at 15, readable as it lands) */
export const TYPE_FRAMES = K;
/** frames each deleted word stays (a held delete key: faster than typing) */
export const DELETE_FRAMES = 3;

/**
 * Picture events, in frames. Taps and landings sit on the beat; the scenes
 * and the score read these same numbers, so moving one moves the picture
 * and the sound together. Typing and the delete run between beats (the one
 * thing allowed to), and each query holds a full beat before its card lands,
 * so it can be read whole.
 */
export const HITS = {
  fieldTap: 64, // the thumb taps "Search your saves" (the app focuses it)
  type1: 80, // "easy dinner, empty fridge", a character every TYPE_FRAMES
  found1: 144, // Marcella Hazan's tomato sauce lands
  back: 208, // the camera leaves the card for the field
  clear: 228, // the query deleted a word at a time (DELETE_FRAMES each)
  type2: 246, // "video about putting things off" (its last character on 304)
  found2: 320, // the TED talk lands, on a downbeat
  throwOut: 400, // the screen is thrown out of frame…
  lockup: 416, // …into the lockup
  markStrike: 464, // the mark's point strikes, on the beat (the reel's is lockup + 44)
};

export const TOTAL_FRAMES = 624;
export const TOTAL_SEC = TOTAL_FRAMES / FPS;

/** The cut. One idea per scene. */
export const SCENES = [
  { id: 'open', from: 0, dur: 64 }, //  0.00  the kicker, the line, Home settling
  { id: 'search1', from: 64, dur: 144 }, //  2.13  tap, type, the one card, read
  { id: 'search2', from: 208, dur: 208 }, //  6.93  back to the field, delete, type, the one card, read
  { id: 'lockup', from: 416, dur: 208 }, // 13.87  the mark, the name, the subtitle
];

/**
 * The narrator's lines = the captions, line for line (the reel's
 * `af_heart` voice: audio/synth-vo.py find speaks `say` when present, else
 * `text`; "Machina" is respelled for the voice). `at` is the frame the voice
 * starts, on a beat; `to` the frame the caption leaves.
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
  // the promise, over Home settling; it leaves as the field is tapped open
  { at: 16, to: 84, text: 'Find it in your own words.' },
  // over the second search: "Type what you remember." as it types, "Get the
  // one you meant." as its one card lands (found2)
  { at: 272, to: 372, text: 'Type what you remember.\nGet the one you meant.' },
  // the close: the name (the drawn wordmark wipes in as it is said), then
  // the App Store subtitle, as the reel closes
  { at: onBeat(HITS.lockup + 60), to: TOTAL_FRAMES, place: 'lockup', text: 'Machina.\nNever lose another great find.', duck: 0.4 },
];

/**
 * The chapter word above the line. The whole clip is one chapter, FIND: the
 * label arrives KICKER_LEAD frames before each line and leaves with it, the
 * reel's rule (on screen only while the chapter's narration is).
 */
const KICKER_LEAD = 4;
export const KICKER_BRIDGE = 24;
export const KICKERS = (() => {
  const spans = [];
  for (const c of CAPTIONS.filter((x) => !x.place)) {
    const last = spans[spans.length - 1];
    if (last && c.at - last.to < KICKER_BRIDGE) last.to = c.to;
    else spans.push({ at: c.at - KICKER_LEAD, to: c.to, text: 'Find' });
  }
  return spans;
})();

/** Risers END on the reveal they lead into. [from, to] in frames. */
export const RISERS = [
  [112, 144], // the first card
  [288, 320], // the second card
  [432, HITS.markStrike], // the mark strikes
];

/**
 * Harmony, [from frame, chord] (the reel's C-major vocabulary and voicings):
 * the open hangs on IV, each search walks I → V and its card lands on V,
 * the second on V's downbeat, and V holds through its read until the lockup
 * resolves home on I (the one change off a bar line: a cadence, on the cut).
 */
export const CHORDS = [
  [0, 'Fmaj7'],
  [64, 'Cmaj7'],
  [128, 'G6'],
  [192, 'Fmaj7'],
  [256, 'Cmaj7'],
  [320, 'G6'],
  [HITS.lockup, 'Cmaj7'],
];
