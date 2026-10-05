/**
 * Voice-over mix: a score + its narrator lines (out/vo/…/line-NN.wav, placed
 * at their start times from the script's manifest.json) → one wav.
 *
 *   node audio/mix-vo.mjs          # film: public/score.wav      → public/score-vo.wav
 *   node audio/mix-vo.mjs reel     # reel: public/reel-score.wav → public/reel-score-vo.wav
 *
 * The music ducks under the voice — 35% down, 120ms ramps — which is what
 * keeps the VO effortless to hear without the score ever disappearing. One
 * mix for every script, like one voice (audio/synth-vo.py).
 *
 * (run AFTER the score and synth-vo.py for the same script)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BAR } from '../timeline.mjs';
import { limit, lufs, truePeak } from './loudness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

// `duck` is how far the music sits under a spoken line. The film's 0.65 is the
// balance the owner has listened to; the reel's bed runs drums under almost
// every line, so it ducks deeper to put the voice at the SAME level over its
// music (npm run verify measures both and compares).
const SCRIPTS = {
  film: { vo: path.join(root, 'out', 'vo'), score: 'score.wav', out: 'score-vo.wav', duck: 0.65 },
  reel: { vo: path.join(root, 'out', 'vo', 'reel'), score: 'reel-score.wav', out: 'reel-score-vo.wav', duck: 0.55 },
  // the REVISIT feature clip: the reel's balance and master, its own files
  // (`timeline` gives its per-line ducks, `master` its delivery spec)
  revisit: {
    vo: path.join(root, 'out', 'vo', 'revisit'),
    score: 'clips/revisit/score.wav',
    out: 'clips/revisit/score-vo.wav',
    duck: 0.55,
    timeline: '../clips/revisit-timeline.mjs',
    master: { lufs: -14, truePeak: -1 },
  },
  // Meta ad 3 (TODO): the main cut (narrator over the score) and the A/B cut
  // with no narrator (`noVoice`: the score alone, mastered the same way)
  adtodo: {
    vo: path.join(root, 'out', 'vo', 'adtodo'),
    score: 'ads/todo/score.wav',
    out: 'ads/todo/score-vo.wav',
    duck: 0.55,
    timeline: '../clips/ad-todo-timeline.mjs',
    master: { lufs: -14, truePeak: -1 },
  },
  'adtodo-music': {
    vo: path.join(root, 'out', 'vo', 'adtodo-music'),
    score: 'ads/todo/score.wav',
    out: 'ads/todo/score-music.wav',
    duck: 1,
    noVoice: true,
    master: { lufs: -14, truePeak: -1 },
  },
  // the ASK feature clip (clips/ask-timeline.mjs): the reel's balance and master
  ask: { vo: path.join(root, 'out', 'vo', 'ask'), score: 'ask-score.wav', out: 'ask-score-vo.wav', duck: 0.55 },
  // Meta ad: the trip (ads/trip-timeline.mjs): the reel's balance and master
  trip: { vo: path.join(root, 'out', 'vo', 'trip'), score: 'ads/trip/score.wav', out: 'ads/trip/score-vo.wav', duck: 0.55 },
  // Meta ad 2, the "talking to a friend" edition (ads/asktalk-timeline.mjs)
  asktalk: { vo: path.join(root, 'out', 'vo', 'asktalk'), score: 'ads/asktalk/score.wav', out: 'ads/asktalk/score-vo.wav', duck: 0.55 },
};
const name = process.argv[2] ?? 'film';
const script = SCRIPTS[name];
if (!script) throw new Error(`unknown script ${name}; one of ${Object.keys(SCRIPTS).join(', ')}`);
const voDir = script.vo;

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

const score = readWav(path.join(root, 'public', script.score));
const SR = score.rate;
const N = score.frames;
const L = new Float64Array(N);
const R = new Float64Array(N);
for (let i = 0; i < N; i++) {
  L[i] = score.samples[i * 2];
  R[i] = score.samples[i * 2 + 1];
}

const manifest = script.noVoice ? [] : JSON.parse(fs.readFileSync(path.join(voDir, 'manifest.json'), 'utf8'));
fs.mkdirSync(voDir, { recursive: true });
// a reel line may duck the music further than the rest (`duck` on its caption
// in reel-timeline.mjs, keyed by the frame the line starts on)
const lineDuck =
  name === 'reel'
    ? Object.fromEntries((await import('../reel-timeline.mjs')).CAPTIONS.filter((c) => c.duck).map((c) => [c.at, c.duck]))
    : {};
// (a feature clip names its own timeline)
if (script.timeline) for (const c of (await import(script.timeline)).CAPTIONS) if (c.duck) lineDuck[c.at] = c.duck;
// (the ASK clip's lines duck the same way, keyed by its own timeline)
if (name === 'asktalk') Object.assign(lineDuck, Object.fromEntries((await import('../ads/asktalk-timeline.mjs')).CAPTIONS.filter((c) => c.duck).map((c) => [c.at, c.duck])));
if (name === 'trip') Object.assign(lineDuck, Object.fromEntries((await import('../ads/trip-timeline.mjs')).CAPTIONS.filter((c) => c.duck).map((c) => [c.at, c.duck])));
if (name === 'ask') Object.assign(lineDuck, Object.fromEntries((await import('../clips/ask-timeline.mjs')).CAPTIONS.filter((c) => c.duck).map((c) => [c.at, c.duck])));

// duck envelope: 1 everywhere, dips to DUCK across each VO line
const DUCK = script.duck;
const RAMP = Math.round(0.12 * SR);
const duck = new Float64Array(N).fill(1);
const voL = new Float64Array(N);

for (const line of manifest) {
  const wav = readWav(path.join(voDir, line.file));
  // the film's manifest places lines by bar (kept exactly as it always was,
  // so the film's mix stays bit-identical); other scripts carry seconds
  const startSec = line.bar !== undefined ? line.bar * BAR : line.start;
  const start = Math.round(startSec * SR);
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
  const D = lineDuck[line.frame] ?? DUCK;
  for (let i = d0; i < d1; i++) {
    let g = D;
    if (i < start) g = 1 - (1 - D) * ((i - d0) / RAMP);
    else if (i > start + outFrames) g = D + (1 - D) * ((i - start - outFrames) / RAMP);
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
let g = peak > 0.98 ? 0.98 / peak : 1;

// The reel is mastered for the feeds it plays in (round 13): −14 LUFS
// integrated, true peaks at or under −1 dBTP, which is where Reels, TikTok,
// Shorts and YouTube expect a finished mix (the round-12 mix measured −15.8).
// A global gain, then a look-ahead limiter on the few transients that would
// pass the ceiling. The film's mix is untouched (it has no MASTER).
const MASTER = { reel: { lufs: -14, truePeak: -1 }, ask: { lufs: -14, truePeak: -1 }, trip: { lufs: -14, truePeak: -1 }, asktalk: { lufs: -14, truePeak: -1 } }[name] ?? script.master;
if (MASTER) {
  let gain = 10 ** ((MASTER.lufs - lufs(L, R, SR)) / 20);
  let ceiling = 10 ** ((MASTER.truePeak - 0.3) / 20);
  let out = null;
  for (let pass = 0; pass < 6; pass++) {
    const l = L.map((v) => v * gain);
    const r = R.map((v) => v * gain);
    limit(l, r, SR, ceiling);
    const I = lufs(l, r, SR);
    const tp = truePeak(l, r);
    out = { l, r, I, tp };
    // (0.2 dB under the spec: meters and the render's AAC encode disagree by
    // about that much on inter-sample peaks)
    const tpMax = MASTER.truePeak - 0.2;
    if (Math.abs(I - MASTER.lufs) < 0.05 && tp <= tpMax) break;
    gain *= 10 ** ((MASTER.lufs - I) / 20);
    if (tp > tpMax) ceiling *= 10 ** ((tpMax - tp - 0.05) / 20);
  }
  L.set(out.l);
  R.set(out.r);
  g = 1;
  // verify.mjs measures the voice against the bed by subtracting the ducked
  // bed from this mix; it needs the gain the whole mix was given
  fs.writeFileSync(
    path.join(voDir, 'mix.json'),
    JSON.stringify({ gain, lufs: +out.I.toFixed(2), truePeak: +out.tp.toFixed(2) }, null, 1),
  );
  console.log(`mastered: gain ${(20 * Math.log10(gain)).toFixed(2)}dB → ${out.I.toFixed(2)} LUFS, ${out.tp.toFixed(2)} dBTP`);
}

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
const outPath = path.join(root, 'public', script.out);
fs.writeFileSync(outPath, out);
console.log(`wrote ${outPath} — ${(bytes / 1e6).toFixed(1)}MB, peak gain ${g.toFixed(3)}, ${manifest.length} VO lines`);
