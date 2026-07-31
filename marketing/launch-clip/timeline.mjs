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
  // Concrete things, not "it" (owner note, round 13c) — the line names what
  // the pictures show.
  { bar: 1.1, bars: 1.4, place: 'bottom', text: 'A recipe here. A video there. A thread somewhere else.' },
  { bar: 2.55, bars: 0.7, place: 'bottom', text: 'Multiple apps, countless saved links.' },
  // A DELIBERATE BEAT OF SILENCE (bars 3.25–3.7) — the first wrong pile opens
  // with no words at all, then the truth lands over the second one. Owner's
  // wording ("rarely", not "never" — bold but honest), on the bar-3 minor.
  { bar: 3.7, bars: 1.2, place: 'bottom', text: 'Saved, and rarely seen again.' },
  // The turn is an INTRODUCTION now (owner call, round 13b) — the film stops
  // describing and presents the product by name.
  { bar: 5.45, bars: 1.35, place: 'bottom', kicker: 'Introducing', text: 'Machina — one place for all your saved links.' },
  // Value first (owner note, round 13c): anything + anywhere. No tap-count
  // claim — the share sheet is two touches (owner correction).
  { bar: 7.35, bars: 1.25, place: 'left', kicker: 'Capture', text: 'Save anything, from anywhere.' },
  { bar: 8.95, bars: 2.4, place: 'left', text: 'Machina reads it, summarizes it, and files it.' },
  // THE PROMISE — four words, two verbs. One line for the whole library beat;
  // the search (a query sharing no words with the one card it finds) plays
  // wordless underneath and proves the second half.
  { bar: 12.3, bars: 2.45, place: 'left', text: 'Lose nothing. Find everything.' },
  // A new feature, not a continuation — no "Then" (owner note, round 13c).
  // The name still carries the line: "ask it" mushed out loud (round 12).
  { bar: 15.35, bars: 1.6, place: 'left', kicker: 'Ask', text: 'Ask Machina anything.' },
  // Ends BEFORE the Graph-chip tap at 19.5 — during the dive the device rises
  // through the caption band. The claim: the answers' only source is your own
  // saves ("straight from" — round 13c, after two unclear tries).
  { bar: 17.4, bars: 1.9, place: 'left', text: 'Every answer comes straight from your saves.' },
  // The graph beat says why it matters, not what it is (round 13). "months
  // apart" was cut by the owner — the WHEN isn't the point, the noticing is.
  { bar: 20.4, bars: 2.3, place: 'left', kicker: 'Connect', text: 'Machina notices when things you saved belong together.' },
  // A new feature, not a continuation — no "Or" (owner note, round 13c).
  { bar: 23.3, bars: 1.35, place: 'left', text: 'Group your saves into collections.' },
  // YOU did the grouping — this line is what it buys you: the topic is
  // COMPLETE, because everything you saved about it landed there.
  { bar: 24.8, bars: 1.15, place: 'left', text: 'Every topic you care about, complete.' },
  // ONE line for the whole digest beat (rounds of iteration ended here: no
  // patterns jargon, no schedule talk, no reminders vibe — the concrete value
  // of the weekly synthesis, which is what the screen shows). The resurfaced
  // card below the write-up plays as a wordless grace note.
  { bar: 26.1, bars: 2.6, place: 'left', text: 'And Machina turns your saves into one short read.' },
];

/**
 * Act one's five save gestures, in bars — each tap-contact lands ON the
 * quarter-note grid so the ticks read as the score acknowledging the finger.
 * The Scatter scene derives its local frames from these; the score ticks them.
 */
// Widened again in round 13c (owner: still too fast) — a dotted-eighth train,
// every contact on the 16th grid, last landing clear of the bar-3 loss. The
// perceived slowdown also comes from the surfaces LINGERING after their tap
// (they drift off toward their silo instead of hard-cutting).
export const SAVES = [1.25, 1.625, 2.0, 2.375, 2.75];

/** Sound-design hits, in bars — the picture events the score has to acknowledge. */
export const HITS = {
  // moved 0.32 → 0.35 (round 13c): the impact now lands exactly on the dot's
  // spring peak in the boot, so the ding IS the point striking, not near it
  bootStrike: 0.35,
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
