/**
 * The highlight reel's score: the film's instruments (audio/synth.mjs), its
 * own arrangement on the reel's clock (reel-timeline.mjs, 112.5 BPM, 16
 * frames a beat).
 *
 * The arrangement follows the cut, not a loop: the hook floats on a held IV
 * with no drums until the saves collapse into one point; the mark lands on
 * beat 3 of bar 0 and the harmony resolves home on bar 1; the drums come in
 * on the downbeat the real app appears (bar 2) and run hot through the hero
 * (Ask); they drop out for the lockup so the mark strikes into air.
 *
 * Sound design sits on the same frames the picture uses (HITS): a tap is a
 * tick, a phase of the save pipeline is a rising tick, a card landing is a
 * sub, a citation is a bell, a fling is a whoosh, typing is 16th-note clicks.
 *
 *   node audio/reel-score.mjs   →   public/reel-score.wav
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BAR, BAR_FRAMES, BEAT, BAR_CHORDS, FPS, HITS, RISERS, TOTAL_FRAMES, TOTAL_SEC, holdStart, real, srcOf } from '../reel-timeline.mjs';
import { createSynth } from './synth.mjs';

// Round 3/4: the round-1 score, on the reel's variable-speed clock. Everything is
// written against SOURCE frames (the round-1 cut) and placed where that
// moment now falls in the output (real()); the groove runs at 90 BPM, so a
// round-1 bar is two bars here.

// The reel ends on its last frame: no tail past the end, the fade finishes in it.
const S = createSynth({ seconds: TOTAL_SEC, beat: BEAT });
const { pad, sub, pulse, keys, bell, kick, hat, rim, shaker, clap, riser, whoosh, impact, tick, shimmer } = S;

const f = (src) => real(src) / FPS; // SOURCE frame → seconds in the output
const b = (bar) => bar * BAR; // OUTPUT bar → seconds
const at = (bar, beats) => b(bar) + beats * BEAT;

// The film's four chords, same voicings.
const CHORDS = {
  Fmaj7: { bass: 41, upper: [57, 60, 64, 69] },
  Cmaj7: { bass: 48, upper: [59, 64, 67, 71] },
  G6: { bass: 43, upper: [59, 62, 64, 69] },
};

const BARS = Math.ceil(TOTAL_FRAMES / BAR_FRAMES); // output bars
/** the round-1 bar (64 source frames) an output bar falls in */
const srcBar = (bar) => Math.min(BAR_CHORDS.length - 1, Math.floor(srcOf(bar * BAR_FRAMES + 1) / 64));

/** How much of the band is playing, per ROUND-1 bar. */
const DENSITY = [0.3, 0.52, 0.86, 0.92, 0.97, 1.0, 0.96, 0.92, 0.5, 0.45];
const DRUMS = [f(128), f(512)]; // the app appears … the lockup breathes

for (let bar = 0; bar < BARS; bar++) {
  const sb = srcBar(bar);
  const ch = CHORDS[BAR_CHORDS[sb]];
  const d = DENSITY[sb];
  const t0 = b(bar);
  const len = Math.min(BAR, TOTAL_SEC - t0);
  const drums = t0 >= DRUMS[0] - 0.01 && t0 < DRUMS[1] - 0.01;

  // ── pad: the hook is voiced high and open (air before the product)
  const padLevel = 0.1 + 0.08 * d;
  const lift = sb < 1 ? 12 : 0;
  ch.upper.forEach((m, i) => {
    const panPos = ((i / (ch.upper.length - 1)) * 2 - 1) * 0.55;
    pad(t0, len, m + lift, padLevel * (i === 0 ? 1 : 0.85), panPos);
  });
  pad(t0, len, ch.bass + 12, padLevel * 0.6, 0);
  if (drums) pad(t0, len, ch.upper[3] + 12, padLevel * 0.34, bar % 2 ? 0.35 : -0.35);

  // ── bass: a moving line once the band is in
  if (sb >= 1) sub(t0, ch.bass, 0.34 + 0.26 * d, d >= 0.7 ? 0.55 : 1.6);
  if (d >= 0.7) {
    sub(at(bar, 1.5), ch.bass + 7, 0.2 + 0.1 * d, 0.36);
    sub(at(bar, 2.5), ch.bass + 12, 0.18 + 0.1 * d, 0.34);
    sub(at(bar, 3.5), ch.bass + 7, 0.15, 0.3);
  }

  // ── drums: four on the floor, backbeat claps, 16th hats, off-beat opens
  if (drums) {
    for (let k = 0; k < 4; k++) kick(at(bar, k), (k % 2 ? 0.34 : 0.42) + 0.2 * d);
    clap(at(bar, 1), 0.17 + 0.05 * d);
    clap(at(bar, 3), 0.17 + 0.05 * d);
    rim(at(bar, 2.75), 0.08 + 0.04 * d);
    for (let k = 0; k < 16; k++) {
      const accent = k % 4 === 0 ? 0.9 : k % 2 ? 1 : 0.55;
      hat(at(bar, k / 4), 0.034 * accent * d, k % 2 ? 0.22 : -0.18);
      shaker(at(bar, k / 4), 0.02 * d, k % 2 ? 0.34 : -0.3);
    }
    for (let k = 0; k < 4; k++) hat(at(bar, k + 0.5), 0.03 * d, 0.1, true);
  }

  // ── the pulse figure: the film's scale walk (degrees 0-2-3-4-6)
  if (sb >= 1 && t0 < f(512)) {
    const SCALE = [0, 2, 4, 5, 7, 9, 11];
    const shape = [0, 2, 3, 4, 6, 4, 3, 2];
    const onsets = drums ? [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] : [0, 0.75, 1.5, 2, 2.75, 3.5];
    onsets.forEach((on, k) => {
      if (at(bar, on) >= TOTAL_SEC) return;
      const step = shape[(k + bar) % shape.length];
      const m = ch.upper[0] + SCALE[step % 7] + Math.floor(step / 7) * 12 + (on >= 2.5 ? 12 : 0);
      pulse(at(bar, on), m, (drums ? 0.1 : 0.12) * (0.62 + 0.38 * d), ((k % 4) / 3) * 1.1 - 0.55, drums ? 0.3 : 0.4);
    });
  }
}

// ── the lockup: one held voicing under the end, a single breath
for (const m of [48, 64, 67, 72]) pad(f(512), TOTAL_SEC - f(512) - 0.2, m, 0.08, m === 64 ? -0.4 : 0.35);

// ── melody (FM keys): a lead-in over Save/Find, the tune over the hero, home
// on C for the lockup. Stepwise, with E→F and B→C in the line.
const MELODY = [
  [2, 0, 67], [2, 2, 69], [3, 0, 71], [3, 2.5, 72], // lead-in (quiet)
  [4, 0, 64], [4, 1.5, 65], [4, 3, 67], // Ask: E F G
  [5, 0, 72], [5, 1.5, 71], [5, 2, 72], [5, 3, 74], // the chips: C B C D
  [6, 0, 71], [6, 2, 67], [7, 0, 69], [7, 2, 71], // connect → revisit: B G A B
  [8, 1, 72], [8, 2.5, 76], [9, 0, 79], // home: C E G
];
for (const [bar, bt, m] of MELODY) {
  const lead = bar < 4;
  keys(f(bar * 64 + bt * 16), m, lead ? 0.11 : bar >= 8 ? 0.19 : 0.16, bar % 2 ? 0.2 : -0.2, bar >= 8 ? 2.8 : 2);
}

// ── risers, each ENDING on the reveal it leads into
for (const [from, to] of RISERS) riser(f(from), f(to) - f(from), 0.09);

// ── sound design, on the picture's frames
const H = HITS;

// the hook: saves appearing as scattered glints, the rush, the point, the snap
[4, 8, 12, 16, 20, 24, 28].forEach((fr, i) => bell(f(fr), [84, 88, 91, 86, 89, 93, 95][i], 0.028, i % 2 ? 0.45 : -0.45, 1.2));
whoosh(f(H.collapse) - 0.3, 0.55, 0.1, -0.35);
whoosh(f(H.collapse) - 0.25, 0.5, 0.1, 0.35);
impact(f(H.dotLands), 0.36);
sub(f(H.dotLands), 36, 0.3, 0.6);
tick(f(H.bracketsClose), 0.11, 0.85);
sub(f(H.bracketsClose), 43, 0.18, 0.25);
shimmer(f(H.markLocked), [72, 79, 84, 88], 0.05);
whoosh(f(H.toApp) - 0.1, 0.5, 0.08, 0);
// the mark holds on its own now (no tagline over it): a held, lifting chord
// under it so the music does not drop out
[60, 64, 67, 71].forEach((m, i) => pad(f(H.markLocked) - 0.2, f(H.toApp) - f(H.markLocked) + 0.4, m, 0.13, (i / 3) * 1.1 - 0.55));
sub(f(H.markLocked), 36, 0.22, 1.2);

// save: tap, the dialog, the five phases climbing, saved, the card landing
tick(f(H.plusTap), 0.1, 1.1);
whoosh(f(H.dialog) - 0.08, 0.35, 0.05, 0.2);
tick(f(H.saveTap), 0.1, 1.2);
H.phases.forEach((fr, i) => {
  tick(f(fr), 0.075, 1.0 + i * 0.12);
  bell(f(fr), [72, 76, 79, 83, 84][i], 0.035, i % 2 ? 0.3 : -0.3, 0.9);
});
shimmer(f(H.saved), [84, 88, 91], 0.045);
sub(f(H.cardLands), 43, 0.3, 0.32);
tick(f(H.cardLands), 0.09, 0.9);

// the insert: the new card, tapped open, its Key Points arriving (output
// frames: scenes/CardDetail.tsx taps at +20 and lands the Key Points at +130)
const I0 = holdStart('card') / FPS;
tick(I0 + 20 / FPS, 0.09, 1.2);
whoosh(I0 + 22 / FPS, 0.35, 0.05, -0.15);
shimmer(I0 + 130 / FPS, [79, 84, 88], 0.035);

// find: the tap, typing on 16ths, the one card
tick(f(H.searchTap), 0.09, 1.25);
for (let fr = H.typeFrom; fr < H.found; fr += 4) tick(f(fr), 0.035, 1.6 + ((fr / 4) % 3) * 0.08);
sub(f(H.found), 48, 0.3, 0.34);
shimmer(f(H.found), [76, 83, 88], 0.045);

// ask: tap, typing, send, the stream, three citations
tick(f(H.askTap), 0.1, 1.15);
for (let fr = H.askTypeFrom; fr < H.send; fr += 4) tick(f(fr), 0.035, 1.6 + ((fr / 4) % 3) * 0.08);
tick(f(H.send), 0.11, 1.3);
whoosh(f(H.send), 0.4, 0.06, 0.25);
shimmer(f(H.answerFrom), [79, 84], 0.03);
H.chips.forEach((fr, i) => {
  sub(f(fr), [48, 52, 55][i], 0.22, 0.26);
  bell(f(fr), [84, 88, 91][i], 0.06, [-0.35, 0, 0.35][i], 1.6);
});
tick(f(H.graphTap), 0.1, 1.2);
whoosh(f(H.graphTap) + 0.03, 0.5, 0.07, -0.2);

// connect: the graph arrives
impact(f(H.graph), 0.24);
shimmer(f(H.graph) + 0.05, [72, 76, 79, 84], 0.045);

// recall (the review deck's slot): the tab, this week's recap, its standout
tick(f(H.revisitTap), 0.09, 1.15);
tick(f(H.recapTap), 0.09, 1.3);
shimmer(f(H.recapTap) + 0.05, [72, 76, 79], 0.035);
bell(f(H.standout), 88, 0.05, 0.2, 1.8);
sub(f(H.standout), 48, 0.2, 0.3);

// the lockup: the last card leaves, the mark strikes into air
whoosh(f(H.lockup) - 0.1, 0.7, 0.09, 0);
impact(f(H.markStrike), 0.34);
shimmer(f(H.markStrike) + 0.08, [79, 84, 88, 91], 0.055);

S.master({ fadeInSec: 0.25, fadeOutSec: 1.1 });

const here = path.dirname(fileURLToPath(import.meta.url));
S.writeWav(path.join(here, '..', 'public', 'reel-score.wav'));
