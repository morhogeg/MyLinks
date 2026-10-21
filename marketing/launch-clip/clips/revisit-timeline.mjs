/**
 * REVISIT, the feature clip: "what you save comes back to you". Its single
 * source of truth for time (the reel's reel-timeline.mjs is the template).
 * Picture (src/reels/clips/revisit/), score (audio/clips/revisit-score.mjs),
 * narrator (audio/synth-vo.py revisit), mix (audio/mix-vo.mjs revisit) and
 * `npm run verify` (audio/clips/revisit-verify.mjs) all read this file.
 *
 * Unlike the reel, the clip is written directly in OUTPUT frames, on its own
 * grid. (2026-10-21, owner: "pacing is too slow, make it more engaging"; and
 * "make this in light mode", see src/reels/clips/revisit/light/.) THE QUICK
 * CUT: 56.5s → 41.5s with every line and every beat of the story kept. The
 * grid is 128.6 BPM (was 112.5): 14 frames a beat, 56 a bar. The narrator's
 * lines run back to back at their natural speed (a 10% time-stretch was
 * tried and sounded metallic: owner, "clean it up"); the app moves at its REAL speed (two captured 60fps frames
 * per output frame; it played at half speed before), and the silent stretches
 * (the tick, the recap's reading, the Standout) are cut to what the eye needs.
 *
 * One take, `revisitClip` (capture/shoot.mjs), carries the whole clip, shot in
 * the app's LIGHT theme (CAPTURE_THEME=light): the Revisit tab on its "Due
 * now" reminder and "Do this" list, this week's recap tapped open and read
 * down to its Standout, then the Standout tapped: the save it names opens.
 * Then the reel's lockup.
 */

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export const BPM = (60 * FPS) / 14; // 128.57
export const BEAT_FRAMES = 14;
export const BAR_FRAMES = BEAT_FRAMES * 4; // 56
export const BEAT = BEAT_FRAMES / FPS; // 0.4667s
export const BAR = BAR_FRAMES / FPS; // 1.8667s

/** Beat (may be fractional) → frame. */
export const beat = (n) => Math.round(n * BEAT_FRAMES);
/** the nearest beat */
export const onBeat = (f) => Math.round(f / BEAT_FRAMES) * BEAT_FRAMES;

export const TAKE = 'revisitClip';

/** The app plays at its real speed: captured 60fps frames per output frame */
export const APP_SPEED = 2;

/**
 * THE OPENING (round 4, owner: "no proper opening: present the issue, then
 * our solutions"). Before the app: the problem, then the turn. Ten real saves
 * from the demo account (the ones Revisit brings back later among them) are
 * in focus where they were kept; the narrator names the habit ("You save
 * things to come back to later.") and the problem ("But most of them, you
 * never open again."), and they fade into the paper on "never"; on "Machina
 * brings them back to you." they gather into the point just after the name,
 * the brackets snap round it (the mark), and the point opens as an iris onto
 * the Revisit tab. OPEN frames (4 bars); everything after it is the app
 * clip, whose clock (HITS, READS, CREEP, GLIDE below) starts at OPEN: the
 * scenes read `f - OPEN`, captions and the score are absolute.
 */
export const OPEN = 224;
export const OPENING = {
  focus: [0, 20], // the saves settle into focus (most already sharp on frame 0)
  bleach: 118, // …fade into the paper on "never"
  gather: [160, 182], // …gather into one point, landing just after "Machina"
  snap: 189, // the brackets snap round it: the mark
  iris: [196, 224], // the point opens onto the Revisit tab
};

/**
 * Picture events, in APP frames (add OPEN for the clip's). The scene and the
 * score read these same numbers, so moving one moves the picture and its
 * sound together. Taps and lifts sit on 8ths (7 frames); a tap lands on the
 * frame the app responds. Each app transition plays at APP_SPEED from its
 * tap, so a 40-frame capture takes 20.
 */
export const HITS = {
  settle: 14, // the establishing tilt has settled
  dueLift: 56, // the reminder that came due lifts, on "when you want them"
  dueDrop: 84, // …and settles back
  bell: 98, // its bell, tapped: the reminder's sheet slides up
  smartLift: 161, // the top row (Smart review) lifts on "three times"
  smartDrop: 189, // …and settles back
  cancel: 224, // its X: the sheet goes
  openTap: 238, // the due save, tapped: it opens on its summary
  keyPoints: [280, 308], // down to its Key Points
  back: 329, // "‹ Revisit": back to the list
  tab2: 350, // the list again (the back transition is over)
  todoLift: 385, // the first "Do this" row lifts, in the pause after "action,"
  todoDrop: 413, // …and settles back
  wide: [392, 420], // back a little: the list, the recap and the toast in frame
  tick: 462, // the V60 step ticked off: "Marked as done"
  travel: [469, 490], // into the reading window, the toast left below the frame
  recapTap: 497, // tapped open, just before its line
  rise: [518, 546], // the recap scrolls up into the reading window
  standout: 728, // the Standout lifts as the glide onto it lands
  standoutDrop: 756, // …and settles back before it is tapped
  cardTap: 770, // the Standout, tapped: its save opens
  out: 805, // the save is thrown out of frame; the lockup begins
  markStrike: 840, // the mark's point strikes (the impact)
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
  [630, 658, 293, 660], // → the two themes and the saves they link to, on "themes"
];
/**
 * THE CREEPS (clip round 2: a read never holds dead still). While a read is
 * held the page drifts on a few points, the way a reader's thumb does, on a
 * curve that starts and ends at rest. [from, to, points]
 */
export const CREEP = [
  [HITS.rise[1], 630, 10], // the write-up
  [658, 686, 6], // the themes
];
/**
 * The last read is ONE glide onto the Standout: the page scrolls on until it
 * runs out (the end of the recap) and the camera carries the same eased
 * motion on down the screen, so nothing stops and starts again.
 */
export const GLIDE = [686, 728];

/**
 * (round 3) The clip sets its type higher than the reel's (SLOTS 290 / 346
 * in kit/Captions.tsx) and the app comes up under it: the scrim is solid to
 * 420px and clear by 600px. The kicker still clears the top ~10% that Reels
 * and TikTok cover with their own UI.
 */
export const SLOTS = { kicker: 200, top: 256 };
export const BAND = { solid: 420, clear: 600 };

/** the end: the finished lockup holds ~1.8s once its line is whole */
export const TOTAL_FRAMES = 1246;
export const TOTAL_SEC = TOTAL_FRAMES / FPS;

/**
 * The narrator's lines = the captions, line for line (audio/synth-vo.py
 * revisit speaks them verbatim; "Machina" is respelled for the voice only).
 * `at` is the frame the voice starts (on a beat), `to` the frame the line
 * leaves. THE DWELL RULE (the reel's, round 11): a line leaves 0.3–1.2s after
 * its voice. A "\n" is a hard break on screen only. No em dashes, no literal
 * "AI", no "second brain", no "library" (verify).
 *
 * The narrator's direction (2026-10-03, voice Sulafat): gentle, caring and
 * encouraging, a thoughtful friend nudging you, never guilt. `style` and
 * `pace` key the takes in audio/vo-takes/ (unchanged, so nothing is
 * re-voiced); `maxPause` shapes them afterwards: the quick cut holds the
 * pauses inside a line to 0.25s. No `tempo`: the stretch rang metallic.
 */
const PACE = 'Unhurried and warm, about 145 words a minute; let sentences breathe.';
// every line ducks the music deeper than the house 0.55 (owner: "the music
// is too loud")
const QUICK = { maxPause: 0.25, duck: 0.4 };

export const CAPTIONS = [
  // THE OPENING: the habit, then the problem (no chapter word: `open`)
  { at: 14, to: 76, open: true, poster: true, text: 'You save things\nto come back to later.', style: 'Warm and knowing, gentle.', pace: PACE, ...QUICK },
  { at: 84, to: 165, open: true, text: 'But most of them,\nyou never open again.', style: 'Softly honest, a touch wistful, no guilt.', pace: PACE, ...QUICK },
  // the turn: the saves gather into the point as the name is said
  { at: 168, to: 241, open: true, text: 'Machina brings them\nback to you.', style: 'The turn: kind and uplifting, a smile.', pace: PACE, ...QUICK },
  // Revisit opens on what has come due: a reminder the user set lands under
  // "Due now"; its row lifts on "when you want them"
  { at: OPEN + 28, to: OPEN + 93, text: 'Your saves come back\nwhen you want them.', style: 'Reassuring, a sense of being in control.', pace: PACE, ...QUICK },
  // the reminder's own sheet, its choices named plainly as it slides up; the top row (the
  // app's "Smart review": tomorrow, then 1 week and 1 month) lifts on "three
  // times"
  { at: OPEN + 98, to: OPEN + 224, text: 'Later today, this weekend,\nor three times, so it sticks.', style: "A light, lilting list; a playful little lift on 'so it sticks'.", pace: PACE, ...QUICK },
  // the save opens on its summary, then down to its Key Points
  { at: OPEN + 238, to: OPEN + 340, text: 'Open one, and the key points\nare already there.', style: 'Pleased and easy.', pace: PACE, ...QUICK },
  // the "Do this" list: the app writes a step only for a save that calls for
  // one (web/lib/takeaway.ts); its first row lifts in the pause after
  // "action,", then the V60 step is ticked off (the app's "Marked as done")
  { at: OPEN + 350, to: OPEN + 479, text: 'When a save calls for action,\nMachina turns it into a to-do.', style: 'Practical, a little energised.', pace: PACE, ...QUICK },
  // "This week in Machina" is tapped open just before this line; it rises
  // into view on "Machina brings back"
  { at: OPEN + 504, to: OPEN + 617, text: 'Every week, Machina brings back\nwhat’s worth remembering.', style: 'Warm and steady, a gentle weekly ritual.', pace: PACE, ...QUICK },
  // the themes land as "themes" is said; the glide lands on the Standout on
  // "the one save worth rereading", and it lifts
  { at: OPEN + 630, to: OPEN + 777, text: 'The themes of your week,\nand the one save worth rereading.', style: "Thoughtful and savouring; slower on 'worth rereading'.", pace: PACE, ...QUICK },
  // the close: the name (the drawn wordmark wipes in as it is said), then
  // the tagline (owner, 2026-09-28: every launch film ends on it, once)
  { at: OPEN + 868, to: TOTAL_FRAMES, place: 'lockup', text: 'Machina.\nEverything you save, finally useful.', duck: 0.4, style: 'A warm, assured sign-off; the name proud, then the tagline unhurried and sincere.', pace: PACE },
];

/**
 * The chapter word, REVISIT, in the band above the lines: from the app on
 * (the opening's problem lines carry none), on the reel's rule: on screen
 * only with its narration, arriving 4 frames before a line, leaving with it,
 * gaps under KICKER_BRIDGE frames bridged.
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
  [120, OPENING.snap], // into the mark
  [OPEN + HITS.out - 28, OPEN + HITS.markStrike], // into the lockup's strike
];
