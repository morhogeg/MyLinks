/**
 * The FIND clip's score: the reel's instruments (audio/synth.mjs, shared by
 * every Machina score), its own arrangement on the clip's clock
 * (clips/find-timeline.mjs: 112.5 BPM, 16 frames a beat, output frames).
 *
 * The arrangement follows the cut: pad, sub and the pulse under the promise
 * and the first search, the typing ticking on 8ths; the band comes in ON the
 * first card's landing and runs under the second search; it drops out for
 * the lockup, so the mark strikes into air. Sound design sits on the frames
 * the picture uses (HITS): a tap is a tick, a card landing is a sub, a found
 * card answers with the same small falling figure both times. Nothing bright
 * sounds on a word the narrator has to land (the reel's round-13 rule): the
 * second card's shimmer and figure wait for "meant.", the last note for
 * "find."
 *
 *   node audio/find-score.mjs   →   public/clips/find/score.wav
 *   (then `node audio/mix-vo.mjs find` for the narrated, mastered mix)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BEAT,
  BEAT_FRAMES,
  BAR_FRAMES,
  CAPTIONS,
  CHORDS,
  DELETE_FRAMES,
  FPS,
  HITS,
  RISERS,
  TOTAL_FRAMES,
  TOTAL_SEC,
  TYPE_FRAMES,
} from '../clips/find-timeline.mjs';
import { createSynth } from './synth.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

// The clip ends on its last frame: no tail past the end, the fade finishes in it.
const S = createSynth({ seconds: TOTAL_SEC, beat: BEAT });
const { pad, sub, pulse, keys, bell, kick, hat, rim, shaker, clap, riser, whoosh, impact, tick, shimmer } = S;

const H = HITS;
const t = (frame) => frame / FPS;

// the take's runs (the typed characters, the delete's steps), so the ticks
// follow what the picture shows
const TAKE = JSON.parse(fs.readFileSync(path.join(root, 'src', 'reels', 'clips', 'find', 'takes.json'), 'utf8'))['clips/find/search'];
const run = (from, to) => TAKE.marks[to] - TAKE.marks[from];
const CHARS1 = run('typing1', 'result1');
const STEPS = run('clear', 'typing2');
const CHARS2 = run('typing2', 'result2');
const lastChar1 = H.type1 + (CHARS1 - 1) * TYPE_FRAMES;
const lastChar2 = H.type2 + (CHARS2 - 1) * TYPE_FRAMES;

// the reel's voicings
const VOICINGS = {
  Fmaj7: { bass: 41, upper: [57, 60, 64, 69] },
  Cmaj7: { bass: 48, upper: [59, 64, 67, 71] },
  G6: { bass: 43, upper: [59, 62, 64, 69] },
};
const chordAt = (frame) => VOICINGS[CHORDS.filter(([f]) => f <= frame).at(-1)[1]];

/** how much of the band is playing: the promise, the first search, then the
 *  band from the first card, fullest around the second */
const density = (frame) =>
  frame < H.fieldTap ? 0.3 : frame < H.found1 ? 0.55 : frame < H.back ? 0.85 : frame < H.found2 ? 0.9 : 1.0;
const DRUMS = [H.found1, H.lockup];

// ── pad: one voicing per chord span, up to the lockup (its own voicing below);
// the open is voiced high and open, air before the product
CHORDS.forEach(([from, name], k) => {
  if (from >= H.lockup) return;
  const to = Math.min(H.lockup, k + 1 < CHORDS.length ? CHORDS[k + 1][0] : TOTAL_FRAMES);
  const ch = VOICINGS[name];
  const d = density(from);
  const level = 0.1 + 0.08 * d;
  const lift = from < H.fieldTap ? 12 : 0;
  ch.upper.forEach((m, i) => pad(t(from), t(to - from), m + lift, level * (i === 0 ? 1 : 0.85), ((i / 3) * 2 - 1) * 0.55));
  pad(t(from), t(to - from), ch.bass + 12, level * 0.6, 0);
  if (from >= DRUMS[0]) pad(t(from), t(to - from), ch.upper[3] + 12, level * 0.34, k % 2 ? 0.35 : -0.35);
});

// ── bass and the pulse figure, per bar up to the lockup
for (let f0 = 0; f0 < H.lockup; f0 += BAR_FRAMES) {
  const ch = chordAt(f0);
  const d = density(f0);
  const drums = f0 + BAR_FRAMES > DRUMS[0];
  if (f0 >= H.fieldTap) sub(t(f0), ch.bass, 0.34 + 0.26 * d, d >= 0.7 ? 0.55 : 1.6);
  if (d >= 0.7) {
    sub(t(f0 + 1.5 * BEAT_FRAMES), ch.bass + 7, 0.2 + 0.1 * d, 0.36);
    sub(t(f0 + 2.5 * BEAT_FRAMES), ch.bass + 12, 0.18 + 0.1 * d, 0.34);
    sub(t(f0 + 3.5 * BEAT_FRAMES), ch.bass + 7, 0.15, 0.3);
  }
  // the film's scale walk (degrees 0-2-3-4-6), from the tap on
  if (f0 >= H.fieldTap) {
    const SCALE = [0, 2, 4, 5, 7, 9, 11];
    const shape = [0, 2, 3, 4, 6, 4, 3, 2];
    const onsets = drums ? [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] : [0, 0.75, 1.5, 2, 2.75, 3.5];
    onsets.forEach((on, k) => {
      const fr = f0 + on * BEAT_FRAMES;
      if (fr >= H.lockup) return;
      const c = chordAt(fr);
      const step = shape[(k + f0 / BAR_FRAMES) % shape.length];
      const m = c.upper[0] + SCALE[step % 7] + Math.floor(step / 7) * 12 + (on >= 2.5 ? 12 : 0);
      pulse(t(fr), m, (drums ? 0.1 : 0.12) * (0.62 + 0.38 * d), ((k % 4) / 3) * 1.1 - 0.55, drums ? 0.3 : 0.4);
    });
  }
}

// ── drums: from the first card's landing to the lockup, per beat
// (four on the floor, backbeat claps, 16th hats, off-beat opens)
for (let fr = DRUMS[0]; fr < DRUMS[1]; fr += BEAT_FRAMES) {
  const d = density(fr);
  const inBar = (fr % BAR_FRAMES) / BEAT_FRAMES; // 0–3
  kick(t(fr), (inBar % 2 ? 0.34 : 0.42) + 0.2 * d);
  if (inBar % 2) clap(t(fr), 0.17 + 0.05 * d);
  if (inBar === 2) rim(t(fr + 0.75 * BEAT_FRAMES), 0.08 + 0.04 * d);
  for (let k = 0; k < 4; k++) {
    const accent = k === 0 ? 0.9 : k % 2 ? 1 : 0.55;
    hat(t(fr + k * 4), 0.034 * accent * d, k % 2 ? 0.22 : -0.18);
    shaker(t(fr + k * 4), 0.02 * d, k % 2 ? 0.34 : -0.3);
  }
  hat(t(fr + 8), 0.03 * d, 0.1, true);
}

// ── the lockup: one held voicing under the end, a single breath (the reel's)
for (const m of [48, 64, 67, 72]) pad(t(H.lockup), TOTAL_SEC - t(H.lockup) - 0.2, m, 0.08, m === 64 ? -0.4 : 0.35);

// ── melody (FM keys): the same small falling figure answers each found card
// (G6: D, B, G on beats), the first from its ink ring, the second AFTER
// "…the one you meant."; home on C for the lockup, its last note AFTER the
// last word (the reel's close)
const FOUND_FIGURE = [[0, 74], [16, 71], [32, 67]]; // [frames after its start, midi]
const VOICE = (line) => {
  const c = CAPTIONS[line];
  const m = JSON.parse(fs.readFileSync(path.join(root, 'out', 'vo', 'find', 'manifest.json'), 'utf8')).find((x) => x.frame === c.at);
  return { from: c.at, to: c.at + Math.round((m?.spoken ?? 0) * FPS) };
};
const said2 = VOICE(1); // "Type what you remember. Get the one you meant."
const said3 = VOICE(2); // "Machina. Never lose another great find."
const after2 = Math.ceil((said2.to + 2) / BEAT_FRAMES) * BEAT_FRAMES; // the beat after "meant."
for (const [dt, m] of FOUND_FIGURE) keys(t(H.found1 + 16 + dt), m, 0.12, dt === 16 ? 0.2 : -0.2, 2);
for (const [dt, m] of FOUND_FIGURE) keys(t(after2 + dt), m, 0.13, dt === 16 ? 0.2 : -0.2, 2);
keys(t(H.lockup + 32), 72, 0.19, -0.2, 2.8); // C as the mark draws
keys(t(H.lockup + 80), 76, 0.12, 0.2, 2.8); // E, softer, in the breath after the name
keys(t(Math.ceil((said3.to + 4) / 8) * 8), 79, 0.19, -0.2, 2.8); // G after "find."

// ── risers, each ENDING on the reveal it leads into
for (const [from, to] of RISERS) riser(t(from), t(to - from), 0.09);

// ── sound design, on the picture's frames
// the open: a glint as the kicker arrives
bell(t(12), 84, 0.035, -0.3, 1.6);
// the tap on the field, the typing on 8ths
tick(t(H.fieldTap), 0.1, 1.2);
for (let fr = H.type1; fr <= lastChar1; fr += 8) tick(t(fr), 0.035, 1.6 + ((fr / 8) % 3) * 0.08);
// the first card lands: the band comes in on it
sub(t(H.found1), 48, 0.3, 0.34);
shimmer(t(H.found1), [76, 83, 88], 0.045);
// back to the field; the query deleted a word at a time (falling ticks)
whoosh(t(H.back) - 0.05, 0.45, 0.04, 0.2);
for (let k = 0; k < STEPS; k++) tick(t(H.clear + k * DELETE_FRAMES), 0.03, 1.5 - k * 0.07);
// the second query, on 8ths
for (let fr = Math.ceil(H.type2 / 8) * 8; fr <= lastChar2; fr += 8) tick(t(fr), 0.035, 1.6 + ((fr / 8) % 3) * 0.08);
// the second card lands on the downbeat under "Get the one you meant.": the
// weight on the landing (a sub sits under the speech band), the shimmer after
sub(t(H.found2), 48, 0.32, 0.34);
shimmer(t(after2), [76, 83, 88], 0.04);
// thrown out into the lockup; the mark strikes into air
whoosh(t(H.lockup) - 0.1, 0.7, 0.09, 0);
impact(t(H.markStrike), 0.34);
shimmer(t(H.markStrike) + 0.08, [79, 84, 88, 91], 0.055);

S.master({ fadeInSec: 0.25, fadeOutSec: 1.1 });

const out = path.join(root, 'public', 'clips', 'find', 'score.wav');
fs.mkdirSync(path.dirname(out), { recursive: true });
S.writeWav(out);
