/**
 * The synthesizer shared by every Machina score: the launch film
 * (audio/score.mjs) and the reels (audio/reel-score.mjs). Voices, buses and
 * master chain are the film's, moved here VERBATIM so a reel sounds like it
 * comes from the same studio; `node audio/score.mjs` still writes a
 * byte-identical public/score.wav (the refactor was checked by hash).
 *
 * No samples, no dependencies, deterministic: one seeded LCG per synth, so
 * the same arrangement always renders the same bits.
 *
 * Signal path per voice: oscillator/exciter → ADSR → one-pole LP → dry stereo
 * bus + a mono reverb send. Master: dotted-8th delay for the plucks, a
 * Freeverb-style tank (8 damped combs → 4 allpasses, 23-sample stereo spread),
 * gentle tanh saturation, then fades and a normalize.
 *
 *   const S = createSynth({ seconds, beat })   // beat in seconds (delay time)
 *   S.pad(…); S.kick(…); …                     // arrange
 *   S.master(); S.writeWav(path)
 */

import fs from 'node:fs';
import path from 'node:path';

export const SR = 44100;

export function createSynth({ seconds, beat }) {
  const N = Math.ceil(seconds * SR);

  const L = new Float64Array(N);
  const R = new Float64Array(N);
  const SEND = new Float64Array(N); // mono reverb send
  const DELAY_SEND = new Float64Array(N); // mono delay send (plucks)

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

  // ─────────────────────────────────────────────────────────── master chain

  const master = ({ fadeInSec = 0.4, fadeOutSec = 2.2, normalizeTo = 0.86 } = {}) => {
    // Dotted-8th delay on the pluck bus — the detail that makes the arpeggio feel
    // like it lives in a room instead of on a grid.
    {
      const dt = Math.round(beat * 0.75 * SR);
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
      const fadeIn = fadeInSec * SR;
      const fadeOut = fadeOutSec * SR;
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
      const target = normalizeTo;
      const g = peak > 0 ? target / peak : 1;
      for (let i = 0; i < N; i++) {
        L[i] *= g;
        R[i] *= g;
      }
      console.log(`peak before normalize: ${peak.toFixed(3)} → gain ${g.toFixed(3)}`);
    }
  };

  // ─────────────────────────────────────────────────────────── write WAV

  const writeWav = (outPath) => {
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
    console.log(`wrote ${outPath} — ${(bytes / 1e6).toFixed(1)}MB, ${(N / SR).toFixed(1)}s @ ${SR}Hz`);
  };

  return {
    N, L, R, SEND, DELAY_SEND,
    mtof, clamp01, secToIdx, rnd, adsr, render, lp, hp,
    pad, sub, pluck, pulse, keys, bell, kick, hat, rim, shaker, clap, riser, whoosh, impact, tick, shimmer,
    master, writeWav,
  };
}
