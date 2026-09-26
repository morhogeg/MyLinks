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
 * 600 frames = 9.375 bars = 20.0s.
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

export const TOTAL_FRAMES = 600;
export const TOTAL_SEC = TOTAL_FRAMES / FPS;

/**
 * The cut, in frames. One idea per scene; the hero (Ask) gets the most time.
 * Every boundary is a beat line (a multiple of 16).
 */
export const SCENES = [
  { id: 'hook', from: 0, dur: 128 }, //  0.00  saves everywhere → one point → [ • ]
  { id: 'save', from: 128, dur: 80 }, //  4.27  + → the five-phase pipeline → a card
  { id: 'find', from: 208, dur: 64 }, //  6.93  plain words → the one card
  { id: 'ask', from: 272, dur: 144 }, //  9.07  question → answer → three sources
  { id: 'connect', from: 416, dur: 48 }, // 13.87  the graph lights those three
  { id: 'revisit', from: 464, dur: 48 }, // 15.47  today's Daily Brew deals
  { id: 'lockup', from: 512, dur: 88 }, // 17.07  the mark, the name, the subtitle
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
 * leaves. Short lines, one per pillar, with air between them: the reel is
 * narrated by its pictures first.
 *
 * A "\n" is a hard line break on screen only (the voice reads straight on).
 * NO em dashes, no literal "AI", no "second brain", no "library" (verify).
 */
export const CAPTIONS = [
  // the tagline introduces the product (D-6), spoken as the mark locks; it
  // holds over the + tap and the Add dialog so its last word can land
  { at: 44, to: 146, place: 'hook', text: 'Machina.\nEverything you save, finally useful.' },
  { at: 150, to: 180, text: 'Save anything.' },
  { at: 214, to: 262, text: 'Find it in your own words.' },
  { at: 278, to: 380, text: 'Ask anything. Every answer comes straight from your saves.' },
  { at: 420, to: 464, text: 'See how it all connects.' },
  { at: 468, to: 524, text: 'And the best ones come back to you.' },
  // the close is the App Store subtitle, the same words the lockup sets
  { at: 546, to: 600, place: 'lockup', text: 'Never lose another great find.' },
];

/** The pillar word each product scene opens on (the kinetic kicker). */
export const KICKERS = [
  { at: 148, to: 204, text: 'Save' },
  { at: 210, to: 268, text: 'Find' },
  { at: 274, to: 412, text: 'Ask' },
  { at: 418, to: 460, text: 'Connect' },
  { at: 466, to: 510, text: 'Revisit' },
];

/**
 * Picture events the score must acknowledge, in frames. Taps and landings
 * sit on the grid; the scenes read these same numbers, so moving a hit here
 * moves the picture and the sound together.
 */
export const HITS = {
  collapse: 40, // the saves rush together…
  dotLands: 48, // …and land as one point (beat 3)
  bracketsClose: 56, // the brackets snap shut around it (the app's spring)
  markLocked: 64, // bar 1: the mark, whole
  toApp: 120, // the point becomes the + button
  plusTap: 132,
  dialog: 136,
  saveTap: 140,
  phases: [144, 152, 160, 168, 176], // the five phases, an 8th apart
  saved: 184,
  cardLands: 200,
  searchTap: 212,
  typeFrom: 216,
  found: 240,
  askTap: 272,
  askTypeFrom: 284,
  send: 316,
  answerFrom: 320,
  sources: 344,
  chips: [352, 360, 368],
  graphTap: 400,
  graph: 416,
  revisitTap: 464,
  reviewTap: 472,
  flings: [480, 496],
  lockup: 512,
  markStrike: 534,
};

/** Risers END on the reveal they lead into. [from, to] in frames. */
export const RISERS = [
  [16, 48],
  [96, 128],
  [384, 416],
  [500, 534],
];

/**
 * Harmony, one chord per bar (the film's C-major vocabulary, walked brighter
 * and faster): the hook hangs on IV until the mark resolves home on I.
 */
export const BAR_CHORDS = ['Fmaj7', 'Cmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'Cmaj7'];
