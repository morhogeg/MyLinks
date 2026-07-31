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
  // Act one is a STORY now (round 13), not a description: five saves fly into
  // five separate silos, the silos pile up unreadable, and one person opens the
  // wrong pile twice looking for one thing. The loss beat sits ON bar 3 —
  // the film's single minor chord — which is why this act is four bars: the
  // extra bar came from the library's browse-before-search stretch, the
  // slowest beat in the product act.
  { id: 'scatter', bar: 1, bars: 4 }, //  2.5 – 12.5  save everywhere → piles → the loss
  { id: 'wordmark', bar: 5, bars: 2 }, // 12.5 – 17.5  five silos become one point
  // FIVE bars: the pipeline is the magic and needs ~5.5s to be readable.
  { id: 'capture', bar: 7, bars: 5 }, // 17.5 – 30.0  CAPTURE
  { id: 'library', bar: 12, bars: 3 }, // 30.0 – 37.5  search finds the one you meant
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
  //
  // The script is written for the EAR first (round 12: the film is narrated —
  // audio/synth-vo.py speaks these exact lines, so they must flow as speech):
  // connectors carry the argument ("So…", "Then…", "Or…"), no echoed words
  // between neighbouring lines, and the product is named where a pronoun would
  // mumble. A caption edit here MUST be mirrored in audio/synth-vo.py.
  // ACT ONE (round 13) — everyday words, one idea per line, timed to the
  // picture: the line lists the saves as they fly, names the piles as they
  // grow, and lands the loss as the wrong pile opens.
  // Every line below was workshopped with the owner line-by-line (round 13) —
  // do not rewrite without them.
  { bar: 1.15, bars: 1.25, place: 'bottom', text: 'You save it here. And here. And here.' },
  { bar: 2.45, bars: 0.8, place: 'bottom', text: 'Multiple apps, countless saved links.' },
  // The emotional bottom — riding the bar-3 minor while the wrong silo opens.
  // "where it IS" (owner call): the thing still exists, you just can't reach it.
  { bar: 3.25, bars: 1.75, place: 'bottom', text: 'Then you need one thing back — and you have no idea where it is.' },
  { bar: 5.5, bars: 1.1, place: 'bottom', text: 'So Machina keeps it all in one place.' },
  // "without leaving where you are" (owner refinement of the round-12 line).
  { bar: 7.35, bars: 1.25, place: 'left', kicker: 'Capture', text: 'One tap, and it’s saved — without leaving where you are.' },
  { bar: 8.95, bars: 2.4, place: 'left', text: 'Machina reads it, summarizes it, and files it.' },
  // THE PROMISE — Machina carries the memory burden. One line for the whole
  // library beat (the owner cut the search caption: the picture — a query that
  // shares no words with the one card it finds — plays under this line).
  { bar: 12.3, bars: 2.45, place: 'left', text: 'Machina remembers, so you don’t have to.' },
  // "ask it anything" mushed into "ask HER anything" out loud — the name
  // carries the line instead of the pronoun (owner note, round 12).
  { bar: 15.35, bars: 1.6, place: 'left', kicker: 'Ask', text: 'Then ask Machina anything.' },
  // Ends BEFORE the Graph-chip tap at 19.5 — during the dive the device rises
  // through the caption band. The claim: answers come from YOUR saves and
  // nowhere else. "Get answers" — owner call, round 13.
  { bar: 17.4, bars: 1.9, place: 'left', text: 'Get answers from your saves — and nothing else.' },
  // The graph beat says why it matters, not what it is (round 13). "months
  // apart" was cut by the owner — the WHEN isn't the point, the noticing is.
  { bar: 20.4, bars: 2.3, place: 'left', kicker: 'Connect', text: 'Machina notices when things you saved belong together.' },
  { bar: 23.3, bars: 1.35, place: 'left', text: 'Or group your saves into collections.' },
  // Collections are YOUR shape of thinking, not an access claim (owner call).
  { bar: 24.8, bars: 1.15, place: 'left', text: 'Organized the way you think.' },
  // The digest introduced as the thing you DON'T ask for — a deliberate rhyme
  // with the Ask kicker line, and "keep circling" is the on-screen headline.
  { bar: 26.1, bars: 1.65, place: 'left', text: 'You don’t even have to ask — Machina spots what you keep circling.' },
  { bar: 27.8, bars: 1.2, place: 'left', text: 'And brings the right ones back — on your schedule.' },
];

/**
 * Act one's five save gestures, in bars — each tap-contact lands ON the
 * quarter-note grid so the ticks read as the score acknowledging the finger.
 * The Scatter scene derives its local frames from these; the score ticks them.
 */
export const SAVES = [1.25, 1.5, 1.75, 2.0, 2.25];

/** Sound-design hits, in bars — the picture events the score has to acknowledge. */
export const HITS = {
  bootStrike: 0.32,
  bootExit: 0.78,
  // the loss: the wrong pile opened twice, on and after the bar-3 minor
  lossOpenA: 3.07,
  lossShutA: 3.53,
  lossOpenB: 3.67,
  lossShutB: 4.13,
  converge: 5.0,
  collapse: 5.35,
  markLock: 5.55,
  deviceIn: 7.0,
  shareSheet: 7.6,
  sourceCutA: 7.75,
  sourceCutB: 8.17,
  pipelineIn: 8.6,
  cardLands: 10.85,
  searchIn: 12.0,
  filterSnap: 13.85,
  askIn: 15.0,
  answerStart: 16.5,
  citations: 18.05,
  // the finger tapping the Graph chip — the cut into the graph is a TAP now,
  // not an edit decision
  graphTap: 19.5,
  graphBloom: 20.0,
  collectionsIn: 23.0,
  digestIn: 26.0,
  endcard: 29.0,
};

/**
 * Risers, placed to END on the reveal they lead into (round 13): the turn's
 * collapse (5.0), the Machina icon on the share sheet (~7.6), the library
 * (12.0), the first Ask answer (16.5), the graph bloom (20.0), the endcard
 * (29.0). The bar-4 riser is the short one — it doubles as the search-tension
 * exit of act one.
 */
export const RISERS = [4.0, 6.3, 10.7, 15.2, 18.6, 27.6];
