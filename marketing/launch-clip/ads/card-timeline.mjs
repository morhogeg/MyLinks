/**
 * Meta ad 1, "What one save becomes": its single source of time (the SAVE
 * clip's clips/save-timeline.mjs is the template; the picture in
 * src/reels/ads/card/, the score in audio/ads/card-score.mjs, the narrator via
 * `audio/synth-vo.py adcard`, the gates in audio/ads/card-verify.mjs all read
 * this file).
 *
 * One save, fully read, and brought back (owner, round 3, 2026-10-02: the
 * pain is "later never comes", so the payoff is the reminder):
 *
 *   HOOK     the YouTube · Watch later pile, the video on top: "Saved for
 *            later?" (on screen from frame 0) "Later never comes."
 *   SHARE    the video lifts out of the fading list, its Share is tapped, it
 *            is pulled into the mark; the wordmark wipes in on the name:
 *            "Share it to Machina instead."
 *   MOMENTS  the card lands in the feed and is tapped open; its four Key
 *            moments lift one by one, timestamps first (the peak)
 *   POINTS   one scroll down; the Key Points lift
 *   LINKS    the Related cards lift; "See in graph"; the real graph, its ties lit
 *   REMIND   back on the card: the bell, "Remind me" (Smart review: tomorrow
 *            9:00 AM, then 1 week and 1 month), Save, "Reminder set"
 *   DUE      tomorrow, 9:00 AM: the feed's "Reminders due" strip, the video in it
 *   CLOSE    thrown into the lockup: "Machina." / "Everything you save, finally useful."
 *
 * OUTPUT frames at 30fps on the reel's grid (112.5 BPM, 16 frames a beat).
 * The app is take "adcard" (capture/shoot.mjs, capture/ad-card.mjs), its rolls
 * captured at 60fps and played one per output frame (the reel's half speed).
 */

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const BPM = 112.5;
export const BEAT_FRAMES = 16;
export const BAR_FRAMES = 64;
export const BEAT = BEAT_FRAMES / FPS;
export const BAR = BAR_FRAMES / FPS;

/** THE CUT: every scene reads these, and so does the score */
export const HITS = {
  // the hook: on "never" the list bleaches (the video stays sharp); the
  // video lifts out of it only as the narrator says "Share it to Machina"
  // (owner, round 4: the card waited for its line)
  lost: 56,
  talkLifts: 96,
  // the mark assembles where the share will land (3.7s), the name wipes in on "Machina"
  dotLands: 104,
  bracketsClose: 112,
  // the share: tapped after the name, pulled into the mark
  shareTap: 128,
  shareLands: 144,
  // the point drops to become the + button; the app irises open around it
  part: 168,
  toApp: 192,
  // the card lands at the top of the feed (from toApp) and is tapped open
  cardTap: 232,
  // the peak: its Key moments, one by one, timestamps first
  moments: [256, 272, 288, 304],
  // one scroll down: the Key Points, lifted
  keyPoints: 384,
  // on down: the three Related cards, lifted as one block
  related: 464,
  // the app's own "See in graph": the same ties, as a map
  graphTap: 496,
  // a cut back to the card: its bell, "Remind me", Save
  back: 536,
  bellTap: 552,
  smart: 568, // the Smart review row (preselected: tomorrow 9:00 AM, then 1 week & 1 month), lifted
  saveTap: 624,
  reminderSet: 632, // the app's "Reminder set for …", lifted
  // tomorrow, 9:00 AM: the feed's "Reminders due" strip
  due: 656,
  dueLift: 680,
  // the close
  throw: 704,
  lockup: 720,
  markStrike: 744,
};

/**
 * The share-sheet slot: the span a real iPhone screen recording of the share
 * (Share → Machina) could replace one day, cut for cut. Today it is the kit's
 * brand share gesture (Share.tsx), never rebuilt iOS UI. [from, to): the video
 * lifting out of the pile until it lands in the mark.
 */
export const SHARE_SLOT = [HITS.talkLifts, HITS.shareLands];

/**
 * The push slot: the reminder arriving as a lock-screen push ("Time to
 * revisit") is native iOS and cannot be captured from the web build; the ad
 * shows the in-app delivery (the feed's "Reminders due" strip). A real iPhone
 * recording of the push could replace [from, to) later.
 */
export const PUSH_SLOT = [HITS.due, HITS.throw];

/** the card's read-down (the app's scroll, captured in 3pt steps): [from, to,
 *  target] in output frames; targets are named in Card.tsx */
export const SCROLLS = [
  [320, 384, 'keyPoints'],
  [416, 464, 'related'],
];

export const THROW_LEN = 30;
export const TOTAL_FRAMES = 878; // the tagline holds 1.6s after the voice ends
export const TOTAL_SEC = TOTAL_FRAMES / FPS;

/**
 * The narrator = the captions, line for line (Kokoro `af_heart` 0.95,
 * "Machina" spoken "Makeena"). `at` is the frame the voice starts, `to` the
 * frame the line leaves (0.3–1.2s after the voice; up to 4s with `until`).
 * At most 8 words on screen at once (a kicker counts). `poster`: the line is
 * already set on frame 0 (the ad's first frame is its poster; the hook must
 * land with the sound off). NO em dashes, no literal "AI", no "second
 * brain", no "library". "Ready when you are." is the launch film's own payoff
 * line (timeline.mjs, round 13g).
 */
export const CAPTIONS = [
  { at: 8, to: 48, text: 'Saved for later?', size: 80, poster: true },
  { at: 48, to: 92, text: 'Later never comes.', size: 80 },
  { at: 96, to: 160, text: 'Share it to Machina instead.', size: 64, until: 'the share lands in the mark' },
  { at: 232, to: 320, text: 'Get the moments that matter,\ntimestamped.', size: 60, until: 'the four Key moments lift, a beat apart' },
  { at: 368, to: 416, text: 'Get the key points.', size: 64, until: 'the Key Points lift' },
  { at: 432, to: 536, text: 'Linked to what you\nalready saved.', size: 60, until: 'the Related cards lift, then the graph opens on their ties' },
  { at: 544, to: 648, text: 'Pick a time.\nMachina brings it back.', size: 60, until: 'the reminder is set' },
  { at: 664, to: 704, text: 'Ready when you are.', size: 64, kicker: 'Tomorrow,\u00a09:00\u00a0AM', until: 'the Reminders due strip lifts' },
  // the close, on the lockup: the name (the drawn wordmark wipes in as it is
  // said), then the tagline, exactly as written (owner call 2026-09-28)
  { at: HITS.markStrike, to: TOTAL_FRAMES, place: 'lockup', text: 'Machina.\nEverything you save, finally useful.', duck: 0.4 },
];

/** the time card above "Ready when you are." (the kit's Kicker): 4 frames
 *  before its line, leaving with it */
export const KICKERS = CAPTIONS.filter((c) => c.kicker).map((c) => ({ at: c.at - 4, to: c.to, text: c.kicker }));

/**
 * THE SCORE's map (audio/ads/card-score.mjs), one chord per bar (14 bars):
 * the hook hangs on IV, the mark resolves to I, the card walks I V IV I,
 * the reminder leans on V, home for "Ready when you are." and the lockup.
 */
export const BAR_CHORDS = ['Fmaj7', 'Fmaj7', 'Cmaj7', 'G6', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'Cmaj7', 'Cmaj7', 'Cmaj7'];
/** the drums: in with the app (bar 3), out for the lockup */
export const DRUMS = [3 * BAR_FRAMES, HITS.lockup];
/** risers END on the reveal they lead into: the mark, the app, the strike */
export const RISERS = [
  [HITS.dotLands - 32, HITS.dotLands],
  [HITS.part, HITS.toApp + 8],
  [HITS.lockup - 8, HITS.markStrike],
];
