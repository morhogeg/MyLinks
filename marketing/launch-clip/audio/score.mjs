/**
 * The score, synthesized from scratch — no samples, no dependencies.
 *
 * Why generate it: a launch film needs music that hits ITS cuts, and the cuts
 * live in `timeline.mjs`. So the arrangement reads the same bar map the edit
 * does: risers land on the bar before a hard cut, the sub thumps where the
 * card lands, percussion thins out for the endcard. Sync is structural rather
 * than nudged by ear.
 *
 * The voices and the master chain live in audio/synth.mjs (shared with the
 * reels since 2026-09-26); this file is the film's ARRANGEMENT. Its output is
 * byte-identical to the pre-split version.
 *
 *   node audio/score.mjs   →   public/score.wav
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BAR, BEAT, TOTAL_SEC, TOTAL_BARS, SCENES, HITS, RISERS, SAVES } from '../timeline.mjs';
import { createSynth } from './synth.mjs';

const OUT_SEC = TOTAL_SEC + 1.2; // room for the final reverb tail
const S = createSynth({ seconds: OUT_SEC, beat: BEAT });
const { pad, sub, pulse, keys, kick, hat, rim, shaker, clap, riser, whoosh, impact, tick, shimmer } = S;

// ─────────────────────────────────────────────────────────── arrangement

const b = (bar) => bar * BAR; // bar → seconds
const beat = (bar, nBeats) => b(bar) + nBeats * BEAT;

// The four chords under the whole film.
const CHORDS = {
  Am9: { bass: 45, upper: [60, 64, 67, 71] },
  Fmaj7: { bass: 41, upper: [57, 60, 64, 69] },
  Cmaj7: { bass: 48, upper: [59, 64, 67, 71] },
  G6: { bass: 43, upper: [59, 62, 64, 69] },
};
// Anchored to C MAJOR, not A minor.
//
// The chords were always these four; the film used to walk them Am9 → F → C → G
// (i–VI–III–VII), which starts on the minor tonic and reads as melancholy — the
// note was "the music at the beginning is too gloomy", and that ordering IS the
// gloom. Walked C → G → Am → F (I–V–vi–IV) the same four chords open bright,
// touch the minor in passing, and the film can end resolved at home on C.
// The split personality is deliberate (owner notes ×2: the struggle can stay
// moody, but the rest must sound like a LAUNCH): bar 3 is now the ONLY minor
// chord in the entire film — the loss gets one shadow and the product act is
// pure I–IV–V sunshine, every scene opening on the tonic and closing on V so
// each cut arrives as a resolution.
const BAR_CHORDS = [
  'Cmaj7', // 0     cold open (the boot) — opens major
  // Act one (round 13e, five bars): the save-run stays bright, bar 4 is the
  // LOSS — the film's single minor bar, moved here WITH the loss beat — and
  // bar 5 hangs on the dominant while the wrong pile is opened a second time:
  // searching, unresolved, but NOT a second minor.
  'Cmaj7', 'G6', 'Fmaj7', 'Am9', 'G6', // 1–5  saves fly → piles grow → the loss → still looking
  'Fmaj7', 'Cmaj7', // 6–7   the turn lifts on F and resolves home as the mark locks
  'Cmaj7', 'Fmaj7', 'G6', 'Cmaj7', 'G6', // 8–12  capture
  'Cmaj7', 'Fmaj7', 'G6', // 13–15 library — opens on the tonic, closes on V
  'Cmaj7', 'Fmaj7', 'G6', 'Cmaj7', 'G6', // 16–20 ask — V lands the graph bloom on I
  'Cmaj7', 'Fmaj7', 'G6', // 21–23 graph
  'Cmaj7', 'G6', // 24–25 collections — tonic in, V out
  'Fmaj7', 'Cmaj7', 'G6', // 26–28 digest — warm IV first
  'Cmaj7', 'Fmaj7', 'Cmaj7', // 29–31 endcard — home, a last breath of F, home
];

// A retime in timeline.mjs that forgets the arrangement would silently put the
// wrong chord under every scene. Fail loudly instead.
if (BAR_CHORDS.length !== TOTAL_BARS) {
  throw new Error(`BAR_CHORDS has ${BAR_CHORDS.length} bars but the film is ${TOTAL_BARS}`);
}

/** Which scene owns a bar — so the arrangement follows the EDIT, not magic numbers. */
const sceneOfBar = (bar) => SCENES.find((sc) => bar >= sc.bar && bar < sc.bar + sc.bars)?.id;

/** How much of the arrangement is switched on, per scene. */
// Product scenes run HOT (owner note: upbeat once the app appears) — the
// four-on-the-floor and the off-beat hats key off these thresholds.
const SCENE_DENSITY = {
  coldOpen: 0.3,
  scatter: 0.62,
  wordmark: 0.62,
  capture: 0.85,
  library: 0.95,
  ask: 1.0,
  graph: 0.96,
  collections: 0.9,
  digest: 0.78,
  endcard: 0.52,
};

const density = (bar) => {
  const sc = SCENES.find((x) => bar >= x.bar && bar < x.bar + x.bars);
  if (!sc) return 0.5;
  // a small ramp inside each scene, so a four-bar hold still breathes
  const within = sc.bars > 1 ? (bar - sc.bar) / (sc.bars - 1) : 0;
  return SCENE_DENSITY[sc.id] + within * 0.05;
};

/** Bar of the first percussion-bearing scene, and of the endcard's drop-out. */
const CAPTURE_BAR = SCENES.find((x) => x.id === 'capture').bar;
/** The arpeggio starts with act one — silence under the scatter read as dread. */
const ARP_FROM = SCENES.find((x) => x.id === 'scatter').bar;
const GRAPH_END = SCENES.find((x) => x.id === 'graph');
const DIGEST_BAR = SCENES.find((x) => x.id === 'digest').bar;
const ENDCARD_BAR = SCENES.find((x) => x.id === 'endcard').bar;
// the pulse figure doubles to 16ths from the HERO on — the drive used to wait
// for the graph, which left Ask feeling half-lit
const SIXTEENTH_FROM = SCENES.find((x) => x.id === 'ask').bar;
void GRAPH_END;

for (let bar = 0; bar < BAR_CHORDS.length; bar++) {
  const ch = CHORDS[BAR_CHORDS[bar]];
  const d = density(bar);
  const t0 = b(bar);

  // ── pad: the harmony, voiced wider as the film opens up
  const padLevel = 0.1 + 0.075 * d;
  // The first two bars are voiced an OCTAVE UP and stay open: the low, close
  // voicing that opened the film was the other half of the gloom.
  const lift = bar < 2 ? 12 : 0;
  ch.upper.forEach((m, i) => {
    if (bar < 1 && i > 2) return; // the boot: three voices, airy
    const panPos = ((i / (ch.upper.length - 1)) * 2 - 1) * 0.55;
    pad(t0, BAR, m + lift, padLevel * (i === 0 ? 1 : 0.85), panPos);
  });
  pad(t0, BAR, ch.bass + 12, padLevel * 0.6, 0);
  // a high sparkle voice over the product act — the top chord tone an octave
  // up, quiet, which is what makes the bed read as sunlight instead of fog
  if (bar >= CAPTURE_BAR && bar < ENDCARD_BAR) {
    pad(t0, BAR, ch.upper[3] + 12, padLevel * 0.34, bar % 2 ? 0.35 : -0.35);
  }

  // ── bass: a MOVING line once the film is properly under way, not a pedal.
  // The single downbeat sub was what made the earlier cut feel like a bed
  // rather than a track.
  sub(t0, ch.bass, 0.34 + 0.26 * d, d >= 0.7 ? 0.5 : 1.4);
  if (d >= 0.7) {
    sub(beat(bar, 1.5), ch.bass + 7, 0.2 + 0.1 * d, 0.34); // the fifth
    sub(beat(bar, 2.5), ch.bass + 12, 0.18 + 0.1 * d, 0.3); // the octave
    if (d >= 0.84) sub(beat(bar, 3.5), ch.bass + 7, 0.15, 0.26);
  }

  // ── percussion — the product act dances, act one only breathes
  if (d >= 0.7 && bar < ENDCARD_BAR) {
    kick(t0, 0.42 + 0.22 * d);
    kick(beat(bar, 2), 0.38 + 0.18 * d);
    // FOUR-ON-THE-FLOOR through the product act: beats 1 and 3 join once the
    // film is at full tilt — this is the single biggest "upbeat" lever
    if (d >= 0.88 && bar < DIGEST_BAR) {
      kick(beat(bar, 1), 0.3 + 0.1 * d);
      kick(beat(bar, 3), 0.3 + 0.1 * d);
    }
    // the backbeat — beats 2 and 4
    if (d >= 0.78 && bar < DIGEST_BAR) {
      clap(beat(bar, 1), 0.16 + 0.05 * d);
      clap(beat(bar, 3), 0.16 + 0.05 * d);
    }
    if (d >= 0.82 && bar < DIGEST_BAR) rim(beat(bar, 2), 0.1 + 0.05 * d);
    if (d >= 0.8 && bar < DIGEST_BAR) {
      // 16ths once the film is at full tilt, 8ths before that
      const steps = d >= 0.88 ? 16 : 8;
      for (let k = 0; k < steps; k++) {
        const accent = k % (steps / 4) === 0 ? 0.9 : k % 2 ? 1 : 0.55;
        hat(beat(bar, (k * 4) / steps), 0.036 * accent * d, k % 2 ? 0.22 : -0.18);
      }
      // the OFF-BEAT open hat — the "and" of every beat, the lift itself
      if (d >= 0.85) {
        for (let k = 0; k < 4; k++) hat(beat(bar, k + 0.5), 0.03 * d, 0.1, true);
      }
      for (let k = 0; k < 16; k++) shaker(beat(bar, k * 0.25), 0.022 * d, k % 2 ? 0.34 : -0.3);
    }
  }

  // ── the pulse figure. Two things changed together here: the instrument (a
  // synth pulse, not a plucked string) and the NOTES. The old figure walked
  // chord tones only, which on a plucked string is a pentatonic folk pattern.
  // This walks the C-major scale — including the semitones B→C and E→F, the
  // intervals a pentatonic scale by definition does not have.
  if (bar >= ARP_FROM && bar < ENDCARD_BAR) {
    const root = ch.upper[0];
    // scale steps above the chord's lowest voice, in a 3+3+2 grouping
    // Degrees 0,2,3,4,6 → C E F G B. The 3 and the 6 are the whole point: they
    // put E→F and B→C in the line, the two semitones a pentatonic scale does
    // not have. A shape of 0,2,4,5 (C E G A) is still pentatonic no matter what
    // instrument plays it — which is what the first attempt at this fix got
    // wrong.
    const shape = [0, 2, 3, 4, 6, 4, 3, 2];
    const dense = bar >= SIXTEENTH_FROM && bar < DIGEST_BAR;
    const onsets = dense
      ? [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5]
      : [0, 0.75, 1.5, 2, 2.75, 3.5];
    onsets.forEach((on, k) => {
      const step = shape[(k + bar) % shape.length];
      // C major scale degrees, so passing tones land where a pentatonic
      // pattern would skip
      const SCALE = [0, 2, 4, 5, 7, 9, 11];
      const oct = Math.floor(step / 7);
      const m = root + SCALE[step % 7] + oct * 12 + (on >= 2.5 ? 12 : 0);
      pulse(
        beat(bar, on),
        m,
        (dense ? 0.105 : 0.125) * (0.62 + 0.38 * d),
        ((k % 4) / 3) * 1.1 - 0.55,
        dense ? 0.26 : 0.34,
      );
    });
  }
}

// ── endcard glue: one long sustaining voicing under the last three bars, so the
// per-bar pads stop pulsing and the ending reads as a single held breath.
for (const m of [48, 64, 67, 72]) pad(b(ENDCARD_BAR), BAR * 3 - 0.3, m, 0.075, m === 64 ? -0.4 : 0.35);

// ── melody: enters with the hero scene (Ask), returns for the endcard
// Stepwise, and deliberately full of the semitones a pentatonic line cannot
// contain: B→C over the G, E→F over the F. 67 = G4, 72 = C5.
// Bar numbers follow the 32-bar map (round 13 kept the whole back half in
// place — the act-one bar came from library, so ask 15–19, graph 20–22,
// collections 23–25, digest 26–28, endcard 29–31 are unchanged).
const MELODY = [
  [16, 0, 64], [16, 1.5, 65], [16, 3, 67], //  Cmaj7: E4 F4 G4  (E→F right away)
  [17, 0, 67], [17, 1.5, 69], [17, 3, 72], //  Fmaj7: G4 A4 C5  (rising)
  [18, 0, 74], [18, 2, 71], //  G6:    D5 B4
  [19, 0, 72], [19, 1.5, 71], [19, 3, 69], //  Cmaj7: C5 B4 A4
  [20, 0, 67], [20, 2, 69], [20, 3, 71], //  G6:    G4 A4 B4  (leading tone into the bloom)
  [21, 0, 72], [21, 2, 71], [22, 0, 69], [22, 2, 67], [23, 0, 74], [23, 2, 71], // graph
  [24, 0, 72], [25, 1, 69], // collections — kept high, kept bright
  [26, 0, 69], [27, 0, 67], [27, 2, 72], [28, 0, 71], // digest — warm, rising
  [29, 0, 64], [29, 2, 65], [30, 0, 69], [31, 0, 72], [31, 1.5, 76], // …home on C
];

for (const [bar, bt, m] of MELODY) {
  const last = bar >= ENDCARD_BAR;
  keys(beat(bar, bt), m, last ? 0.2 : 0.17, bar % 2 ? 0.2 : -0.2, last ? 2.6 : 1.5);
}

// A light LEAD-IN line under capture + library — single bright keys notes on
// scene pulses, so the product act sings from its first bar instead of waiting
// nine bars for the hero melody. Quiet by design: a promise, not the tune.
const LEAD_IN = [
  [8, 0, 67], [9, 2, 69], [10, 0, 71], [11, 2, 72], [12, 0, 71],
  [13, 0, 72], [14, 2, 69], [15, 2, 71],
];
for (const [bar, bt, m] of LEAD_IN) {
  keys(beat(bar, bt), m, 0.12, bar % 2 ? -0.25 : 0.25, 1.3);
}

// ── risers, each ENDING on the reveal it leads into (see timeline.mjs):
// 5.0→the collapse, 7.3→the share-sheet Machina icon, 11.7→the library,
// 16.2→the first answer, 19.6→the graph bloom, 27.6→the endcard.
for (const r of RISERS) riser(b(r), BAR * (r === 5 ? 1 : 1.4), 0.095);

// ── sound design against the picture
// the boot: the brackets close, the point strikes, then the mark pushes past
// the viewer and the frame dissolves into the film
whoosh(b(HITS.bootStrike) - 0.5, 0.62, 0.07, -0.4);
whoosh(b(HITS.bootStrike) - 0.45, 0.58, 0.07, 0.4);
impact(b(HITS.bootStrike), 0.26);
shimmer(b(HITS.bootStrike) + 0.1, [79, 84, 88], 0.055);
whoosh(b(HITS.bootExit), 0.62, 0.1, 0);
riser(b(HITS.bootExit) - 0.1, 0.7, 0.07);

// act one: each save gesture gets a tick ON the beat, a breath of air for the
// fly-off, and a soft landing thump as it drops into its silo — the score
// acknowledging the finger, which is what makes the run feel driven.
SAVES.forEach((s, i) => {
  tick(b(s), 0.095, 1.05 + i * 0.09);
  whoosh(b(s) + 0.04, 0.4, 0.045, i % 2 ? 0.3 : -0.3);
  sub(b(s + 0.21), 45, 0.14, 0.25); // the landing, ~0.21 bars later
});

// the loss: two DULL opens (pitched under the save ticks — same gesture,
// nothing found) and a heavier shut-thud each time the pile drops back
tick(b(HITS.lossOpenA), 0.09, 0.72);
sub(b(HITS.lossShutA), 43, 0.24, 0.32);
tick(b(HITS.lossOpenB), 0.09, 0.66);
sub(b(HITS.lossShutB), 41, 0.28, 0.36);

// the gather: five things rushing to one place, then landing as one
whoosh(b(HITS.converge) - 0.15, 0.9, 0.1, -0.35);
whoosh(b(HITS.converge) - 0.05, 0.85, 0.1, 0.35);
riser(b(HITS.converge), BAR * 0.35, 0.075);
impact(b(HITS.collapse), 0.4);
sub(b(HITS.collapse), 45, 0.34, 0.5);
// and the mark locking around it
shimmer(b(HITS.markLock), [69, 76, 81, 88], 0.062);

whoosh(b(HITS.deviceIn) - 0.3, 0.9, 0.085, 0.25);
tick(b(HITS.shareSheet), 0.085, 1.1);
// the world behind the sheet changing — a soft tick on each cut
tick(b(HITS.sourceCutA), 0.075, 1.25);
tick(b(HITS.sourceCutB), 0.075, 1.4);
tick(b(HITS.sourceCutC), 0.075, 1.55);
whoosh(b(HITS.collectionsIn) - 0.25, 0.7, 0.055, 0.25);
whoosh(b(HITS.pipelineIn) - 0.25, 0.7, 0.06, -0.25);
shimmer(b(HITS.pipelineIn) + 0.15, [72, 76, 79], 0.04);
tick(b(HITS.cardLands), 0.11, 0.9);
sub(b(HITS.cardLands), 45, 0.3, 0.35);
shimmer(b(HITS.cardLands) + 0.1, [72, 79, 84], 0.05);

whoosh(b(HITS.searchIn) - 0.25, 0.7, 0.06, -0.3);
tick(b(HITS.filterSnap), 0.09, 1.2);
shimmer(b(HITS.filterSnap), [76, 83], 0.045);

whoosh(b(HITS.askIn) - 0.3, 0.8, 0.08, 0.3);
tick(b(HITS.answerStart), 0.075, 1.5);
shimmer(b(HITS.citations), [72, 76, 79, 84, 88], 0.055);

// the finger landing on the Graph chip — a real UI tick, then the dive
tick(b(HITS.graphTap), 0.11, 1.25);
whoosh(b(HITS.graphTap) + 0.05, 0.6, 0.06, 0.2);

impact(b(HITS.graphBloom), 0.3);
whoosh(b(HITS.graphBloom) - 0.2, 0.9, 0.07, 0);

whoosh(b(HITS.digestIn) - 0.25, 0.7, 0.055, -0.25);

impact(b(HITS.endcard), 0.34);
whoosh(b(HITS.endcard) - 0.35, 0.9, 0.07, 0);

S.master();

const here = path.dirname(fileURLToPath(import.meta.url));
S.writeWav(path.join(here, '..', 'public', 'score.wav'));
