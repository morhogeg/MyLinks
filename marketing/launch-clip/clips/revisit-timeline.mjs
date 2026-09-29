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
 * THE OPENING (round 4, owner: "no proper opening: present the issue, then
 * our solutions"). Before the app: the problem, then the turn. Ten real saves
 * from the demo account (the ones Revisit brings back later among them) come
 * into focus where they were kept; the narrator names the habit ("You save
 * things to come back to later.") and the problem ("But you rarely go back to
 * them."; rarely, not never: the film's honest word), and they bleach into
 * the paper; on "Machina brings them back to you." they gather into the
 * point, the brackets snap round it (the mark), and the point opens as an
 * iris onto the Revisit tab. OPEN frames (4 bars); everything after it is
 * the app clip, whose clock (HITS, READS, CREEP, GLIDE below) starts at OPEN:
 * the scenes read `f - OPEN`, captions and the score are absolute.
 */
export const OPEN = 256;
export const OPENING = {
  focus: [0, 24], // the saves come into focus (a soft scatter is already there on frame 0)
  bleach: 128, // …bleach into the paper on "rarely"
  gather: [176, 200], // …gather into one point, landing just after "Machina"
  snap: 208, // the brackets snap round it: the mark
  iris: [224, 256], // the point opens onto the Revisit tab
};

/**
 * Picture events, in APP frames (add OPEN for the clip's). The scene and the score read these same
 * numbers, so moving one moves the picture and its sound together. Taps and
 * lifts sit on beats or 8ths; a tap lands on the frame the app responds.
 */
export const HITS = {
  settle: 16, // the establishing tilt has settled (the first line starts)
  dueLift: 48, // (round 3) the reminder that came due lifts, in the pause after "reminder,"
  dueDrop: 104, // …and settles back
  todoLift: 176, // the first "Do this" row lifts, in the pause after "action,"
  todoDrop: 216, // …and settles back
  wide: [224, 256], // (round 3) back a little: the list, the recap and the toast in frame
  tick: 272, // (round 3) the V60 step ticked off: "Marked as done"
  travel: [320, 352], // into the reading window, the toast left below the frame
  recapTap: 368, // tapped open, in the silence between the lines
  rise: [400, 448], // the recap scrolls up into the reading window
  standout: 688, // the Standout lifts as the glide onto it lands
  standoutDrop: 752, // …and settles back before it is tapped
  cardTap: 800, // the Standout, tapped: its save opens
  out: 896, // the save is thrown out of frame; the lockup begins
  markStrike: 936, // the mark's point strikes (the impact)
};

/**
 * The recap, read. The capture scrolls it in ~3pt steps (take mark `scroll`,
 * one frame a step); each read eases the page from one scroll position to
 * the next, in POINTS, and the camera takes up the difference to the nearest
 * captured step (kit/scroll.ts). [from, to, from pt, to pt]: 293 and 660 put
 * the write-up, then the two themes, at the top of the reading window.
 */
export const READS = [
  [HITS.rise[0], HITS.rise[1], 0, 293], // the write-up rises into view
  [528, 576, 293, 660], // → the two themes and the saves they link to (681 with the creeps)
];
/**
 * THE CREEPS (clip round 2: the themes hold measured dead still for a full
 * second). While a read is held the page never quite stops: it drifts on a
 * few points, the way a reader's thumb does, on a curve that starts and ends
 * at rest, so the reads before and after it start and end exactly as before
 * (no kick). About 0.3pt (0.7px) a frame at the fastest. [from, to, points]
 */
export const CREEP = [
  [HITS.rise[1], 528, 12], // the write-up
  [576, 624, 9], // the themes
];
/**
 * The last read is ONE glide onto the Standout and its question: the page
 * scrolls on until it runs out (the end of the recap) and the camera carries
 * the same eased motion on down the screen, so nothing stops and starts
 * again, and the tab bar comes into frame only after the page has stopped
 * (its camera correction never shows on the fixed chrome).
 */
export const GLIDE = [624, 688];

/**
 * (round 3, owner: "a huge white gap at the top") The clip sets its type
 * higher than the reel's (SLOTS 290 / 346 in kit/Captions.tsx) and the app
 * comes up under it: the scrim is solid to 420px and clear by 600px (the
 * reel's: 510 / 720). The kicker still clears the top ~10% that Reels and
 * TikTok cover with their own UI.
 */
export const SLOTS = { kicker: 200, top: 256 };
export const BAND = { solid: 420, clear: 600 };

/** the end: the finished lockup holds ~1.8s once its line is whole */
export const TOTAL_FRAMES = OPEN + 1088;
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
  // THE OPENING: the habit, then the problem (no chapter word: `open`)
  { at: 16, to: 96, open: true, text: 'You save things\nto come back to later.' },
  { at: 112, to: 176, open: true, text: 'But you rarely\ngo back to them.' },
  // the turn: the saves gather into the point as the name is said
  { at: 192, to: 256, open: true, text: 'Machina brings them\nback to you.' },
  // (round 3, owner: "too thin, expand on the feature") Revisit opens on
  // what has come due: a reminder the user set (the app's Remind me: Smart
  // review, or a day) lands under "Due now"; its row lifts after "reminder,"
  { at: OPEN + 16, to: OPEN + 124, text: 'Set a reminder, and a save\ncomes back when it’s due.' },
  // the "Do this" list: the app writes a step only for a save that calls for
  // one (web/lib/takeaway.ts); its first row lifts in the pause after
  // "action,", then the V60 step is ticked off (the app's "Marked as done")
  { at: OPEN + 128, to: OPEN + 256, text: 'When a save calls for action,\nMachina turns it into a to-do.' },
  // "This week in Machina" is tapped open in the silence before this line;
  // it unfolds on "Every week," and rises into view on "Machina brings back"
  { at: OPEN + 384, to: OPEN + 496, text: 'Every week, Machina brings back\nwhat’s worth remembering.' },
  // the themes land as "themes" is said; the Standout rises into view on
  // "the one save worth rereading" and lifts as the glide lands
  { at: OPEN + 576, to: OPEN + 688, text: 'The themes of your week,\nand the one save worth rereading.' },
  // the close: the name (the drawn wordmark wipes in as it is said), then
  // the tagline (owner, 2026-09-28: every launch film ends on it, once)
  { at: OPEN + 960, to: TOTAL_FRAMES, place: 'lockup', text: 'Machina.\nEverything you save, finally useful.', duck: 0.4 },
];

/**
 * The chapter word, REVISIT, in the band above the lines: from the app on
 * (round 4: the opening's problem lines carry none), on the reel's rule: on
 * screen only with its narration, arriving 4 frames before a line, leaving
 * with it, gaps under KICKER_BRIDGE frames bridged.
 */
export const KICKER = 'Revisit';
const KICKER_LEAD = 4;
export const KICKER_BRIDGE = 24;
export const KICKERS = (() => {
  const spans = [];
  for (const c of CAPTIONS.filter((x) => !x.place && !x.open)) {
    const last = spans[spans.length - 1];
    if (last && c.at - last.to < KICKER_BRIDGE) last.to = c.to;
    else spans.push({ at: c.at - KICKER_LEAD, to: c.to, text: KICKER });
  }
  return spans;
})();

/** Risers END on the reveal they lead into. [from, to] in frames. */
export const RISERS = [
  [144, OPENING.snap], // into the mark
  [OPEN + 864, OPEN + HITS.markStrike], // into the lockup's strike
];

/** one chord per bar (the reel's C-major vocabulary); the last is the lockup */
/** (the first four bars are the opening: the problem hangs on IV, the mark
 *  resolves home) */
export const BAR_CHORDS = ['Fmaj7', 'Fmaj7', 'G6', 'Cmaj7', 'Fmaj7', 'Cmaj7', 'G6', 'Cmaj7', 'Fmaj7', 'Cmaj7', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'Fmaj7', 'G6', 'Cmaj7', 'Fmaj7', 'Cmaj7', 'Cmaj7'];
