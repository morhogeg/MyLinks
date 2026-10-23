/**
 * TICK IT OFF: the score. The house instruments (audio/synth.mjs, shared by
 * every Machina score) on the reel's own clock (clips/revisit-timeline.mjs:
 * 120 BPM, 15 frames a beat, a bar is 2s), plus four foley voices of its own
 * (a ratchet click, a paper rip, a sheet landing, a pen stroke), all
 * synthesized, nothing sampled.
 *
 * The arrangement IS the story's energy curve:
 *  - frame 0: a chord stab and a kick under the hook (the loop lands here);
 *  - "Watch later. Read later. Try later.": the list ratchets, a click and a
 *    rising pluck on each step, a half-time beat coming in;
 *  - the spin: the slot reel's own clicks, one per save crossing the middle
 *    of the frame (clips/revisit-list.mjs CLICKS: the picture's scroll, so
 *    they speed up and slow down WITH it), four on the floor, a riser;
 *  - "…procrastination.": the reel stops dead and so does the band: a clunk,
 *    then the comic beat in near silence;
 *  - "Relax.": the paper rips; under it the real app on I, warm;
 *  - "Every Sunday…": a light groove, a tap, the page unfolding, a pen
 *    stroke under the smallest step;
 *  - the pull-out: a sheet lands, five plucks for five picks (a 16th
 *    apart), a whoosh as they fly, a pen stroke for each rewritten line;
 *  - the breath before the payoff, then THE TICKS (75%): five rising pings
 *    on 8ths, home on I, the band in full;
 *  - "All done.": a bell; the tab; the sign-off rests IV → I; the fresh
 *    sheet lands on vi, into the loop's downbeat.
 *
 * THE LOOP: rendered twice in a row and the second copy kept, so every tail
 * rings on into frame 0 as it will when a feed plays it again. No fades.
 *
 *   node audio/revisit-score.mjs   →   public/clips/revisit/score.wav
 *   (then `node audio/mix-vo.mjs revisit` for the narrated, mastered mix)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BAR_FRAMES, BEAT, BEAT_FRAMES, CAPTIONS, CHORDS, FPS, HITS, RISERS, TOTAL_FRAMES, TOTAL_SEC } from '../clips/revisit-timeline.mjs';
import { CLICKS } from '../clips/revisit-list.mjs';
import { SR, createSynth } from './synth.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

const S = createSynth({ seconds: TOTAL_SEC * 2, beat: BEAT });
const { pad, sub, pulse, keys, bell, kick, hat, rim, shaker, clap, riser, whoosh, impact, tick, shimmer, pluck, ping, render, rnd, lp, hp } = S;
const H = HITS;

// ── where the narrator is speaking, in frames (the voice manifest)
const MANIFEST = JSON.parse(fs.readFileSync(path.join(root, 'out', 'vo', 'revisit', 'manifest.json'), 'utf8'));
const spoken = CAPTIONS.map((c) => {
  const m = MANIFEST.find((x) => x.frame === c.at);
  return [c.at, c.at + Math.round((m?.spoken ?? 0) * FPS)];
});
// noise (hats, shakers, whooshes, risers) stays out from under the voice
const voiced = (from, len = 1) => spoken.some(([a, b]) => from < b + 3 && from + len > a - 3);
const afterVoice = (from) => {
  let f = from;
  for (const [a, b] of spoken) if (f >= a - 2 && f < b + 2) f = b + 2;
  return f;
};

const VOICINGS = {
  Am7: { bass: 45, upper: [55, 60, 64, 67] },
  Fmaj7: { bass: 41, upper: [57, 60, 64, 69] },
  Cmaj7: { bass: 48, upper: [59, 64, 67, 71] },
  G6: { bass: 43, upper: [59, 62, 64, 69] },
};
const chordAt = (frame) => VOICINGS[CHORDS.filter(([f]) => f <= frame).at(-1)[1]];

// ── foley, synthesized

/** the ratchet: a dry click with a little wooden thock under it */
const clack = (startSec, level = 0.1, pitch = 1) => {
  tick(startSec, level, 1.25 * pitch);
  const l = lp(900);
  render(startSec, 0.09, (t) => (Math.sin(2 * Math.PI * 190 * pitch * t) * Math.exp(-t * 70) + l(rnd()) * Math.exp(-t * 120) * 0.4) * level * 0.9, { pan: -0.05, send: 0.12 });
};

/** paper ripping: a crackle of fibres, bright then darker, in bursts */
const rip = (startSec, lenSec = 0.36, level = 0.16) => {
  let z = 0;
  let env = 0;
  const h = hp(700);
  render(
    startSec,
    lenSec,
    (t) => {
      const x = t / lenSec;
      // fibres tearing: random grains, denser at the start
      if (rnd() > 0.84 - 0.1 * (1 - x)) env = 0.6 + 0.4 * Math.abs(rnd());
      env *= 0.985;
      const cutoff = 5200 - 3800 * x;
      const a = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
      z += a * (rnd() - z);
      return h(z) * env * Math.pow(1 - x, 0.6) * Math.min(1, t / 0.004) * level * 2.2;
    },
    { pan: -0.15, send: 0.25 },
  );
};

/** a sheet landing on the pad: a soft, papery pat with a low body */
const pat = (startSec, level = 0.12) => {
  const l = lp(1400);
  render(
    startSec,
    0.3,
    (t) => (Math.sin(2 * Math.PI * (72 + 30 * Math.exp(-t * 30)) * t) * Math.exp(-t * 26) * 0.9 + l(rnd()) * Math.exp(-t * 34) * 0.7) * level,
    { pan: 0, send: 0.3 },
  );
};

/** a pen stroke: a short scratch of nib on paper */
const scratch = (startSec, lenSec = 0.16, level = 0.05, panPos = 0.1) => {
  let z = 0;
  const h = hp(2400);
  render(
    startSec,
    lenSec,
    (t) => {
      const x = t / lenSec;
      const a = 1 - Math.exp((-2 * Math.PI * 6500) / SR);
      z += a * (rnd() - z);
      const grain = 0.65 + 0.35 * Math.sin(2 * Math.PI * 38 * t);
      return h(z) * grain * Math.sin(Math.PI * x) * level * 2;
    },
    { pan: panPos, send: 0.2 },
  );
};

/** the band's energy along the story (0–1) */
const energy = (f) =>
  f < H.step1 ? 0.25
  : f < H.spin ? 0.45
  : f < H.stop ? 0.6 + 0.4 * ((f - H.spin) / (H.stop - H.spin))
  : f < H.card - 4 ? 0
  : f < H.tapRecap ? 0.4
  : f < H.land ? 0.5
  : f < H.push2 ? 0.65
  : f < H.tick ? 0.35
  : f < H.allDone ? 1
  : f < H.lockup ? 0.55
  : f < H.clear ? 0.4
  : 0.3;

/** where the drums play, and how */
const groove = (f) => {
  if (f >= H.step1 && f < H.spin) return 'half';
  if (f >= H.spin && f < H.stop) return 'four';
  if (f >= H.card + 30 && f < H.land) return 'half';
  if (f >= H.land && f < H.push2 + 20) return 'four';
  if (f >= H.tick && f < H.allDone + 15) return 'drop';
  if (f >= H.allDone + 15 && f < H.lockup) return 'half';
  return null;
};

const arrange = (o) => {
  const t = (frame) => (frame + o) / FPS;

  // ── pad: one voicing per chord span; it rests for the comic beat after the stop
  CHORDS.forEach(([from, name], k) => {
    const to = k + 1 < CHORDS.length ? CHORDS[k + 1][0] : TOTAL_FRAMES;
    let a = from;
    let b = to;
    if (a < H.stop && b > H.stop) b = H.stop;
    if (a >= H.stop && a < H.card - 4) return;
    const ch = VOICINGS[name];
    const e = energy(a);
    const level = 0.075 + 0.07 * Math.max(e, 0.35);
    const lift = from === 0 || from >= H.clear ? 12 : 0;
    ch.upper.forEach((m, i) => pad(t(a), (b - a) / FPS + 0.04, m + lift, level * (i === 0 ? 1 : 0.85), ((i / 3) * 2 - 1) * 0.55));
    pad(t(a), (b - a) / FPS + 0.04, ch.bass + 12, level * 0.5, 0);
  });
  // the comic beat: one held, hushed note so the stop is not a dropout
  pad(t(H.stop + 4), (H.card - 8 - H.stop) / FPS, 64, 0.045, 0);

  // ── frame 0: the hook lands on a chord stab and a kick (and so does the loop)
  kick(t(0), 0.5);
  sub(t(0), 33, 0.42, 0.55);
  [57, 60, 64, 67, 72].forEach((m, i) => keys(t(0), m, 0.085, ((i / 4) * 2 - 1) * 0.5, 1.2));

  // ── bass: roots on the bar; the drop walks 8ths
  for (let f0 = 0; f0 < TOTAL_FRAMES; f0 += BAR_FRAMES) {
    const e = energy(f0);
    const ch = chordAt(f0);
    if (e <= 0.05) continue;
    if (groove(f0) === 'drop' || groove(f0 + BAR_FRAMES / 2) === 'drop') {
      for (let k = 0; k < 8; k++) {
        const fr = f0 + k * (BEAT_FRAMES / 2);
        if (groove(fr) !== 'drop') continue;
        sub(t(fr), chordAt(fr).bass - 12 + (k % 4 === 3 ? 7 : 0), 0.32, 0.2);
      }
    } else if (f0 >= H.step1) {
      sub(t(f0), ch.bass - 12, 0.22 + 0.2 * e, 0.9);
      if (groove(f0) === 'four') sub(t(f0 + 2 * BEAT_FRAMES), ch.bass - 12, 0.2 + 0.12 * e, 0.5);
    }
  }

  // ── the pulse: 8ths with the half-time beat, 16ths in the four and the drop
  const SCALE = [0, 2, 4, 5, 7, 9, 11];
  const SHAPE = [0, 2, 4, 2, 5, 4, 2, 4];
  for (let fr = 0; fr < TOTAL_FRAMES; fr += BEAT_FRAMES / 4) {
    const g = groove(fr);
    if (!g) continue;
    const sixteenth = Math.round(fr / (BEAT_FRAMES / 4));
    const step = g === 'drop' || g === 'four' ? 1 : 2;
    if (sixteenth % step) continue;
    const c = chordAt(fr);
    const k = (sixteenth / step) % SHAPE.length;
    const m = c.upper[0] + SCALE[SHAPE[k] % 7] + (g === 'drop' && k % 4 === 3 ? 12 : 0);
    const lvl = g === 'drop' ? 0.1 : g === 'four' ? 0.07 : 0.06 + 0.03 * energy(fr);
    pulse(t(fr), m, lvl, ((k % 4) / 3) * 1.1 - 0.55, g === 'drop' ? 0.2 : 0.28);
  }

  // ── drums
  for (let fr = 0; fr < TOTAL_FRAMES; fr += BEAT_FRAMES) {
    const g = groove(fr);
    if (!g) continue;
    const inBar = Math.round((fr % BAR_FRAMES) / BEAT_FRAMES);
    const e = energy(fr);
    if (g === 'half') {
      if (inBar === 0 || inBar === 2) kick(t(fr), 0.34 + 0.1 * e);
      if (inBar === 2) clap(t(fr), 0.1);
    } else {
      kick(t(fr), g === 'drop' ? 0.6 : 0.4 + 0.14 * e);
      if (inBar % 2) clap(t(fr), g === 'drop' ? 0.19 : 0.12 + 0.05 * e);
      if (g === 'drop' && inBar === 3) rim(t(fr + 0.5 * BEAT_FRAMES), 0.1);
    }
    const per = g === 'drop' || g === 'four' ? 4 : 2;
    for (let k = 0; k < per; k++) {
      const fh = fr + (k * BEAT_FRAMES) / per;
      if (voiced(fh, BEAT_FRAMES / per)) continue;
      const open = per === 2 ? k === 1 : k === 2;
      hat(t(fh), (g === 'drop' ? 0.038 : 0.027) * (open ? 1 : 0.7), k % 2 ? 0.22 : -0.2, open);
      if (g !== 'half') shaker(t(fh), 0.013, k % 2 ? 0.3 : -0.3);
    }
  }

  // ── the ratchet and the spin: one click per save crossing the frame's middle
  CLICKS.forEach((fr, k) => {
    const inSpin = fr > H.spin;
    clack(t(fr), inSpin ? 0.075 : 0.12, inSpin ? 1 + 0.002 * k : 0.95);
  });
  // each ratchet step: a rising pluck on its verb
  [
    [H.step1, 76],
    [H.step2, 79],
    [H.step3, 83],
  ].forEach(([fr, m]) => pluck(t(fr + 1), m, 0.06, 0.15, 0.45));

  // ── "…procrastination.": the reel stops dead (the band with it)
  sub(t(H.stop), 31, 0.42, 0.4);
  clack(t(H.stop), 0.16, 0.7);
  impact(t(H.stop), 0.1);
  ping(t(H.stop + 2), 88, 0.05, 0.2, 0.9);

  // ── "Relax.": the paper rips; the real app under it, on I
  rip(t(H.tear), 0.4, 0.16);
  whoosh(t(H.tear + 4), 0.4, 0.05, -0.2);
  sub(t(H.card - 4), 48, 0.3, 0.8);
  bell(t(afterVoice(H.card + 6)), 84, 0.06, 0.1, 2.2);

  // ── "Every Sunday…": the tap, the page unfolding, the pen under the step
  tick(t(H.tapRecap), 0.1, 1.05);
  whoosh(t(H.tapRecap + 1), 0.6, 0.03, 0.1);
  scratch(t(H.underline), 0.46, 0.035, 0.05);

  // ── the pull-out: a sheet lands; five picks; the flight; five rewrites
  pat(t(H.land + 10), 0.12);
  [76, 79, 81, 83, 88].forEach((m, j) => pluck(t(H.pick + 3.75 * j), m, 0.055, j % 2 ? 0.25 : -0.25, 0.4));
  whoosh(t(H.fly), (H.rewrite - H.fly) / FPS + 0.05, 0.05, 0);
  for (let r = 0; r < 5; r++) {
    const R0 = H.rewrite + 6 * r;
    scratch(t(R0), 0.11, 0.035, -0.1 + 0.05 * r);
    scratch(t(R0 + 6), 0.2, 0.025, 0.1);
  }

  // ── the breath before the payoff: the drums fall away under "Even the
  // procrastination one."; a short riser into the tick
  riser(t(H.tick - 16), 16 / FPS, 0.2);

  // ── THE TICKS: five rising pings on 8ths, home on I, the band in full
  impact(t(H.tick), 0.42);
  sub(t(H.tick), 36, 0.6, 1.1);
  [72, 76, 79, 84, 88].forEach((m, j) => {
    const fr = H.tick + 7.5 * j;
    ping(t(fr), m, 0.09, ((j / 4) * 2 - 1) * 0.4, 0.8);
    tick(t(fr), 0.07, 1.2);
  });
  shimmer(t(H.tick + 38), [84, 88, 91, 96], 0.04);
  // the rows folding away
  whoosh(t(H.tick + 18), 1.4, 0.03, 0);
  // "All done."
  bell(t(H.allDone), 91, 0.08, 0, 2.6);
  bell(t(H.allDone) + 0.04, 84, 0.06, -0.2, 2.6);

  // ── the sign-off: the mark's point strikes on "Machina" (lighter than the payoff)
  impact(t(H.lockup + 5), 0.2);
  sub(t(H.lockup + 5), 41, 0.3, 0.8);
  bell(t(afterVoice(H.lockup + 80)), 88, 0.06, -0.1, 2.2);

  // ── the fresh sheet lands on vi, into the loop's downbeat
  whoosh(t(H.landLoop), 0.7, 0.035, 0);
  pat(t(H.landLoop + 22), 0.11);
  [
    [H.landLoop + 4, 76],
    [H.landLoop + 12, 79],
  ].forEach(([fr, m]) => keys(t(fr), m, 0.055, -0.2, 0.8));

  // ── risers, each ENDING on its reveal, out of the voice's way
  for (const [from, to] of RISERS) {
    let a = from;
    for (const [s0, s1] of spoken) if (a < s1 + 3 && to > s0 - 3) a = s1 + 3;
    if (to - a >= BEAT_FRAMES / 2) riser(t(a), (to - a) / FPS, 0.09);
  }
};

const N1 = Math.round(TOTAL_SEC * SR);
arrange(0);
arrange(TOTAL_FRAMES);
S.master({ fadeInSec: 0, fadeOutSec: 0 });

// the second copy, as 16-bit stereo
const bytes = N1 * 4;
const out = Buffer.alloc(44 + bytes);
out.write('RIFF', 0);
out.writeUInt32LE(36 + bytes, 4);
out.write('WAVE', 8);
out.write('fmt ', 12);
out.writeUInt32LE(16, 16);
out.writeUInt16LE(1, 20);
out.writeUInt16LE(2, 22);
out.writeUInt32LE(SR, 24);
out.writeUInt32LE(SR * 4, 28);
out.writeUInt16LE(4, 32);
out.writeUInt16LE(16, 34);
out.write('data', 36);
out.writeUInt32LE(bytes, 40);
for (let i = 0; i < N1; i++) {
  const l = S.L[N1 + i];
  const r = S.R[N1 + i];
  out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, l)) * 32767), 44 + i * 4);
  out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, r)) * 32767), 44 + i * 4 + 2);
}
const dest = path.join(root, 'public', 'clips', 'revisit', 'score.wav');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
console.log(`wrote ${path.relative(root, dest)} (${TOTAL_SEC.toFixed(2)}s, the second of two copies: loops clean)`);
