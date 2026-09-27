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

/**
 * The holds. At source frame `at` the reel spends `len` output frames while
 * the source clock advances only `adv` source frames:
 *  - adv 0: a SCENE hold; an output-frame scene plays (reel-timeline `hold`);
 *  - adv > 0: a LINGER (round 7, owner: "show things a bit longer when
 *    discussing key features"): the same shot keeps drifting, slowly, on a
 *    moment worth reading; nothing freezes and the cut's pace is unchanged.
 * Every hold starts on an output 8th and ADDS whole beats (len − adv × K,
 * round 13), so the grid holds; `npm run verify` checks both.
 */
/**
 * Inside two scene holds, in OUTPUT frames from the hold's start (the scenes
 * and the score both read these):
 *  - SHARE: when each app's card arrives (scenes/ShareBeat.tsx); the first
 *    waits for "All your saves, finally useful." to leave the screen;
 *  - MODES: the tab taps, the paste and the Save tap (scenes/SaveModes.tsx);
 *    Save is tapped INSIDE the hold, so the source clock resumes on the
 *    tapped dialog and goes straight into the phases.
 */
export const SHARE_STARTS = [36, 84, 132];
/** each share, from its start: the Share button is tapped, the card is
 *  pulled, it lands in the mark (scenes/ShareBeat.tsx and the score) */
export const SHARE_BEAT = { tap: 20, pull: 24, land: 36 };
export const MODES = { taps: [16, 56, 96], paste: 112, save: 136 };

// Round 11: the card hold (224 → 192) and the found / graph lingers (48 → 32)
// were trimmed once their lines stopped lingering: each still shows its
// subject for ~1.2–1.5s after the line leaves, without a dead static stretch.
//
// Round 13: THE GRID. A hold may start on an 8th, but the output frames it
// ADDS (len − adv × K) must be whole beats, or every cut, tap and sound after
// it slides off the beat. Round 11's lingers added 24, 52 and 20 frames: the
// whole Ask hero (the three sources, the Graph tap, the cut into the graph)
// sat on 8ths and 16ths between the kicks. Now 32, 48 and 16 (the same 96 in
// total, so nothing after the graph moves). The modes hold moved from source
// 141 (a 16th) to 144, the frame the phases start on: the tour and its taps
// are back on the grid and the phases still start on the same output frame.
// `npm run verify` checks the grid.
/** Revisit's opening "Do this" beat, in output frames (scenes/Recall.tsx) */
export const TODO_LEN = 144;

export const HOLDS = [
  { id: 'problem', at: 32, len: 224, adv: 0 }, // the problem, named
  { id: 'name', at: 96, len: 32, adv: 0 }, // the name holds
  { id: 'share', at: 100, len: 192, adv: 0 }, // shared from YouTube, Instagram, Safari into the mark
  { id: 'modes', at: 144, len: 144, adv: 0 }, // Link, Image, Note
  { id: 'card', at: 208, len: 192, adv: 0 }, // the new card, opened
  { id: 'found', at: 248, len: 40, adv: 4 }, // linger: the one card it finds
  { id: 'sources', at: 372, len: 60, adv: 6 }, // linger: the answer and its sources
  { id: 'graph', at: 440, len: 28, adv: 6 }, // linger: the graph
  { id: 'recall', at: 464, len: 192 + 144, adv: 0 }, // Revisit: the "Do this" list (TODO_LEN), then this week's recap, read
  { id: 'end', at: 584, len: 64, adv: 16 }, // linger: the end card holds ~2s once the line is whole
];

/** source frame → output frame (at/after a scene hold → after it) */
export const real = (src) => {
  let out = 0;
  let s = 0;
  for (const h of HOLDS) {
    if (src < h.at) break;
    out += (h.at - s) * K;
    s = h.at;
    if (h.adv > 0 && src < h.at + h.adv) return Math.round(out + (src - h.at) * (h.len / h.adv));
    out += h.len;
    s = h.at + h.adv;
  }
  return Math.round(out + (src - s) * K);
};

/** the output frame a hold starts on */
export const holdStart = (id) => {
  let out = 0;
  let s = 0;
  for (const h of HOLDS) {
    out += (h.at - s) * K;
    if (h.id === id) return Math.round(out);
    out += h.len;
    s = h.at + h.adv;
  }
  throw new Error(`no hold ${id}`);
};

/** output frame → { src, hold, u, k }: the source frame; for a scene hold,
 *  which one and how far into it (output frames); k = output frames per
 *  source frame right now (motion blur) */
export const clockAt = (f) => {
  let out = 0;
  let s = 0;
  for (const h of HOLDS) {
    const seg = (h.at - s) * K;
    if (f < out + seg) return { src: s + (f - out) / K, hold: null, u: 0, k: K };
    out += seg;
    if (f < out + h.len) {
      const u = f - out;
      if (h.adv > 0) return { src: h.at + (u * h.adv) / h.len, hold: null, u, k: h.len / h.adv };
      return { src: h.at, hold: h.id, u, k: K };
    }
    out += h.len;
    s = h.at + h.adv;
  }
  return { src: s + (f - out) / K, hold: null, u: 0, k: K };
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
  saveTap: 144, // tapped inside the modes hold (MODES.save); the phases follow
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

/** Recall's length in output frames: its hold, then the source frames up to
 *  the lockup (scenes/Recall.tsx) */
export const RECALL_LEN = real(HITS.lockup) - holdStart('recall');

/**
 * THE DWELL RULE (round 11, owner: a line that "lingered"): a line leaves
 * 0.3–1.2s after the narrator finishes it. A line may stay longer only while
 * the action it names is still playing on screen, and says so (`until`,
 * at most 4s past the voice). `npm run verify` enforces both.
 */
export const CAPTIONS = [
  // the problem, as the launch film opens: the saves hang where they were
  // kept while the narrator names it
  { at: 16, to: 88, text: 'You save things everywhere.' },
  { at: 96, to: 216, text: 'An article here. A recipe there.\nA video somewhere else.' },
  { at: 224, to: 304, text: 'Saved, and rarely seen again.' },
  // the answer: the saves collapse into the point, the brackets snap, and
  // the narrator introduces it. The screen shows only the NAME (the drawn
  // wordmark wipes in under the mark on "Machina"; scenes/Hook.tsx); the
  // spoken lead-in "Introducing" is voice only (`say`)
  // (`duck`: the music steps further back under the two brand lines, the
  // name and the promise; round 13, measured masked in the speech band)
  { at: real(56), to: 410, place: 'mark', text: 'Machina.', say: 'Introducing Machina.', duck: 0.4 },
  { at: 416, to: 488, text: 'All your saves,\nfinally useful.' },
  // the share hold: from any app, into Machina (scenes/ShareBeat.tsx)
  { at: holdStart('share') + 40, to: holdStart('share') + 176, text: 'Save anything, from anywhere.', until: 'the third share lands in the mark' },
  // the modes hold: the Add dialog's three ways in
  // (to +122: within KICKER_BRIDGE of the next line, so SAVE stays up)
  { at: holdStart('modes'), to: holdStart('modes') + 122, text: 'A link, a screenshot, or a note.', until: 'the tour is back on Link, the link pasted' },
  // the phases (round 14, owner: say what Machina does while they tick; the
  // launch film's line, word for word, and the app's own words in the Add
  // dialog): on the first phase, so "reads" lands on "Reading the page" and
  // "summarizes" on "Writing the summary"
  { at: real(HITS.phases[0]), to: real(HITS.cardLands) + 12, text: 'Machina reads it,\nsummarizes it, and files it.' },
  // the card hold: the new card, opened
  { at: holdStart('card') + 16, to: holdStart('card') + 152, text: 'Each save becomes a card,\nwith the key points pulled out.', until: 'the Key Points are highlighted' },
  { at: onBeat(real(214)), to: real(HITS.found) + 24, text: 'Find it in your own words.' },
  // (round 13: the Ask and Connect chapter words land ON their cut, which is
  // on the beat again, and the line follows KICKER_LEAD frames later)
  { at: real(HITS.askTap) + 4, to: real(HITS.chips[2]) + 8, text: 'Ask anything. Every answer comes straight from your saves.', until: 'the third source lands' },
  // (round 12, owner: say the app connects them ON ITS OWN)
  { at: real(HITS.graph) + 4, to: holdStart('graph') + 56, text: 'Related saves find each other,\nall on their own.' },
  // recall (scenes/Recall.tsx): the "Do this" list (round 12, owner: say the
  // app makes an action item where one is relevant; it writes one only for a
  // save that calls for an action), then the weekly recap, read slowly
  { at: holdStart('recall') + 16, to: holdStart('recall') + TODO_LEN - 4, text: 'When a save calls for action,\nMachina turns it into a to-do.' },
  { at: holdStart('recall') + TODO_LEN + 24, to: holdStart('recall') + TODO_LEN + 130, text: 'Every week, Machina brings back\nwhat’s worth remembering.' },
  { at: holdStart('recall') + TODO_LEN + 136, to: holdStart('recall') + TODO_LEN + 256, text: 'The themes of your week,\nand the one save worth rereading.' },
  // the close: the name (the drawn wordmark wipes in as it is said), then
  // the App Store subtitle, set big in the serif
  { at: onBeat(real(542)), to: real(600), place: 'lockup', text: 'Machina.\nNever lose another great find.', duck: 0.4 },
];

/**
 * The chapter word (the kinetic kicker) above the line, in OUTPUT frames.
 * Round 11 (owner: writing that "lingered"): the label is on screen only
 * while its chapter's narration is, arriving a beat-fraction before each line
 * and leaving WITH it; silent stretches are pure picture. Lines closer than
 * KICKER_BRIDGE frames share one label (no flicker between them).
 */
const CHAPTERS = [
  ['Save', 'Save anything'],
  ['Find', 'Find it'],
  ['Ask', 'Ask anything'],
  ['Connect', 'Related saves'],
  ['Revisit', 'When a save'],
];
const KICKER_LEAD = 4;
export const KICKER_BRIDGE = 24;
const narrated = CAPTIONS.filter((c) => !c.place);
export const KICKERS = CHAPTERS.flatMap(([text, opens], i) => {
  const from = narrated.findIndex((c) => c.text.startsWith(opens));
  const next = i + 1 < CHAPTERS.length ? narrated.findIndex((c) => c.text.startsWith(CHAPTERS[i + 1][1])) : narrated.length;
  const spans = [];
  for (const c of narrated.slice(from, next)) {
    const last = spans[spans.length - 1];
    if (last && c.at - last.to < KICKER_BRIDGE) last.to = c.to;
    else spans.push({ at: c.at - KICKER_LEAD, to: c.to, text });
  }
  return spans;
});


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
