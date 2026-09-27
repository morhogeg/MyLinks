/**
 * Loudness and level tools shared by the mix (audio/mix-vo.mjs) and the gates
 * (audio/verify.mjs). Plain JS over Float64Arrays, any sample rate.
 *
 *  - lufs(): integrated loudness, ITU-R BS.1770 (K-weighting, 400ms blocks,
 *    absolute −70 LUFS and relative −10 LU gates), the measure the platforms
 *    normalize by;
 *  - truePeak(): the highest inter-sample peak (4× oversampled), in dBTP;
 *  - limit(): a linked look-ahead peak limiter (no clipping, no pumping on
 *    the few transients it touches);
 *  - speechBand(): the 500 Hz – 4 kHz band a voice is understood in, for
 *    measuring the narrator against the music where it matters.
 */

/** RBJ biquad (a0-normalized) → a filter function over a whole array */
const biquad = ({ b0, b1, b2, a0, a1, a2 }) => (x) => {
  const y = new Float64Array(x.length);
  const B0 = b0 / a0;
  const B1 = b1 / a0;
  const B2 = b2 / a0;
  const A1 = a1 / a0;
  const A2 = a2 / a0;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = B0 * x[i] + B1 * x1 + B2 * x2 - A1 * y1 - A2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    y[i] = v;
  }
  return y;
};

const shelf = (fs, fc, gainDb, Q) => {
  const A = 10 ** (gainDb / 40);
  const w = (2 * Math.PI * fc) / fs;
  const c = Math.cos(w);
  const al = Math.sin(w) / (2 * Q);
  const r = 2 * Math.sqrt(A) * al;
  return biquad({
    b0: A * (A + 1 + (A - 1) * c + r),
    b1: -2 * A * (A - 1 + (A + 1) * c),
    b2: A * (A + 1 + (A - 1) * c - r),
    a0: A + 1 - (A - 1) * c + r,
    a1: 2 * (A - 1 - (A + 1) * c),
    a2: A + 1 - (A - 1) * c - r,
  });
};
const highpass = (fs, fc, Q) => {
  const w = (2 * Math.PI * fc) / fs;
  const c = Math.cos(w);
  const al = Math.sin(w) / (2 * Q);
  return biquad({ b0: (1 + c) / 2, b1: -(1 + c), b2: (1 + c) / 2, a0: 1 + al, a1: -2 * c, a2: 1 - al });
};
const lowpass = (fs, fc, Q) => {
  const w = (2 * Math.PI * fc) / fs;
  const c = Math.cos(w);
  const al = Math.sin(w) / (2 * Q);
  return biquad({ b0: (1 - c) / 2, b1: 1 - c, b2: (1 - c) / 2, a0: 1 + al, a1: -2 * c, a2: 1 - al });
};

/** BS.1770 K-weighting at any rate (the standard's 48k filters, re-derived) */
const kWeight = (fs) => {
  const pre = shelf(fs, 1681.974450955533, 3.999843853973347, 0.7071752369554196);
  const rlb = highpass(fs, 38.13547087602444, 0.5003270373238773);
  return (x) => rlb(pre(x));
};

/** integrated loudness (LUFS) of a stereo signal */
export const lufs = (L, R, fs) => {
  const k = kWeight(fs);
  const kl = k(L);
  const kr = k(R);
  const n = Math.round(0.4 * fs);
  const hop = Math.round(0.1 * fs);
  const z = [];
  for (let s = 0; s + n <= kl.length; s += hop) {
    let e = 0;
    for (let i = s; i < s + n; i++) e += kl[i] * kl[i] + kr[i] * kr[i];
    z.push(e / n);
  }
  const L_ = (e) => -0.691 + 10 * Math.log10(e);
  const gated = (zs) => zs.reduce((a, b) => a + b, 0) / zs.length;
  const abs = z.filter((e) => L_(e) > -70);
  if (!abs.length) return -Infinity;
  const rel = L_(gated(abs)) - 10;
  return L_(gated(abs.filter((e) => L_(e) > rel)));
};

/** 4× oversampled peak (dBTP) of a stereo signal: a 48-tap windowed-sinc
 *  interpolator per phase, which is what true-peak meters approximate */
export const truePeak = (L, R) => {
  const UP = 4;
  const TAPS = 12; // per side
  const phases = [];
  for (let p = 1; p < UP; p++) {
    const h = [];
    for (let k = -TAPS + 1; k <= TAPS; k++) {
      const t = k - p / UP;
      const sinc = t === 0 ? 1 : Math.sin(Math.PI * t) / (Math.PI * t);
      const w = 0.5 + 0.5 * Math.cos((Math.PI * t) / TAPS); // Hann
      h.push([k, sinc * w]);
    }
    phases.push(h);
  }
  let peak = 0;
  for (const x of [L, R]) {
    for (let i = 0; i < x.length; i++) {
      const a = Math.abs(x[i]);
      if (a > peak) peak = a;
      // only look between samples where an over is possible
      if (a < peak * 0.7) continue;
      for (const h of phases) {
        let v = 0;
        for (const [k, c] of h) {
          const j = i + k;
          if (j >= 0 && j < x.length) v += x[j] * c;
        }
        if (Math.abs(v) > peak) peak = Math.abs(v);
      }
    }
  }
  return 20 * Math.log10(peak);
};

/**
 * Linked look-ahead peak limiter, in place: the gain falls BEFORE a peak
 * (over `lookMs`, as a smooth ramp) so nothing is clipped, and recovers over
 * `releaseMs`. `ceiling` is linear.
 */
export const limit = (L, R, fs, ceiling, { lookMs = 2, releaseMs = 80 } = {}) => {
  const N = L.length;
  const W = Math.max(1, Math.round((lookMs / 1000) * fs));
  const need = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    const p = Math.max(Math.abs(L[i]), Math.abs(R[i]));
    need[i] = p > ceiling ? ceiling / p : 1;
  }
  // the lowest gain needed anywhere in the next W samples (a sliding minimum)
  const ahead = new Float64Array(N);
  const dq = [];
  for (let i = N - 1; i >= 0; i--) {
    while (dq.length && need[dq[dq.length - 1]] >= need[i]) dq.pop();
    dq.push(i);
    while (dq[0] > i + W) dq.shift();
    ahead[i] = need[dq[0]];
  }
  // a W-long moving average of that: a ramp that reaches the minimum on the peak
  // (the samples before the start count as unity gain)
  const gain = new Float64Array(N);
  let acc = W;
  for (let i = 0; i < N; i++) {
    acc += ahead[i] - (i >= W ? ahead[i - W] : 1);
    gain[i] = Math.min(ahead[i], acc / W);
  }
  // release: the gain may rise only this fast
  const rel = 1 - Math.exp(-1 / ((releaseMs / 1000) * fs));
  let g = 1;
  for (let i = 0; i < N; i++) {
    g = Math.min(gain[i], g + (1 - g) * rel);
    L[i] *= g;
    R[i] *= g;
  }
};

/** the speech band (500 Hz – 4 kHz, 4th-order each side), mono */
export const speechBand = (x, fs) => {
  const hp = (v) => highpass(fs, 500, 0.5412)(highpass(fs, 500, 1.3066)(v));
  const lp = (v) => lowpass(fs, 4000, 0.5412)(lowpass(fs, 4000, 1.3066)(v));
  return lp(hp(x));
};

/** mean power in dB of a range */
export const powerDb = (x, from = 0, to = x.length) => {
  let e = 0;
  for (let i = from; i < to; i++) e += x[i] * x[i];
  return 10 * Math.log10(e / Math.max(1, to - from) + 1e-20);
};
