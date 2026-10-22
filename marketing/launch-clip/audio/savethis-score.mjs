/**
 * SAVE THIS: the score. The house instruments (audio/synth.mjs, shared by
 * every Machina score) on the reel's own clock (clips/savethis-timeline.mjs:
 * 128.57 BPM, 14 frames a beat).
 *
 * The arrangement follows the story: the hook is nearly bare (a minor pad,
 * the bookmark's click on "save"); the save falls on a scale run down to a
 * thud on the heap; the heap rushes up a riser into the brand's impact on
 * "Machina"; the band comes in under the reading (a tick on each phase, a
 * bell on "Saved to Machina"), drops out for "three weeks later" so each
 * save landing on top is its own thud, holds its breath for the typing, and
 * lands, full, on the find. The dive rises into the poster, and the poster
 * is as bare as the hook, because it IS the hook: the reel loops.
 *
 * THE LOOP: the arrangement is rendered twice in a row and the second copy
 * kept, so the reverb and delay tails of the end ring on into the start,
 * exactly as they will when a feed plays it again. No fades.
 *
 *   node audio/savethis-score.mjs   →   public/clips/savethis/score.wav
 *   (then `node audio/mix-vo.mjs savethis` for the narrated, mastered mix)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BAR_FRAMES, BEAT, BEAT_FRAMES, CAPTIONS, CHORDS, FPS, HITS, RISERS, TOTAL_FRAMES, TOTAL_SEC, TYPE_FRAMES } from '../clips/savethis-timeline.mjs';
import { SR, createSynth } from './synth.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

// two copies of the reel, end to end; the second one is the score
const S = createSynth({ seconds: TOTAL_SEC * 2, beat: BEAT });
const { pad, sub, pulse, keys, bell, kick, hat, rim, shaker, clap, riser, whoosh, impact, tick, shimmer, pluck } = S;

const H = HITS;
// the take's runs, so the typing ticks follow the picture
const TAKE = JSON.parse(fs.readFileSync(path.join(root, 'src', 'reels', 'clips', 'savethis', 'takes.json'), 'utf8'))['clips/savethis/app'];
const CHARS = TAKE.marks.result - TAKE.marks.typing;
const SAVES_SINCE = (TAKE.marks.buried - TAKE.marks.bury0) / 14;
const BURY_FROM = H.bury - 7;
const NARROWED = H.type + 7 * TYPE_FRAMES;

// ── where the narrator is speaking, in frames (from the voice manifest)
const MANIFEST = JSON.parse(fs.readFileSync(path.join(root, 'out', 'vo', 'savethis', 'manifest.json'), 'utf8'));
const spoken = CAPTIONS.map((c) => {
  const m = MANIFEST.find((x) => x.frame === c.at);
  return [c.at, c.at + Math.round((m?.spoken ?? 0) * FPS)];
});
// noise (hats, shakers, whooshes, risers) stays out from under the voice
const voiced = (from, len = 1) => spoken.some(([a, b]) => from < b + 4 && from + len > a - 4);
const clearOfVoice = (from, len) => {
  let f = from;
  for (const [a, b] of spoken) if (f < b + 2 && f + len > a) f = Math.ceil((b + 2) / 7) * 7;
  return f;
};

const VOICINGS = {
  Am7: { bass: 45, upper: [55, 60, 64, 67] },
  Fmaj7: { bass: 41, upper: [57, 60, 64, 69] },
  Cmaj7: { bass: 48, upper: [59, 64, 67, 71] },
  G6: { bass: 43, upper: [59, 62, 64, 69] },
};
const chordAt = (frame) => VOICINGS[CHORDS.filter(([f]) => f <= frame).at(-1)[1]];

/** the band's density along the story: bare hook, the fall, the turn, the
 *  reading, a breath for the skip, the typing held, the find full, the dive,
 *  the bare poster */
const density = (f) =>
  f < H.drop ? 0.18 : f < H.land ? 0.3 : f < H.gather ? 0.36 : f < H.markStrike ? 0.5 : f < H.phase0 ? 0.42 : f < H.skip ? 0.85 : f < H.fieldTap ? 0.55 : f < H.found ? 0.6 : f < H.cardTap ? 1 : f < H.poster ? 0.7 : 0.2;
const DRUMS = [
  [H.phase0, H.skip],
  [H.found, H.cardTap + 7],
];
const drumsAt = (f) => DRUMS.some(([a, b]) => f >= a && f < b);

const arrange = (o) => {
  const t = (frame) => (frame + o) / FPS;

  // ── pad: one voicing per chord span, the hook and the poster high and open
  CHORDS.forEach(([from, name], k) => {
    const to = k + 1 < CHORDS.length ? CHORDS[k + 1][0] : TOTAL_FRAMES;
    const ch = VOICINGS[name];
    const d = density(from);
    const level = 0.08 + 0.08 * d;
    const lift = from < H.drop || from >= H.poster ? 12 : 0;
    ch.upper.forEach((m, i) => pad(t(from), (to - from) / FPS + 0.05, m + lift, level * (i === 0 ? 1 : 0.85), ((i / 3) * 2 - 1) * 0.55));
    pad(t(from), (to - from) / FPS + 0.05, ch.bass + 12, level * 0.55, 0);
  });

  // ── bass + the pulse figure under the reading and the find
  for (let f0 = 0; f0 < TOTAL_FRAMES; f0 += BAR_FRAMES) {
    const d = density(f0);
    const ch = chordAt(f0);
    if (f0 >= H.markStrike && f0 < H.poster) sub(t(f0), ch.bass, 0.3 + 0.25 * d, d >= 0.8 ? 0.5 : 1.4);
    if (d >= 0.8) {
      sub(t(f0 + 1.5 * BEAT_FRAMES), ch.bass + 7, 0.18 + 0.1 * d, 0.32);
      sub(t(f0 + 2.5 * BEAT_FRAMES), ch.bass + 12, 0.16 + 0.1 * d, 0.3);
    }
    if (f0 >= H.phase0 - BAR_FRAMES && f0 < H.poster) {
      const SCALE = [0, 2, 4, 5, 7, 9, 11];
      const shape = [0, 2, 3, 4, 6, 4, 3, 2];
      [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].forEach((on, k) => {
        const fr = f0 + on * BEAT_FRAMES;
        if (fr < H.phase0 - 4 || fr >= H.poster) return;
        // the skip and the typing breathe: half the figure
        if ((fr >= H.skip && fr < H.fieldTap) || (fr >= H.fieldTap && fr < H.found)) if (k % 2) return;
        const c = chordAt(fr);
        const step = shape[(k + f0 / BAR_FRAMES) % shape.length];
        const m = c.upper[0] + SCALE[step % 7] + Math.floor(step / 7) * 12 + (on >= 2.5 ? 12 : 0);
        pulse(t(fr), m, 0.1 * (0.6 + 0.4 * density(fr)), ((k % 4) / 3) * 1.1 - 0.55, 0.3);
      });
    }
  }

  // ── drums: under the reading, and full on the find
  for (let fr = 0; fr < TOTAL_FRAMES; fr += BEAT_FRAMES) {
    if (!drumsAt(fr)) continue;
    const d = density(fr);
    const inBar = (fr % BAR_FRAMES) / BEAT_FRAMES;
    kick(t(fr), (inBar % 2 ? 0.34 : 0.44) + 0.18 * d);
    if (inBar % 2) clap(t(fr), 0.15 + 0.05 * d);
    if (inBar === 2) rim(t(fr + 0.75 * BEAT_FRAMES), 0.08);
    for (let k = 0; k < 2; k++) {
      const f8 = fr + k * 7;
      if (voiced(f8, 7)) continue;
      hat(t(f8), 0.032 * d * (k ? 1 : 0.7), k ? 0.2 : -0.18, k === 1);
      shaker(t(f8), 0.018 * d, k ? 0.32 : -0.3);
    }
  }

  // ── the hook: the bookmark's click on "save"
  tick(t(H.tapSave), 0.16, 1.05);
  sub(t(H.tapSave), 57, 0.22, 0.16);
  pluck(t(H.tapSave) + 0.02, 81, 0.09, 0.1, 0.4);

  // ── the trapdoor and the fall: a run down the scale, an 8th a note, to a
  // thud on the heap
  whoosh(t(H.drop), 0.5, 0.05, 0);
  const RUN = [76, 74, 72, 71, 69, 67, 65, 64, 62];
  RUN.forEach((m, k) => {
    const fr = H.drop + 8 + k * 7;
    if (fr < H.land) keys(t(fr), m, 0.1 - k * 0.006, k % 2 ? 0.25 : -0.25, 0.9);
  });
  sub(t(H.land), 33, 0.5, 0.5);
  impact(t(H.land), 0.14);
  shaker(t(H.land) + 0.03, 0.04, 0.1);
  // "with all the others": the camera dives at the heap
  if (!voiced(H.land + 10, 20)) whoosh(t(H.land + 10), 0.7, 0.04, 0.1);

  // ── the turn: everything rushes into the point; the brand's impact on "Machina"
  impact(t(H.markStrike), 0.36);
  shimmer(t(H.markStrike) + 0.08, [79, 84, 88, 91], 0.05);
  bell(t(clearOfVoice(H.markStrike + 4, 6)), 84, 0.08, 0.15, 2.4);
  // the app opens around the mark
  whoosh(t(H.iris) - 0.05, 0.5, 0.035, -0.1);

  // ── the reading: a tick on each phase, rising; a bell on "Saved to Machina"
  for (let k = 0; k < 5; k++) tick(t(H.phase0 + k * BEAT_FRAMES), 0.07, 1.2 + k * 0.1);
  bell(t(H.done), 88, 0.1, 0.2, 2.2);
  sub(t(H.done), 48, 0.26, 0.3);
  // (round 4) the cut to the graph; the thumb on the new save's dot, and its
  // two ties lighting: two notes, linked, under the word
  tick(t(H.graph), 0.08, 0.95);
  if (!voiced(H.graph + 2, 12)) whoosh(t(H.graph) + 0.02, 0.45, 0.035, 0.15);
  tick(t(H.connect), 0.11, 1.12);
  pluck(t(H.connect + 2), 76, 0.07, -0.2, 0.45);
  pluck(t(H.connect + 6), 83, 0.06, 0.2, 0.45);
  sub(t(H.connect), 43, 0.22, 0.3);

  // ── three weeks later: a breath, then one thud per save landing on top,
  // each a step higher, an 8th apart
  if (!voiced(H.skip - 6, 18)) whoosh(t(H.skip) - 0.15, 0.6, 0.05, 0.2);
  for (let k = 0; k < SAVES_SINCE; k++) {
    const fr = BURY_FROM + k * 7;
    sub(t(fr), 40 + k, 0.2 + k * 0.012, 0.18);
    tick(t(fr), 0.05, 0.8 + k * 0.05);
  }

  // ── search: the tap, a click a character, the feed narrowing to one
  tick(t(H.fieldTap), 0.11, 1.15);
  for (let k = 0; k < CHARS; k++) tick(t(H.type + k * TYPE_FRAMES), 0.028, 1.5 + ((k * 7) % 5) * 0.06);
  sub(t(NARROWED), 45, 0.22, 0.3);

  // ── the find: the band lands, the card lifts
  sub(t(H.found), 36, 0.42, 0.6);
  shimmer(t(clearOfVoice(H.found, 10)), [76, 83, 88], 0.045);

  // ── the dive: the thumb on the cover, a rise into the poster
  tick(t(H.cardTap), 0.12, 1.1);
  whoosh(t(H.cardTap) + 0.05, 0.85, 0.07, 0);
  sub(t(H.poster), 33, 0.3, 0.7);
  bell(t(clearOfVoice(H.poster + 2, 4)), 81, 0.06, -0.1, 2.6);

  // ── risers, each ENDING on its reveal (out of the voice's way)
  for (const [from, to] of RISERS) {
    let a = from;
    for (const [s0, s1] of spoken) if (a < s1 + 4 && to > s0 - 4) a = s1 + 4;
    if (to - a >= BEAT_FRAMES) riser(t(a), (to - a) / FPS, 0.08);
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
const dest = path.join(root, 'public', 'clips', 'savethis', 'score.wav');
fs.mkdirSync(path.dirname(dest), { recursive: true });
fs.writeFileSync(dest, out);
console.log(`wrote ${path.relative(root, dest)} (${TOTAL_SEC.toFixed(2)}s, the second of two copies: loops clean)`);
