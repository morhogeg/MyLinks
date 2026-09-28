/**
 * The ASK feature clip's score: the film's instruments (audio/synth.mjs), the
 * reel's arrangement language, on the clip's clock (clips/ask-timeline.mjs:
 * 112.5 BPM, 16 frames a beat, written straight in output frames).
 *
 * It follows the cut: the empty Ask screen floats on a held IV with no drums;
 * the question types over 16th-note clicks; the drums come in on the Send
 * downbeat and run through the answer, its three sources (a bell on each, as
 * in the reel) and the card they cite opening; they drop out for the lockup
 * so the mark strikes into air.
 *
 *   node audio/clips/ask-score.mjs && node audio/mix-vo.mjs ask
 *        → public/ask-score.wav → public/ask-score-vo.wav
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { BAR, BAR_FRAMES, BAR_CHORDS, BEAT, CAPTIONS, FPS, HITS, RISERS, TOTAL_FRAMES, TOTAL_SEC } from '../../clips/ask-timeline.mjs';
import { createSynth } from '../synth.mjs';

// The clip ends on its last frame: no tail past the end, the fade finishes in it.
const S = createSynth({ seconds: TOTAL_SEC, beat: BEAT });
const { pad, sub, pulse, keys, bell, kick, hat, rim, shaker, clap, riser, whoosh, impact, tick, shimmer } = S;

const f = (fr) => fr / FPS; // frame → seconds
const b = (n) => n * BAR; // bar → seconds
const at = (n, beats) => b(n) + beats * BEAT;
const H = HITS;

// The film's (and the reel's) chords, same voicings.
const CHORDS = {
  Fmaj7: { bass: 41, upper: [57, 60, 64, 69] },
  Cmaj7: { bass: 48, upper: [59, 64, 67, 71] },
  G6: { bass: 43, upper: [59, 62, 64, 69] },
};

const BARS = Math.ceil(TOTAL_FRAMES / BAR_FRAMES);
/** How much of the band is playing, per bar. */
const DENSITY = [0.3, 0.42, 0.86, 0.92, 1.0, 0.96, 0.9, 0.5, 0.45, 0.45, 0.45];
const DRUMS = [f(H.send), f(H.lockup)]; // Send … the lockup breathes

for (let n = 0; n < BARS; n++) {
  const ch = CHORDS[BAR_CHORDS[Math.min(n, BAR_CHORDS.length - 1)]];
  const d = DENSITY[Math.min(n, DENSITY.length - 1)];
  const t0 = b(n);
  const len = Math.min(BAR, TOTAL_SEC - t0);
  const drums = t0 >= DRUMS[0] - 0.01 && t0 < DRUMS[1] - 0.01;

  // ── pad: the empty screen is voiced high and open (air before the question)
  const padLevel = 0.1 + 0.08 * d;
  const lift = n < 1 ? 12 : 0;
  ch.upper.forEach((m, i) => {
    const panPos = ((i / (ch.upper.length - 1)) * 2 - 1) * 0.55;
    pad(t0, len, m + lift, padLevel * (i === 0 ? 1 : 0.85), panPos);
  });
  pad(t0, len, ch.bass + 12, padLevel * 0.6, 0);
  if (drums) pad(t0, len, ch.upper[3] + 12, padLevel * 0.34, n % 2 ? 0.35 : -0.35);

  // ── bass: a moving line once the question is being asked
  if (n >= 1) sub(t0, ch.bass, 0.34 + 0.26 * d, d >= 0.7 ? 0.55 : 1.6);
  if (d >= 0.7) {
    sub(at(n, 1.5), ch.bass + 7, 0.2 + 0.1 * d, 0.36);
    sub(at(n, 2.5), ch.bass + 12, 0.18 + 0.1 * d, 0.34);
    sub(at(n, 3.5), ch.bass + 7, 0.15, 0.3);
  }

  // ── drums: four on the floor, backbeat claps, 16th hats, off-beat opens
  if (drums) {
    for (let k = 0; k < 4; k++) kick(at(n, k), (k % 2 ? 0.34 : 0.42) + 0.2 * d);
    clap(at(n, 1), 0.17 + 0.05 * d);
    clap(at(n, 3), 0.17 + 0.05 * d);
    rim(at(n, 2.75), 0.08 + 0.04 * d);
    for (let k = 0; k < 16; k++) {
      const accent = k % 4 === 0 ? 0.9 : k % 2 ? 1 : 0.55;
      hat(at(n, k / 4), 0.034 * accent * d, k % 2 ? 0.22 : -0.18);
      shaker(at(n, k / 4), 0.02 * d, k % 2 ? 0.34 : -0.3);
    }
    for (let k = 0; k < 4; k++) hat(at(n, k + 0.5), 0.03 * d, 0.1, true);
  }

  // ── the pulse figure: the film's scale walk (degrees 0-2-3-4-6)
  if (n >= 1 && t0 < f(H.lockup)) {
    const SCALE = [0, 2, 4, 5, 7, 9, 11];
    const shape = [0, 2, 3, 4, 6, 4, 3, 2];
    const onsets = drums ? [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] : [0, 0.75, 1.5, 2, 2.75, 3.5];
    onsets.forEach((on, k) => {
      if (at(n, on) >= TOTAL_SEC) return;
      const step = shape[(k + n) % shape.length];
      const m = ch.upper[0] + SCALE[step % 7] + Math.floor(step / 7) * 12 + (on >= 2.5 ? 12 : 0);
      pulse(at(n, on), m, (drums ? 0.1 : 0.12) * (0.62 + 0.38 * d), ((k % 4) / 3) * 1.1 - 0.55, drums ? 0.3 : 0.4);
    });
  }
}

// ── the lockup: one held voicing under the end, a single breath
for (const m of [48, 64, 67, 72]) pad(f(H.lockup), TOTAL_SEC - f(H.lockup) - 0.2, m, 0.08, m === 64 ? -0.4 : 0.35);

// ── melody (FM keys): a lead-in under the question, the tune over the
// answer and its sources, home on C for the lockup. Stepwise, E→F and B→C.
const LINE = CAPTIONS.find((c) => c.place === 'lockup');
const MELODY = [
  [1, 0, 67], [1, 2, 69], // the question (quiet)
  [2, 0, 64], [2, 1.5, 65], [2, 3, 67], // the answer: E F G
  [4, 1.5, 72], [4, 2, 71], [4, 3, 72], // after the sources: C B C
  [5, 0, 74], [5, 2, 71], [6, 0, 69], [6, 2, 71], // the card: D B A B
  // home: C a beat before the mark strikes, E (softer) in the breath after
  // its name, and the G AFTER the last word (the reel's round-13 rule: never
  // a note on a word the narrator has to land)
  [f(H.markStrike) / BAR - 1 / 4, 0, 72],
  [f(LINE.at + 16) / BAR, 0, 76, 0.12],
  [f(LINE.at + 80) / BAR, 0, 79],
];
for (const [n, bt, m, level] of MELODY) {
  const lead = n < 2;
  const home = n >= 7;
  keys(at(n, bt), m, level ?? (lead ? 0.11 : home ? 0.19 : 0.16), Math.floor(n) % 2 ? 0.2 : -0.2, home ? 2.8 : 2);
}

// ── risers, each ENDING on the reveal it leads into
for (const [from, to] of RISERS) riser(f(from), f(to) - f(from), 0.09);

// ── sound design, on the picture's frames

// Ask opens: a glint as the screen comes into focus
bell(f(H.open) + 0.05, 84, 0.03, -0.3, 1.4);
shimmer(f(H.open) + 0.1, [72, 79, 84], 0.03);

// the question: typing on 16ths (a character lands every K frames)
for (let fr = H.typeFrom; fr < H.send - 16; fr += 4) tick(f(fr), 0.035, 1.6 + ((fr / 4) % 3) * 0.08);

// send, and the answer arriving
tick(f(H.send), 0.11, 1.3);
whoosh(f(H.send), 0.4, 0.06, 0.25);
shimmer(f(H.answerFrom), [79, 84], 0.03);

// the three sources, each on its beat (the reel's citation bells)
H.chips.forEach((fr, i) => {
  sub(f(fr), [48, 52, 55][i], 0.22, 0.26);
  bell(f(fr), [84, 88, 91][i], 0.06, [-0.35, 0, 0.35][i], 1.6);
});

// the first source tapped: its card opens
tick(f(H.citeTap), 0.1, 1.2);
whoosh(f(H.citeTap) + 0.03, 0.45, 0.06, -0.2);
sub(f(H.citeTap), 43, 0.2, 0.3);
// its summary, the passage the answer drew on, lifts
bell(f(H.summary), 88, 0.05, 0.2, 1.8);
shimmer(f(H.summary) + 0.04, [76, 83, 88], 0.035);

// the lockup: the card is thrown out, the mark strikes into air
whoosh(f(H.lockup) - 0.6, 0.7, 0.09, 0);
impact(f(H.markStrike), 0.34);
shimmer(f(H.markStrike) + 0.08, [79, 84, 88, 91], 0.055);

S.master({ fadeInSec: 0.25, fadeOutSec: 1.1 });

const here = path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(path.join(here, '..', '..', 'public'), { recursive: true });
S.writeWav(path.join(here, '..', '..', 'public', 'ask-score.wav'));
