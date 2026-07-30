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
  // Four bars, not three: act one needs an opening SENTENCE before the list of
  // platforms, or the film starts on a fragment.
  { id: 'scatter', bar: 1, bars: 4 }, //  2.5 – 12.5  five platforms, quietly disappearing
  { id: 'wordmark', bar: 5, bars: 2 }, // 12.5 – 17.5  five become one
  { id: 'capture', bar: 7, bars: 4 }, // 17.5 – 27.5  share from anywhere → read + filed
  { id: 'library', bar: 11, bars: 4 }, // 27.5 – 37.5  the feed + finding it again
  { id: 'ask', bar: 15, bars: 4 }, // 37.5 – 47.5  the hero: cited answer
  { id: 'graph', bar: 19, bars: 3 }, // 47.5 – 55.0  the knowledge graph
  { id: 'digest', bar: 22, bars: 2 }, // 55.0 – 60.0  it resurfaces
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
  // `place` is a LAYOUT, not a style: 'left' puts the line in the left column
  // with the device held right of centre; 'bottom' is the centred line, used
  // only where there is no device to sit under.
  { bar: 1.3, bars: 1.3, place: 'bottom', text: 'You save things everywhere.' },
  { bar: 2.8, bars: 1.3, place: 'bottom', text: 'Instagram. X. YouTube. WhatsApp.' },
  { bar: 4.3, bars: 1.3, place: 'bottom', text: "Then you can't remember which one." },
  // The turn. Ends before the mark pushes through into the product section.
  { bar: 5.7, bars: 1.0, place: 'bottom', text: 'One place for everything you save.' },
  // Capture, as a claim the picture is proving at the same moment: the sheet
  // holds while Instagram, YouTube and an article pass behind it.
  { bar: 7.5, bars: 1.5, place: 'left', text: 'Share it from anywhere.' },
  { bar: 9.2, bars: 1.6, place: 'left', text: 'Machina reads every save.' },
  { bar: 11.4, bars: 1.6, place: 'left', text: 'Summarized, tagged and filed.' },
  { bar: 13.3, bars: 1.5, place: 'left', text: 'So you can actually find it again.' },
  { bar: 15.4, bars: 1.6, place: 'left', text: 'Then ask it anything.' },
  { bar: 17.3, bars: 1.7, place: 'left', text: 'Answers built from what you saved.' },
  { bar: 19.4, bars: 1.6, place: 'left', text: 'See how your saves connect.' },
  // Bar 21 is deliberately silent — the graph earns a beat with no copy on it.
  { bar: 22.3, bars: 1.6, place: 'left', text: 'Nothing worth keeping stays buried.' },
];

/** Sound-design hits, in bars — the picture events the score has to acknowledge. */
export const HITS = {
  bootStrike: 0.32, // the boot's point lands
  bootExit: 0.78, // the mark pushes through and the frame dissolves
  converge: 5.0, // the five platform panels rush back toward centre
  collapse: 5.35, // …and land as one point of light
  markLock: 5.55, // the brackets close around the gathered point
  deviceIn: 7.0,
  shareSheet: 7.7, // the sheet comes up and stays
  sourceCutA: 8.55, // the world behind it changes…
  sourceCutB: 9.05, // …and changes again
  cardLands: 9.9,
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
