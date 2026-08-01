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
import { BAR, BEAT, TOTAL_SEC, TOTAL_BARS, SCENES, HITS, RISERS, SAVES } from '../timeline.mjs';

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
  // opened up from 1500+900 — the darker pad was half of the "gloomy" reading
  const filt = lp(1900 + level * 1300);
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

/**
 * Pulse — the engine of the track.
 *
 * A detuned band-limited saw through a falling lowpass, fast attack, short
 * decay. It replaces the Karplus-Strong pluck that used to carry the rhythm:
 * a plucked STRING playing chord-tone-only arpeggios into a long reverb is,
 * acoustically, a koto — which is exactly why an earlier cut got described as
 * sounding Chinese. The fix was never EQ or level; it was the instrument and
 * the note choice.
 */
const pulse = (startSec, midi, level = 0.14, panPos = 0, decay = 0.34) => {
  const f = mtof(midi);
  const det = [0, -0.08, 0.09];
  const filt = lp(3300);
  const HARM = 9;
  render(
    startSec,
    decay + 0.3,
    (t) => {
      const e = Math.exp(-t * (3.4 / decay));
      if (e < 1e-4) return 0;
      // brightness falls with the envelope — a filter sweep without a filter
      const open = 0.35 + 0.65 * e;
      let v = 0;
      for (const d of det) {
        const ff = f * Math.pow(2, d / 12);
        for (let h = 1; h <= HARM; h++) {
          const amp = (1 / h) * Math.max(0, 1 - (h - 1) / (HARM * open));
          if (amp <= 0) continue;
          v += Math.sin(2 * Math.PI * ff * h * t) * amp;
        }
      }
      return filt(v / (det.length * 2.2)) * e * level;
    },
    // a SHORT send: long reverb on the rhythmic voice is the other half of the
    // folk-instrument sound
    { pan: panPos, send: 0.12, delay: 0.22 },
  );
};

/**
 * Keys — a two-operator FM electric piano (sine carrier, sine modulator at 2:1
 * with a decaying index). Carries the melody. Modern, warm, and unmistakably a
 * keyboard rather than a plucked string.
 */
const keys = (startSec, midi, level = 0.16, panPos = 0, decay = 1.6) => {
  const f = mtof(midi);
  render(
    startSec,
    decay + 0.6,
    (t) => {
      const e = Math.exp(-t * (2.6 / decay));
      if (e < 1e-4) return 0;
      const index = 2.4 * Math.exp(-t * 6); // bell-like attack, mellow tail
      const mod = Math.sin(2 * Math.PI * f * 2 * t) * index;
      return (Math.sin(2 * Math.PI * f * t + mod) + 0.2 * Math.sin(2 * Math.PI * f * t)) * e * level;
    },
    { pan: panPos, send: 0.3, delay: 0.16 },
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

/** Hat — noise through a highpass, very short. Sits at the edge of audible.
 *  `open` lets it ring a little — the off-beat open hat is the upbeat engine. */
const hat = (startSec, level = 0.05, panPos = 0.15, open = false) => {
  const h = hp(6500);
  render(
    startSec,
    open ? 0.22 : 0.09,
    (t) => h(rnd()) * Math.exp(-t * (open ? 34 : 90)) * level,
    { pan: panPos, send: open ? 0.24 : 0.18 },
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

/** Shaker — the quietest thing in the mix, and the reason it moves. */
const shaker = (startSec, level = 0.03, panPos = 0.3) => {
  const h = hp(4200);
  const l = lp(11000);
  render(
    startSec,
    0.07,
    (t) => l(h(rnd())) * Math.exp(-t * 120) * level,
    { pan: panPos, send: 0.14 },
  );
};

/** Clap — three tight noise bursts, the backbeat that stops this being ambient. */
const clap = (startSec, level = 0.13) => {
  const h = hp(1100);
  const l = lp(5200);
  render(
    startSec,
    0.28,
    (t) => {
      const bursts = Math.exp(-t * 420) + Math.exp(-Math.max(0, t - 0.009) * 380) + Math.exp(-Math.max(0, t - 0.019) * 300);
      const tail = Math.exp(-t * 22) * 0.5;
      return l(h(rnd())) * (bursts * 0.5 + tail) * level;
    },
    { pan: 0.12, send: 0.42 },
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
  const wet = 0.42;
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
  const target = 0.86;
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
