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
  { id: 'coldOpen', bar: 0, bars: 2 }, //  0.0 –  5.0  the mark forms
  { id: 'problem', bar: 2, bars: 3 }, //  5.0 – 12.5  you save everything / find nothing
  { id: 'wordmark', bar: 5, bars: 2 }, // 12.5 – 17.5  MACHINA
  { id: 'capture', bar: 7, bars: 4 }, // 17.5 – 27.5  share sheet → analyzed card
  { id: 'library', bar: 11, bars: 4 }, // 27.5 – 37.5  feed + meaning search
  { id: 'ask', bar: 15, bars: 4 }, // 37.5 – 47.5  the hero: cited answer
  { id: 'graph', bar: 19, bars: 3 }, // 47.5 – 55.0  the knowledge graph
  { id: 'digest', bar: 22, bars: 2 }, // 55.0 – 60.0  it comes back to you
  { id: 'endcard', bar: 24, bars: 3 }, // 60.0 – 67.5  lockup
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
  { bar: 2.1, bars: 1.3, text: 'You save everything.' },
  { bar: 3.5, bars: 1.4, text: 'You find nothing.' },
  { bar: 7.3, bars: 1.7, text: 'Share anything, from anywhere.' },
  { bar: 9.1, bars: 1.8, text: 'Machina reads it and files it for you.' },
  { bar: 11.3, bars: 1.7, text: 'A library that searches by meaning.' },
  { bar: 13.2, bars: 1.6, text: 'Not by the words you forgot.' },
  { bar: 15.3, bars: 1.7, text: 'Then ask your own knowledge.' },
  { bar: 17.2, bars: 1.8, text: 'Every answer cites what you saved.' },
  { bar: 19.3, bars: 1.6, text: 'And everything you save connects.' },
  { bar: 21.0, bars: 1.6, text: 'Ideas find each other for you.' },
  { bar: 22.3, bars: 1.6, text: 'It comes back when it matters.' },
];

/** Sound-design hits, in bars — the picture events the score has to acknowledge. */
export const HITS = {
  markImpact: 0.75, // brackets meet
  wordmarkBloom: 5.0,
  deviceIn: 7.0,
  shareSheet: 7.9,
  cardLands: 9.6,
  searchIn: 11.0,
  filterSnap: 13.1,
  askIn: 15.0,
  answerStart: 16.4,
  citations: 17.6,
  graphBloom: 19.0,
  digestIn: 22.0,
  endcard: 24.0,
};

/** One-bar risers that lead into the big cuts. */
export const RISERS = [6.0, 10.6, 14.0, 18.4, 23.4];
