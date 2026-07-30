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
  { id: 'scatter', bar: 2, bars: 3 }, //  5.0 – 12.5  five platforms, quietly disappearing
  { id: 'wordmark', bar: 5, bars: 2 }, // 12.5 – 17.5  five become one → MACHINA
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
  // Act one states the real problem from the founder letter — fragmentation,
  // not clutter: you can't remember WHICH app you buried it in.
  { bar: 2.2, bars: 1.4, text: 'Instagram. X. YouTube. Somewhere else.' },
  // ends exactly on bar 5 — the turn should not open with act one's copy
  // still on screen.
  { bar: 3.8, bars: 1.2, text: 'You never remember where you saved it.' },
  // The turn, landing just after the name resolves.
  // 1.2 bars, not 1.5: at 1.5 it ran to bar 7.7 and collided with the next
  // cue at 7.5. Two captions on screen at once is the one thing this track
  // must never do.
  { bar: 6.2, bars: 1.2, text: 'One place for all of it.' },
  { bar: 7.5, bars: 1.6, text: 'Saving was never the hard part.' },
  { bar: 9.3, bars: 1.7, text: 'Machina reads what you save.' },
  { bar: 11.5, bars: 1.6, text: 'One library, searchable by meaning.' },
  { bar: 13.4, bars: 1.5, text: 'Not by where it came from.' },
  { bar: 15.4, bars: 1.6, text: 'Then ask your own library.' },
  { bar: 17.3, bars: 1.7, text: 'Real answers, from your own sources.' },
  { bar: 19.4, bars: 1.6, text: 'Every save connects to the rest.' },
  // Bar 21 is deliberately silent — the graph earns a beat with no copy on it.
  { bar: 22.3, bars: 1.6, text: 'And it comes back to you.' },
];

/** Sound-design hits, in bars — the picture events the score has to acknowledge. */
export const HITS = {
  markImpact: 0.75, // brackets meet in the cold open
  converge: 5.0, // the five platform panels rush back toward centre
  collapse: 5.35, // …and land as one point of light
  nameIn: 5.75, // the brackets open, MACHINA resolves
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
