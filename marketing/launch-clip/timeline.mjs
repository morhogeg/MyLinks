/**
 * The film's single source of truth for TIME. Both the picture (Remotion
 * compositions) and the sound (audio/score.mjs) read this file, so a cut can
 * never drift away from the beat it was cut to.
 *
 * The grain is musical, not arbitrary: 96 BPM, 4/4 → one bar = 2.5s = 75
 * frames at 30fps. Every scene boundary is a bar line, which is why the edit
 * feels locked to the score rather than laid over it.
 */

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;

export const BPM = 96;
export const BEAT = 60 / BPM; // 0.625s
export const BAR = BEAT * 4; // 2.5s
export const BAR_FRAMES = Math.round(BAR * FPS); // 75

/** Bar index → seconds / frames. */
export const barToSec = (bar) => bar * BAR;
export const barToFrame = (bar) => Math.round(bar * BAR_FRAMES);

/**
 * The edit. `bar` = start bar, `bars` = length in bars. Sequential and
 * gapless; the last one ends the film.
 */
export const SCENES = [
  // The cold open is the app's own BootScreen, one bar long — a launch, not a
  // title sequence. If you retime here, `audio/score.mjs` asserts its bar map
  // still matches.
  { id: 'coldOpen', bar: 0, bars: 1 }, //  0.0 –  2.5  the app boots: mark + MACHINA
  // Act one gave a bar back to the product: two lines fit in three bars, and
  // the reclaimed time went where the viewer's attention actually is — the app.
  { id: 'scatter', bar: 1, bars: 3 }, //  2.5 – 10.0  five platforms, then out of reach
  { id: 'wordmark', bar: 4, bars: 2 }, // 10.0 – 15.0  five become one
  // FIVE bars: the pipeline is the magic and needs ~5.5s to be readable.
  { id: 'capture', bar: 6, bars: 5 }, // 15.0 – 27.5  CAPTURE
  { id: 'library', bar: 11, bars: 4 }, // 27.5 – 37.5  browse, search, filter
  // The hero gets five bars: the typing, the stream and the three citations
  // were racing the captions at four.
  { id: 'ask', bar: 15, bars: 5 }, // 37.5 – 50.0  ASK
  { id: 'graph', bar: 20, bars: 3 }, // 50.0 – 57.5  CONNECT
  // Collections and the digest are separate features with separate beats —
  // three bars each, enough to read the screen AND the line.
  { id: 'collections', bar: 23, bars: 3 }, // 57.5 – 65.0  the ones you shape
  { id: 'digest', bar: 26, bars: 3 }, // 65.0 – 72.5  the ones it brings back
  { id: 'endcard', bar: 29, bars: 3 }, // 72.5 – 80.0  lockup
];

export const TOTAL_BARS = SCENES.reduce((n, s) => Math.max(n, s.bar + s.bars), 0);
export const TOTAL_FRAMES = barToFrame(TOTAL_BARS);
export const TOTAL_SEC = barToSec(TOTAL_BARS);

export const sceneAt = (id) => {
  const s = SCENES.find((x) => x.id === id);
  if (!s) throw new Error(`unknown scene ${id}`);
  return { ...s, from: barToFrame(s.bar), durationInFrames: barToFrame(s.bars) };
};

/**
 * Subtitles. `bar` is fractional bars from film start; `bars` is length.
 * Written to read as narration, not as a feature list — and short enough to be
 * absorbed in a glance while the picture does the real talking.
 */
export const SUBTITLES = [
  // `place` is a LAYOUT: 'left' puts the line in the left column with the device
  // held right; 'bottom' is the centred line, for beats with no device.
  // `kicker` prints the tagline word for that act above the line — CAPTURE /
  // ASK / CONNECT — so a viewer can place each beat inside the tagline.
  { bar: 1.3, bars: 1.4, place: 'bottom', text: 'You save things everywhere.' },
  // A hard parallel to the opening line. Earlier candidates narrated the
  // picture ("and then it's gone") or got tangled in a clause ("and you can
  // never get back to it"); the loss reads cleanest as the mirror of the save.
  { bar: 2.85, bars: 1.1, place: 'bottom', text: 'And lose them everywhere.' },
  { bar: 4.55, bars: 1.05, place: 'bottom', text: 'Machina keeps it all in one place.' },
  { bar: 6.5, bars: 1.0, place: 'left', kicker: 'Capture', text: 'Share it from anywhere.' },
  { bar: 7.8, bars: 2.6, place: 'left', text: 'Machina reads it, summarizes it, files it.' },
  { bar: 11.4, bars: 1.6, place: 'left', text: 'Browse it, search it, filter it.' },
  // The library payoff — retrieval works from a half-memory, which is all
  // anyone ever has. (Deliberately not a "search by meaning" claim.)
  { bar: 13.3, bars: 1.5, place: 'left', text: 'Even when you only half-remember it.' },
  { bar: 15.35, bars: 1.6, place: 'left', kicker: 'Ask', text: 'Then ask it anything.' },
  { bar: 17.4, bars: 2.3, place: 'left', text: 'Answers built from what you saved.' },
  { bar: 20.4, bars: 1.8, place: 'left', kicker: 'Connect', text: 'See how it all connects.' },
  // Collections and the digest each say what the feature DOES for you —
  // the earlier lines ("group them the way you think") were too coy to land.
  { bar: 23.35, bars: 1.5, place: 'left', text: 'Gather them into collections.' },
  { bar: 24.95, bars: 0.95, place: 'left', text: 'Yours to shape.' },
  { bar: 26.35, bars: 1.5, place: 'left', text: 'Every week, it writes up what you saved.' },
  { bar: 27.95, bars: 0.95, place: 'left', text: 'And brings back what you forgot.' },
];

/** Sound-design hits, in bars — the picture events the score has to acknowledge. */
export const HITS = {
  bootStrike: 0.32,
  bootExit: 0.78,
  converge: 4.0,
  collapse: 4.35,
  markLock: 4.55,
  deviceIn: 6.0,
  shareSheet: 6.6,
  sourceCutA: 6.75,
  sourceCutB: 7.17,
  pipelineIn: 7.6,
  cardLands: 9.85,
  searchIn: 11.0,
  filterSnap: 13.25,
  askIn: 15.0,
  answerStart: 16.5,
  citations: 18.05,
  graphBloom: 20.0,
  collectionsIn: 23.0,
  digestIn: 26.0,
  endcard: 29.0,
};

/** One-bar risers that lead into the big cuts. */
export const RISERS = [5.0, 10.6, 13.8, 19.4, 28.4];
