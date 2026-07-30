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
  // title sequence. Every later scene shifted a bar earlier with it; if you
  // retime here, `audio/score.mjs` asserts its bar map still matches.
  { id: 'coldOpen', bar: 0, bars: 1 }, //  0.0 –  2.5  the app boots: mark + MACHINA
  { id: 'scatter', bar: 1, bars: 3 }, //  2.5 – 10.0  five platforms, quietly disappearing
  { id: 'wordmark', bar: 4, bars: 2 }, // 10.0 – 15.0  five become one → MACHINA
  { id: 'capture', bar: 6, bars: 4 }, // 15.0 – 25.0  share sheet → analyzed card
  { id: 'library', bar: 10, bars: 4 }, // 25.0 – 35.0  the feed + finding it again
  { id: 'ask', bar: 14, bars: 4 }, // 35.0 – 45.0  the hero: cited answer
  { id: 'graph', bar: 18, bars: 3 }, // 45.0 – 52.5  the knowledge graph
  { id: 'digest', bar: 21, bars: 2 }, // 52.5 – 57.5  it resurfaces
  { id: 'endcard', bar: 23, bars: 3 }, // 57.5 – 65.0  lockup
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
  // `place` is a LAYOUT, not a style: 'left' puts the line in the left column
  // with the device held right of centre; 'bottom' is the centred line, used
  // only where there is no device to sit under.
  { bar: 1.2, bars: 1.4, place: 'bottom', text: 'Instagram. X. YouTube. WhatsApp.' },
  { bar: 2.8, bars: 1.2, place: 'bottom', text: "Then you can't remember which one." },
  // The turn. Ends before the mark pushes through into the product section.
  { bar: 4.75, bars: 0.9, place: 'bottom', text: 'One place for everything you save.' },
  // This one has to clear the cut INTO the app: it is about the act of saving,
  // and it looked absurd sitting over Machina's own analyzing screen.
  { bar: 6.4, bars: 0.85, place: 'left', text: 'Saving was never the hard part.' },
  { bar: 7.35, bars: 1.65, place: 'left', text: 'Machina reads what you save.' },
  { bar: 10.5, bars: 1.6, place: 'left', text: 'Summarized, tagged and filed for you.' },
  { bar: 12.4, bars: 1.5, place: 'left', text: 'So you can actually find it again.' },
  { bar: 14.4, bars: 1.6, place: 'left', text: 'Then ask it anything.' },
  { bar: 16.3, bars: 1.7, place: 'left', text: 'Answers built from what you saved.' },
  // NOT "every save connects to the rest" — that claims something the product
  // does not promise. The graph shows you the connections it found.
  { bar: 18.4, bars: 1.6, place: 'left', text: 'See how your saves connect.' },
  // Bar 20 is deliberately silent — the graph earns a beat with no copy on it.
  { bar: 21.3, bars: 1.6, place: 'left', text: 'Nothing worth keeping stays buried.' },
];

/** Sound-design hits, in bars — the picture events the score has to acknowledge. */
export const HITS = {
  bootStrike: 0.32, // the boot's point lands
  bootExit: 0.78, // the mark pushes through and the frame dissolves
  converge: 4.0, // the five platform panels rush back toward centre
  collapse: 4.35, // …and land as one point of light
  markLock: 4.55, // the brackets close around the gathered point
  deviceIn: 6.0,
  shareSheet: 6.9,
  cardLands: 8.6,
  searchIn: 10.0,
  filterSnap: 12.1,
  askIn: 14.0,
  answerStart: 15.4,
  citations: 16.6,
  graphBloom: 18.0,
  digestIn: 21.0,
  endcard: 23.0,
};

/** One-bar risers that lead into the big cuts. */
export const RISERS = [5.0, 9.6, 13.0, 17.4, 22.4];
