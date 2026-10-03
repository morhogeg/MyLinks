/**
 * Meta ad 3's score: the film's and the reel's instruments (audio/synth.mjs),
 * its own arrangement on the ad's clock (clips/ad-todo-timeline.mjs: 112.5
 * BPM, 16 frames a beat, OUTPUT frames).
 *
 * Round 6 (the owner's approved script, a person talking: the pain, the
 * answer, save from any app, analyzed and summarized, linked; read in short
 * lines at the house pace, like the other ads). A feed ad starts mid-scroll, so the music is already
 * playing on frame 0. The saves bleach on a falling whoosh and rush into the
 * mark (whooshes, the impact, the snap); the band comes in as the app opens
 * and each save lands with a soft thud under its word; the feed glides on a
 * long whoosh; a riser ends on the cut to the lit cluster, and once "…related
 * saves." has landed, a shimmer; the band drops out
 * for the lockup, so the mark strikes into air under "Machina." The
 * kit's rules: one chord a bar, risers END on the reveal they lead into, a tap
 * is a tick on the frame the app responds, nothing pitched sounds on a word
 * the narrator has to land (notes and shimmers sit in the gaps).
 *
 *   node audio/ads/todo-score.mjs           →   public/ads/todo/score.wav
 *   node audio/mix-vo.mjs adtodo            →   public/ads/todo/score-vo.wav
 *   node audio/mix-vo.mjs adtodo-music      →   public/ads/todo/score-music.wav
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BAR, BAR_CHORDS, BAR_FRAMES, BEAT, DRUMS, FPS, HITS, RISERS, TOTAL_FRAMES, TOTAL_SEC } from '../../clips/ad-todo-timeline.mjs';
import { createSynth } from '../synth.mjs';

const S = createSynth({ seconds: TOTAL_SEC, beat: BEAT });
const { pad, sub, pulse, keys, bell, kick, hat, rim, shaker, clap, riser, whoosh, impact, tick, shimmer } = S;

const s = (frame) => frame / FPS;
const b = (bar) => bar * BAR;
const at = (bar, beats) => b(bar) + beats * BEAT;

// the reel's (the film's) voicings
const CHORDS = {
  Fmaj7: { bass: 41, upper: [57, 60, 64, 69] },
  Cmaj7: { bass: 48, upper: [59, 64, 67, 71] },
  G6: { bass: 43, upper: [59, 62, 64, 69] },
};

const BARS = Math.ceil(TOTAL_FRAMES / BAR_FRAMES);
/** how much of the band plays, per bar */
const DENSITY = [0.3, 0.32, 0.34, 0.35, 0.36, 0.37, 0.4, 0.44, 0.52, 0.58, 0.62, 0.64, 0.64, 0.66, 0.66, 0.68, 0.68, 0.68, 0.66, 0.6, 0.42, 0.34, 0.3];
const LOCKUP = s(HITS.out);

for (let bar = 0; bar < BARS; bar++) {
  const ch = CHORDS[BAR_CHORDS[bar]];
  const d = DENSITY[bar];
  const t0 = b(bar);
  const len = Math.min(BAR, TOTAL_SEC - t0);
  const drums = t0 >= s(DRUMS[0]) - 0.01 && t0 < s(DRUMS[1]) - 0.01;
  const lockup = t0 >= LOCKUP - 0.01;

  // ── pad (already sounding on frame 0)
  const padLevel = 0.11 + 0.08 * d;
  if (!lockup) {
    ch.upper.forEach((m, i) => pad(t0, Math.min(len, LOCKUP - t0 + 0.4), m, padLevel * (i === 0 ? 1 : 0.85), ((i / (ch.upper.length - 1)) * 2 - 1) * 0.55));
    pad(t0, Math.min(len, LOCKUP - t0 + 0.4), ch.bass + 12, padLevel * 0.6, 0);
  }

  // ── bass
  if (!lockup) sub(t0, ch.bass, 0.3 + 0.26 * d, drums ? 0.55 : 1.6);
  if (drums) {
    sub(at(bar, 1.5), ch.bass + 7, 0.18 + 0.1 * d, 0.36);
    sub(at(bar, 2.5), ch.bass + 12, 0.16 + 0.1 * d, 0.34);
    sub(at(bar, 3.5), ch.bass + 7, 0.14, 0.3);
  }

  // ── drums (the reel's kit, lighter: the viewer is reading)
  if (drums) {
    for (let k = 0; k < 4; k++) if (at(bar, k) < LOCKUP) kick(at(bar, k), (k % 2 ? 0.3 : 0.38) + 0.18 * d);
    clap(at(bar, 1), 0.14 + 0.05 * d);
    if (at(bar, 3) < LOCKUP) clap(at(bar, 3), 0.14 + 0.05 * d);
    rim(at(bar, 2.75), 0.07 + 0.04 * d);
    for (let k = 0; k < 16; k++) {
      if (at(bar, k / 4) >= LOCKUP) break;
      const accent = k % 4 === 0 ? 0.9 : k % 2 ? 1 : 0.55;
      hat(at(bar, k / 4), 0.03 * accent * d, k % 2 ? 0.22 : -0.18);
      shaker(at(bar, k / 4), 0.018 * d, k % 2 ? 0.34 : -0.3);
    }
  }

  // ── the pulse figure: the film's scale walk (degrees 0-2-3-4-6), from frame 0
  if (!lockup) {
    const SCALE = [0, 2, 4, 5, 7, 9, 11];
    const shape = [0, 2, 3, 4, 6, 4, 3, 2];
    const onsets = drums ? [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] : [0, 0.75, 1.5, 2, 2.75, 3.5];
    onsets.forEach((on, k) => {
      if (at(bar, on) >= LOCKUP) return;
      const step = shape[(k + bar) % shape.length];
      const m = ch.upper[0] + SCALE[step % 7] + Math.floor(step / 7) * 12 + (on >= 2.5 ? 12 : 0);
      pulse(at(bar, on), m, (drums ? 0.09 : 0.11) * (0.62 + 0.38 * d), ((k % 4) / 3) * 1.1 - 0.55, drums ? 0.3 : 0.4);
    });
  }
}

// ── the lockup: one held voicing under the end, a single breath
for (const m of [48, 64, 67, 72]) pad(LOCKUP, TOTAL_SEC - LOCKUP - 0.1, m, 0.08, m === 64 ? -0.4 : 0.35);

// ── melody (FM keys), in the narrator's pauses (src/reels/ads/todo/vo.json),
// never on a word
const MELODY = [
  // [frame, midi, level?] (round 6: the narrator talks almost throughout; the
  // melody only answers in the real pauses)
  [470, 76], // after "…different apps."
  [1062, 72, 0.15], // after "…why you kept it."
  [1272, 74, 0.15], // after "…each other.", into the lockup
  [TOTAL_FRAMES - 44, 79, 0.17], // after the last word
];
for (const [fr, m, level] of MELODY) keys(s(fr), m, level ?? 0.13, (fr / 16) % 2 ? 0.2 : -0.2, fr >= HITS.out ? 2.6 : 1.8);

// ── risers, each ENDING on the reveal it leads into
for (const [from, to] of RISERS) riser(s(from), s(to) - s(from), 0.09);

// ── sound design, on the picture's frames (HITS). Under a word only
// unpitched sounds (ticks, whooshes, sub thumps); shimmers in the pauses.
const H = HITS;
// THE PAIN: they grey out; each named save lifts (a soft air and a click);
// they drift apart on "buried"
whoosh(s(H.grey) + 0.05, 0.9, 0.045, 0);
for (const [k, n] of H.named.entries()) {
  tick(s(n + 1), 0.06, 0.9 + k * 0.08);
  whoosh(s(n) - 0.04, 0.28, 0.03, k % 2 ? 0.3 : -0.3);
}
whoosh(s(H.bury[0]) + 0.05, 1.6, 0.05, 0);
// THE ANSWER: they rush into the point; the brackets snap on "Machina"
whoosh(s(H.gather[0]) + 0.05, 0.5, 0.09, -0.35);
whoosh(s(H.gather[0]) + 0.1, 0.45, 0.09, 0.35);
impact(s(H.gather[1]), 0.24);
sub(s(H.gather[1]), 36, 0.24, 0.6);
tick(s(H.snap), 0.1, 0.85);
whoosh(s(H.iris[0]) - 0.05, 0.45, 0.06, 0);
// SAVE: each save lands with a soft thud
for (const [k, l] of H.lands.entries()) {
  sub(s(l + 2), 40 + k * 2, 0.16, 0.22);
  tick(s(l + 2), 0.05, 0.8 + k * 0.1);
}
// WHAT IT DOES: the glide; the card tapped open; down to its Key Points
whoosh(s(H.glide[0]) + 0.05, 2.6, 0.03, 0.1);
tick(s(H.kpOpen), 0.09, 1.25);
whoosh(s(H.kpOpen) + 0.05, 0.3, 0.045, -0.15);
whoosh(s(H.kpScroll[0]), 0.6, 0.03, 0.1);
sub(s(H.keyPoints), 45, 0.12, 0.3);
// LINKED: the riser ends on the cut into the graph; the second cluster
sub(s(H.cluster), 48, 0.2, 0.4);
whoosh(s(H.cluster2) - 0.05, 0.5, 0.04, 0.15);
sub(s(H.cluster2), 43, 0.14, 0.3);
// CLOSE: thrown out; the mark strikes into air
whoosh(s(H.out) - 0.1, 0.6, 0.09, 0);
impact(s(H.markStrike), 0.34);
shimmer(s(H.markStrike) + 0.08, [79, 84, 88, 91], 0.05);

S.master({ fadeInSec: 0.02, fadeOutSec: 1.0 });

const here = path.dirname(fileURLToPath(import.meta.url));
S.writeWav(path.join(here, '..', '..', 'public', 'ads', 'todo', 'score.wav'));
