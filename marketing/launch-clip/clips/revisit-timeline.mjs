/**
 * REVISIT, the feature clip: "what you save comes back to you". Its single
 * source of truth for time (the reel's reel-timeline.mjs is the template).
 * Picture (src/reels/clips/revisit/), score (audio/clips/revisit-score.mjs),
 * narrator (audio/synth-vo.py revisit), mix (audio/mix-vo.mjs revisit) and
 * `npm run verify` (audio/clips/revisit-verify.mjs) all read this file.
 *
 * Unlike the reel, the clip is written directly in OUTPUT frames, on the
 * reel's grid: 112.5 BPM, 16 frames a beat, 64 a bar. App motion the capture
 * recorded at 60fps plays one captured frame per output frame, which is the
 * reel's K = 2: the app moves exactly as fast here as it does in the reel.
 *
 * One take, `revisitClip` (capture/shoot.mjs), carries the whole clip: the
 * Revisit tab on its "Do this" list, this week's recap tapped open and read
 * down to its Standout and its question, then the Standout tapped: the save
 * it names opens. Then the reel's lockup.
 */

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export const BPM = 112.5;
export const BEAT_FRAMES = 16;
export const BAR_FRAMES = BEAT_FRAMES * 4; // 64
export const BEAT = BEAT_FRAMES / FPS; // 0.5333s
export const BAR = BAR_FRAMES / FPS; // 2.1333s

/** Beat (may be fractional) → frame. */
export const beat = (n) => Math.round(n * BEAT_FRAMES);
/** the nearest beat */
export const onBeat = (f) => Math.round(f / BEAT_FRAMES) * BEAT_FRAMES;

export const TAKE = 'revisitClip';

/**
 * Picture events, in frames. The scene and the score read these same
 * numbers, so moving one moves the picture and its sound together. Taps and
 * lifts sit on beats or 8ths; a tap lands on the frame the app responds.
 */
export const HITS = {
  settle: 16, // the establishing tilt has settled (the first line starts)
  todoLift: 64, // the first "Do this" row lifts, in the pause after "action,"
  todoDrop: 104, // …and settles back
  travel: [112, 144], // down to "This week in Machina" (the reading window)
  recapTap: 160, // tapped open, in the silence between the first two lines
  rise: [192, 240], // the recap scrolls up into the reading window
  standout: 480, // the Standout lifts as the glide onto it lands
  standoutDrop: 544, // …and settles back before it is tapped
  cardTap: 592, // the Standout, tapped: its save opens
  out: 688, // the save is thrown out of frame; the lockup begins
  markStrike: 728, // the mark's point strikes (the impact)
};

/**
 * The recap, read. The capture scrolls it in ~3pt steps (take mark `scroll`,
 * one frame a step, 841pt to the end of the page); each read eases the page
 * from one scroll position to the next, in POINTS, and the camera takes up
 * the difference to the nearest captured step (kit/scroll.ts). [from, to,
 * from pt, to pt]: 194 and 548 put the write-up, then the two themes, in the
 * reading window.
 */
export const READS = [
  [HITS.rise[0], HITS.rise[1], 0, 194], // the write-up rises into view
  [320, 368, 194, 527], // → the two themes and the saves they link to (548 with the creeps)
];
/**
 * THE CREEPS (clip round 2: the themes hold measured dead still for a full
 * second). While a read is held the page never quite stops: it drifts on a
 * few points, the way a reader's thumb does, on a curve that starts and ends
 * at rest, so the reads before and after it start and end exactly as before
 * (no kick). About 0.3pt (0.7px) a frame at the fastest. [from, to, points]
 */
export const CREEP = [
  [HITS.rise[1], 320, 12], // the write-up
  [368, 416, 9], // the themes
];
/**
 * The last read is ONE glide onto the Standout and its question: the page
 * scrolls on until it runs out (841pt, the end of the recap) and the camera
 * carries the same eased motion on down the screen, so nothing stops and
 * starts again, and the tab bar comes into frame only after the page has
 * stopped (its camera correction never shows on the fixed chrome).
 */
export const GLIDE = [416, 480];

/** the end: the finished lockup holds ~1.8s once its line is whole */
export const TOTAL_FRAMES = 880;
export const TOTAL_SEC = TOTAL_FRAMES / FPS;

/**
 * The narrator's lines = the captions, line for line (audio/synth-vo.py
 * revisit speaks them verbatim; "Machina" is respelled for the voice only).
 * `at` is the frame the voice starts (on a beat), `to` the frame the line
 * leaves. THE DWELL RULE (the reel's, round 11): a line leaves 0.3–1.2s after
 * its voice, or up to 4s while the action it names still plays (`until`).
 * A "\n" is a hard break on screen only. No em dashes, no literal "AI", no
 * "second brain", no "library" (verify).
 */
export const CAPTIONS = [
  // the "Do this" list: the app writes a step only for a save that calls for
  // one (web/lib/takeaway.ts); its first row lifts in the pause after "action,"
  { at: 16, to: 154, text: 'When a save calls for action,\nMachina turns it into a to-do.' },
  // "This week in Machina" is tapped open in the silence before this line;
  // it unfolds on "Every week," and rises into view on "Machina brings back"
  { at: 176, to: 288, text: 'Every week, Machina brings back\nwhat’s worth remembering.' },
  // the themes land as "themes" is said; the Standout rises into view on
  // "the one save worth rereading" and lifts after it
  { at: 368, to: 480, text: 'The themes of your week,\nand the one save worth rereading.' },
  // the close: the name (the drawn wordmark wipes in as it is said), then
  // the App Store subtitle (the reel's lockup, the reel's words)
  { at: 752, to: TOTAL_FRAMES, place: 'lockup', text: 'Machina.\nNever lose another great find.', duck: 0.4 },
];

/**
 * The chapter word, REVISIT, in the band above the lines. The clip OPENS on
 * it: it is already formed on frame 0 (its letters came into focus over the
 * 12 frames before), a beat before the first line; after that it follows the
 * reel's rule: on screen only with its narration, arriving 4 frames before a
 * line, leaving with it, gaps under KICKER_BRIDGE frames bridged.
 */
export const KICKER = 'Revisit';
const OPEN = -12;
const KICKER_LEAD = 4;
export const KICKER_BRIDGE = 24;
export const KICKERS = (() => {
  const spans = [];
  for (const c of CAPTIONS.filter((x) => !x.place)) {
    const last = spans[spans.length - 1];
    if (last && c.at - last.to < KICKER_BRIDGE) last.to = c.to;
    else spans.push({ at: spans.length ? c.at - KICKER_LEAD : OPEN, to: c.to, text: KICKER });
  }
  return spans;
})();

/** Risers END on the reveal they lead into. [from, to] in frames. */
export const RISERS = [[656, HITS.markStrike]];

/** one chord per bar (the reel's C-major vocabulary); the last is the lockup */
export const BAR_CHORDS = ['Fmaj7', 'Cmaj7', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'Fmaj7', 'G6', 'Cmaj7', 'Fmaj7', 'Cmaj7', 'Cmaj7', 'Cmaj7'];
