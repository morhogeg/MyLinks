/**
 * Meta ad 2 of 3, the Ask ad, the "one person talking to a friend" edition
 * (owner-approved script, 2026-10-03). It sits beside round 6 of the same ad
 * (ads/trip-timeline.mjs, `MachinaAdTrip*`), which is kept as it is: same
 * feature, same real-app take (`adask`), a new voice.
 *
 *   "You save the good stuff for a reason. So why does most of it slip your
 *    mind?" over saves of every kind from five apps; "The talk that made it all
 *    click." (the YouTube pile lifts, the TED talk lit) "The article you meant
 *    to come back to." (the Safari pile, The Tail End); "That's exactly why we
 *    made Machina." (they gather into the mark); "Now you can ask your saves
 *    anything." (the chat, the question typing); "It reads across all your
 *    saves… so you get one clear answer."; "It even finds what connects
 *    them… so you see the theme running through your saves." (the theme,
 *    the three sources, the graph); "Machina. Everything you save, finally useful."
 *
 * Picture (src/reels/ads/asktalk/), score (audio/ads/asktalk-score.mjs),
 * narrator (audio/synth-vo.py asktalk) and the ad's gates
 * (audio/ads/asktalk-verify.mjs) all read this file. Output frames on the
 * reel's grid: 112.5 BPM, 16 frames a beat; cuts and taps on beats or 8ths.
 *
 * THE META SPEC: frame 0 is the poster (the piles, the hook's first sentence
 * already up); the narrator starts by 0.5s; at most 30s; every line burned in
 * as chunks of at most 8 words timed to the voice (`splits`); every line,
 * logo and key app moment inside the 9:16 safe zone.
 */

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
/** the Feed edition (4:5) */
export const FEED_HEIGHT = 1350;

export const K = 2;
export const BPM = 112.5;
export const BEAT_FRAMES = 16;
export const BAR_FRAMES = BEAT_FRAMES * 4;
export const BEAT = BEAT_FRAMES / FPS;
export const BAR = BAR_FRAMES / FPS;

/** Beat (may be fractional) → frame. */
export const beat = (n) => Math.round(n * BEAT_FRAMES);

/** the capture take every app frame comes from (shared with round 6) */
export const TAKE = 'adask';

/** how many of the feed's captured steps may play (unused here: no feed rush) */
export const FEED_STEPS = 186;

/** output frames per typed character (the capture types one per frame) */
export const TYPE_STEP = 1;

/**
 * Picture events, in frames. The scenes and the score read these same
 * numbers. A tap lands on the frame the app answers it. (Frames that follow a
 * spoken word are set from vo.json, noted where they are.)
 */
export const HITS = {
  hook: 0, // saves of every kind, each in the app it was saved in (the poster)
  talk: 165, // "The talk…": the YouTube pile lifts, the TED talk lit (vo.json)
  article: 221, // "The article…": the Safari pile lifts, The Tail End lit (vo.json)
  lost: beat(16), // "…come back to.": the piles go soft
  collapse: beat(17), // they gather into one point (EASE_GATHER)…
  dotLands: beat(18), // …which lands as "That's exactly why…" starts
  bracketsClose: beat(18.5), // the brackets snap shut around it
  wordmark: 332, // the drawn wordmark wipes in as "Machina" is said (vo.json)
  part: beat(22.5), // the mark and the wordmark leave
  open: beat(23.5), // CUT to the chat: the question types itself
  send: beat(27), // Send is tapped; the cut to its answer lands on the touch
  ask2: beat(35.5), // CUT to a new chat, the big question typed
  send2: beat(36), // Send is tapped; its answer arrives on the touch
  lead: beat(37), // "It even finds…": the theme (its first line) lifts, and holds
  sources2: beat(39), // its three sources arrive…
  chips: [beat(40), beat(40.5), beat(41)], // …and lift one by one on "so you see"
  graphTap: beat(42), // its Graph chip: the saves it connected, lit in the real graph ("the theme running through your saves")
  lockup: beat(45), // thrown out into the lockup; the mark launches
  markStrike: beat(46), // the mark's point strikes
};

/**
 * The captions ARE the script (audio/synth-vo.py asktalk speaks each as
 * written, "Machina" respelled for the voice only). `at` is the frame the
 * voice starts, `to` the frame the line has left. `splits` (word indexes)
 * shows a line as consecutive captions, each arriving with its first word,
 * so no more than 8 words are ever up. `pre` puts the first caption on
 * screen, whole, from frame 0.
 */
/**
 * The narrator: Gemini TTS, voice Sulafat, the house narrator (owner,
 * 2026-10-03). Each line carries its acting note (`style`) and this video's
 * pace (`pace`, replacing the house one): a friend sharing a discovery. A
 * take is keyed by its words and its direction
 * (audio/vo-takes/), so changing either re-voices the line.
 */
const PACE = 'Conversational, about 160 words a minute, natural breaths.';

export const CAPTIONS = [
  { at: beat(0.5), to: beat(10), hook: true, pre: true, splits: [8, 13], text: 'You save the good stuff for a reason. So why does most of it slip your mind?', pace: PACE, style: 'Warm and reflective, then a genuine, gently puzzled question.' },
  { at: beat(10), to: beat(17.5), splits: [7], text: 'The talk that made it all click. The article you meant to come back to.', pace: PACE, style: 'Fond, remembering, a small smile on each.' },
  { at: beat(18), to: beat(22.5), text: "That's exactly why we made Machina.", pace: PACE, style: 'The turn: bright, warm and proud; the name lands with a smile.', duck: 0.4 },
  { at: beat(23.5), to: beat(28), text: 'Now you can ask your saves anything.', pace: PACE, style: 'Excited, sharing good news with a friend.' },
  { at: beat(28), to: beat(36.5), splits: [6], text: 'It reads across all your saves… so you get one clear answer.', pace: PACE, style: 'Clear and quietly impressed.' },
  { at: beat(36.5), to: beat(45), splits: [6, 9], until: true, text: 'It even finds what connects them… so you see the theme running through your saves.', pace: PACE, style: "Delighted, a little wonder on 'It even'." },
  // the close: the name (the drawn wordmark wipes in as it is said), then the
  // tagline on ONE line, exactly; the music steps back
  { at: beat(46.5), to: beat(56), place: 'lockup', text: 'Machina.\nEverything you save, finally useful.', pace: PACE, style: 'A confident, warm sign-off with a smile; the name proud, then the tagline unhurried and sincere.', duck: 0.4 },
];

export const TOTAL_FRAMES = CAPTIONS[CAPTIONS.length - 1].to;
export const TOTAL_SEC = TOTAL_FRAMES / FPS;

/** Risers END on the reveal they lead into. [from, to] in frames. */
export const RISERS = [
  [beat(15), HITS.dotLands], // the piles going soft → the point lands
  [beat(43.5), HITS.markStrike], // the throw → the mark strikes
];

/** One chord per bar (the film's and the reel's vocabulary). */
export const BAR_CHORDS = ['Fmaj7', 'Fmaj7', 'G6', 'Cmaj7', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'Cmaj7', 'Cmaj7'];
