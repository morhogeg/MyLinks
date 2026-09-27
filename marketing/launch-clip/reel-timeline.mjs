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
 * ROUND 5 (owner, 2026-09-27): "keep a steady pace". The round-1 cut, written
 * in its own frames (SOURCE frames: 600, 16 a beat at 112.5 BPM), is played
 * at ONE constant speed, K = 2: every source 8th lands exactly on an output
 * beat of the same 112.5 BPM score, so cuts, taps and sound design sit on
 * the music. The narrator is never slowed: captions and voice are placed in
 * OUTPUT frames, each starting on a beat.
 *
 * Two HOLDS stop the source clock while an output-frame scene plays; both
 * start on a source 8th and last a whole number of beats, so the grid holds:
 *  - `problem`: the opening, the saves hanging where they were kept while
 *    the narrator names the problem (scenes/Hook.tsx);
 *  - `card`: the new card, opened to its Key Points (scenes/CardDetail.tsx).
 */
export const K = 2;
export const BPM = 112.5;
export const BEAT_FRAMES = 16;
export const BAR_FRAMES = BEAT_FRAMES * 4; // 64
export const BEAT = BEAT_FRAMES / FPS; // 0.5333s
export const BAR = BAR_FRAMES / FPS; // 2.1333s

/** Beat (quarter note, may be fractional) → output frame. */
export const beat = (n) => Math.round(n * BEAT_FRAMES);
/** Bar → output frame. */
export const bar = (n) => Math.round(n * BAR_FRAMES);
/** the nearest output beat */
export const onBeat = (f) => Math.round(f / BEAT_FRAMES) * BEAT_FRAMES;

/** The holds: at source frame `at` the source clock stops for `len` output frames. */
export const HOLDS = [
  { id: 'problem', at: 32, len: 224 }, // 14 beats
  { id: 'card', at: 208, len: 192 }, // 12 beats
];

/** source frame → output frame (a source frame at/after a hold lands after it) */
export const real = (src) => {
  let out = src * K;
  for (const h of HOLDS) if (src >= h.at) out += h.len;
  return Math.round(out);
};

/** the output frame a hold starts on */
export const holdStart = (id) => {
  const h = HOLDS.find((x) => x.id === id);
  return real(h.at) - h.len;
};

/** output frame → { src, hold, u, k }: the source frame, and if a hold is
 *  playing, which one and how far into it (output frames) */
export const clockAt = (f) => {
  let src = f / K;
  for (const h of HOLDS) {
    const h0 = holdStart(h.id);
    if (f >= h0 && f < h0 + h.len) return { src: h.at, hold: h.id, u: f - h0, k: K };
    if (f >= h0 + h.len) src -= h.len / K;
  }
  return { src, hold: null, u: 0, k: K };
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
  // the problem, as the launch film opens: the saves hang where they were
  // kept while the narrator names it
  { at: 16, to: 88, text: 'You save things everywhere.' },
  { at: 96, to: 216, text: 'An article here. A recipe there.\nA video somewhere else.' },
  { at: 224, to: 304, text: 'Saved, and rarely seen again.' },
  // the answer: the saves collapse into the point, the name lands with it
  { at: real(48), to: real(70), place: 'hook', sizes: [52, 104], text: 'Introducing\nMachina.' },
  { at: onBeat(real(74)), to: real(146), text: 'All your saves in one place,\nready when you need them.' },
  { at: onBeat(real(150)), to: real(180), text: 'Save anything.' },
  // the card hold: the new card, opened
  { at: holdStart('card') + 16, to: holdStart('card') + 184, text: 'Each save becomes a card,\nwith the key points pulled out.' },
  { at: onBeat(real(214)), to: real(262), text: 'Find it in your own words.' },
  { at: onBeat(real(278)), to: real(380), text: 'Ask anything. Every answer comes straight from your saves.' },
  { at: onBeat(real(420)), to: real(464), text: 'See how it all connects.' },
  // recall: the weekly recap
  { at: onBeat(real(466)), to: real(519), text: 'Every week, Machina brings back\nwhat’s worth remembering.' },
  // the close: the name (the drawn wordmark wipes in as it is said), then
  // the App Store subtitle, set big
  { at: onBeat(real(542)), to: real(600), place: 'lockup', text: 'Machina.\nNever lose another great find.' },
];

/** The pillar word each product scene opens on (the kinetic kicker), in
 *  OUTPUT frames. */
export const KICKERS = [
  { at: onBeat(real(148)), to: holdStart('card') + 184, text: 'Save' },
  { at: onBeat(real(210)), to: real(268), text: 'Find' },
  { at: onBeat(real(274)), to: real(412), text: 'Ask' },
  { at: onBeat(real(418)), to: real(460), text: 'Connect' },
  { at: onBeat(real(464)), to: real(510), text: 'Revisit' },
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
