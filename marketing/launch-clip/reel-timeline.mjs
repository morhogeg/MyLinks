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
 * ROUND 4 (owner, 2026-09-27): the round-1 cut, written in its own frames
 * (SOURCE frames: 600 of them, 16 a beat), played at a speed that CHANGES
 * with what is on screen: "slower when it's important the user actually
 * reads what's on the screen, faster for cool transitions". SPEED lists how
 * many output frames each source frame lasts, by source range. The narrator
 * is never slowed: captions and voice are placed in OUTPUT frames.
 *
 * Two HOLDS stop the source clock while an output-frame scene plays:
 *  - `problem`: the opening, the saves hanging where they were kept while
 *    the narrator names the problem (scenes/Hook.tsx reads `hold`);
 *  - `card`: the new card, opened to its Key Points (scenes/CardDetail.tsx).
 *
 * The music runs at 90 BPM on the output clock; its sound design is placed
 * where each picture event lands (`real`).
 */
export const BPM = 90;
export const BEAT_FRAMES = 20;
export const BAR_FRAMES = BEAT_FRAMES * 4; // 80
export const BEAT = BEAT_FRAMES / FPS; // 0.6667s
export const BAR = BAR_FRAMES / FPS; // 2.6667s

/** Beat (quarter note, may be fractional) → output frame. */
export const beat = (n) => Math.round(n * BEAT_FRAMES);
/** Bar → output frame. */
export const bar = (n) => Math.round(n * BAR_FRAMES);

/** [from source frame, output frames per source frame] — read ↔ move */
export const SPEED = [
  [0, 1.5], //    the saves arrive
  [31, 2.0], //   …collapse into the point, the brackets snap shut
  [64, 1.2], //   the mark, whole
  [104, 1.5], //  the point drops, the + irises open
  [136, 2.0], //  Add to Machina, the Save tap
  [144, 2.6], //  READ: the five phases
  [184, 1.6], //  the dialog drops, the card lands
  [208, 2.0], //  the search tap, the query typed
  [240, 2.8], //  READ: the one card it finds
  [264, 1.5], //  whip into Ask, the hero
  [284, 2.0], //  the question typed
  [316, 3.0], //  READ: the answer and its three sources
  [392, 1.6], //  the dive into the Graph chip
  [416, 2.2], //  the graph
  [464, 1.6], //  the Revisit tab
  [474, 3.0], //  READ: this week's recap, down to its standout
  [506, 1.6], //  thrown out of frame
  [512, 2.2], //  the lockup
];

/** The holds: at source frame `at` the source clock stops for `len` output frames. */
export const HOLDS = [
  { id: 'problem', at: 31, len: 210 },
  { id: 'card', at: 208, len: 200 },
];
export const INSERT = HOLDS[1];

const speedAt = (src) => {
  let k = SPEED[0][1];
  for (const [from, v] of SPEED) if (src >= from) k = v;
  return k;
};

/** source frame → output frame (a source frame at/after a hold lands after it) */
export const real = (src) => {
  let out = 0;
  for (let i = 0; i < SPEED.length; i++) {
    const [from, k] = SPEED[i];
    const to = i + 1 < SPEED.length ? SPEED[i + 1][0] : Infinity;
    if (src <= from) break;
    out += (Math.min(src, to) - from) * k;
  }
  for (const h of HOLDS) if (src >= h.at) out += h.len;
  return Math.round(out);
};

/** the output frame a hold starts on */
export const holdStart = (id) => {
  const h = HOLDS.find((x) => x.id === id);
  return real(h.at) - h.len;
};

/** output frame → { src, hold, u }: the source frame, and if a hold is
 *  playing, which one and how far into it (output frames) */
export const clockAt = (f) => {
  for (const h of HOLDS) {
    const h0 = holdStart(h.id);
    if (f >= h0 && f < h0 + h.len) return { src: h.at, hold: h.id, u: f - h0, k: speedAt(h.at) };
  }
  // invert real() by walking the source range
  let lo = 0;
  let hi = SOURCE_FRAMES;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (realExact(mid) <= f) lo = mid;
    else hi = mid;
  }
  return { src: lo, hold: null, u: 0, k: speedAt(lo) };
};

/** real() without rounding, for the inverse */
const realExact = (src) => {
  let out = 0;
  for (let i = 0; i < SPEED.length; i++) {
    const [from, k] = SPEED[i];
    const to = i + 1 < SPEED.length ? SPEED[i + 1][0] : Infinity;
    if (src <= from) break;
    out += (Math.min(src, to) - from) * k;
  }
  for (const h of HOLDS) if (src >= h.at) out += h.len;
  return out;
};

/** output frame → source frame */
export const srcOf = (f) => clockAt(f).src;

export const SOURCE_FRAMES = 600;
export const TOTAL_FRAMES = real(SOURCE_FRAMES);
export const TOTAL_SEC = TOTAL_FRAMES / FPS;

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
  // the problem, as the launch film opens (owner, round 4): the saves hang
  // where they were kept while the narrator names it
  { at: 10, to: 70, text: 'You save things everywhere.' },
  { at: 80, to: 200, text: 'An article here. A recipe there.\nA video somewhere else.' },
  { at: 206, to: 290, text: 'Saved, and rarely seen again.' },
  { at: real(150), to: real(180), text: 'Save anything.' },
  // the card hold: the new card, opened
  { at: holdStart('card') + 10, to: holdStart('card') + 192, text: 'Each save becomes a card,\nwith the key points pulled out.' },
  { at: real(214), to: real(262), text: 'Find it in your own words.' },
  { at: real(278), to: real(380), text: 'Ask anything. Every answer comes straight from your saves.' },
  { at: real(420), to: real(464), text: 'See how it all connects.' },
  // recall: the weekly recap
  { at: real(468), to: real(518), text: 'Every week, Machina brings back\nwhat’s worth remembering.' },
  // the close: the name, then the App Store subtitle, set by the lockup
  // (the name is the drawn wordmark, which wipes in as it is said)
  { at: real(542), to: real(600), place: 'lockup', text: 'Machina.\nNever lose another great find.' },
];

/** The pillar word each product scene opens on (the kinetic kicker), in
 *  OUTPUT frames. */
export const KICKERS = [
  { at: real(148), to: holdStart('card') + 192, text: 'Save' },
  { at: real(210), to: real(268), text: 'Find' },
  { at: real(274), to: real(412), text: 'Ask' },
  { at: real(418), to: real(460), text: 'Connect' },
  { at: real(466), to: real(510), text: 'Revisit' },
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
  [64, 128], // the mark holds, then the app: one long lift (round 4, no tagline over it)
  [384, 416],
  [500, 534],
];

/**
 * Harmony, one chord per bar (the film's C-major vocabulary, walked brighter
 * and faster): the hook hangs on IV until the mark resolves home on I.
 */
/** one chord per SOURCE bar (64 source frames); the score maps them */
export const BAR_CHORDS = ['Fmaj7', 'Cmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'Cmaj7'];
