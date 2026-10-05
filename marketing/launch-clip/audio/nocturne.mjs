/**
 * NOCTURNE: the score engine for the night look (2026-10-05). Every Machina
 * video's music is rendered by this one file, from a cue sheet in that
 * video's score script (audio/<…>-score.mjs), so the nine films sound like one
 * studio and one story: lost in the dark, then the light comes on.
 *
 * Harmony. One pitch set for everything, the A-flat major scale, heard from
 * two centres: F minor (aeolian) while the saves are lost, D-flat lydian once
 * Machina arrives. Same notes, opposite moods: the turn is a change of where
 * home is, not a key change, so it lifts without a lurch. The lydian G natural
 * is the colour of "wonder"; the film ends resolved on D-flat.
 *
 *   dark   Fm9 ↔ D♭maj9, a felt-piano sigh, a heartbeat sub, air
 *   turn   reverse swell into a boom, one beat of silence, then D♭maj9 in light
 *   drive  D♭maj9 · E♭/D♭ · Fm7 · B♭m9 (I · II · iii · vi), a filtered pulse
 *          bass, 16th glass arps, a half-time kick and a backbeat on 3
 *   peak   the same, wider: G♭maj7♯11 · A♭add9 · D♭maj9 · E♭/D♭, octave arps
 *   end    the beat stops a beat early; a riser lands the strike: boom, the
 *          tonic held, a rising glint, the felt motif resolving home
 *
 * Instruments (no samples, no dependencies, deterministic: one seeded LCG):
 * PolyBLEP saw/pulse oscillators, a TPT state-variable filter, a 7-voice
 * supersaw pad, an additive felt piano with inharmonic partials and a hammer
 * thump, an FM glint bell, a filtered pulse bass and sub, and a drum kit made
 * of tuned sines and shaped noise. Sends: an 8-line feedback-delay-network
 * reverb (modulated, damped, 25ms pre-delay) and a ping-pong dotted-8th delay.
 * Master: kick sidechain on the pads and bass, a stereo-linked glue
 * compressor, a gentle tanh. Loudness is set later, with the voice, by
 * audio/mix-vo.mjs (−14 LUFS, true peak ≤ −1 dBTP).
 *
 * The score breathes with the narrator: `voice` (the spans of every spoken
 * line, from out/vo/<script>/manifest.json) keeps melodic notes from starting
 * on a word; pads, bass and pulse carry on under it.
 */

import fs from 'node:fs';
import path from 'node:path';

export const SR = 44100;
const TAU = Math.PI * 2;
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const dbToGain = (db) => Math.pow(10, db / 20);

// ─────────────────────────────────────────────────────────────── harmony

/** Pad voicings (MIDI), bass root (MIDI) and arp tones per chord. */
export const CHORDS = {
  Fm9: { bass: 41, pad: [56, 60, 63, 67], arp: [65, 68, 72, 75, 79] },
  Dbmaj9: { bass: 37, pad: [53, 56, 60, 63], arp: [61, 65, 68, 72, 75] },
  'Eb/Db': { bass: 37, pad: [55, 58, 63, 65], arp: [63, 67, 70, 74, 75] },
  Fm7: { bass: 41, pad: [56, 60, 63, 65], arp: [65, 68, 72, 75, 77] },
  Bbm9: { bass: 34, pad: [56, 60, 61, 65], arp: [61, 65, 68, 72, 73] },
  'Gbmaj7#11': { bass: 30, pad: [58, 61, 65, 72], arp: [66, 70, 73, 77, 72] },
  Abadd9: { bass: 32, pad: [56, 60, 63, 70], arp: [63, 68, 70, 72, 75] },
  Cm7: { bass: 36, pad: [55, 58, 63, 67], arp: [63, 67, 70, 72, 74] },
};

const LOOPS = {
  dark: ['Fm9', 'Dbmaj9'],
  drive: ['Dbmaj9', 'Eb/Db', 'Fm7', 'Bbm9'],
  peak: ['Gbmaj7#11', 'Abadd9', 'Dbmaj9', 'Eb/Db'],
};

/** The felt-piano motifs (scale degrees as MIDI, beats from the bar start). */
const MOTIF = {
  // a falling sigh across two bars, then its answer
  dark: [
    [[0, 72], [1.5, 68], [2, 67], [3, 65]],
    [[0.5, 75], [1.5, 72], [2.5, 70], [3, 68]],
  ],
  // the brand figure in light: rising, then settling on the colour tone
  drive: [
    [[0, 77], [1, 75], [1.5, 73], [2.5, 68]],
    [[0, 79], [1, 77], [1.5, 75], [2.5, 72]],
  ],
  // home: up to the ninth, down to the root
  end: [[0, 68], [0.5, 72], [1, 75], [2, 73]],
};

// ─────────────────────────────────────────────────────────────── the engine

/** the house mix: each instrument's gain, set by measurement (see analyze) */
export const DEFAULT_GAINS = {
  // measured solo per section (out/score-test, 2026-10-05) and set so that in
  // the drive section the sub sits ~4dB under the pads, the kick ~3dB over
  // them, and the arp, hats and clap read as the top end rather than garnish
  halo: 1.7, air: 3.2, felt: 1.15, glint: 1.8, spark: 4.6, engine: 1.0, sub: 0.38, kick: 0.7, boom: 0.6,
  clap: 3.4, hat: 6.0, tick: 4.0, riser: 2.2, swell: 2.5, whoosh: 3.0, heart: 1.15,
};

export function createScore({ seconds, bpm, seed = 0x51ce7, gains = {} }) {
  const G = (name) => (gains[name] ?? 1) * (DEFAULT_GAINS[name] ?? 1);
  const N = Math.ceil(seconds * SR) + SR * 4; // + a tail for the reverb
  const beat = 60 / bpm;
  const bus = () => ({ L: new Float32Array(N), R: new Float32Array(N) });
  const DRY = bus(); // everything that is not sidechained
  const PUMP = bus(); // pads + bass: ducked by the kick
  const REV = new Float32Array(N); // mono reverb send
  const DLY = new Float32Array(N); // mono delay send
  const KICK_ENV = new Float32Array(N); // sidechain key

  let s = seed >>> 0;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
  const noise = () => rnd() * 2 - 1;

  const idx = (sec) => Math.round(sec * SR);
  const panGains = (pan) => [Math.cos(((pan + 1) * Math.PI) / 4), Math.sin(((pan + 1) * Math.PI) / 4)];

  /** write a generator into a bus: gen(t, i) → mono sample */
  const write = (target, start, dur, gen, { pan = 0, rev = 0.2, dly = 0 } = {}) => {
    const i0 = idx(start);
    const n = Math.ceil(dur * SR);
    const [gl, gr] = panGains(pan);
    for (let i = 0; i < n; i++) {
      const j = i0 + i;
      if (j < 0) continue;
      if (j >= N) break;
      const v = gen(i / SR, i);
      if (v === 0 || !Number.isFinite(v)) continue;
      target.L[j] += v * gl;
      target.R[j] += v * gr;
      if (rev) REV[j] += v * rev;
      if (dly) DLY[j] += v * dly;
    }
  };

  // ── building blocks
  const polyblep = (t, dt) => {
    if (t < dt) {
      t /= dt;
      return t + t - t * t - 1;
    }
    if (t > 1 - dt) {
      t = (t - 1) / dt;
      return t * t + t + t + 1;
    }
    return 0;
  };
  /** band-limited saw, phase-accumulating */
  const saw = (freq, phase0 = rnd()) => {
    let ph = phase0;
    return (fmul = 1) => {
      const dt = (freq * fmul) / SR;
      const v = 2 * ph - 1 - polyblep(ph, dt);
      ph += dt;
      if (ph >= 1) ph -= 1;
      return v;
    };
  };
  /** band-limited pulse (width w) */
  const pulse = (freq, w = 0.5, phase0 = rnd()) => {
    let ph = phase0;
    return (fmul = 1) => {
      const dt = (freq * fmul) / SR;
      let v = ph < w ? 1 : -1;
      v += polyblep(ph, dt);
      let p2 = ph - w;
      if (p2 < 0) p2 += 1;
      v -= polyblep(p2, dt);
      ph += dt;
      if (ph >= 1) ph -= 1;
      return v;
    };
  };
  /** TPT state-variable filter; set(fc, q) every block, run(x) → {lp, bp, hp} */
  const svf = () => {
    let ic1 = 0;
    let ic2 = 0;
    let a1 = 0;
    let a2 = 0;
    let a3 = 0;
    let k = 1;
    const out = { lp: 0, bp: 0, hp: 0 };
    return {
      set(fc, q = 0.707) {
        const f = Math.min(fc, SR * 0.45);
        const g = Math.tan((Math.PI * f) / SR);
        k = 1 / q;
        a1 = 1 / (1 + g * (g + k));
        a2 = g * a1;
        a3 = g * a2;
      },
      run(x) {
        const v3 = x - ic2;
        const v1 = a1 * ic1 + a2 * v3;
        const v2 = ic2 + a2 * ic1 + a3 * v3;
        ic1 = 2 * v1 - ic1;
        ic2 = 2 * v2 - ic2;
        out.lp = v2;
        out.bp = v1;
        out.hp = x - k * v1 - v2;
        return out;
      },
    };
  };
  const onePole = (fc) => {
    const a = 1 - Math.exp((-TAU * fc) / SR);
    let z = 0;
    return (x) => (z += a * (x - z));
  };
  /** attack/decay/sustain/release, curved */
  const adsr = (t, dur, a, d, sus, r) => {
    if (t < 0) return 0;
    if (t < a) {
      const x = t / a;
      return x * x * (3 - 2 * x);
    }
    if (t < a + d) return 1 + (sus - 1) * (1 - Math.pow(1 - (t - a) / d, 2));
    if (t < dur) return sus;
    const rt = t - dur;
    if (rt >= r) return 0;
    return sus * Math.pow(1 - rt / r, 2);
  };

  // ────────────────────────────────────────────────────────── instruments

  /** HALO: a 7-saw supersaw chord voice, opened by a slow filter swell. */
  const halo = (start, dur, midi, { level = 0.05, bright = 0.5, attack = 1.2, release = 2.6, pan = 0, swell = 1 } = {}) => {
    level *= G('halo');
    const f = mtof(midi);
    const det = [0, -0.11, 0.1, -0.21, 0.19, -0.31, 0.3]; // semitones/10: ±31 cents at the edges
    const oscs = det.map((d) => saw(f * Math.pow(2, d / 12)));
    const spread = det.map((_, k) => (k === 0 ? 0 : (k % 2 ? -1 : 1) * (0.25 + 0.1 * k)));
    const fL = svf();
    const fR = svf();
    const sub = saw(f / 2);
    const len = dur + release;
    const i0 = idx(start);
    const n = Math.ceil(len * SR);
    for (let i = 0; i < n; i++) {
      const j = i0 + i;
      if (j < 0) continue;
      if (j >= N) break;
      const t = i / SR;
      const e = adsr(t, dur, attack, 0.6, 0.9, release);
      if (e <= 0 && t > attack) continue;
      if ((i & 31) === 0) {
        // the swell: the filter opens with the envelope, a slow breath on top
        const open = Math.min(1, t / (attack * 1.6 + 0.001)) * swell;
        const fc = 420 + (1200 + 4200 * bright) * open * (0.92 + 0.08 * Math.sin(TAU * 0.13 * t));
        fL.set(fc, 0.8);
        fR.set(fc * 1.04, 0.8);
      }
      let l = 0;
      let r = 0;
      for (let k = 0; k < oscs.length; k++) {
        const v = oscs[k]();
        const p = spread[k];
        l += v * (1 - p) * 0.5;
        r += v * (1 + p) * 0.5;
      }
      const sv = sub() * 0.15;
      l = fL.run(l / 3.2 + sv).lp;
      r = fR.run(r / 3.2 + sv).lp;
      const g = e * level;
      const [gl, gr] = panGains(pan);
      PUMP.L[j] += l * g * gl * 1.41;
      PUMP.R[j] += r * g * gr * 1.41;
      REV[j] += (l + r) * g * 0.32;
    }
  };

  /** AIR: a high, quiet sine-and-triangle shimmer (the light coming on). */
  const air = (start, dur, midi, { level = 0.012, pan = 0 } = {}) => {
    level *= G('air');
    const f = mtof(midi);
    const ph = rnd() * TAU;
    write(
      DRY,
      start,
      dur + 3,
      (t) => {
        const e = adsr(t, dur, 1.8, 0.5, 0.85, 3);
        if (!e) return 0;
        const trem = 0.82 + 0.18 * Math.sin(TAU * 0.9 * t + ph);
        return (Math.sin(TAU * f * t + ph) * 0.7 + Math.sin(TAU * f * 2.0 * t) * 0.18 + Math.sin(TAU * f * 3.0 * t + 1) * 0.06) * e * trem * level;
      },
      { pan, rev: 0.7 },
    );
  };

  /** FELT: an additive felt piano, two slightly detuned strings, a hammer thump. */
  const felt = (start, midi, { level = 0.08, len = 3.2, pan = 0, bright = 0.5 } = {}) => {
    level *= G('felt');
    const f0 = mtof(midi);
    const B = 0.00035; // inharmonicity
    const parts = [];
    for (let k = 1; k <= 9; k++) {
      const fk = f0 * k * Math.sqrt(1 + B * k * k);
      if (fk > 9000) break;
      const amp = Math.pow(k, -1.35) * (k === 1 ? 1 : 0.85) * (1 - 0.06 * k * (1 - bright));
      const decay = 0.9 + 2.6 / (1 + 0.55 * (k - 1)) * (midi < 60 ? 1.3 : 1); // higher partials die sooner
      parts.push({ fk, amp, decay, ph: rnd() * TAU, det: 1 + (rnd() - 0.5) * 0.0012 });
    }
    const thump = onePole(900);
    const lp = onePole(2400 + bright * 2500);
    write(
      DRY,
      start,
      len + 0.5,
      (t) => {
        const att = Math.min(1, t / 0.006);
        const rel = t > len ? Math.max(0, 1 - (t - len) / 0.5) : 1;
        let v = 0;
        for (const p of parts) {
          const env = Math.exp(-t / p.decay);
          v += p.amp * env * (Math.sin(TAU * p.fk * t + p.ph) + 0.6 * Math.sin(TAU * p.fk * p.det * t + p.ph * 1.3));
        }
        const h = t < 0.03 ? thump(noise()) * (1 - t / 0.03) * 0.35 : 0;
        return lp(v * 0.55 + h) * att * rel * level;
      },
      { pan, rev: 0.38, dly: 0.08 },
    );
  };

  /** GLINT: an FM bell, quiet, for light catching an edge. */
  const glint = (start, midi, { level = 0.03, pan = 0, len = 2.2 } = {}) => {
    level *= G('glint');
    const f = mtof(midi);
    write(
      DRY,
      start,
      len,
      (t) => {
        const env = Math.exp(-t / (len * 0.32)) * Math.min(1, t / 0.002);
        const idxm = 2.2 * Math.exp(-t / 0.25);
        return Math.sin(TAU * f * t + idxm * Math.sin(TAU * f * 3.5 * t)) * env * level;
      },
      { pan, rev: 0.55, dly: 0.25 },
    );
  };

  /** SPARK: the arp pluck, a filtered pulse with a fast filter envelope. */
  const spark = (start, midi, { level = 0.03, pan = 0, len = 0.22, bright = 0.6 } = {}) => {
    level *= G('spark');
    const osc = pulse(mtof(midi), 0.32);
    const osc2 = saw(mtof(midi) * 1.003);
    const f = svf();
    write(
      DRY,
      start,
      len + 0.12,
      (t, i) => {
        if ((i & 15) === 0) f.set(500 + (2200 + 3500 * bright) * Math.exp(-t / 0.07), 1.1);
        const e = t < 0.003 ? t / 0.003 : Math.exp(-(t - 0.003) / (len * 0.42));
        return f.run(osc() * 0.6 + osc2() * 0.4).lp * e * level;
      },
      { pan, rev: 0.22, dly: 0.32 },
    );
  };

  /** ENGINE: the pulse bass, a saw + square through a plucked filter. */
  const engine = (start, midi, { level = 0.09, len = 0.24, bright = 0.55 } = {}) => {
    level *= G('engine');
    const a = saw(mtof(midi));
    const b = pulse(mtof(midi) * 0.999, 0.5);
    const f = svf();
    const i0 = idx(start);
    const n = Math.ceil((len + 0.08) * SR);
    for (let i = 0; i < n; i++) {
      const j = i0 + i;
      if (j < 0) continue;
      if (j >= N) break;
      const t = i / SR;
      if ((i & 15) === 0) f.set(140 + (500 + 900 * bright) * Math.exp(-t / 0.09), 1.4);
      const e = t < 0.004 ? t / 0.004 : t < len ? 1 - 0.35 * (t / len) : Math.max(0, 0.65 * (1 - (t - len) / 0.08));
      const v = f.run(a() * 0.55 + b() * 0.45).lp * e * level;
      PUMP.L[j] += v;
      PUMP.R[j] += v;
    }
  };

  /** SUB: a sine root, held, softly saturated. */
  const subBass = (start, dur, midi, { level = 0.12 } = {}) => {
    level *= G('sub');
    const f = mtof(midi);
    const i0 = idx(start);
    const n = Math.ceil((dur + 0.4) * SR);
    for (let i = 0; i < n; i++) {
      const j = i0 + i;
      if (j < 0) continue;
      if (j >= N) break;
      const t = i / SR;
      const e = adsr(t, dur, 0.06, 0.3, 0.85, 0.4);
      const v = Math.tanh(1.3 * Math.sin(TAU * f * t)) * e * level;
      PUMP.L[j] += v;
      PUMP.R[j] += v;
    }
  };

  // ── drums
  const kick = (start, { level = 0.5, len = 0.42, punch = 1 } = {}) => {
    level *= G('kick');
    let ph = 0;
    const click = onePole(3000);
    const i0 = idx(start);
    const n = Math.ceil(len * SR);
    for (let i = 0; i < n; i++) {
      const j = i0 + i;
      if (j < 0) continue;
      if (j >= N) break;
      const t = i / SR;
      const f = 46 + 120 * Math.exp(-t / 0.035) * punch;
      ph += (TAU * f) / SR;
      const e = Math.exp(-t / (len * 0.36));
      const v = (Math.sin(ph) * e + (t < 0.004 ? click(noise()) * 0.6 * (1 - t / 0.004) : 0)) * level;
      DRY.L[j] += v;
      DRY.R[j] += v;
      KICK_ENV[j] = Math.max(KICK_ENV[j], Math.exp(-t / 0.11));
    }
  };

  /** BOOM: the cinematic hit, a falling sine, a noise bloom, a long tail. */
  const boom = (start, { level = 0.55, len = 3.2 } = {}) => {
    level *= G('boom');
    let ph = 0;
    const lpN = onePole(420);
    const i0 = idx(start);
    const n = Math.ceil(len * SR);
    for (let i = 0; i < n; i++) {
      const j = i0 + i;
      if (j < 0) continue;
      if (j >= N) break;
      const t = i / SR;
      const f = 33 + 52 * Math.exp(-t / 0.22);
      ph += (TAU * f) / SR;
      const e = Math.exp(-t / (len * 0.3));
      const body = Math.tanh(1.6 * Math.sin(ph)) * e;
      const bloom = lpN(noise()) * Math.exp(-t / 0.35) * 0.9;
      const v = (body + bloom) * level;
      DRY.L[j] += v;
      DRY.R[j] += v;
      REV[j] += v * 0.35;
      KICK_ENV[j] = Math.max(KICK_ENV[j], Math.exp(-t / 0.5));
    }
  };

  const clap = (start, { level = 0.16, pan = 0 } = {}) => {
    level *= G('clap');
    const f = svf();
    f.set(1500, 0.9);
    const tone = 190;
    write(
      DRY,
      start,
      0.35,
      (t) => {
        // three flams then the body
        const fl = [0, 0.011, 0.023].reduce((a, d) => a + (t >= d ? Math.exp(-(t - d) / 0.006) : 0), 0);
        const body = Math.exp(-t / 0.09);
        const n = f.run(noise()).bp;
        return (n * (fl * 0.5 + body) + Math.sin(TAU * tone * t) * Math.exp(-t / 0.04) * 0.3) * level;
      },
      { pan, rev: 0.45 },
    );
  };

  const hat = (start, { level = 0.03, open = false, pan = 0.25 } = {}) => {
    level *= G('hat');
    const f = svf();
    f.set(9000, 0.7);
    const len = open ? 0.24 : 0.05;
    write(
      DRY,
      start,
      len,
      (t) => f.run(noise()).hp * Math.exp(-t / (len * 0.35)) * level,
      { pan, rev: 0.1 },
    );
  };

  /** TICK: a glass tap, for a finger landing. */
  const tick = (start, { level = 0.05, pan = 0 } = {}) => {
    level *= G('tick');
    write(
      DRY,
      start,
      0.12,
      (t) => (Math.sin(TAU * 2350 * t) * 0.6 + Math.sin(TAU * 4790 * t) * 0.3) * Math.exp(-t / 0.018) * level,
      { pan, rev: 0.25, dly: 0.05 },
    );
  };

  /** RISER: filtered noise sweeping up plus a gliding tone, ending ON `end`. */
  const riser = (end, len, { level = 0.07, tone = 0.4 } = {}) => {
    level *= G('riser');
    const f = svf();
    let ph = 0;
    write(
      DRY,
      end - len,
      len,
      (t, i) => {
        const x = t / len;
        if ((i & 31) === 0) f.set(250 + 7000 * x * x, 2.2);
        const tail = Math.min(1, (len - t) / 0.012);
        const e = Math.pow(x, 2.2) * tail;
        ph += (TAU * (180 + 520 * x * x)) / SR;
        return (f.run(noise()).bp * 1.2 + Math.sin(ph) * tone * 0.25) * e * level;
      },
      { rev: 0.4 },
    );
  };

  /** SWELL: a reversed-envelope chord, rushing into `end`. */
  const swell = (end, len, chord, { level = 0.03 } = {}) => {
    level *= G('swell');
    const notes = CHORDS[chord].pad;
    for (const m of notes) {
      const o = saw(mtof(m + 12));
      const f = svf();
      write(
        DRY,
        end - len,
        len,
        (t, i) => {
          const x = t / len;
          if ((i & 31) === 0) f.set(300 + 5000 * x * x, 0.9);
          return f.run(o()).lp * Math.pow(x, 3) * Math.min(1, (len - t) / 0.012) * level;
        },
        { rev: 0.5, pan: (m % 5) / 5 - 0.4 },
      );
    }
  };

  /** WHOOSH: air past the lens, for a camera dive or a throw. */
  const whoosh = (center, { level = 0.06, len = 0.55, dir = 1 } = {}) => {
    level *= G('whoosh');
    const f = svf();
    const start = center - len * 0.6;
    const i0 = idx(start);
    const n = Math.ceil(len * SR);
    for (let i = 0; i < n; i++) {
      const j = i0 + i;
      if (j < 0) continue;
      if (j >= N) break;
      const x = i / n;
      if ((i & 31) === 0) f.set(400 + 3600 * Math.sin(Math.PI * x), 1.6);
      const e = Math.sin(Math.PI * Math.min(1, x * 1.15)) ** 2;
      const v = f.run(noise()).bp * e * level;
      const p = dir * (x * 2 - 1) * 0.8;
      DRY.L[j] += v * (1 - p) * 0.7;
      DRY.R[j] += v * (1 + p) * 0.7;
      REV[j] += v * 0.2;
    }
  };

  /** HEART: a soft double sub thump (the problem's pulse). */
  const heart = (start, { level = 0.16 } = {}) => {
    level *= G('heart');
    for (const [d, a] of [
      [0, 1],
      [0.26, 0.6],
    ]) {
      let ph = 0;
      write(
        PUMP,
        start + d,
        0.5,
        (t) => {
          ph += (TAU * (44 + 30 * Math.exp(-t / 0.05))) / SR;
          return Math.sin(ph) * Math.exp(-t / 0.13) * a * level;
        },
        { rev: 0 },
      );
    }
  };

  // ──────────────────────────────────────────────────────────── master

  /** FDN reverb on the send: 8 modulated, damped lines, ~3.4s */
  const reverb = (input, { t60 = 3.4, damp = 5200, predelay = 0.025, mix = 1 } = {}) => {
    const lens = [1433, 1601, 1867, 2053, 2251, 2399, 2617, 2797];
    const M = lens.length;
    const bufs = lens.map((l) => new Float32Array(l + 64));
    const pos = new Array(M).fill(0);
    const g = lens.map((l) => Math.pow(10, (-3 * l) / (t60 * SR)));
    const dampA = 1 - Math.exp((-TAU * damp) / SR);
    const dz = new Float64Array(M);
    const pre = Math.round(predelay * SR);
    const outL = new Float32Array(N);
    const outR = new Float32Array(N);
    const x = new Float64Array(M);
    const inLp = onePole(7000);
    const inHp = (() => {
      const l = onePole(140);
      return (v) => v - l(v);
    })();
    for (let i = 0; i < N; i++) {
      const inp = i >= pre ? inHp(inLp(input[i - pre])) : 0;
      // read (with a slow wobble on two lines so the tail never rings metallic)
      for (let k = 0; k < M; k++) {
        const L = lens[k];
        let d = L;
        if (k === 2 || k === 5) d = L - 6 - 5 * Math.sin((TAU * (0.31 + k * 0.07) * i) / SR);
        const rp = pos[k] - d;
        const r0 = Math.floor(rp);
        const fr = rp - r0;
        const sz = bufs[k].length;
        const a = bufs[k][((r0 % sz) + sz) % sz];
        const b = bufs[k][(((r0 + 1) % sz) + sz) % sz];
        let v = a + (b - a) * fr;
        dz[k] += dampA * (v - dz[k]);
        x[k] = dz[k] * g[k];
      }
      // Householder feedback
      let sum = 0;
      for (let k = 0; k < M; k++) sum += x[k];
      sum *= 2 / M;
      let l = 0;
      let r = 0;
      for (let k = 0; k < M; k++) {
        const fb = x[k] - sum;
        const sz = bufs[k].length;
        bufs[k][pos[k] % sz] = fb + inp * (k % 2 ? -0.35 : 0.35);
        pos[k]++;
        if (k % 2) r += x[k] * (k & 2 ? -1 : 1);
        else l += x[k] * (k & 2 ? -1 : 1);
      }
      outL[i] = l * 0.5 * mix;
      outR[i] = r * 0.5 * mix;
    }
    return { L: outL, R: outR };
  };

  /** ping-pong delay, dotted 8th, darkened repeats */
  const delay = (input, { time = beat * 0.75, fb = 0.38 } = {}) => {
    const D = Math.round(time * SR);
    const bL = new Float32Array(D);
    const bR = new Float32Array(D);
    const outL = new Float32Array(N);
    const outR = new Float32Array(N);
    const lpL = onePole(3800);
    const lpR = onePole(3800);
    let p = 0;
    for (let i = 0; i < N; i++) {
      const dl = bL[p];
      const dr = bR[p];
      bL[p] = input[i] + lpR(dr) * fb;
      bR[p] = lpL(dl) * fb;
      outL[i] = dl;
      outR[i] = dr;
      p = (p + 1) % D;
    }
    return { L: outL, R: outR };
  };

  const master = ({ sidechain = 0.32, reverbMix = 0.9, glue = true } = {}) => {
    // the delay's repeats go into the reverb too, so they bloom rather than echo
    const d = delay(DLY);
    for (let i = 0; i < N; i++) REV[i] += (d.L[i] + d.R[i]) * 0.25;
    const rv = reverb(REV, { mix: reverbMix });
    const outL = new Float32Array(N);
    const outR = new Float32Array(N);
    // sidechain: the pads and bass breathe with the kick
    let env = 0;
    for (let i = 0; i < N; i++) {
      const k = KICK_ENV[i];
      env = k > env ? k : env + (k - env) * 0.0009;
      const duck = 1 - sidechain * env;
      outL[i] = DRY.L[i] + PUMP.L[i] * duck + rv.L[i] + d.L[i] * 0.55;
      outR[i] = DRY.R[i] + PUMP.R[i] * duck + rv.R[i] + d.R[i] * 0.55;
    }
    // DC and rumble out (the saturated sub and the boom are not symmetric)
    {
      const a = Math.exp((-TAU * 22) / SR);
      let xl = 0, yl = 0, xr = 0, yr = 0;
      for (let i = 0; i < N; i++) {
        const l = outL[i];
        const r = outR[i];
        yl = a * (yl + l - xl);
        xl = l;
        yr = a * (yr + r - xr);
        xr = r;
        outL[i] = yl;
        outR[i] = yr;
      }
    }
    // glue: stereo-linked RMS compressor, −20 dBFS threshold, 2:1, 30/250ms
    if (glue) {
      let ms = 0;
      const at = 1 - Math.exp(-1 / (0.03 * SR));
      const rt = 1 - Math.exp(-1 / (0.25 * SR));
      let gs = 1;
      const th = dbToGain(-20);
      for (let i = 0; i < N; i++) {
        const p = 0.5 * (outL[i] * outL[i] + outR[i] * outR[i]);
        ms += (p - ms) * (p > ms ? at : rt);
        const rms = Math.sqrt(ms);
        const target = rms > th ? Math.pow(th / rms, 0.5) : 1;
        gs += (target - gs) * (target < gs ? at : rt);
        outL[i] = Math.tanh(outL[i] * gs * 1.4) / 1.4;
        outR[i] = Math.tanh(outR[i] * gs * 1.4) / 1.4;
      }
    }
    return { L: outL, R: outR };
  };

  return { N, beat, rnd, halo, air, felt, glint, spark, engine, subBass, kick, boom, clap, hat, tick, riser, swell, whoosh, heart, master };
}

// ─────────────────────────────────────────────────────────────── arranging

/**
 * Render a cue sheet.
 *
 *   sections: [{ from, kind }]   frames; kind ∈ dark | turn | drive | peak | end
 *                                 | still (pad only, no beat). Sorted; each runs
 *                                 to the next one's `from` (the last to `total`).
 *   hits: {
 *     ticks:   [frame]           a finger lands (glass tick)
 *     whooshes:[frame]           a dive / throw (air past the lens)
 *     booms:   [frame]           an impact (the mark's strike, a big reveal)
 *     glints:  [frame]           light catching (a lift, a chip, a phase)
 *     risers:  [frame]           a riser ends ON this frame
 *   }
 *   voice:   [[startSec, endSec]] spoken spans: melodic notes avoid starting in them
 *   fadeOut: seconds of fade at the very end (default 1.2)
 */
export function renderCues({ fps, bpm, total, sections, hits = {}, voice = [], fadeOut = 1.2, seed, gains, masterOpts }) {
  const seconds = total / fps;
  const S = createScore({ seconds, bpm, seed, gains });
  const beat = 60 / bpm;
  const bar = beat * 4;
  const sec = (f) => f / fps;
  const secs = sections
    .map((s, i) => ({ ...s, t0: sec(s.from), t1: sec(i + 1 < sections.length ? sections[i + 1].from : total) }))
    .filter((s) => s.t1 > s.t0 + 1e-6);
  const speaking = (t) => voice.some(([a, b]) => t > a - 0.06 && t < b + 0.04);
  const loopIdx = { dark: 0, drive: 0, peak: 0 };

  // a bar grid anchored on frame 0 (every timeline is cut on its beat grid)
  const barsIn = (t0, t1) => {
    const out = [];
    let b = Math.ceil(t0 / bar - 1e-6);
    // a section that starts mid-bar gets a partial first bar
    if (b * bar - t0 > 1e-3) out.push({ t: t0, len: b * bar - t0, partial: true });
    for (; b * bar < t1 - 1e-3; b++) out.push({ t: b * bar, len: Math.min(bar, t1 - b * bar), partial: false });
    return out;
  };

  for (const s of secs) {
    const kind = s.kind;
    if (kind === 'turn') {
      // the turn: light comes on. D♭maj9 in halo + air, a rising glint
      const len = s.t1 - s.t0;
      const c = CHORDS.Dbmaj9;
      for (const m of c.pad) S.halo(s.t0, len, m, { level: 0.05, bright: 0.85, attack: 0.25, pan: ((m % 7) - 3) / 6 });
      S.subBass(s.t0, len, c.bass, { level: 0.1 });
      S.air(s.t0 + 0.1, len, 80, { level: 0.012, pan: -0.3 });
      S.air(s.t0 + 0.3, len, 84, { level: 0.009, pan: 0.3 });
      [61, 65, 68, 72, 75, 79].forEach((m, k) => S.glint(s.t0 + 0.12 + k * beat * 0.25, m + 12, { level: 0.022, pan: -0.5 + k * 0.2 }));
      continue;
    }
    const bars = barsIn(s.t0, s.t1);
    for (const [bi, b] of bars.entries()) {
      // a drive section builds in: bar 0 harmony and engine, bar 1 adds the
      // kick and arp, full kit from bar 2 (a peak arrives full)
      const build = kind === 'drive' ? Math.min(2, bi) : 2;
      const loop = kind === 'end' ? null : LOOPS[kind === 'still' ? 'dark' : kind] ?? LOOPS.drive;
      let name;
      if (kind === 'end') name = 'Dbmaj9';
      else {
        name = loop[loopIdx[kind === 'still' ? 'dark' : kind] % loop.length];
        if (!b.partial) loopIdx[kind === 'still' ? 'dark' : kind]++;
      }
      const c = CHORDS[name];
      const dur = b.len;
      // ── harmony (every kind)
      const padLevel = { dark: 0.022, still: 0.026, drive: 0.04, peak: 0.046, end: 0.05 }[kind] ?? 0.04;
      const bright = { dark: 0.3, still: 0.35, drive: 0.6, peak: 0.85, end: 0.7 }[kind] ?? 0.55;
      c.pad.forEach((m, k) =>
        S.halo(b.t, dur, m, { level: padLevel, bright, attack: kind === 'dark' ? 1.6 : 0.5, release: kind === 'end' ? 6 : 2.2, pan: (k - 1.5) / 3 }),
      );
      S.subBass(b.t, dur, c.bass, { level: kind === 'dark' ? 0.06 : 0.1 });
      if (kind === 'peak' || kind === 'end' || kind === 'drive') S.air(b.t, dur, c.pad[3] + 24, { level: kind === 'drive' ? 0.006 : 0.008, pan: 0.2 });

      if (kind === 'dark' || kind === 'still') {
        // the heartbeat on 1 (dark only), the felt sigh over two bars
        if (kind === 'dark') S.heart(b.t, { level: 0.15 });
        const phrase = MOTIF.dark[Math.floor(b.t / bar) % 2];
        for (const [bt, m] of phrase) {
          const t = b.t + bt * beat;
          if (t >= b.t + dur - 0.05 || speaking(t)) continue;
          S.felt(t, m, { level: 0.07, pan: (m - 70) / 20, bright: 0.25, len: 3 });
        }
        // a thin hat ticking like a clock, only in dark
        if (kind === 'dark') for (let q = 0; q < 4; q++) if (b.t + q * beat < b.t + dur) S.hat(b.t + q * beat + beat * 0.5, { level: 0.012, pan: 0.4 });
        continue;
      }

      if (kind === 'drive' || kind === 'peak') {
        // half-time pulse: kick on 1 and the & of 2, backbeat clap on 3
        const kicks = [0, 1.5];
        if (kind === 'peak') kicks.push(2.75);
        if (build >= 1) for (const kb of kicks) if (kb * beat < dur - 0.02) S.kick(b.t + kb * beat, { level: kind === 'peak' ? 0.5 : 0.42 });
        if (build >= 2 && 2 * beat < dur - 0.02) S.clap(b.t + 2 * beat, { level: kind === 'peak' ? 0.17 : 0.13 });
        // 16th hats, accented on the off-beats
        for (let q = 0; q < 16 && build >= 2; q++) {
          const t = b.t + q * beat * 0.25;
          if (t >= b.t + dur - 0.01) break;
          const acc = q % 4 === 2 ? 1 : q % 2 ? 0.45 : 0.3;
          S.hat(t, { level: (kind === 'peak' ? 0.026 : 0.02) * acc, open: kind === 'peak' && q % 4 === 2, pan: q % 2 ? 0.3 : -0.2 });
        }
        // the engine: 8ths on the root, the octave on the & of 4
        for (let q = 0; q < 8; q++) {
          const t = b.t + q * beat * 0.5;
          if (t >= b.t + dur - 0.02) break;
          const m = c.bass + 12 + (q === 7 ? 12 : 0);
          S.engine(t, m, { level: kind === 'peak' ? 0.085 : 0.075, bright: kind === 'peak' ? 0.75 : 0.55 });
        }
        // the spark arp: 16ths through the chord, a figure that walks up and turns
        const figure = [0, 2, 1, 3, 2, 4, 3, 1, 0, 2, 1, 3, 4, 3, 2, 1];
        for (let q = 0; q < 16 && build >= 1; q++) {
          const t = b.t + q * beat * 0.25;
          if (t >= b.t + dur - 0.01) break;
          const m = c.arp[figure[q]];
          S.spark(t, m, { level: (kind === 'peak' ? 0.026 : 0.022) * (build === 1 ? 0.6 : 1), pan: q % 2 ? 0.45 : -0.45, bright: kind === 'peak' ? 0.75 : 0.55 });
          if (kind === 'peak' && q % 2 === 0) S.spark(t, m + 12, { level: 0.01, pan: q % 4 ? 0.7 : -0.7, bright: 0.8 });
        }
        // the brand figure on the felt piano, between the narrator's words
        const phrase = MOTIF.drive[Math.floor(b.t / bar) % 2];
        for (const [bt, m] of phrase) {
          const t = b.t + bt * beat;
          if (t >= b.t + dur - 0.05 || speaking(t)) continue;
          S.felt(t, m, { level: kind === 'peak' ? 0.06 : 0.05, pan: (m - 72) / 18, bright: 0.6, len: 2.2 });
        }
        continue;
      }

      if (kind === 'end') {
        // held tonic, the motif resolving home, glints rising
        if (b === bars[0]) {
          MOTIF.end.forEach(([bt, m], k) => {
            const t = b.t + 0.15 + bt * beat;
            if (!speaking(t)) S.felt(t, m, { level: 0.06, pan: -0.2 + k * 0.12, bright: 0.55, len: 4.5 });
          });
          [68, 72, 75, 77, 80].forEach((m, k) => S.glint(b.t + 0.05 + k * beat * 0.5, m + 12, { level: 0.016, pan: -0.4 + k * 0.2 }));
        }
      }
    }
  }

  // ── sound to picture
  for (const f of hits.ticks ?? []) S.tick(sec(f), { level: 0.045, pan: 0.1 });
  for (const f of hits.whooshes ?? []) S.whoosh(sec(f), { level: 0.055 });
  for (const f of hits.booms ?? []) S.boom(sec(f), { level: 0.5 });
  for (const f of hits.glints ?? []) S.glint(sec(f), 84, { level: 0.018, pan: 0.3 });
  for (const f of hits.risers ?? []) {
    S.riser(sec(f), Math.min(2.4, bar * 0.75), { level: 0.06 });
    S.swell(sec(f), Math.min(1.8, bar * 0.6), 'Dbmaj9', { level: 0.014 });
  }

  const out = S.master(masterOpts);
  // fades: a breath in at the head, the tail out at the very end
  const n = Math.ceil(seconds * SR);
  const L = out.L.subarray(0, n);
  const R = out.R.subarray(0, n);
  const fi = Math.round(0.02 * SR);
  for (let i = 0; i < fi; i++) {
    L[i] *= i / fi;
    R[i] *= i / fi;
  }
  const fo = Math.round(fadeOut * SR);
  for (let i = 0; i < fo; i++) {
    const g = Math.pow(1 - i / fo, 2);
    L[n - fo + i] *= g;
    R[n - fo + i] *= g;
  }
  return { L, R, seconds };
}

/** 16-bit stereo WAV, peak-normalized to −1 dBFS (loudness is set later). */
export function writeWav(file, { L, R }) {
  let peak = 0;
  for (let i = 0; i < L.length; i++) peak = Math.max(peak, Math.abs(L[i]), Math.abs(R[i]));
  const g = peak > 0 ? dbToGain(-1) / peak : 1;
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0);
  buf.writeUInt32LE(36 + n * 4, 4);
  buf.write('WAVE', 8);
  buf.write('fmt ', 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32);
  buf.writeUInt16LE(16, 34);
  buf.write('data', 36);
  buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, L[i] * g));
    const r = Math.max(-1, Math.min(1, R[i] * g));
    buf.writeInt16LE(Math.round(l * 32767), 44 + i * 4);
    buf.writeInt16LE(Math.round(r * 32767), 46 + i * 4);
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
  return { peak, gain: g };
}

/** the narrator's spoken spans for a script, from its manifest (seconds) */
export function voiceSpans(manifestPath) {
  if (!fs.existsSync(manifestPath)) return [];
  const m = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return m.map((e) => [e.start, e.start + (e.spoken ?? e.sec)]);
}
