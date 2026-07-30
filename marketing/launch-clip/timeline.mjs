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
  { id: 'scatter', bar: 1, bars: 4 }, //  2.5 – 12.5  five platforms, then out of reach
  { id: 'wordmark', bar: 5, bars: 2 }, // 12.5 – 17.5  five become one
  // FIVE bars: the pipeline is the magic and needs ~5.5s to be readable.
  { id: 'capture', bar: 7, bars: 5 }, // 17.5 – 30.0  CAPTURE
  { id: 'library', bar: 12, bars: 4 }, // 30.0 – 40.0  browse, search, filter
  { id: 'ask', bar: 16, bars: 4 }, // 40.0 – 50.0  ASK
  { id: 'graph', bar: 20, bars: 3 }, // 50.0 – 57.5  CONNECT
  // Collections and the digest are separate features and now get separate
  // beats — sharing two bars, they were a whip-cut most viewers read as one.
  { id: 'collections', bar: 23, bars: 2 }, // 57.5 – 62.5  the ones you shape
  { id: 'digest', bar: 25, bars: 2 }, // 62.5 – 67.5  the ones it brings back
  { id: 'endcard', bar: 27, bars: 3 }, // 67.5 – 75.0  lockup
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
  { bar: 1.4, bars: 1.5, place: 'bottom', text: 'You save things everywhere.' },
  // The loss is not that it fails to come back to you — it is that YOU can't
  // get back to IT. That is the founder's actual complaint, and the active
  // construction is what makes it land.
  { bar: 3.4, bars: 1.5, place: 'bottom', text: 'And you can never get back to it.' },
  { bar: 5.7, bars: 1.0, place: 'bottom', text: 'Machina keeps every save in one place.' },
  { bar: 7.5, bars: 1.0, place: 'left', kicker: 'Capture', text: 'Share it from anywhere.' },
  { bar: 8.8, bars: 2.6, place: 'left', text: 'Machina reads it, summarizes it, files it.' },
  { bar: 12.4, bars: 1.6, place: 'left', text: 'Browse it, search it, filter it.' },
  { bar: 14.3, bars: 1.5, place: 'left', text: 'However you remember it.' },
  { bar: 16.4, bars: 1.6, place: 'left', kicker: 'Ask', text: 'Then ask it anything.' },
  { bar: 18.3, bars: 1.7, place: 'left', text: 'Answers built from what you saved.' },
  { bar: 20.4, bars: 1.8, place: 'left', kicker: 'Connect', text: 'See how your saves connect.' },
  // Collections and the digest, each with its own beat and its own line.
  { bar: 23.4, bars: 1.6, place: 'left', text: 'Group them the way you think.' },
  { bar: 25.4, bars: 1.6, place: 'left', text: 'And it brings the right one back.' },
];

/** Sound-design hits, in bars — the picture events the score has to acknowledge. */
export const HITS = {
  bootStrike: 0.32,
  bootExit: 0.78,
  converge: 5.0,
  collapse: 5.35,
  markLock: 5.55,
  deviceIn: 7.0,
  shareSheet: 7.6,
  sourceCutA: 8.35,
  sourceCutB: 9.0,
  pipelineIn: 9.6,
  cardLands: 11.3,
  searchIn: 12.0,
  filterSnap: 14.1,
  askIn: 16.0,
  answerStart: 17.4,
  citations: 18.6,
  graphBloom: 20.0,
  collectionsIn: 23.0,
  digestIn: 25.0,
  endcard: 27.0,
};

/** One-bar risers that lead into the big cuts. */
export const RISERS = [6.0, 11.6, 15.0, 19.4, 26.4];
