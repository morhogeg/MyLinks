/**
 * Meta ad 1, "What one save becomes": its single source of time (the SAVE
 * clip's clips/save-timeline.mjs is the template; the picture in
 * src/reels/ads/card/, the score in audio/ads/card-score.mjs, the narrator via
 * `audio/synth-vo.py adcard`, the gates in audio/ads/card-verify.mjs all read
 * this file).
 *
 * One save, fully read, in about 20 seconds (owner, 2026-10-02):
 *
 *   HOOK    the YouTube · Watch later pile, the talk on top: "That talk you
 *           saved for later? You'll never get to it." (on screen from frame 0)
 *   SHARE   the talk lifts out of the fading pile, its Share is tapped and it
 *           is pulled into the mark; the wordmark wipes in: "Share it to Machina."
 *   MOMENTS the card lands in the feed and is tapped open; its Key moments
 *           lift one by one, timestamps first
 *   POINTS  read down to the gist and the Key Points
 *   LINKS   the tags lift, then the three Related cards; "See in graph" is
 *           tapped and the real graph opens on the talk, its three ties lit
 *   CLOSE   thrown into the lockup: "Machina." / "Everything you save, finally useful."
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
  // the hook: on "never" the pile bleaches; the talk lifts out of it
  lost: 80,
  talkLifts: 88,
  // the mark assembles where the share will land (by ~3s)
  dotLands: 96,
  bracketsClose: 104,
  // the share: tapped on "Share", pulled into the mark
  shareTap: 120,
  shareLands: 136,
  // the point drops to become the + button; the app irises open around it
  part: 160,
  toApp: 184,
  // the card lands at the top of the feed (from toApp) and is tapped open
  cardTap: 216,
  // its Key moments, one by one, timestamps first
  moments: [240, 248, 256, 264],
  // the read-down: the gist, then the Key Points, lifted
  keyPoints: 336,
  // the tags, then the Related cards
  tags: 384,
  related: 424, // the three cards, lifted as one block
  // the app's own "See in graph": the same ties, as a map
  graphTap: 456,
  // the close
  throw: 520,
  lockup: 536,
  markStrike: 560,
};

/**
 * The share-sheet slot: the span a real iPhone screen recording of the share
 * (Share → Machina) could replace one day, cut for cut. Today it is the kit's
 * brand share gesture (Share.tsx), never rebuilt iOS UI. [from, to): the talk
 * lifting out of the pile until it lands in the mark.
 */
export const SHARE_SLOT = [HITS.talkLifts, HITS.shareLands];

/** the card's read-down (the app's scroll, captured in 3pt steps): [from, to,
 *  target] in output frames; targets are named in Card.tsx */
export const SCROLLS = [
  [280, 312, 'gist'],
  [312, 336, 'keyPoints'],
  [360, 384, 'tags'],
  [400, 424, 'related'],
];

export const THROW_LEN = 30;
export const TOTAL_FRAMES = 694; // the tagline holds 1.6s after the voice ends
export const TOTAL_SEC = TOTAL_FRAMES / FPS;

/**
 * The narrator = the captions, line for line (Kokoro `af_heart` 0.95,
 * "Machina" spoken "Makeena"). `at` is the frame the voice starts, `to` the
 * frame the line leaves (0.3–1.2s after the voice; up to 4s with `until`).
 * At most 8 words on screen at once. `poster`: the line is already set on
 * frame 0 (the ad's first frame is its poster; the hook must land with the
 * sound off). NO em dashes, no literal "AI", no "second brain", no "library".
 */
export const CAPTIONS = [
  { at: 8, to: 68, text: 'That talk you\nsaved for later?', size: 76, poster: true },
  { at: 72, to: 120, text: "You'll never\nget to it.", size: 76 },
  { at: 120, to: 168, text: 'Share it to Machina.', size: 64 },
  { at: 216, to: 288, text: 'Get the key moments,\nwith timestamps.', size: 60, until: 'the four Key moments lift' },
  { at: 296, to: 368, text: 'The whole talk,\ndown to what matters.', size: 60, until: 'the Key Points lift' },
  { at: 376, to: 520, text: 'Tagged, and linked to\nwhat you already saved.', size: 60, until: 'the Related cards lift, then the graph opens on their ties' },
  // the close, on the lockup: the name (the drawn wordmark wipes in as it is
  // said), then the tagline, exactly as written (owner call 2026-09-28)
  { at: HITS.markStrike, to: TOTAL_FRAMES, place: 'lockup', text: 'Machina.\nEverything you save, finally useful.', duck: 0.4 },
];

/**
 * THE SCORE's map (audio/ads/card-score.mjs), one chord per bar (11 bars):
 * the hook hangs on IV, the mark resolves to I, the card walks I V IV I,
 * home for the lockup.
 */
export const BAR_CHORDS = ['Fmaj7', 'Fmaj7', 'Cmaj7', 'G6', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'G6', 'Cmaj7', 'Cmaj7'];
/** the drums: in with the card (bar 3), out for the lockup */
export const DRUMS = [3 * BAR_FRAMES, HITS.lockup];
/** risers END on the reveal they lead into: the mark, the app, the strike */
export const RISERS = [
  [HITS.dotLands - 32, HITS.dotLands],
  [HITS.part, HITS.toApp + 8],
  [HITS.lockup - 8, HITS.markStrike],
];
