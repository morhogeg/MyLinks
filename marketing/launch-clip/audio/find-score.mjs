/**
 * The FIND clip's score: the reel's instruments (audio/synth.mjs, shared by
 * every Machina score), its own arrangement on the clip's clock
 * (clips/find-timeline.mjs: 112.5 BPM, 16 frames a beat, output frames).
 *
 * The arrangement follows the cut: the hook floats (pad, sub, a soft pulse)
 * under the feed scrolling past; the band comes in ON the first card's
 * landing and runs under the four elements; it drops out for the lockup, so
 * the mark strikes into air. Sound design sits on the frames the picture
 * uses (HITS): a tap is a tick, the typing ticks on 8ths, a delete falls, a
 * card landing is a sub and a shimmer, and each found thing answers with the
 * same small falling figure. Nothing bright sounds on a word the narrator
 * has to land (the reel's round-13 rule): a figure that would fall inside a
 * line waits for it.
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
const STEPS1 = run('clear1', 'typing2');
const CHARS2 = run('typing2', 'result2');
const STEPS2 = run('clear2', 'typing3');
const CHARS3 = run('typing3', 'sources');
const typing = [
  [H.type1, CHARS1],
  [H.type2, CHARS2],
  [H.type3, CHARS3],
].map(([from, n]) => [from, from + (n - 1) * TYPE_FRAMES]);

// the reel's voicings
const VOICINGS = {
  Fmaj7: { bass: 41, upper: [57, 60, 64, 69] },
  Cmaj7: { bass: 48, upper: [59, 64, 67, 71] },
  G6: { bass: 43, upper: [59, 62, 64, 69] },
};
const chordAt = (frame) => VOICINGS[CHORDS.filter(([f]) => f <= frame).at(-1)[1]];

/** how much of the band is playing: the promise, the first search, then the
 *  band from the first card, fullest around the second */
const density = (frame) => (frame < H.fieldTap ? 0.3 : frame < H.found1 ? 0.55 : frame < H.found2 ? 0.85 : 0.95);
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

// ── melody (FM keys): the same small falling figure (D, B, G) answers each
// thing found, from its beat; a figure that would land inside a narrator
// line waits for the beat after it. Home on C for the lockup, its last note
// AFTER the last word (the reel's close)
const MANIFEST = JSON.parse(fs.readFileSync(path.join(root, 'out', 'vo', 'find', 'manifest.json'), 'utf8'));
const spoken = CAPTIONS.map((c) => {
  const m = MANIFEST.find((x) => x.frame === c.at);
  return [c.at, c.at + Math.round((m?.spoken ?? 0) * FPS)];
});
const clearOfVoice = (from, len) => {
  let f = from;
  for (const [a, b] of spoken) if (f < b + 2 && f + len > a) f = Math.ceil((b + 2) / BEAT_FRAMES) * BEAT_FRAMES;
  return f;
};
const FOUND_FIGURE = [[0, 74], [16, 71], [32, 67]]; // [frames after its start, midi]
for (const found of [H.found1, H.found2, H.chipTap + 16, H.cardTap + 16]) {
  const from = clearOfVoice(found + 16, 40);
  if (from + 40 < H.throwOut) for (const [dt, m] of FOUND_FIGURE) keys(t(from + dt), m, 0.12, dt === 16 ? 0.2 : -0.2, 2);
}
const lastWord = spoken[spoken.length - 1][1];
keys(t(H.lockup + 32), 72, 0.19, -0.2, 2.8); // C as the mark draws
keys(t(H.lockup + 80), 76, 0.12, 0.2, 2.8); // E, softer, in the breath after the name
keys(t(Math.ceil((lastWord + 4) / 8) * 8), 79, 0.19, -0.2, 2.8); // G after "find."

// ── risers, each ENDING on the reveal it leads into
for (const [from, to] of RISERS) riser(t(from), t(to - from), 0.09);

// ── sound design, on the picture's frames
// the hook: the feed flying past, and back
whoosh(t(H.scroll), 1.0, 0.025, -0.3);
whoosh(t(H.scrollBack), 0.6, 0.025, 0.3);
// the taps
for (const f of [H.fieldTap, H.chipTap, H.cardTap]) tick(t(f), 0.1, 1.2);
// the typing, on 8ths
for (const [a, b] of typing) for (let fr = Math.ceil(a / 8) * 8; fr <= b; fr += 8) tick(t(fr), 0.035, 1.6 + ((fr / 8) % 3) * 0.08);
// each query deleted a word at a time (falling ticks)
for (const [from, n] of [[H.clear1, STEPS1], [H.clear2, STEPS2]]) for (let k = 0; k < n; k++) tick(t(from + k * DELETE_FRAMES), 0.03, 1.5 - k * 0.07);
for (const f of [H.back1, H.back2]) whoosh(t(f) - 0.05, 0.45, 0.04, 0.2);
// each thing found: weight on the landing (a sub sits under the speech
// band), the shimmer clear of the voice
for (const f of [H.found1, H.found2]) {
  sub(t(f), 48, 0.3, 0.34);
  shimmer(t(clearOfVoice(f, 12)), [76, 83, 88], 0.045);
}
// the source tapped: every video lands
sub(t(H.chipTap), 43, 0.26, 0.3);
whoosh(t(H.cardTap), 0.35, 0.05, -0.15);
// thrown out into the lockup; the mark strikes into air
whoosh(t(H.lockup) - 0.1, 0.7, 0.09, 0);
impact(t(H.markStrike), 0.34);
shimmer(t(H.markStrike) + 0.08, [79, 84, 88, 91], 0.055);

S.master({ fadeInSec: 0.25, fadeOutSec: 1.1 });

const out = path.join(root, 'public', 'clips', 'find', 'score.wav');
fs.mkdirSync(path.dirname(out), { recursive: true });
S.writeWav(out);
