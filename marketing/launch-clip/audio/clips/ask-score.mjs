/**
 * The ASK feature clip's score: the film's instruments (audio/synth.mjs), the
 * reel's arrangement language, on the clip's clock (clips/ask-timeline.mjs:
 * 112.5 BPM, 16 frames a beat, written straight in output frames).
 *
 * It follows the cut: the hook floats on a held IV with no drums while the
 * feed flies past under a long whoosh and a riser; the drums come in on the
 * beat Ask arrives and run through the feature (a tick on every tap, a bell
 * on each source, as in the reel); they drop out for the lockup so the mark
 * strikes into air. The narrator talks through most of it, so the melody
 * is sparse and never lands on a word.
 *
 *   node audio/clips/ask-score.mjs && node audio/mix-vo.mjs ask
 *        → public/ask-score.wav → public/ask-score-vo.wav
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { BAR, BAR_FRAMES, BAR_CHORDS, BEAT, CAPTIONS, FPS, HITS, RISERS, TOTAL_FRAMES, TOTAL_SEC } from '../../clips/ask-timeline.mjs';
import { createSynth } from '../synth.mjs';

// The clip ends on its last frame: no tail past the end, the fade finishes in it.
const S = createSynth({ seconds: TOTAL_SEC, beat: BEAT });
const { pad, sub, pulse, keys, bell, kick, hat, rim, shaker, clap, riser, whoosh, impact, tick, shimmer } = S;

const f = (fr) => fr / FPS; // frame → seconds
const b = (n) => n * BAR; // bar → seconds
const at = (n, beats) => b(n) + beats * BEAT;
const H = HITS;

// The film's (and the reel's) chords, same voicings.
const CHORDS = {
  Fmaj7: { bass: 41, upper: [57, 60, 64, 69] },
  Cmaj7: { bass: 48, upper: [59, 64, 67, 71] },
  G6: { bass: 43, upper: [59, 62, 64, 69] },
};

const BARS = Math.ceil(TOTAL_FRAMES / BAR_FRAMES);
/** How much of the band is playing, per bar: the hook thin, the feature full,
 *  the lockup a breath. */
const DENSITY = [0.3, 0.45, 0.8, 0.86, 0.9, 0.95, 1.0, 0.95, 0.9, 0.95, 1.0, 0.92, 0.6, 0.45, 0.45];
const DRUMS = [f(H.open), f(H.lockup)]; // Ask arrives … the lockup breathes

for (let n = 0; n < BARS; n++) {
  const ch = CHORDS[BAR_CHORDS[Math.min(n, BAR_CHORDS.length - 1)]];
  const d = DENSITY[Math.min(n, DENSITY.length - 1)];
  const t0 = b(n);
  const len = Math.min(BAR, TOTAL_SEC - t0);
  const drumsFrom = Math.max(t0, DRUMS[0]);
  const drums = t0 + BAR > DRUMS[0] + 0.01 && t0 < DRUMS[1] - 0.01;

  // ── pad: the hook is voiced high and open (air before the product)
  const padLevel = 0.1 + 0.08 * d;
  const lift = n < 2 ? 12 : 0;
  ch.upper.forEach((m, i) => {
    const panPos = ((i / (ch.upper.length - 1)) * 2 - 1) * 0.55;
    pad(t0, len, m + lift, padLevel * (i === 0 ? 1 : 0.85), panPos);
  });
  pad(t0, len, ch.bass + 12, padLevel * 0.6, 0);
  if (drums) pad(t0, len, ch.upper[3] + 12, padLevel * 0.34, n % 2 ? 0.35 : -0.35);

  // ── bass: a moving line once the band is in
  if (n >= 1) sub(t0, ch.bass, 0.34 + 0.26 * d, d >= 0.7 ? 0.55 : 1.6);
  if (d >= 0.7) {
    sub(at(n, 1.5), ch.bass + 7, 0.2 + 0.1 * d, 0.36);
    sub(at(n, 2.5), ch.bass + 12, 0.18 + 0.1 * d, 0.34);
    sub(at(n, 3.5), ch.bass + 7, 0.15, 0.3);
  }

  // ── drums: four on the floor, backbeat claps, 16th hats, off-beat opens
  // (from the beat Ask arrives, which may fall inside a bar)
  if (drums) {
    const on = (beats) => at(n, beats) >= drumsFrom - 0.01 && at(n, beats) < DRUMS[1] - 0.01;
    for (let k = 0; k < 4; k++) if (on(k)) kick(at(n, k), (k % 2 ? 0.34 : 0.42) + 0.2 * d);
    if (on(1)) clap(at(n, 1), 0.17 + 0.05 * d);
    if (on(3)) clap(at(n, 3), 0.17 + 0.05 * d);
    if (on(2.75)) rim(at(n, 2.75), 0.08 + 0.04 * d);
    for (let k = 0; k < 16; k++) {
      if (!on(k / 4)) continue;
      const accent = k % 4 === 0 ? 0.9 : k % 2 ? 1 : 0.55;
      hat(at(n, k / 4), 0.034 * accent * d, k % 2 ? 0.22 : -0.18);
      shaker(at(n, k / 4), 0.02 * d, k % 2 ? 0.34 : -0.3);
    }
    for (let k = 0; k < 4; k++) if (on(k + 0.5)) hat(at(n, k + 0.5), 0.03 * d, 0.1, true);
  }

  // ── the pulse figure: the film's scale walk (degrees 0-2-3-4-6)
  if (n >= 1 && t0 < f(H.lockup)) {
    const SCALE = [0, 2, 4, 5, 7, 9, 11];
    const shape = [0, 2, 3, 4, 6, 4, 3, 2];
    const onsets = drums ? [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] : [0, 0.75, 1.5, 2, 2.75, 3.5];
    onsets.forEach((o, k) => {
      if (at(n, o) >= f(H.lockup)) return;
      const step = shape[(k + n) % shape.length];
      const m = ch.upper[0] + SCALE[step % 7] + Math.floor(step / 7) * 12 + (o >= 2.5 ? 12 : 0);
      pulse(at(n, o), m, (drums ? 0.09 : 0.11) * (0.62 + 0.38 * d), ((k % 4) / 3) * 1.1 - 0.55, drums ? 0.3 : 0.4);
    });
  }
}

// ── the lockup: one held voicing under the end, a single breath
for (const m of [48, 64, 67, 72]) pad(f(H.lockup), TOTAL_SEC - f(H.lockup) - 0.2, m, 0.08, m === 64 ? -0.4 : 0.35);

// ── melody (FM keys), sparse: the narrator talks through most of the clip,
// so the tune answers in the gaps and lands home on C for the lockup (the
// reel's round-13 rule: never a note on a word the narrator has to land)
const LINE = CAPTIONS.find((c) => c.place === 'lockup');
const MELODY = [
  [f(H.open) / BAR, 0, 72, 0.13], // Ask arrives
  [f(H.chips[0]) / BAR, 0, 76, 0.1], [f(H.chips[1]) / BAR, 0, 79, 0.1], [f(H.chips[2]) / BAR, 0, 84, 0.1],
  [f(H.markStrike) / BAR - 1 / 4, 0, 72, 0.17], // a beat before the mark strikes
  [f(LINE.at + 16) / BAR, 0, 76, 0.12], // in the breath after the name
  [f(LINE.at + 80) / BAR, 0, 79, 0.17], // AFTER the last word
];
for (const [n, bt, m, level] of MELODY) keys(at(n, bt), m, level, Math.floor(n) % 2 ? 0.2 : -0.2, n >= 12 ? 2.8 : 1.8);

// ── risers, each ENDING on the reveal it leads into
for (const [from, to] of RISERS) riser(f(from), f(to) - f(from), 0.09);

// ── sound design, on the picture's frames

// NOTHING NOISY UNDER THE VOICE (Gemini narrator, 2026-10-03): a whoosh or a
// riser under a spoken line reads as static between its words, so a whoosh
// plays only where no caption is up, and the hook's whoosh and riser wait for
// its last word
const HOOK_END = CAPTIONS[0].to;
const clear = (fr, sec) => !CAPTIONS.some((c) => fr < c.to && fr + sec * FPS > c.at);
const quietWhoosh = (fr, at, sec, ...rest) => clear(fr, sec) && whoosh(at, sec, ...rest);

// the hook: the feed flying past (a long whoosh with the scroll), then Ask
whoosh(f(HOOK_END), f(H.open - HOOK_END), 0.05, -0.2);
impact(f(H.open), 0.22);
shimmer(f(H.appMark), [79, 84, 88], 0.03); // the app's own mark strikes

// the question: typing on 16ths (a character lands every K frames)
for (let fr = H.typeFrom; fr < H.typeFrom + 64; fr += 4) tick(f(fr), 0.035, 1.6 + ((fr / 4) % 3) * 0.08);

// send, and the answer arriving on the touch
tick(f(H.send), 0.11, 1.3);
quietWhoosh(H.send, f(H.send), 0.4, 0.06, 0.25);

// the three sources, each on its beat (the reel's citation bells)
H.chips.forEach((fr, i) => {
  sub(f(fr), [48, 52, 55][i], 0.22, 0.26);
  bell(f(fr), [84, 88, 91][i], 0.05, [-0.35, 0, 0.35][i], 1.6);
});

// a source tapped: its card opens; its passage lifts; the card closes
tick(f(H.citeTap), 0.1, 1.2);
quietWhoosh(H.citeTap, f(H.citeTap) + 0.03, 0.45, 0.06, -0.2);
sub(f(H.citeTap), 43, 0.2, 0.3);
bell(f(H.summary), 88, 0.045, 0.2, 1.8);
tick(f(H.closeTap), 0.09, 1.1);
quietWhoosh(H.closeTap, f(H.closeTap), 0.3, 0.04, 0.2);

// the follow-up tapped: the second answer
tick(f(H.followTap), 0.1, 1.25);
quietWhoosh(H.followTap, f(H.followTap), 0.4, 0.05, -0.25);

// the graph
tick(f(H.graphTap), 0.1, 1.2);
// (soft: the narrator is mid-line; round 13's rule, nothing loud on a word)
impact(f(H.graphTap), 0.1);

// the lockup: the graph is thrown out, the mark strikes into air
quietWhoosh(H.lockup - 18, f(H.lockup) - 0.6, 0.7, 0.09, 0);
impact(f(H.markStrike), 0.34);
shimmer(f(H.markStrike) + 0.08, [79, 84, 88, 91], 0.055);

S.master({ fadeInSec: 0.25, fadeOutSec: 1.1 });

const here = path.dirname(fileURLToPath(import.meta.url));
fs.mkdirSync(path.join(here, '..', '..', 'public'), { recursive: true });
S.writeWav(path.join(here, '..', '..', 'public', 'ask-score.wav'));
