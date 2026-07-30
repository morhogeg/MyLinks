/**
 * The score, synthesized from scratch — no samples, no dependencies.
 *
 * Why generate it: a launch film needs music that hits ITS cuts, and the cuts
 * live in `timeline.mjs`. So the arrangement reads the same bar map the edit
 * does: risers land on the bar before a hard cut, the sub thumps where the
 * card lands, percussion thins out for the endcard. Sync is structural rather
 * than nudged by ear.
 *
 * Signal path per voice: oscillator/exciter → ADSR → one-pole LP → dry stereo
 * bus + a mono reverb send. Master: dotted-8th delay for the plucks, a
 * Freeverb-style tank (8 damped combs → 4 allpasses, 23-sample stereo spread),
 * gentle tanh saturation, then fades.
 *
 *   node audio/score.mjs   →   public/score.wav
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BAR, BEAT, TOTAL_SEC, HITS, RISERS } from '../timeline.mjs';

const SR = 44100;
const OUT_SEC = TOTAL_SEC + 1.2; // room for the final reverb tail
const N = Math.ceil(OUT_SEC * SR);

const L = new Float64Array(N);
const R = new Float64Array(N);
const SEND = new Float64Array(N); // mono reverb send
const DELAY_SEND = new Float64Array(N); // mono delay send (plucks)

// ─────────────────────────────────────────────────────────── helpers

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const secToIdx = (s) => Math.round(s * SR);

/** Deterministic noise — a seeded LCG, so every render is bit-identical. */
let seed = 0x2f6e2b1;
const rnd = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return (seed / 0xffffffff) * 2 - 1;
};

/** Linear attack / exponential-ish decay-sustain-release envelope. */
const adsr = (t, dur, a, d, s, r) => {
  if (t < 0) return 0;
  if (t < a) return t / a;
  if (t < a + d) return 1 + (s - 1) * ((t - a) / d);
  if (t < dur) return s;
  const rt = t - dur;
  if (rt >= r) return 0;
  const x = 1 - rt / r;
  return s * x * x;
};

/**
 * Write a voice into the buses. `gen(t, i)` returns a mono sample for time t.
 * pan −1..1, send = reverb amount, delay = delay-bus amount.
 */
const render = (startSec, lenSec, gen, { pan = 0, send = 0.25, delay = 0 } = {}) => {
  const i0 = secToIdx(startSec);
  const n = Math.ceil(lenSec * SR);
  const gl = Math.cos(((pan + 1) * Math.PI) / 4);
  const gr = Math.sin(((pan + 1) * Math.PI) / 4);
  for (let i = 0; i < n; i++) {
    const idx = i0 + i;
    if (idx < 0 || idx >= N) continue;
    const v = gen(i / SR, i);
    if (v === 0) continue;
    L[idx] += v * gl;
    R[idx] += v * gr;
    if (send) SEND[idx] += v * send;
    if (delay) DELAY_SEND[idx] += v * delay;
  }
};

/** One-pole lowpass as a closure (per-voice state). */
const lp = (cutoff) => {
  const a = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
  let z = 0;
  return (x) => (z += a * (x - z));
};

const hp = (cutoff) => {
  const l = lp(cutoff);
  return (x) => x - l(x);
};

// ─────────────────────────────────────────────────────────── instruments

/**
 * Pad — five slightly detuned partials with a slow bloom. Carries the harmony
 * for the whole film; everything else is decoration on top of it.
 */
const pad = (startSec, lenSec, midi, level, panPos) => {
  const f = mtof(midi);
  const dets = [0, -0.07, 0.06, -0.13, 0.11];
  const phase = dets.map(() => rnd() * Math.PI);
  const filt = lp(1500 + level * 900);
  render(
    startSec,
    lenSec + 2.2,
    (t) => {
      const e = adsr(t, lenSec, 1.15, 0.5, 0.86, 2.1);
      if (e <= 0) return 0;
      let v = 0;
      for (let k = 0; k < dets.length; k++) {
        const ff = f * Math.pow(2, dets[k] / 12);
        // a touch of drift keeps the sustain from sounding frozen
        const drift = 1 + 0.0008 * Math.sin(2 * Math.PI * (0.11 + k * 0.037) * t);
        v += Math.sin(2 * Math.PI * ff * drift * t + phase[k]) / dets.length;
      }
      v += 0.14 * Math.sin(2 * Math.PI * f * 2 * t); // slim octave for presence
      return filt(v) * e * level;
    },
    { pan: panPos, send: 0.42 },
  );
};

/** Sub — the weight under a downbeat. Sine + 2nd harmonic, soft-driven. */
const sub = (startSec, midi, level = 0.5, lenSec = 0.75) => {
  const f = mtof(midi);
  render(
    startSec,
    lenSec + 0.4,
    (t) => {
      const e = adsr(t, lenSec, 0.006, 0.28, 0.42, 0.35);
      if (e <= 0) return 0;
      const v = Math.sin(2 * Math.PI * f * t) + 0.18 * Math.sin(2 * Math.PI * f * 2 * t);
      return Math.tanh(v * 1.4) * 0.7 * e * level;
    },
    { pan: 0, send: 0.08 },
  );
};

/**
 * Pluck — Karplus-Strong. A noise burst into a damped delay line; the string
 * length is the period, so the pitch is exact and the timbre is real rather
 * than an oscillator pretending.
 */
const pluck = (startSec, midi, level = 0.2, panPos = 0, damp = 0.5) => {
  const f = mtof(midi);
  const M = Math.max(2, Math.round(SR / f));
  const buf = new Float64Array(M);
  const exc = lp(3800);
  for (let i = 0; i < M; i++) buf[i] = exc(rnd());
  let p = 0;
  let prev = 0;
  const body = lp(4200);
  render(
    startSec,
    1.5,
    (t) => {
      const cur = buf[p];
      const nxt = buf[(p + 1) % M];
      const filtered = (cur + nxt) * 0.5 * (0.9965 - damp * 0.004);
      buf[p] = filtered;
      p = (p + 1) % M;
      prev = prev * 0.5 + filtered * 0.5;
      const e = t < 1.4 ? Math.pow(1 - t / 1.5, 1.3) : 0;
      return body(prev) * e * level;
    },
    { pan: panPos, send: 0.34, delay: 0.3 },
  );
};

/** Bell — the melodic voice. Sine core plus a quiet 3rd partial, long decay. */
const bell = (startSec, midi, level = 0.18, panPos = 0, decay = 2.6) => {
  const f = mtof(midi);
  render(
    startSec,
    decay + 0.5,
    (t) => {
      const e = Math.exp(-t * (3.2 / decay));
      if (e < 1e-4) return 0;
      const strike = Math.exp(-t * 40) * 0.35;
      return (
        (Math.sin(2 * Math.PI * f * t) +
          0.22 * Math.sin(2 * Math.PI * f * 3.01 * t) * Math.exp(-t * 2.4) +
          strike * Math.sin(2 * Math.PI * f * 5 * t)) *
        e *
        level
      );
    },
    { pan: panPos, send: 0.5 },
  );
};

/** Kick — pitch-swept sine with a click. Restrained; this is not a trailer. */
const kick = (startSec, level = 0.5) => {
  const filt = lp(240);
  render(
    startSec,
    0.6,
    (t) => {
      const f = 46 + 74 * Math.exp(-t * 26);
      const e = Math.exp(-t * 7.5);
      const click = Math.exp(-t * 260) * 0.5 * rnd();
      return (Math.tanh(Math.sin(2 * Math.PI * f * t) * 1.8) * e + filt(click)) * level;
    },
    { pan: 0, send: 0.06 },
  );
};

/** Hat — noise through a highpass, very short. Sits at the edge of audible. */
const hat = (startSec, level = 0.05, panPos = 0.15) => {
  const h = hp(6500);
  render(
    startSec,
    0.09,
    (t) => h(rnd()) * Math.exp(-t * 90) * level,
    { pan: panPos, send: 0.18 },
  );
};

/** Rim — a dry backbeat tick, band-limited noise plus a tuned ping. */
const rim = (startSec, level = 0.16) => {
  const h = hp(1200);
  const l = lp(4200);
  render(
    startSec,
    0.2,
    (t) => (l(h(rnd())) * Math.exp(-t * 55) + 0.3 * Math.sin(2 * Math.PI * 420 * t) * Math.exp(-t * 70)) * level,
    { pan: -0.2, send: 0.3 },
  );
};

/** Riser — noise with an opening filter and a slow sine sweep underneath. */
const riser = (startSec, lenSec, level = 0.11) => {
  let z = 0;
  render(
    startSec,
    lenSec,
    (t) => {
      const x = clamp01(t / lenSec);
      const cutoff = 300 * Math.pow(60, x); // 300Hz → ~18kHz
      const a = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
      z += a * (rnd() - z);
      const sweep = Math.sin(2 * Math.PI * (180 + 620 * x * x) * t) * 0.25 * x;
      return (z * 0.9 + sweep) * Math.pow(x, 1.7) * level;
    },
    { pan: 0, send: 0.35 },
  );
};

/** Whoosh — a soft air movement for a device entering or a hard camera move. */
const whoosh = (startSec, lenSec = 0.85, level = 0.09, panPos = 0) => {
  let z = 0;
  render(
    startSec,
    lenSec,
    (t) => {
      const x = clamp01(t / lenSec);
      const bell_ = Math.sin(Math.PI * x); // swell in and out
      const cutoff = 500 + 2600 * bell_;
      const a = 1 - Math.exp((-2 * Math.PI * cutoff) / SR);
      z += a * (rnd() - z);
      return z * bell_ * level;
    },
    { pan: panPos, send: 0.45 },
  );
};

/** Impact — the mark landing, the endcard arriving. Thump + air, heavy on send. */
const impact = (startSec, level = 0.5) => {
  const l = lp(180);
  const h = hp(2200);
  render(
    startSec,
    2.4,
    (t) => {
      const f = 58 * Math.exp(-t * 3.2) + 32;
      const body = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 3.4);
      const air = h(rnd()) * Math.exp(-t * 9) * 0.22;
      return (Math.tanh(body * 1.6) + l(rnd()) * Math.exp(-t * 30) * 0.3 + air) * level;
    },
    { pan: 0, send: 0.6 },
  );
};

/** UI tick — the tiny, expensive-sounding click of something committing. */
const tick = (startSec, level = 0.1, pitch = 1) => {
  const h = hp(1800);
  render(
    startSec,
    0.14,
    (t) =>
      (h(rnd()) * Math.exp(-t * 130) * 0.6 +
        Math.sin(2 * Math.PI * 2100 * pitch * t) * Math.exp(-t * 90) * 0.5) *
      level,
    { pan: 0.05, send: 0.3 },
  );
};

/** Shimmer — a rising cluster of quiet bells, for citations resolving. */
const shimmer = (startSec, midis, level = 0.075) => {
  midis.forEach((m, i) => bell(startSec + i * 0.075, m, level, i % 2 ? 0.3 : -0.3, 1.9));
};

// ─────────────────────────────────────────────────────────── arrangement

const b = (bar) => bar * BAR; // bar → seconds
const beat = (bar, nBeats) => b(bar) + nBeats * BEAT;

// Chord per bar. Am9 → Fmaj7 → Cmaj7 → G6, the progression sitting under the
// whole film; bars 0–1 are a bare Am drone so the cold open has air.
const CHORDS = {
  Am9: { bass: 45, upper: [60, 64, 67, 71] },
  Fmaj7: { bass: 41, upper: [57, 60, 64, 69] },
  Cmaj7: { bass: 48, upper: [59, 64, 67, 71] },
  G6: { bass: 43, upper: [59, 62, 64, 69] },
};
const BAR_CHORDS = [
  'Am9', 'Am9', // 0–1 cold open
  'Am9', 'Fmaj7', 'Cmaj7', // 2–4 problem
  'G6', 'G6', // 5–6 wordmark
  'Am9', 'Fmaj7', 'Cmaj7', 'G6', // 7–10 capture
  'Am9', 'Fmaj7', 'Cmaj7', 'G6', // 11–14 library
  'Am9', 'Fmaj7', 'Cmaj7', 'G6', // 15–18 ask
  'Am9', 'Fmaj7', 'Cmaj7', // 19–21 graph
  'Am9', 'Fmaj7', // 22–23 digest
  'Cmaj7', 'G6', 'Am9', // 24–26 endcard
];

/** Per-bar intensity — how much of the arrangement is switched on. */
const density = (bar) => {
  if (bar < 2) return 0.18;
  if (bar < 5) return 0.42;
  if (bar < 7) return 0.55;
  if (bar < 11) return 0.7;
  if (bar < 15) return 0.82;
  if (bar < 19) return 1.0;
  if (bar < 22) return 0.9;
  // The digest beat pulls back without dropping out — a 4dB hole here read as
  // "the music stopped" rather than "the film exhaled".
  if (bar < 24) return 0.74;
  return 0.52;
};

for (let bar = 0; bar < BAR_CHORDS.length; bar++) {
  const ch = CHORDS[BAR_CHORDS[bar]];
  const d = density(bar);
  const t0 = b(bar);

  // ── pad: the harmony, voiced wider as the film opens up
  const padLevel = 0.1 + 0.075 * d;
  ch.upper.forEach((m, i) => {
    if (bar < 2 && i > 1) return; // cold open: two voices only
    const panPos = ((i / (ch.upper.length - 1)) * 2 - 1) * 0.55;
    pad(t0, BAR, m, padLevel * (i === 0 ? 1 : 0.85), panPos);
  });
  pad(t0, BAR, ch.bass + 12, padLevel * 0.6, 0);

  // ── sub on the downbeat, plus a lift into the next bar late in the film
  sub(t0, ch.bass, 0.34 + 0.26 * d, bar < 2 ? 1.4 : 0.8);
  if (d >= 0.8) sub(beat(bar, 2.5), ch.bass + 12, 0.16, 0.3);

  // ── percussion
  if (d >= 0.7 && bar < 24) {
    kick(t0, 0.34 + 0.2 * d);
    kick(beat(bar, 2), 0.3 + 0.16 * d);
    if (d >= 0.82 && bar < 22) kick(beat(bar, 3.5), 0.2);
    if (d >= 0.82 && bar < 22) rim(beat(bar, 2), 0.12 + 0.06 * d);
    if (d >= 0.8 && bar < 22) {
      for (let k = 0; k < 8; k++) {
        // offbeats accented — keeps it moving without a four-on-the-floor feel
        hat(beat(bar, k * 0.5), (k % 2 ? 0.055 : 0.03) * d, k % 2 ? 0.22 : -0.18);
      }
    }
  }

  // ── plucked arpeggio: 8ths from the capture scene, 16ths over the graph
  if (bar >= 7 && bar < 24) {
    const notes = [...ch.upper, ch.upper[2] + 12];
    const sixteenths = bar >= 19 && bar < 22;
    const steps = sixteenths ? 16 : 8;
    for (let k = 0; k < steps; k++) {
      if (!sixteenths && k % 4 === 3 && bar % 2 === 0) continue; // breathe
      const m = notes[(k + bar) % notes.length] + (k >= steps / 2 ? 12 : 0);
      pluck(
        beat(bar, (k * 4) / steps),
        m,
        (sixteenths ? 0.1 : 0.15) * (0.6 + 0.4 * d),
        ((k % 4) / 3) * 1.2 - 0.6,
        sixteenths ? 0.7 : 0.45,
      );
    }
  }
}

// ── endcard glue: one long sustaining voicing under the last three bars, so the
// per-bar pads stop pulsing and the ending reads as a single held breath.
for (const m of [45, 57, 64, 69]) pad(b(24), BAR * 3 - 0.3, m, 0.075, m === 57 ? -0.4 : 0.35);

// ── melody: enters with the hero scene (Ask), returns for the endcard
const MELODY = [
  [15, 0, 76], [15, 2, 81], // Am9: E5 A5
  [16, 0, 77], [16, 2.5, 72], // Fmaj7: F5 C5
  [17, 0, 79], [17, 2, 76], // Cmaj7: G5 E5
  [18, 0, 74], [18, 2, 71], // G6: D5 B4
  [19, 0, 81], [20, 1, 77], [21, 0, 79],
  [24, 0, 76], [25, 0, 74], [26, 0, 69], [26, 1.5, 81],
];
for (const [bar, bt, m] of MELODY) {
  bell(beat(bar, bt), m, bar >= 24 ? 0.2 : 0.15, bar % 2 ? 0.22 : -0.22, bar >= 24 ? 3.6 : 2.4);
}

// ── risers into the hard cuts
for (const r of RISERS) riser(b(r), BAR * (r === 6 ? 1 : 1.4), 0.085);

// ── sound design against the picture
impact(b(HITS.markImpact), 0.5);
whoosh(b(HITS.markImpact) - 0.55, 0.7, 0.075, -0.4);
whoosh(b(HITS.markImpact) - 0.5, 0.65, 0.075, 0.4);

// the gather: five things rushing to one place, then landing as one
whoosh(b(HITS.converge) - 0.15, 0.9, 0.1, -0.35);
whoosh(b(HITS.converge) - 0.05, 0.85, 0.1, 0.35);
riser(b(HITS.converge), BAR * 0.35, 0.075);
impact(b(HITS.collapse), 0.4);
sub(b(HITS.collapse), 45, 0.34, 0.5);
// and the release into the name
shimmer(b(HITS.nameIn), [69, 76, 81, 88], 0.062);

whoosh(b(HITS.deviceIn) - 0.3, 0.9, 0.085, 0.25);
tick(b(HITS.shareSheet), 0.085, 1.1);
tick(b(HITS.shareSheet) + 0.28, 0.07, 1.35);
tick(b(HITS.cardLands), 0.11, 0.9);
sub(b(HITS.cardLands), 45, 0.3, 0.35);
shimmer(b(HITS.cardLands) + 0.1, [72, 79, 84], 0.05);

whoosh(b(HITS.searchIn) - 0.25, 0.7, 0.06, -0.3);
tick(b(HITS.filterSnap), 0.09, 1.2);
shimmer(b(HITS.filterSnap), [76, 83], 0.045);

whoosh(b(HITS.askIn) - 0.3, 0.8, 0.08, 0.3);
tick(b(HITS.answerStart), 0.075, 1.5);
shimmer(b(HITS.citations), [72, 76, 79, 84, 88], 0.055);

impact(b(HITS.graphBloom), 0.3);
whoosh(b(HITS.graphBloom) - 0.2, 0.9, 0.07, 0);

whoosh(b(HITS.digestIn) - 0.25, 0.7, 0.055, -0.25);

impact(b(HITS.endcard), 0.34);
whoosh(b(HITS.endcard) - 0.35, 0.9, 0.07, 0);

// ─────────────────────────────────────────────────────────── master chain

// Dotted-8th delay on the pluck bus — the detail that makes the arpeggio feel
// like it lives in a room instead of on a grid.
{
  const dt = Math.round(BEAT * 0.75 * SR);
  const fb = 0.34;
  const filt = lp(3400);
  for (let i = 0; i < N; i++) {
    const src = DELAY_SEND[i];
    if (i >= dt) {
      const echo = filt(DELAY_SEND[i - dt] * fb);
      DELAY_SEND[i] += echo;
      L[i] += echo * 0.75;
      R[i] += echo * 0.95;
      SEND[i] += echo * 0.3;
    }
    void src;
  }
}

// Freeverb-style tank: 8 damped combs in parallel → 4 allpasses in series.
{
  const combTun = [1116, 1188, 1277, 1356, 1422, 1491, 1557, 1617];
  const apTun = [556, 441, 341, 225];
  const room = 0.84;
  const damp = 0.28;
  const spread = 23;

  const makeChannel = (offset) => {
    const combs = combTun.map((t) => ({
      buf: new Float64Array(t + offset),
      i: 0,
      z: 0,
    }));
    const aps = apTun.map((t) => ({ buf: new Float64Array(t + offset), i: 0 }));
    return (x) => {
      let out = 0;
      for (const c of combs) {
        const y = c.buf[c.i];
        c.z = y * (1 - damp) + c.z * damp;
        c.buf[c.i] = x + c.z * room;
        c.i = (c.i + 1) % c.buf.length;
        out += y;
      }
      out /= combs.length;
      for (const a of aps) {
        const y = a.buf[a.i];
        const v = out + y * 0.5;
        a.buf[a.i] = v;
        a.i = (a.i + 1) % a.buf.length;
        out = y - out;
      }
      return out;
    };
  };

  const chL = makeChannel(0);
  const chR = makeChannel(spread);
  const preL = lp(7200);
  const preR = lp(7200);
  const wet = 0.5;
  for (let i = 0; i < N; i++) {
    const x = SEND[i] * 0.8;
    L[i] += preL(chL(x)) * wet;
    R[i] += preR(chR(x)) * wet;
  }
}

// Glue: soft saturation, a gentle overall trim, film-style fades.
{
  const fadeIn = 0.4 * SR;
  const fadeOut = 2.2 * SR;
  let peak = 0;
  for (let i = 0; i < N; i++) {
    let l = Math.tanh(L[i] * 0.9) * 0.94;
    let r = Math.tanh(R[i] * 0.9) * 0.94;
    if (i < fadeIn) {
      const g = i / fadeIn;
      l *= g;
      r *= g;
    }
    const tail = N - i;
    if (tail < fadeOut) {
      const g = Math.pow(tail / fadeOut, 1.5);
      l *= g;
      r *= g;
    }
    L[i] = l;
    R[i] = r;
    peak = Math.max(peak, Math.abs(l), Math.abs(r));
  }
  // Normalize to a comfortable bed level — the film is narrated by pictures and
  // subtitles, so the music must never be the loudest thing in the room.
  const target = 0.82;
  const g = peak > 0 ? target / peak : 1;
  for (let i = 0; i < N; i++) {
    L[i] *= g;
    R[i] *= g;
  }
  console.log(`peak before normalize: ${peak.toFixed(3)} → gain ${g.toFixed(3)}`);
}

// ─────────────────────────────────────────────────────────── write WAV

const here = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(here, '..', 'public', 'score.wav');
fs.mkdirSync(path.dirname(outPath), { recursive: true });

const bytes = N * 2 * 2;
const buf = Buffer.alloc(44 + bytes);
buf.write('RIFF', 0);
buf.writeUInt32LE(36 + bytes, 4);
buf.write('WAVE', 8);
buf.write('fmt ', 12);
buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20); // PCM
buf.writeUInt16LE(2, 22); // stereo
buf.writeUInt32LE(SR, 24);
buf.writeUInt32LE(SR * 4, 28);
buf.writeUInt16LE(4, 32);
buf.writeUInt16LE(16, 34);
buf.write('data', 36);
buf.writeUInt32LE(bytes, 40);
for (let i = 0; i < N; i++) {
  const l = Math.max(-1, Math.min(1, L[i]));
  const r = Math.max(-1, Math.min(1, R[i]));
  buf.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
  buf.writeInt16LE(Math.round(r * 32767), 44 + i * 4 + 2);
}
fs.writeFileSync(outPath, buf);
console.log(`wrote ${outPath} — ${(bytes / 1e6).toFixed(1)}MB, ${OUT_SEC.toFixed(1)}s @ ${SR}Hz`);
