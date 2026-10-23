/**
 * FIND THE BOOK: the score. The house instruments (audio/synth.mjs, shared
 * by every Machina score) on the reel's own clock (clips/needle-timeline.mjs:
 * 120 BPM, 15 frames a beat, a bar is 2s).
 *
 * The arrangement IS the story's energy curve:
 *  - frame 0 hits: a chord stab and a kick on the dare (it is also where the
 *    loop lands), then a playful keys figure while the viewer scans;
 *  - the search builds: half-time kick, then four on the floor, claps, hats
 *    going to 16ths, the pulse figure, a whoosh as the camera swings between
 *    the named saves;
 *  - "Give up?": the band stops dead (a thud for the camera's slam);
 *  - "Or just ask Machina": a riser into the brand's impact on the strike;
 *  - Ask waits on IV, the question typed over soft ticks, a long riser into
 *  - the DROP on the send: the tunnel at full speed on V, kick every beat;
 *  - braking: the drums fall away, a breath of near silence, and the needle
 *    lands HOME on I: impact, sub, a bell (the payoff);
 *  - the answer resolves warm, its citation pinged;
 *  - the sign-off rests IV → I; the P.S. brings the dare's figure back on vi,
 *    into the loop's own downbeat.
 *
 * THE LOOP: rendered twice in a row and the second copy kept, so every tail
 * rings on into frame 0 as it will when a feed plays it again. No fades.
 *
 *   node audio/needle-score.mjs   →   public/clips/needle/score.wav
 *   (then `node audio/mix-vo.mjs needle` for the narrated, mastered mix)
 *   node audio/needle-score.mjs video   →   …/score-video.wav (round 3: the
 *   same score, kept clear of the video's own lines; mix `needle-video`)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BAR_FRAMES, BEAT, BEAT_FRAMES, CHORDS, FPS, HITS, NEEDLES, RISERS, TOTAL_FRAMES, TOTAL_SEC } from '../clips/needle-timeline.mjs';
import { SR, createSynth } from './synth.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const VIDEO = process.argv[2] === 'video';
const { captions: CAPTIONS } = NEEDLES[VIDEO ? 'video' : 'book'];

const S = createSynth({ seconds: TOTAL_SEC * 2, beat: BEAT });
const { pad, sub, pulse, keys, bell, kick, hat, rim, shaker, clap, riser, whoosh, impact, tick, shimmer, pluck, ping } = S;
const H = HITS;

// ── where the narrator is speaking, in frames (the voice manifest)
const MANIFEST = JSON.parse(fs.readFileSync(path.join(root, 'out', 'vo', VIDEO ? 'needle-video' : 'needle', 'manifest.json'), 'utf8'));
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

/** the band's energy along the story (0–1) */
const energy = (f) =>
  f < H.push ? 0.25
  : f < 120 ? 0.45
  : f < H.giveUp ? 0.62 + 0.38 * ((f - 120) / (H.giveUp - 120))
  : f < H.gather ? 0
  : f < H.markStrike ? 0.35
  : f < H.send ? 0.4
  : f < H.brake ? 1
  : f < H.found - 12 ? 0.55
  : f < H.found ? 0.1
  : f < H.lockup ? 0.65
  : f < H.ps ? 0.4
  : 0.3;

/** where the drums play, and how */
const groove = (f) => {
  if (f >= H.push && f < 120) return 'half';
  if (f >= 120 && f < H.giveUp) return 'four';
  if (f >= H.send && f < H.brake) return 'drop';
  if (f >= H.answer + 15 && f < H.lockup) return 'half';
  return null;
};

const arrange = (o) => {
  const t = (frame) => (frame + o) / FPS;

  // ── pad: one voicing per chord span; it rests for "Give up?" (the stop)
  CHORDS.forEach(([from, name], k) => {
    const to = k + 1 < CHORDS.length ? CHORDS[k + 1][0] : TOTAL_FRAMES;
    const a = from;
    const b = from < H.giveUp && to > H.giveUp ? H.giveUp : to;
    if (a >= H.giveUp && a < H.gather) return;
    const ch = VOICINGS[name];
    const e = energy(a);
    const level = 0.075 + 0.07 * Math.max(e, 0.35);
    const lift = from === 0 || from >= H.ps ? 12 : 0;
    ch.upper.forEach((m, i) => pad(t(a), (b - a) / FPS + 0.04, m + lift, level * (i === 0 ? 1 : 0.85), ((i / 3) * 2 - 1) * 0.55));
    pad(t(a), (b - a) / FPS + 0.04, ch.bass + 12, level * 0.5, 0);
  });

  // ── frame 0: the dare lands on a chord stab and a kick (and so does the loop)
  kick(t(0), 0.5);
  sub(t(0), 33, 0.42, 0.55);
  [57, 60, 64, 67, 72].forEach((m, i) => keys(t(0), m, 0.085, ((i / 4) * 2 - 1) * 0.5, 1.2));
  // the scanning beat after the line: a playful figure, a question that rises
  [
    [48, 76],
    [52, 79],
    [56, 81],
    [60, 84],
    [66, 83],
  ].forEach(([fr, m], k) => keys(t(fr), m, 0.075 - k * 0.006, k % 2 ? 0.3 : -0.3, 0.8));

  // ── bass: roots on the bar; the drop walks 8ths
  for (let f0 = 0; f0 < TOTAL_FRAMES; f0 += BAR_FRAMES) {
    const e = energy(f0);
    const ch = chordAt(f0);
    if (e <= 0.05) continue;
    if (groove(f0) === 'drop') {
      for (let k = 0; k < 8; k++) {
        const fr = f0 + k * (BEAT_FRAMES / 2);
        if (fr >= H.brake) break;
        sub(t(fr), ch.bass - 12 + (k % 4 === 3 ? 7 : 0), 0.34, 0.2);
      }
    } else if (f0 >= H.push) {
      sub(t(f0), ch.bass - 12, 0.22 + 0.2 * e, 0.9);
      if (groove(f0) === 'four') sub(t(f0 + 2 * BEAT_FRAMES), ch.bass - 12, 0.2 + 0.12 * e, 0.5);
    }
  }

  // ── the pulse: 8ths in the search, 16ths in the drop, under Ask a held breath
  const SCALE = [0, 2, 4, 5, 7, 9, 11];
  const SHAPE = [0, 2, 4, 2, 5, 4, 2, 4];
  for (let fr = 0; fr < TOTAL_FRAMES; fr += BEAT_FRAMES / 4) {
    const g = groove(fr);
    const inAsk = fr >= H.ask + 9 && fr < H.send;
    if (!g && !inAsk) continue;
    const sixteenth = Math.round(fr / (BEAT_FRAMES / 4));
    const step = g === 'drop' ? 1 : g === 'four' && fr >= 180 ? 2 : 2;
    if (sixteenth % step) continue;
    if (inAsk && sixteenth % 4) continue;
    const c = chordAt(fr);
    const k = (sixteenth / step) % SHAPE.length;
    const m = c.upper[0] + SCALE[SHAPE[k] % 7] + (g === 'drop' && k % 4 === 3 ? 12 : 0);
    const lvl = g === 'drop' ? 0.1 : inAsk ? 0.05 : 0.075 + 0.03 * energy(fr);
    pulse(t(fr), m, lvl, ((k % 4) / 3) * 1.1 - 0.55, g === 'drop' ? 0.2 : 0.28);
  }

  // ── drums
  for (let fr = 0; fr < TOTAL_FRAMES; fr += BEAT_FRAMES) {
    const g = groove(fr);
    if (!g) continue;
    const inBar = Math.round((fr % BAR_FRAMES) / BEAT_FRAMES);
    const e = energy(fr);
    if (g === 'half') {
      if (inBar === 0 || inBar === 2) kick(t(fr), 0.36 + 0.1 * e);
      if (inBar === 2) clap(t(fr), 0.1);
    } else {
      kick(t(fr), g === 'drop' ? 0.62 : 0.4 + 0.16 * e);
      if (inBar % 2) clap(t(fr), g === 'drop' ? 0.2 : 0.13 + 0.05 * e);
      if (g === 'drop' && inBar === 3) rim(t(fr + 0.5 * BEAT_FRAMES), 0.1);
    }
    // hats: 8ths, 16ths as the search heats up and in the drop
    const per = g === 'drop' || (g === 'four' && fr >= 200) ? 4 : 2;
    for (let k = 0; k < per; k++) {
      const fh = fr + (k * BEAT_FRAMES) / per;
      if (voiced(fh, BEAT_FRAMES / per)) continue;
      const open = per === 2 ? k === 1 : k === 2;
      hat(t(fh), (g === 'drop' ? 0.04 : 0.028) * (open ? 1 : 0.7), k % 2 ? 0.22 : -0.2, open);
      if (g !== 'half') shaker(t(fh), 0.014, k % 2 ? 0.3 : -0.3);
    }
  }

  // ── the search: a whoosh as the camera swings between named saves
  for (const fr of [H.beach - 14, 193, 238]) if (!voiced(fr, 10)) whoosh(t(fr), 0.45, 0.05, fr % 2 ? 0.25 : -0.25);
  // each named save, lifted: a light pluck after its noun
  for (const [fr, m] of [
    [H.beach + 16, 84],
    [H.talk + 14, 86],
    [H.coffee + 16, 88],
  ]) pluck(t(fr), m, 0.05, 0.1, 0.45);

  // ── "Give up?": the stop. The camera slams; nothing else
  sub(t(H.giveUp), 31, 0.4, 0.35);
  tick(t(H.giveUp), 0.12, 0.75);
  impact(t(H.giveUp), 0.08);

  // ── "Or just ask Machina": the field rushes in; the brand's impact on the strike
  impact(t(H.markStrike), 0.38);
  sub(t(H.markStrike), 36, 0.42, 0.7);
  shimmer(t(afterVoice(H.markStrike + 2)) + 0.02, [79, 84, 88, 91], 0.05);
  // the screen opens around the mark
  whoosh(t(H.ask) - 0.03, 0.45, 0.03, 0.1);

  // ── the question: soft key ticks as it types, the thumb on send
  for (let fr = H.typing; fr < H.typing + 38; fr += 3) tick(t(fr), 0.035, 1.4 + ((fr * 7) % 5) * 0.06);
  tick(t(H.tap), 0.13, 1.1);

  // the build into the drop: a rim roll that doubles its rate, rising
  for (const [a, b, step] of [
    [H.send - 24, H.send - 12, 3.75],
    [H.send - 12, H.send - 4, 1.875],
    [H.send - 4, H.send - 1, 0.9375],
  ]) {
    for (let fr = a; fr < b; fr += step) rim(t(fr), 0.06 + 0.16 * ((fr - (H.send - 24)) / 24));
  }
  riser(t(H.typing + 6), (H.send - H.typing - 6) / FPS, 0.22);
  sub(t(H.send - 12), 43, 0.18, 0.4);

  // ── THE DROP: the send cuts to the tunnel at full speed
  impact(t(H.send), 0.48);
  sub(t(H.send), 31, 0.62, 0.9);
  shimmer(t(H.send) + 0.04, [74, 79, 83, 86], 0.035);
  // the wind of the tunnel between the lines
  for (const [a, b] of [[497, 524]]) if (b - a > 8) whoosh(t(a), (b - a) / FPS, 0.06, 0);

  // ── braking: a falling line, then a breath of near silence before the needle
  [86, 83, 79, 76, 74].forEach((m, k) => keys(t(H.brake + 4 + k * 8), m, 0.05, k % 2 ? 0.2 : -0.2, 0.7));

  // a short swell into the find, as the voice clears
  riser(t(H.found - 12), 12 / FPS, 0.24);

  // ── THE NEEDLE: home on I. Impact, sub, a bell that rings over the hold
  impact(t(H.found), 0.5);
  sub(t(H.found), 36, 0.66, 1.2);
  bell(t(H.found) + 0.02, 84, 0.14, 0, 3.2);
  bell(t(H.found) + 0.05, 91, 0.06, 0.3, 2.6);
  shimmer(t(H.found + 4), [84, 88, 91, 96], 0.05);
  // the dive
  whoosh(t(H.dive), (H.answer - H.dive) / FPS + 0.08, 0.07, 0);

  // ── the answer: it resolves under the voice; (round 2) Sam's advice runs
  // through the citation's highlight, so the ping is seen, not heard, and the
  // warm keys wait for the line to finish: a cadence into the sign-off
  sub(t(H.answer), 48, 0.34, 0.6);
  const advised = afterVoice(H.answer + 20);
  [
    [advised, 79],
    [advised + 4, 84],
  ].forEach(([fr, m]) => keys(t(fr), m, 0.06, 0.1, 1.4));

  // ── the sign-off: the mark's point strikes on "Machina" (lighter than the turn)
  impact(t(H.lockup + 1), 0.2);
  sub(t(H.lockup + 1), 41, 0.3, 0.8);
  bell(t(afterVoice(H.lockup + 80)), 88, 0.07, -0.1, 2.4);

  // ── the P.S.: the dare's figure, back on vi, into the loop's downbeat
  [
    [H.ps + 16, 76],
    [H.ps + 20, 79],
  ].forEach(([fr, m]) => keys(t(fr), m, 0.06, -0.2, 0.8));
  whoosh(t(H.burst), 0.55, 0.035, 0);
  [
    [830, 81],
    [835, 84],
  ].forEach(([fr, m]) => keys(t(fr), m, 0.06, 0.25, 0.7));

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
const dest = path.join(root, 'public', 'clips', 'needle', VIDEO ? 'score-video.wav' : 'score.wav');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
console.log(`wrote ${path.relative(root, dest)} (${TOTAL_SEC.toFixed(2)}s, the second of two copies: loops clean)`);
