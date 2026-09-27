/**
 * The REEL's single source of truth for time (the launch film's is
 * timeline.mjs; they share nothing but the idea). Picture (src/reels/*),
 * score (audio/reel-score.mjs), narrator (audio/synth-vo.py --script reel)
 * and `npm run verify` all read this file, so a cut cannot drift off its beat.
 *
 * THE GRID. 112.5 BPM in 4/4 is chosen for the frame math, not the number:
 * one beat is exactly 16 frames at 30fps, an 8th is 8, a 16th is 4, a bar is
 * 64. Every cut, tap, card landing and caption is placed on that grid in
 * FRAMES, which is how the edit and the synthesized score stay locked.
 * 1280 frames = 20 bars = 42.7s.
 *
 * ROUND 2 (owner, after the 20s cut): "way too fast, almost impossible to
 * follow". Same grid, twice the room: a phase per BEAT (not per 8th), the
 * app typing and streaming at the pace a person reads, and every caption
 * held until it has been read. The cut's rhythm stays on the beat; only
 * the distance between events grew.
 *
 * Every frame of app UI in the reel is the real app, captured by
 * capture/shoot.mjs; scenes refer to those takes by their marks.
 */

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export const BPM = 112.5;
export const BEAT_FRAMES = 16;
export const BAR_FRAMES = BEAT_FRAMES * 4; // 64
export const BEAT = BEAT_FRAMES / FPS; // 0.5333s
export const BAR = BAR_FRAMES / FPS; // 2.1333s

/** Beat (quarter note, may be fractional) → frame. */
export const beat = (n) => Math.round(n * BEAT_FRAMES);
/** Bar → frame. */
export const bar = (n) => Math.round(n * BAR_FRAMES);

export const TOTAL_FRAMES = 1280;
export const TOTAL_SEC = TOTAL_FRAMES / FPS;

/**
 * The cut, in frames. One idea per scene; the hero (Ask) and the two things
 * people most need explained (what a save becomes, and how it comes back)
 * get the most time. Every boundary is a beat line (a multiple of 16).
 */
export const SCENES = [
  { id: 'hook', from: 0, dur: 208 }, //  0.0   saves everywhere, lost → one point → [ • ]
  { id: 'save', from: 208, dur: 256 }, //  6.9   + → the five phases → the card → what it holds
  { id: 'find', from: 464, dur: 144 }, // 15.5   plain words → the one card
  { id: 'ask', from: 608, dur: 224 }, // 20.3   question → answer → three sources
  { id: 'connect', from: 832, dur: 96 }, // 27.7   the graph lights those three
  { id: 'recall', from: 928, dur: 256 }, // 30.9   this week's recap: themes, a standout, a question
  { id: 'lockup', from: 1184, dur: 96 }, // 39.5   the mark, the name, the subtitle
];

export const sceneAt = (id) => {
  const s = SCENES.find((x) => x.id === id);
  if (!s) throw new Error(`unknown reel scene ${id}`);
  return s;
};

/**
 * The narrator's lines = the captions, line for line (the same `af_heart`
 * voice as the film: audio/synth-vo.py speaks `say` when present, else
 * `text`; the only allowed differences are the SAY_NAME respelling of
 * "Machina"). `at` is the frame the voice starts; `to` the frame the caption
 * leaves. Short lines with air between them: the reel is narrated by its
 * pictures first, and every line is on screen until it has been read.
 *
 * The arc: the problem (saved everywhere, then gone) → the promise (the
 * tagline) → what a save becomes → finding it → asking it → how it comes
 * back to you (recall) → the subtitle, which answers the first line.
 *
 * A "\n" is a hard line break on screen only (the voice reads straight on).
 * NO em dashes, no literal "AI", no "second brain", no "library" (verify).
 */
export const CAPTIONS = [
  { at: 4, to: 108, text: 'You save great finds everywhere.\nThen they’re gone.' },
  // the tagline introduces the product (D-6), spoken as the mark locks; it
  // holds over the + tap and the Add dialog so its last word can land
  { at: 112, to: 226, place: 'hook', text: 'Machina.\nEverything you save, finally useful.' },
  { at: 236, to: 316, text: 'Save anything.' },
  { at: 344, to: 452, text: 'Each save becomes a card,\nwith the key points pulled out.' },
  { at: 484, to: 572, text: 'Find it in your own words.' },
  { at: 640, to: 712, text: 'Ask anything.' },
  { at: 736, to: 812, text: 'Every answer comes straight from your saves.' },
  { at: 840, to: 916, text: 'See how it all connects.' },
  { at: 952, to: 1040, text: 'Every week, Machina writes up what you saved.' },
  { at: 1060, to: 1160, text: 'So what you save stays with you.' },
  // the close is the App Store subtitle, the same words the lockup sets
  { at: 1218, to: 1280, place: 'lockup', text: 'Never lose another great find.' },
];

/** The pillar word each product scene opens on (the kinetic kicker). */
export const KICKERS = [
  { at: 232, to: 452, text: 'Save' },
  { at: 470, to: 596, text: 'Find' },
  { at: 612, to: 822, text: 'Ask' },
  { at: 836, to: 916, text: 'Connect' },
  { at: 934, to: 1164, text: 'Recall' },
];

/**
 * Picture events the score must acknowledge, in frames. Taps and landings
 * sit on the grid; the scenes read these same numbers, so moving a hit here
 * moves the picture and the sound together.
 */
export const HITS = {
  collapse: 88, // the saves rush together…
  dotLands: 96, // …and land as one point (bar 1, beat 3)
  bracketsClose: 104, // the brackets snap shut around it (the app's spring)
  markLocked: 128, // bar 2: the mark, whole
  toApp: 200, // the point becomes the + button
  plusTap: 212,
  dialog: 216,
  saveTap: 232,
  phases: [240, 256, 272, 288, 304], // the five phases, a beat apart
  saved: 320,
  cardLands: 336,
  cardTap: 368, // open the new card: what it holds
  keyPoints: 400, // …read down to its Key Points
  searchTap: 472,
  typeFrom: 480,
  found: 528,
  askTap: 608,
  askTypeFrom: 640,
  send: 688,
  answerFrom: 696,
  sources: 736,
  chips: [752, 768, 784],
  graphTap: 816,
  graph: 832,
  revisitTap: 928,
  recapTap: 944, // open this week's recap
  standout: 1088, // the standout arrives in view
  lockup: 1184,
  markStrike: 1206,
};

/** Risers END on the reveal they lead into. [from, to] in frames. */
export const RISERS = [
  [48, 96],
  [168, 200],
  [800, 832],
  [1150, 1206],
];

/**
 * Harmony, one chord per bar (the film's C-major vocabulary): the hook hangs
 * on IV until the mark resolves home on I at bar 2, then I–V–IV walks under
 * the product, settling home for the recap and the lockup.
 */
export const BAR_CHORDS = [
  'Fmaj7', 'Fmaj7', 'Cmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7',
  'G6', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'Fmaj7', 'G6', 'Cmaj7', 'Cmaj7',
];
