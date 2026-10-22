/**
 * SAVE THIS: the score. The house instruments (audio/synth.mjs, shared by
 * every Machina score) on the reel's own clock (clips/savethis-timeline.mjs:
 * 128.57 BPM, 14 frames a beat).
 *
 * The arrangement follows the story: the hook is nearly bare (a minor pad,
 * the bookmark's click on "save"); the save falls on a scale run down to a
 * thud on the heap; the heap rushes up a riser into the brand's impact on
 * "Machina"; the band comes in under the reading (a tick on each phase, a
 * bell on "Saved to Machina") and the graph, holds its breath for the
 * question, and lands, full, on the Ask answer's proof (round 13: a ping on
 * each citation as it is highlighted) and stays full under the sign-off (the
 * brand's impact again, lighter, as the app's mark strikes); under the last
 * line the drums go and the pad rises to the hook's register, a bell rings
 * over the loop's cut, and the hook is as bare as ever.
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
import { BAR_FRAMES, BEAT, BEAT_FRAMES, CAPTIONS, CHORDS, CITE_PINGS, FPS, HITS, MARK_STRIKE, RISERS, TOTAL_FRAMES, TOTAL_SEC } from '../clips/savethis-timeline.mjs';
import { SR, createSynth } from './synth.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

// two copies of the reel, end to end; the second one is the score
const S = createSynth({ seconds: TOTAL_SEC * 2, beat: BEAT });
const { pad, sub, pulse, keys, bell, kick, hat, rim, shaker, clap, riser, whoosh, impact, tick, shimmer, pluck, ping } = S;

const H = HITS;

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

// (round 13) the mix ducks the music under each line (audio/mix-vo.mjs: to
// the line's `duck`, 0.55 by default, across its file, ramped over 120ms
// either side); a ping belongs to the picture, not the music, so it is
// struck back up through the duck and the three land alike
const duckAt = (sec) => {
  let g = 1;
  for (const m of MANIFEST) {
    const D = CAPTIONS.find((c) => c.at === m.frame)?.duck ?? 0.55;
    const a = m.start;
    const b = m.start + m.sec;
    if (sec >= a && sec <= b) g = Math.min(g, D);
    else if (sec > a - 0.12 && sec < a) g = Math.min(g, 1 - ((1 - D) * (sec - a + 0.12)) / 0.12);
    else if (sec > b && sec < b + 0.12) g = Math.min(g, D + ((1 - D) * (sec - b)) / 0.12);
  }
  return g;
};

const VOICINGS = {
  Am7: { bass: 45, upper: [55, 60, 64, 67] },
  Fmaj7: { bass: 41, upper: [57, 60, 64, 69] },
  Cmaj7: { bass: 48, upper: [59, 64, 67, 71] },
  G6: { bass: 43, upper: [59, 62, 64, 69] },
};
const chordAt = (frame) => VOICINGS[CHORDS.filter(([f]) => f <= frame).at(-1)[1]];

/** the band's density along the story: bare hook, the fall, the turn, the
 *  reading and the graph, the asking held, the proof and the sign-off full,
 *  the promise thinning into the loop */
const density = (f) =>
  f < H.drop ? 0.18 : f < H.land ? 0.3 : f < H.gather ? 0.36 : f < H.markStrike ? 0.5 : f < H.phase0 ? 0.42 : f < H.knows ? 0.85 : f < H.proof ? 0.6 : f < H.watch ? 1 : 0.4;
const DRUMS = [
  [H.phase0, H.knows],
  [H.proof, H.watch],
];
const drumsAt = (f) => DRUMS.some(([a, b]) => f >= a && f < b);

const arrange = (o) => {
  const t = (frame) => (frame + o) / FPS;

  // ── pad: one voicing per chord span, the hook and the promise high and open
  CHORDS.forEach(([from, name], k) => {
    const to = k + 1 < CHORDS.length ? CHORDS[k + 1][0] : TOTAL_FRAMES;
    const ch = VOICINGS[name];
    const d = density(from);
    const level = 0.08 + 0.08 * d;
    const lift = from < H.drop || from >= H.watch ? 12 : 0;
    ch.upper.forEach((m, i) => pad(t(from), (to - from) / FPS + 0.05, m + lift, level * (i === 0 ? 1 : 0.85), ((i / 3) * 2 - 1) * 0.55));
    pad(t(from), (to - from) / FPS + 0.05, ch.bass + 12, level * 0.55, 0);
  });

  // ── bass + the pulse figure under the reading and the proof
  for (let f0 = 0; f0 < TOTAL_FRAMES; f0 += BAR_FRAMES) {
    const d = density(f0);
    const ch = chordAt(f0);
    if (f0 >= H.markStrike) sub(t(f0), ch.bass, 0.3 + 0.25 * d, d >= 0.8 ? 0.5 : 1.4);
    if (d >= 0.8) {
      sub(t(f0 + 1.5 * BEAT_FRAMES), ch.bass + 7, 0.18 + 0.1 * d, 0.32);
      sub(t(f0 + 2.5 * BEAT_FRAMES), ch.bass + 12, 0.16 + 0.1 * d, 0.3);
    }
    if (f0 >= H.phase0 - BAR_FRAMES) {
      const SCALE = [0, 2, 4, 5, 7, 9, 11];
      const shape = [0, 2, 3, 4, 6, 4, 3, 2];
      [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5].forEach((on, k) => {
        const fr = f0 + on * BEAT_FRAMES;
        if (fr < H.phase0 - 4 || fr >= TOTAL_FRAMES) return;
        // the bridge and the asking breathe, and the promise: half the figure
        if (((fr >= H.knows && fr < H.proof) || fr >= H.watch) && k % 2) return;
        const c = chordAt(fr);
        const step = shape[(k + f0 / BAR_FRAMES) % shape.length];
        const m = c.upper[0] + SCALE[step % 7] + Math.floor(step / 7) * 12 + (on >= 2.5 ? 12 : 0);
        pulse(t(fr), m, 0.1 * (0.6 + 0.4 * density(fr)), ((k % 4) / 3) * 1.1 - 0.55, 0.3);
      });
    }
  }

  // ── drums: under the reading, and full on the proof
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
  // (round 4) the cut to the graph, the new save's two ties lit; (round 14)
  // on "connects", two notes, linked, under the word
  tick(t(H.graph), 0.08, 0.95);
  if (!voiced(H.graph + 2, 12)) whoosh(t(H.graph) + 0.02, 0.45, 0.035, 0.15);
  pluck(t(H.connect + 2), 76, 0.07, -0.2, 0.45);
  pluck(t(H.connect + 6), 83, 0.06, 0.2, 0.45);
  sub(t(H.connect), 43, 0.22, 0.3);

  // ── (round 6) Ask: the answer streams on the band. (round 10) "Now every
  // save is one question away": the cut from the graph to Ask opening, a
  // light note on it, the drums out; (round 14) "So, ask it anything": the
  // question sent on "ask", in the same shot
  tick(t(H.knows), 0.09, 1.15);
  pluck(t(H.knows + 1), 79, 0.05, 0, 0.5);
  sub(t(H.knows), 43, 0.2, 0.3);
  tick(t(H.asked), 0.11, 1.2);
  sub(t(H.asked), 45, 0.2, 0.3);

  // ── the proof: the band lands; (owner, round 13) a ping on each citation
  // as it is highlighted, rising up the chord, left to right
  sub(t(H.proof), 36, 0.42, 0.6);
  CITE_PINGS.forEach((p, k) => {
    ping(t(p), [88, 91, 95][k], 0.1, (k - 1) * 0.35, 0.9, (s) => 1 / duckAt(p / FPS + s));
    tick(t(p), 0.05, 1.6 + 0.15 * k);
  });

  // ── (round 12) the sign-off: the app's mark draws in on paper, its point
  // striking as the name is said (the brand's impact, lighter than the
  // opening's); (round 13) the promise over the logo, and a bell after it
  // that rings on over the loop's cut into the hook
  impact(t(MARK_STRIKE), 0.22);
  shimmer(t(MARK_STRIKE) + 0.06, [79, 84, 88, 91], 0.04);
  sub(t(H.watch), 41, 0.26, 0.9);
  bell(t(clearOfVoice(H.watch + 2, 4)), 81, 0.06, -0.1, 2.6);

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
