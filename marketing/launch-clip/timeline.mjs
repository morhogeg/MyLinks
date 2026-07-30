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
  { id: 'scatter', bar: 1, bars: 4 }, //  2.5 – 12.5  five platforms, then gone
  { id: 'wordmark', bar: 5, bars: 2 }, // 12.5 – 17.5  five become one
  // FIVE bars. The pipeline is the magic and it used to flash past in two
  // seconds at thumbnail size; it now runs ~5.5s under a hard push-in, which is
  // long enough to actually read what Machina is doing to your save.
  { id: 'capture', bar: 7, bars: 5 }, // 17.5 – 30.0  share from anywhere → read + filed
  { id: 'library', bar: 12, bars: 4 }, // 30.0 – 40.0  sorted, and findable
  { id: 'ask', bar: 16, bars: 4 }, // 40.0 – 50.0  the hero: cited answer
  { id: 'graph', bar: 20, bars: 3 }, // 50.0 – 57.5  the knowledge graph
  { id: 'digest', bar: 23, bars: 2 }, // 57.5 – 62.5  it resurfaces
  { id: 'endcard', bar: 25, bars: 3 }, // 62.5 – 70.0  lockup
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
  { bar: 1.4, bars: 1.5, place: 'bottom', text: 'You save things everywhere.' },
  // No list of platform names here: they are ON THE PANELS. Captioning what the
  // picture already says is the definition of a redundant line.
  //
  // And the loss is stated as a consequence, not as an event: "and then it's
  // gone" was a shrug. The panels fading out ARE the disappearing; the line's
  // job is to say what that costs you.
  { bar: 3.4, bars: 1.5, place: 'bottom', text: 'And almost none of it comes back.' },
  { bar: 5.7, bars: 1.0, place: 'bottom', text: 'Machina keeps every save in one place.' },
  { bar: 7.5, bars: 1.0, place: 'left', text: 'Share it from anywhere.' },
  // One heading over the whole pipeline: reading and filing are one step, and
  // the shot now holds long enough to watch all five phases of it.
  { bar: 8.8, bars: 2.6, place: 'left', text: 'Machina reads it, summarizes it, files it.' },
  // The library beat is about ACCESS — the point is that there are several ways
  // back in, not one clever one. ("All of it, already sorted" said nothing, and
  // "find it without remembering where" described a search box.)
  { bar: 12.4, bars: 1.6, place: 'left', text: 'Browse it, search it, filter it.' },
  { bar: 14.3, bars: 1.5, place: 'left', text: 'However you remember it.' },
  { bar: 16.4, bars: 1.6, place: 'left', text: 'Then ask it anything.' },
  { bar: 18.3, bars: 1.7, place: 'left', text: 'Answers built from what you saved.' },
  { bar: 20.4, bars: 1.6, place: 'left', text: 'See how your saves connect.' },
  // Bar 22 is deliberately silent — the graph earns a beat with no copy on it.
  { bar: 23.3, bars: 1.6, place: 'left', text: 'Nothing worth keeping stays buried.' },
];

/** Sound-design hits, in bars — the picture events the score has to acknowledge. */
export const HITS = {
  bootStrike: 0.32, // the boot's point lands
  bootExit: 0.78, // the mark pushes through and the frame dissolves
  converge: 5.0, // the five platform panels rush back toward centre
  collapse: 5.35, // …and land as one point of light
  markLock: 5.55, // the brackets close around the gathered point
  deviceIn: 7.0,
  shareSheet: 7.6, // the sheet comes up and stays
  sourceCutA: 8.35, // the world behind it changes…
  sourceCutB: 9.0, // …and changes again
  pipelineIn: 9.6, // inside the app: the five phases, under a push-in
  cardLands: 11.3,
  searchIn: 12.0,
  filterSnap: 14.1,
  askIn: 16.0,
  answerStart: 17.4,
  citations: 18.6,
  graphBloom: 20.0,
  digestIn: 23.0,
  endcard: 25.0,
};

/** One-bar risers that lead into the big cuts. */
export const RISERS = [6.0, 11.6, 15.0, 19.4, 24.4];
