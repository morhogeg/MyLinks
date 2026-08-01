/**
 * Voice-over mix: score.wav + the Kokoro lines (out/vo/line-NN.wav, placed at
 * their caption bars from out/vo/manifest.json) → public/score-vo.wav.
 *
 * The music ducks under the voice — 35% down, 120ms ramps — which is what
 * keeps the VO effortless to hear without the score ever disappearing.
 *
 *   node audio/mix-vo.mjs     (run AFTER `npm run score` and synth-vo.py)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BAR } from '../timeline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const voDir = path.join(root, 'out', 'vo');

const readWav = (p) => {
  const b = fs.readFileSync(p);
  if (b.toString('ascii', 0, 4) !== 'RIFF') throw new Error(`not a wav: ${p}`);
  // walk chunks to fmt + data
  let off = 12;
  let fmt = null;
  let data = null;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const size = b.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { channels: b.readUInt16LE(off + 10), rate: b.readUInt32LE(off + 12), bits: b.readUInt16LE(off + 22) };
    if (id === 'data') data = b.subarray(off + 8, off + 8 + size);
    off += 8 + size + (size % 2);
  }
  if (!fmt || !data) throw new Error(`bad wav: ${p}`);
  if (fmt.bits !== 16) throw new Error(`expect PCM16: ${p} has ${fmt.bits}`);
  const frames = data.length / 2 / fmt.channels;
  const out = new Float64Array(frames * fmt.channels);
  for (let i = 0; i < out.length; i++) out[i] = data.readInt16LE(i * 2) / 32768;
  return { ...fmt, frames, samples: out };
};

const score = readWav(path.join(root, 'public', 'score.wav'));
const SR = score.rate;
const N = score.frames;
const L = new Float64Array(N);
const R = new Float64Array(N);
for (let i = 0; i < N; i++) {
  L[i] = score.samples[i * 2];
  R[i] = score.samples[i * 2 + 1];
}

const manifest = JSON.parse(fs.readFileSync(path.join(voDir, 'manifest.json'), 'utf8'));

// duck envelope: 1 everywhere, dips to DUCK across each VO line
const DUCK = 0.65;
const RAMP = Math.round(0.12 * SR);
const duck = new Float64Array(N).fill(1);
const voL = new Float64Array(N);

for (const line of manifest) {
  const wav = readWav(path.join(voDir, line.file));
  const start = Math.round(line.bar * BAR * SR);
  const ratio = wav.rate / SR;
  const outFrames = Math.floor(wav.frames / ratio);
  for (let i = 0; i < outFrames; i++) {
    const idx = start + i;
    if (idx < 0 || idx >= N) continue;
    // linear resample (speech — transparent enough)
    const s = i * ratio;
    const s0 = Math.floor(s);
    const s1 = Math.min(wav.frames - 1, s0 + 1);
    const fr = s - s0;
    voL[idx] += (wav.samples[s0] * (1 - fr) + wav.samples[s1] * fr) * 0.9;
  }
  const d0 = Math.max(0, start - RAMP);
  const d1 = Math.min(N, start + outFrames + RAMP);
  for (let i = d0; i < d1; i++) {
    let g = DUCK;
    if (i < start) g = 1 - (1 - DUCK) * ((i - d0) / RAMP);
    else if (i > start + outFrames) g = DUCK + (1 - DUCK) * ((i - start - outFrames) / RAMP);
    duck[i] = Math.min(duck[i], g);
  }
}

let peak = 0;
for (let i = 0; i < N; i++) {
  const l = L[i] * duck[i] + voL[i];
  const r = R[i] * duck[i] + voL[i];
  L[i] = l;
  R[i] = r;
  peak = Math.max(peak, Math.abs(l), Math.abs(r));
}
const g = peak > 0.98 ? 0.98 / peak : 1;

const bytes = N * 4;
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
for (let i = 0; i < N; i++) {
  out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, L[i] * g)) * 32767), 44 + i * 4);
  out.writeInt16LE(Math.round(Math.max(-1, Math.min(1, R[i] * g)) * 32767), 44 + i * 4 + 2);
}
const outPath = path.join(root, 'public', 'score-vo.wav');
fs.writeFileSync(outPath, out);
console.log(`wrote ${outPath} — ${(bytes / 1e6).toFixed(1)}MB, peak gain ${g.toFixed(3)}, ${manifest.length} VO lines`);
