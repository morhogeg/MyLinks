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
 * THE OPENING (round 4, owner: "present the issue, then our solutions"):
 * before the app, the problem, then the turn. Ten real saves from the demo
 * account come into focus; "You save things to come back to later." "But
 * most of them, you never open again." (they bleach into the paper on
 * "never"); on "Machina brings them back to you." they gather into the
 * point, the brackets snap round it, and the point opens as an iris onto the
 * Revisit tab. (light revisit, 2026-10-21, owner: "the pacing is too slow")
 * 6.9s, was 8.5s: the lines follow each other without dead air.
 * Everything after it is the app, whose clock (HITS, READS, CREEP, GLIDE
 * below) starts at OPEN: the scenes read `f - OPEN`, captions and the score
 * are absolute.
 */
export const OPEN = 208;
export const OPENING = {
  focus: [0, 24], // the saves come into focus (a soft scatter is already there on frame 0)
  bleach: 112, // …bleach into the paper on "never"
  gather: [152, 176], // …gather into one point, landing just after "Machina"
  snap: 184, // the brackets snap round it: the mark
  iris: [184, 208], // the point opens onto the Revisit tab
};

/**
 * THE APP, BEFORE THE RECAP (light revisit, 2026-10-21; owner on the cut
 * before it: "not clear enough, the pacing is too slow, and the taps are far
 * from good enough: do a complete revision"). One idea per beat, in the order
 * a person meets them, each shown by a tap the viewer can see land:
 *
 *  1. DUE: the save whose reminder came due, picked out on the Revisit tab
 *     ("Your saves come back when you want them."), tapped open: its summary,
 *     then its Key Points ("Open one, and the key points are already
 *     there."); back.
 *  2. REMIND: its bell; the sheet; "This weekend" tapped, then Save ("Need it
 *     again? Pick when it comes back."): the app's own toast, the save leaves
 *     "Due now".
 *  3. TO-DO: the "Do this" list, the V60 step picked out and ticked off as
 *     the line lands ("…turns it into a to-do.").
 *
 * The app's transitions play at their real speed here (two captured 60fps
 * frames per output frame; the recap after them keeps its slow read). Taps
 * sit on 8ths, on the frame the app answers. App frames (add OPEN).
 *
 * From the recap on (owner: "from every week, the video is good") the cut is
 * the one he approved, moved earlier by K: every later event is its old
 * frame minus the old splice (320) plus K.
 */
export const K = 144;

export const HITS = {
  settle: 16, // the establishing tilt has settled
  due: [0, 24], // the due save is picked out (the spotlight lands on it)
  openTap: 88, // the due save, tapped: it opens on its summary
  keyPoints: [112, 136], // down to its Key Points
  back: 184, // "‹ Revisit": back to the list
  bell: 216, // its bell: the reminder's sheet slides up
  weekend: 280, // "This weekend", tapped
  save: 304, // Save: the sheet goes, the toast confirms, the save leaves "Due now"
  todo: [312, 336], // up to the "Do this" list; the spotlight moves to the V60 step
  tick: 440, // …ticked off: "Marked as done"
  // ── the approved cut, from here
  travel: [320 + K, 352 + K], // into the reading window, the toast left below the frame
  recapTap: 368 + K, // tapped open, in the silence between the lines
  rise: [400 + K, 448 + K], // the recap scrolls up into the reading window
  standout: 688 + K, // the Standout lifts as the glide onto it lands
  standoutDrop: 752 + K, // …and settles back before it is tapped
  cardTap: 800 + K, // the Standout, tapped: its save opens
  out: 896 + K, // the save is thrown out of frame; the lockup begins
  markStrike: 936 + K, // the mark's point strikes (the impact)
};

/**
 * The recap, read. The capture scrolls it in ~3pt steps (take mark `scroll`,
 * one frame a step); each read eases the page from one scroll position to
 * the next, in POINTS, and the camera takes up the difference to the nearest
 * captured step (kit/scroll.ts). [from, to, from pt, to pt]: 293 and 660 put
 * the write-up, then the two themes, at the top of the reading window, on
 * the page as the approved cut had it (with "Due now" above the recap). The
 * due save now leaves the list before the recap opens, so Revisit.tsx
 * shifts these by how much higher the recap sits (RECAP_Y_APPROVED).
 */
export const READS = [
  [HITS.rise[0], HITS.rise[1], 0, 293], // the write-up rises into view
  [528 + K, 576 + K, 293, 660], // → the two themes and the saves they link to
];
/** where "This week in Machina" sat (its top, points) on the approved cut's
 *  `ticked` frame: the reads above are measured from it */
export const RECAP_Y_APPROVED = 517;
/**
 * THE CREEPS (clip round 2: the themes hold measured dead still for a full
 * second). While a read is held the page never quite stops: it drifts on a
 * few points, on a curve that starts and ends at rest. [from, to, points]
 */
export const CREEP = [
  [HITS.rise[1], 528 + K, 12], // the write-up
  [576 + K, 624 + K, 9], // the themes
];
/**
 * The last read is ONE glide onto the Standout and its question: the page
 * scrolls on until it runs out and the camera carries the same eased motion
 * on down the screen, so nothing stops and starts again.
 */
export const GLIDE = [624 + K, 688 + K];

/**
 * (round 3, owner: "a huge white gap at the top") The clip sets its type
 * higher than the reel's and the app comes up under it: the scrim is solid
 * to 420px and clear by 600px.
 */
export const SLOTS = { kicker: 200, top: 256 };
export const BAND = { solid: 420, clear: 600 };

/** the end: the finished lockup holds ~1.8s once its line is whole */
export const TOTAL_FRAMES = OPEN + 1088 + K;
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
/**
 * (2026-10-03, owner via the Meta ad 3 session) The narrator's direction for
 * a Gemini read (voice Sulafat): this clip's tone is gentle, caring and
 * encouraging, a thoughtful friend nudging you, never guilt. `style` is each
 * line's acting note, `pace` replaces the house pace. Not yet used: the
 * Gemini voicing pipeline is not on this branch (the clip is still voiced
 * by Kokoro, which ignores both fields).
 */
const PACE = 'Unhurried and warm, about 145 words a minute; let sentences breathe.';
/** (light revisit) the new lines' pace: the owner found the cut slow */
const PACE_QUICK = 'Natural and easy, about 165 words a minute; no dragging.';

export const CAPTIONS = [
  // THE OPENING: the habit, then the problem (no chapter word: `open`).
  // (light revisit) the approved takes, a touch quicker (`tempo`)
  { at: 16, to: 76, open: true, text: 'You save things\nto come back to later.', style: 'Warm and knowing, gentle.', pace: PACE, tempo: 1.12 },
  { at: 80, to: 154, open: true, text: 'But most of them,\nyou never open again.', style: 'Softly honest, a touch wistful, no guilt.', pace: PACE, tempo: 1.12 },
  // the turn: the saves gather into the point as the name is said
  { at: 160, to: 228, open: true, text: 'Machina brings them\nback to you.', style: 'The turn: kind and uplifting, a smile.', pace: PACE, tempo: 1.15 },
  // 1. DUE: the save that came due, picked out, then opened
  { at: OPEN + 32, to: OPEN + 96, text: 'Your saves come back\nwhen you want them.', style: 'Reassuring, a sense of being in control.', pace: PACE, tempo: 1.12 },
  { at: OPEN + 96, to: OPEN + 186, text: 'Open one, and the key points\nare already there.', style: 'Pleased and easy.', pace: PACE, tempo: 1.15 },
  // 2. REMIND: its bell, "This weekend", Save (a new line, 2026-10-21)
  { at: OPEN + 224, to: OPEN + 304, text: 'Need it again?\nPick when it comes back.', style: 'Light and helpful, a friendly nudge.', pace: PACE_QUICK },
  // 3. TO-DO: the V60 step, picked out and ticked off as the line lands
  { at: OPEN + 336, to: OPEN + 464, text: 'When a save calls for action,\nMachina turns it into a to-do.', style: 'Practical, a little energised.', pace: PACE, tempo: 1.15 },
  // ── the approved cut, from here
  // "This week in Machina" is tapped open in the silence before this line;
  // it unfolds on "Every week," and rises into view on "Machina brings back"
  { at: OPEN + 384 + K, to: OPEN + 496 + K, text: 'Every week, Machina brings back\nwhat’s worth remembering.', style: 'Warm and steady, a gentle weekly ritual.', pace: PACE },
  // the themes land as "themes" is said; the Standout rises into view on
  // "the one save worth rereading" and lifts as the glide lands
  { at: OPEN + 576 + K, to: OPEN + 688 + K, text: 'The themes of your week,\nand the one save worth rereading.', style: "Thoughtful and savouring; slower on 'worth rereading'.", pace: PACE },
  // the close: the name (the drawn wordmark wipes in as it is said), then
  // the tagline (owner, 2026-09-28: every launch film ends on it, once)
  { at: OPEN + 960 + K, to: TOTAL_FRAMES, place: 'lockup', text: 'Machina.\nEverything you save, finally useful.', duck: 0.4, style: 'A warm, assured sign-off; the name proud, then the tagline unhurried and sincere.', pace: PACE },
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
  [120, OPENING.snap], // into the mark
  [OPEN + 864 + K, OPEN + HITS.markStrike], // into the lockup's strike
];

/** one chord per bar (the reel's C-major vocabulary); the last is the lockup.
 *  The opening hangs on IV and the mark resolves home; from bar 10 the
 *  approved cut's own progression */
export const BAR_CHORDS = ['Fmaj7', 'Fmaj7', 'G6', 'Cmaj7', 'Fmaj7', 'Cmaj7', 'G6', 'Cmaj7', 'Fmaj7', 'G6', 'Cmaj7', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'Fmaj7', 'G6', 'Cmaj7', 'Fmaj7', 'Cmaj7', 'Cmaj7', 'Cmaj7'];
