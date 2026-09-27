/**
 * The REEL's single source of truth for time (the launch film's is
 * timeline.mjs; they share nothing but the idea). Picture (src/reels/*),
 * score (audio/reel-score.mjs), narrator (audio/synth-vo.py --script reel)
 * and `npm run verify` all read this file, so a cut cannot drift off its beat.
 *
 * THE CUT is written in SOURCE frames (the round-1 cut: 112.5 BPM, 16 frames
 * a beat, 600 frames), and the reel plays it K times slower (see K below);
 * captions and the narrator are placed in OUTPUT frames (90 BPM, 20 a beat).
 * Scenes read SOURCE frames; captions, kickers and the score read OUTPUT.
 *
 * Every frame of app UI in the reel is the real app, captured by
 * capture/shoot.mjs; scenes refer to those takes by their marks.
 */

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

/**
 * ROUND 3 (owner, 2026-09-27): "slow it down more", and change only what was
 * asked. So the cut below is the round-1 cut, unchanged, written in its own
 * frames (SOURCE frames: 600 of them, 16 a beat), and the reel plays it
 * K = 2.5 times slower. The narrator is NOT slowed: captions and voice are
 * placed in OUTPUT frames. One insert is added (INSERT): after the new card
 * lands, it is opened to show what a save becomes (its Key Points).
 *
 * OUTPUT grid: 90 BPM, 20 frames a beat, so every source 8th lands on an
 * output beat. `real(src)` maps a source frame to its output frame.
 */
export const K = 2.5;
export const BPM = 90;
export const BEAT_FRAMES = 20;
export const BAR_FRAMES = BEAT_FRAMES * 4; // 80
export const BEAT = BEAT_FRAMES / FPS; // 0.6667s
export const BAR = BAR_FRAMES / FPS; // 2.6667s

/** Beat (quarter note, may be fractional) → output frame. */
export const beat = (n) => Math.round(n * BEAT_FRAMES);
/** Bar → output frame. */
export const bar = (n) => Math.round(n * BAR_FRAMES);

/** The card insert: at source frame `at` the source clock holds for `len`
 *  output frames while the new card is opened (scenes/CardDetail.tsx). */
export const INSERT = { at: 208, len: 200 };

/** source frame → output frame */
export const real = (src) => Math.round(src * K) + (src >= INSERT.at ? INSERT.len : 0);

/** output frame → source frame (held at INSERT.at during the insert) */
export const srcOf = (f) => {
  const i0 = Math.round(INSERT.at * K);
  if (f < i0) return f / K;
  if (f < i0 + INSERT.len) return INSERT.at;
  return (f - INSERT.len) / K;
};

export const SOURCE_FRAMES = 600;
export const TOTAL_FRAMES = real(SOURCE_FRAMES); // 1700
export const TOTAL_SEC = TOTAL_FRAMES / FPS; // 56.7s

/**
 * The cut, in SOURCE frames. One idea per scene; the hero (Ask) gets the
 * most time. Every boundary is a source beat line (a multiple of 16).
 */
export const SCENES = [
  { id: 'hook', from: 0, dur: 128 }, //  0.00  saves everywhere → one point → [ • ]
  { id: 'save', from: 128, dur: 80 }, //  4.27  + → the five-phase pipeline → a card
  { id: 'find', from: 208, dur: 64 }, //  6.93  plain words → the one card
  { id: 'ask', from: 272, dur: 144 }, //  9.07  question → answer → three sources
  { id: 'connect', from: 416, dur: 48 }, // 13.87  the graph lights those three
  { id: 'recall', from: 464, dur: 48 }, // 15.47  this week's recap
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
 * "Machina"). `at` is the OUTPUT frame the voice starts; `to` the frame the
 * caption leaves (the voice is never slowed, only the picture). Short lines, one per pillar, with air between them: the reel is
 * narrated by its pictures first.
 *
 * A "\n" is a hard line break on screen only (the voice reads straight on).
 * NO em dashes, no literal "AI", no "second brain", no "library" (verify).
 */
export const CAPTIONS = [
  // the tagline introduces the product (D-6), spoken as the mark locks; it
  // holds over the + tap and the Add dialog so its last word can land
  { at: 110, to: 365, place: 'hook', text: 'Machina.\nEverything you save, finally useful.' },
  { at: 375, to: 450, text: 'Save anything.' },
  // the insert: the new card, opened
  { at: 530, to: 712, text: 'Each save becomes a card,\nwith the key points pulled out.' },
  { at: 735, to: 855, text: 'Find it in your own words.' },
  { at: 895, to: 1150, text: 'Ask anything. Every answer comes straight from your saves.' },
  { at: 1250, to: 1360, text: 'See how it all connects.' },
  // recall: the weekly recap (replaces the review deck and its line)
  { at: 1370, to: 1510, text: 'Every week, Machina brings back\nwhat’s worth remembering.' },
  // the close is the App Store subtitle, the same words the lockup sets
  { at: 1565, to: 1700, place: 'lockup', text: 'Never lose another great find.' },
];

/** The pillar word each product scene opens on (the kinetic kicker), in
 *  OUTPUT frames. */
export const KICKERS = [
  { at: 370, to: 712, text: 'Save' },
  { at: 725, to: 870, text: 'Find' },
  { at: 885, to: 1230, text: 'Ask' },
  { at: 1245, to: 1350, text: 'Connect' },
  { at: 1365, to: 1475, text: 'Revisit' },
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
  recapTap: 474, // open this week's recap
  standout: 504, // its standout arrives in view
  lockup: 512,
  markStrike: 534,
};

/** HITS in OUTPUT frames (the score's clock). */
export const REAL_HITS = Object.fromEntries(
  Object.entries(HITS).map(([k, v]) => [k, Array.isArray(v) ? v.map(real) : real(v)]),
);

/** Risers END on the reveal they lead into. [from, to] in SOURCE frames. */
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
/** one chord per SOURCE bar (64 source frames); the score maps them */
export const BAR_CHORDS = ['Fmaj7', 'Cmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'Cmaj7'];
