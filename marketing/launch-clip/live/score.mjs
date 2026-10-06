/**
 * The live film's score: the film's own instruments (audio/synth.mjs, the same
 * studio as the launch film and the reel), arranged on the live film's clock
 * (film/edit.js reads the real app's capture, so a retimed hold moves the
 * music with the picture).
 *
 * The arrangement follows the story, not a loop. The boot and the orbiting
 * saves float on high, open pads with no drums; the band comes in as the
 * saves spiral into the phone (SAVE), warms through FIND, runs fullest over
 * ASK (the hero), breathes for CONNECT and REVISIT, and drops out for the
 * outro so the mark strikes into air. The tempo is set so that strike lands
 * on a downbeat.
 *
 * Sound design sits on the picture's events: a tap is a tick, a phase of the
 * save pipeline is a rising tick and bell, a lift is a soft whoosh and sub,
 * each of the answer's three sources is a bell as its thread draws, typing
 * is a light patter.
 *
 *   node live/score.mjs   →   out/live/media/score.wav (bake.mjs makes the web's MP3)
 *
 * No samples, deterministic (seeded): the same edit always renders the same
 * bits. Verified numerically (levels, clipping) by this script; SOMEONE STILL
 * HAS TO LISTEN TO IT before it ships.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSynth, SR } from '../audio/synth.mjs';
import { limit, lufs, truePeak } from '../audio/loudness.mjs';
import { buildIndex } from './media.mjs';
import { makeEdit } from './film/edit.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'out', 'live', 'media');
const takes = process.env.LIVE_TAKES ?? 'takes';
const index = buildIndex(path.join(here, '..', 'out', 'live', takes));
const E = makeEdit(index.takes.session);
const A = E.at;
const TOTAL = E.dur;

// the mark strikes (brackets shut on the point) ON a downbeat: bar 26
const STRIKE = A.outro + 2.0;
const BARS_TO_STRIKE = 26;
const BAR = STRIKE / BARS_TO_STRIKE;
const BEAT = BAR / 4;
const at = (bar, beats = 0) => bar * BAR + beats * BEAT;
const barOf = (t) => Math.floor(t / BAR + 1e-6);

const S = createSynth({ seconds: TOTAL, beat: BEAT });
const { pad, sub, pulse, keys, bell, kick, hat, rim, shaker, clap, riser, whoosh, impact, tick, shimmer } = S;

// the film's chords (the launch film's voicings), C major: I V vi IV
const CH = {
  F: { bass: 41, upper: [57, 60, 64, 69] }, // Fmaj7
  C: { bass: 48, upper: [59, 64, 67, 71] }, // Cmaj7
  G: { bass: 43, upper: [59, 62, 64, 69] }, // G6
  Am: { bass: 45, upper: [57, 60, 64, 67] }, // Am7
};

// one chord per bar: air for the open, I V vi IV once the band is in
const PROG = (bar) => {
  const t = at(bar);
  if (t < A.home + 2.2) return 'F';
  if (t < A.gather + 0.7) return bar % 2 ? 'C' : 'F';
  if (t >= STRIKE - 0.01) return 'C';
  return ['C', 'G', 'Am', 'F'][(bar - barOf(A.gather + 0.7)) % 4];
};

// how much of the band plays, by where the film is
const density = (t) => {
  if (t < A.gather + 0.9) return 0.42;
  if (t < A.findHome) return 0.62;
  if (t < A.askHome) return 0.78;
  if (t < A.graph) return 1.0;
  if (t < A.revisit) return 0.86;
  if (t < A.outro) return 0.66;
  return 0.3;
};
const drumsFrom = A.gather + 1.05; // the saves arrive in the phone
const drumsTo = A.outro - 0.2; // the outro breathes

const BARS = Math.ceil(TOTAL / BAR);
for (let bar = 0; bar < BARS; bar++) {
  const t0 = at(bar);
  const len = Math.min(BAR, TOTAL - t0);
  if (len <= 0.05) break;
  const ch = CH[PROG(bar)];
  const d = density(t0);
  const drums = t0 >= drumsFrom - 0.05 && t0 < drumsTo;

  // ── pad: open and high for the open; centred once the band plays
  const lift = t0 < A.gather + 0.7 ? 12 : 0;
  const padLevel = 0.1 + 0.07 * d;
  ch.upper.forEach((m, i) => pad(t0, len, m + lift, padLevel * (i === 0 ? 1 : 0.85), ((i / 3) * 2 - 1) * 0.55));
  pad(t0, len, ch.bass + 12, padLevel * 0.6, 0);

  // ── bass
  if (t0 >= drumsFrom - 0.05 && t0 < STRIKE) {
    sub(t0, ch.bass, 0.3 + 0.24 * d, d >= 0.75 ? 0.55 : 1.4);
    if (d >= 0.75) {
      sub(at(bar, 1.5), ch.bass + 7, 0.18 + 0.1 * d, 0.34);
      sub(at(bar, 2.5), ch.bass + 12, 0.16 + 0.1 * d, 0.32);
    }
  }

  // ── drums: soft for SAVE, the full groove for ASK
  if (drums) {
    for (let k = 0; k < 4; k++) if (d >= 0.75 || k % 2 === 0) kick(at(bar, k), (k % 2 ? 0.3 : 0.38) + 0.18 * d);
    if (d >= 0.75) {
      clap(at(bar, 1), 0.13 + 0.05 * d);
      clap(at(bar, 3), 0.13 + 0.05 * d);
    } else {
      rim(at(bar, 3), 0.07);
    }
    for (let k = 0; k < 16; k++) {
      const accent = k % 4 === 0 ? 0.9 : k % 2 ? 1 : 0.55;
      if (d >= 0.75 || k % 2 === 0) hat(at(bar, k / 4), 0.03 * accent * d, k % 2 ? 0.22 : -0.18);
      if (d >= 0.9) shaker(at(bar, k / 4), 0.018 * d, k % 2 ? 0.34 : -0.3);
    }
    if (d >= 0.9) for (let k = 0; k < 4; k++) hat(at(bar, k + 0.5), 0.026 * d, 0.1, true);
  }

  // ── the pulse figure: the film's scale walk (degrees 0-2-3-4-6)
  if (t0 >= drumsFrom - BAR && t0 < A.outro) {
    const SCALE = [0, 2, 4, 5, 7, 9, 11];
    const shape = [0, 2, 3, 4, 6, 4, 3, 2];
    const onsets = drums ? [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] : [0, 0.75, 1.5, 2, 2.75, 3.5];
    onsets.forEach((on, k) => {
      if (at(bar, on) >= TOTAL) return;
      const step = shape[(k + bar) % shape.length];
      const m = ch.upper[0] + SCALE[step % 7] + Math.floor(step / 7) * 12 + (on >= 2.5 ? 12 : 0);
      pulse(at(bar, on), m, 0.1 * (0.6 + 0.4 * d), ((k % 4) / 3) * 1.1 - 0.55, drums ? 0.3 : 0.4);
    });
  }
}

// ── melody (FM keys): a quiet lead-in over SAVE/FIND, the tune over ASK,
// home on C for the mark. Stepwise, with E→F and B→C in the line.
const bA = barOf(A.askOpen);
const MELODY = [
  [barOf(A.phase0), 0, 67, 0.09], [barOf(A.phase0), 2, 69, 0.09], [barOf(A.phase0) + 1, 0, 71, 0.09],
  [barOf(A.findHome), 0, 72, 0.1], [barOf(A.findHome), 2.5, 71, 0.1], [barOf(A.findHome) + 1, 0, 69, 0.1],
  [bA, 0, 64], [bA, 1.5, 65], [bA, 3, 67],
  [bA + 1, 0, 72], [bA + 1, 1.5, 71], [bA + 1, 2, 72], [bA + 1, 3, 74],
  [bA + 2, 0, 71], [bA + 2, 2, 67], [bA + 3, 0, 69], [bA + 3, 2, 71],
  [barOf(A.revisit), 0, 72, 0.12], [barOf(A.revisit) + 1, 0, 76, 0.1], [barOf(A.revisit) + 2, 0, 74, 0.1],
  [BARS_TO_STRIKE, 0, 72, 0.19], [BARS_TO_STRIKE, 1.5, 76, 0.12], [BARS_TO_STRIKE + 1, 0.5, 79, 0.15],
];
for (const [bar, bt, m, level] of MELODY) {
  if (at(bar, bt) < TOTAL - 0.3) keys(at(bar, bt), m, level ?? 0.15, bar % 2 ? 0.2 : -0.2, bar >= BARS_TO_STRIKE ? 2.8 : 2);
}
// the mark: one held C under the endcard
for (const m of [48, 60, 64, 67, 72]) pad(STRIKE - 0.15, TOTAL - STRIKE + 0.15, m, m === 48 ? 0.09 : 0.075, m === 64 ? -0.4 : 0.35);
sub(STRIKE, 36, 0.24, 1.6);

// ── sound design, on the picture's events
// the boot: the brackets settle, the point strikes, the name, the push-through
tick(0.66, 0.08, 0.9);
bell(0.9, 84, 0.06, 0, 1.8);
shimmer(1.15, [79, 84, 88], 0.035);
whoosh(A.bootExit + 0.05, 0.6, 0.07, 0);
sub(A.home, 43, 0.18, 0.4);

// the ring: saves glinting in as they arrive, then the spiral into the phone
[0.35, 0.6, 0.85, 1.1, 1.35, 1.6, 1.85].forEach((dt, i) =>
  bell(A.home + dt, [84, 88, 91, 86, 89, 93, 95][i], 0.026, i % 2 ? 0.45 : -0.45, 1.3),
);
riser(A.gather - 1.3, 2.2, 0.08);
whoosh(A.gather + 0.25, 0.75, 0.09, -0.35);
whoosh(A.gather + 0.35, 0.7, 0.09, 0.35);
impact(A.gather + 1.15, 0.3);
sub(A.gather + 1.15, 36, 0.26, 0.6);

// SAVE: the +, the dialog lifting, three ways in, the paste, Save
const TAPS = [
  A.dialog - 0.12, A.modeImage - 0.06, A.modeNote - 0.06, A.modeLink - 0.06, A.phase0 - 0.1,
  A.detail - 0.08, A.close - 0.06, A.focus - 0.06, A.askOpen - 0.08, A.sent - 0.05, A.graph - 0.08,
  A.revisit - 0.08, A.expand - 0.08,
];
TAPS.forEach((t, i) => tick(t, 0.085, 1.1 + (i % 3) * 0.06));
whoosh(A.dialogSet - 0.05, 0.4, 0.05, 0.2);
[A.modeImage, A.modeNote, A.modeLink].forEach((t, i) => bell(t, [79, 83, 86][i], 0.032, [-0.3, 0.3, 0][i], 1.1));
tick(A.filled, 0.06, 1.4);
// the five phases climbing, a second each
[A.phase0, A.phase1, A.phase2, A.phase3, A.phase4].forEach((t, i) => {
  tick(t + 0.05, 0.07, 1.0 + i * 0.12);
  bell(t + 0.05, [72, 76, 79, 83, 84][i], 0.034, i % 2 ? 0.3 : -0.3, 0.9);
});
shimmer(A.done + 0.25, [84, 88, 91], 0.045);
// the card lifts, the brackets close on it
whoosh(A.landed + 0.1, 0.45, 0.05, -0.15);
sub(A.landed + 0.25, 43, 0.26, 0.3);
tick(A.landed + 0.55, 0.08, 0.95);
// opened; its "Do this" lifts
whoosh(A.detail, 0.35, 0.045, 0.15);
bell(A.detailEnd + 0.15, 88, 0.04, 0.2, 1.5);

// FIND: typing (every other character), then the one card
for (let k = 0; k < 32; k += 2) tick(A.typing + k / 30, 0.03, 1.6 + (k % 3) * 0.08);
shimmer(A.searching + 0.3, [79, 84], 0.025);
sub(A.result + 0.1, 48, 0.26, 0.34);
shimmer(A.result + 0.1, [76, 83, 88], 0.045);
tick(A.resultHold + 0.25, 0.07, 0.95);

// ASK: typing, send, the answer arriving, three sources
for (let k = 0; k < 32; k += 2) tick(A.askTyping + k / 30, 0.03, 1.6 + (k % 3) * 0.08);
whoosh(A.sent, 0.4, 0.055, 0.25);
shimmer(A.stream + 0.1, [79, 84], 0.03);
[0, 1, 2].forEach((i) => {
  const t = A.sources + 0.7 + i * 0.25;
  sub(t, [48, 52, 55][i], 0.2, 0.26);
  bell(t, [84, 88, 91][i], 0.055, [-0.35, 0, 0.35][i], 1.6);
});

// CONNECT: the graph opening with the three lit
whoosh(A.graph - 0.05, 0.5, 0.065, -0.2);
impact(A.graph + 0.15, 0.2);
shimmer(A.graph + 0.25, [72, 76, 79, 84], 0.045);

// REVISIT: the to-do lifts (the Tail End's own), the week opens, its standout
bell(A.revHold + 0.4, 84, 0.042, -0.2, 1.4);
shimmer(A.expand + 0.1, [72, 76, 79], 0.035);
bell(A.recap + 2.9, 88, 0.045, 0.2, 1.8);

// OUTRO: the ring once more, the spiral, the point, the brackets, the name
[0.0, 0.2, 0.4, 0.6].forEach((dt, i) => bell(A.outro - 0.2 + dt, [86, 89, 93, 91][i], 0.024, i % 2 ? 0.4 : -0.4, 1.2));
riser(A.outro + 0.2, STRIKE - A.outro - 0.2, 0.085);
whoosh(A.outro + 0.85, 0.6, 0.085, -0.3);
whoosh(A.outro + 0.95, 0.55, 0.085, 0.3);
impact(STRIKE, 0.34);
tick(STRIKE, 0.1, 0.85);
shimmer(STRIKE + 0.55, [79, 84, 88, 91], 0.05);

S.master({ fadeInSec: 0.3, fadeOutSec: 1.6 });

// Mastered like the reel (audio/mix-vo.mjs): −14 LUFS integrated, true peaks
// at or under −1 dBTP, where the feeds expect a finished mix. A global gain,
// then a look-ahead limiter on the few transients that would pass.
{
  const TARGET = { lufs: -14, truePeak: -1 };
  let gain = 10 ** ((TARGET.lufs - lufs(S.L, S.R, SR)) / 20);
  let ceiling = 10 ** ((TARGET.truePeak - 0.3) / 20);
  let out = null;
  for (let pass = 0; pass < 6; pass++) {
    const l = S.L.map((v) => v * gain);
    const r = S.R.map((v) => v * gain);
    limit(l, r, SR, ceiling);
    const I = lufs(l, r, SR);
    const tp = truePeak(l, r);
    out = { l, r, I, tp };
    const tpMax = TARGET.truePeak - 0.2;
    if (Math.abs(I - TARGET.lufs) < 0.05 && tp <= tpMax) break;
    gain *= 10 ** ((TARGET.lufs - I) / 20);
    if (tp > tpMax) ceiling *= 10 ** ((tpMax - tp - 0.05) / 20);
  }
  S.L.set(out.l);
  S.R.set(out.r);
  console.log(`mastered: ${out.I.toFixed(2)} LUFS, ${out.tp.toFixed(2)} dBTP`);
}
fs.mkdirSync(OUT, { recursive: true });
const wav = path.join(OUT, 'score.wav');
S.writeWav(wav);

// numbers, since nobody can listen here: level per section, peaks, clipping
const buf = fs.readFileSync(wav);
const n = (buf.length - 44) / 4;
const rmsDb = (a, b) => {
  let acc = 0;
  let cnt = 0;
  for (let i = Math.floor(a * SR); i < Math.min(n, Math.floor(b * SR)); i++) {
    const l = buf.readInt16LE(44 + i * 4) / 32768;
    const r = buf.readInt16LE(46 + i * 4) / 32768;
    acc += (l * l + r * r) / 2;
    cnt++;
  }
  return cnt ? (10 * Math.log10(acc / cnt + 1e-12)).toFixed(1) : '-';
};
let peak = 0;
let clips = 0;
for (let i = 0; i < n * 2; i++) {
  const v = Math.abs(buf.readInt16LE(44 + i * 2));
  peak = Math.max(peak, v);
  if (v >= 32700) clips++;
}
const sections = [
  ['open', 0, A.gather + 0.9], ['save', A.gather + 0.9, A.findHome], ['find', A.findHome, A.askHome],
  ['ask', A.askHome, A.graph], ['connect', A.graph, A.revisit], ['revisit', A.revisit, A.outro], ['outro', A.outro, TOTAL],
];
console.log(`score: ${TOTAL.toFixed(2)}s, ${(60 / BEAT).toFixed(1)} BPM, strike on bar ${BARS_TO_STRIKE} at ${STRIKE.toFixed(2)}s`);
console.log('  RMS dBFS by section:', sections.map(([k, a, b]) => `${k} ${rmsDb(a, b)}`).join(' · '));
console.log(`  peak ${(20 * Math.log10(peak / 32768)).toFixed(2)} dBFS · near-clip samples ${clips}`);
if (clips > 0) {
  console.error('the master clips');
  process.exit(1);
}
console.log(`  → ${path.relative(process.cwd(), wav)}`);
