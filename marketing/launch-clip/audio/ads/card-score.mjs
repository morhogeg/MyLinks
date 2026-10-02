/**
 * Meta ad 1's score ("What one save becomes"): the film's instruments
 * (audio/synth.mjs, shared by every Machina score), its own arrangement on the
 * ad's clock (ads/card-timeline.mjs: 112.5 BPM, 16 frames a beat, 10 bars).
 * The SAVE clip's score is the template.
 *
 * The hook floats on an open IV with no drums (it must work from frame 0,
 * sound on or off); a soft fall as the list is lost; a riser into the point,
 * the mark resolving to I; a tick and a bell as the share lands in it; a
 * riser carries the point into the app; the drums come in with the card (a
 * tick as it is tapped open); the lifts are silent under the lines (the
 * narrator owns them); the drums drop out for the lockup, the mark strikes
 * into air, the last note after the last word.
 *
 *   node audio/ads/card-score.mjs     →   public/ads/card/score.wav
 *   node audio/mix-vo.mjs adcard      →   public/ads/card/score-vo.wav     (+ narrator, mastered)
 *   node audio/mix-vo.mjs adcardMusic →   public/ads/card/score-music.wav  (no narrator, mastered)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BAR, BAR_CHORDS, BAR_FRAMES, BEAT, CAPTIONS, DRUMS, FPS, HITS, RISERS, TOTAL_FRAMES, TOTAL_SEC } from '../../ads/card-timeline.mjs';
import { createSynth } from '../synth.mjs';

const S = createSynth({ seconds: TOTAL_SEC, beat: BEAT });
const { pad, sub, pulse, keys, bell, kick, hat, rim, shaker, clap, riser, whoosh, impact, tick, shimmer } = S;

const t = (frame) => frame / FPS;
const b = (bar) => bar * BAR;
const at = (bar, beats) => b(bar) + beats * BEAT;

const CHORDS = {
  Fmaj7: { bass: 41, upper: [57, 60, 64, 69] },
  Cmaj7: { bass: 48, upper: [59, 64, 67, 71] },
  G6: { bass: 43, upper: [59, 62, 64, 69] },
};

const BARS = Math.ceil(TOTAL_FRAMES / BAR_FRAMES);
const LOCKUP_BAR = Math.round(HITS.lockup / BAR_FRAMES);
/** how much of the band is playing, per bar */
const DENSITY = [0.36, 0.5, 0.6, 0.8, 0.84, 0.84, 0.84, 0.8, 0.45, 0.45];

for (let bar = 0; bar < BARS; bar++) {
  const ch = CHORDS[BAR_CHORDS[bar]];
  const d = DENSITY[bar];
  const t0 = b(bar);
  const len = Math.min(BAR, TOTAL_SEC - t0);
  const drums = t0 >= t(DRUMS[0]) - 0.01 && t0 < t(DRUMS[1]) - 0.01;
  if (bar >= LOCKUP_BAR) continue;

  const padLevel = 0.1 + 0.08 * d;
  ch.upper.forEach((m, i) => {
    const panPos = ((i / (ch.upper.length - 1)) * 2 - 1) * 0.55;
    pad(t0, len, m, padLevel * (i === 0 ? 1 : 0.85), panPos);
  });
  pad(t0, len, ch.bass + 12, padLevel * 0.6, 0);
  if (drums) pad(t0, len, ch.upper[3] + 12, padLevel * 0.34, bar % 2 ? 0.35 : -0.35);

  sub(t0, ch.bass, 0.34 + 0.26 * d, d >= 0.7 ? 0.55 : 1.6);
  if (d >= 0.7) {
    sub(at(bar, 1.5), ch.bass + 7, 0.2 + 0.1 * d, 0.36);
    sub(at(bar, 2.5), ch.bass + 12, 0.18 + 0.1 * d, 0.34);
    sub(at(bar, 3.5), ch.bass + 7, 0.15, 0.3);
  }

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

  // the pulse figure: the film's scale walk (degrees 0-2-3-4-6)
  const SCALE = [0, 2, 4, 5, 7, 9, 11];
  const shape = [0, 2, 3, 4, 6, 4, 3, 2];
  const onsets = drums ? [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] : [0, 0.75, 1.5, 2, 2.75, 3.5];
  onsets.forEach((on, k) => {
    const step = shape[(k + bar) % shape.length];
    const m = ch.upper[0] + SCALE[step % 7] + Math.floor(step / 7) * 12 + (on >= 2.5 ? 12 : 0);
    pulse(at(bar, on), m, (drums ? 0.1 : 0.12) * (0.62 + 0.38 * d), ((k % 4) / 3) * 1.1 - 0.55, drums ? 0.3 : 0.4);
  });
}

// the lockup: one held voicing under the end
for (const m of [48, 64, 67, 72]) pad(t(HITS.lockup), TOTAL_SEC - t(HITS.lockup) - 0.2, m, 0.08, m === 64 ? -0.4 : 0.35);

// melody (FM keys), only where no one is speaking: the breath after the
// name, then home on C for the lockup (C as the mark draws, G after the words)
const closing = CAPTIONS.find((c) => c.place === 'lockup');
const MELODY = [
  [t(HITS.part), 72, 0.13],
  [t(HITS.part) + 1.5 * BEAT, 76, 0.12],
  [t(HITS.markStrike) - BEAT, 72, 0.19],
  [t(closing.to - 20), 79, 0.16],
];
MELODY.forEach(([sec, m, level], i) => keys(sec, m, level, i % 2 ? 0.2 : -0.2, sec >= t(HITS.lockup) ? 2.8 : 2));

for (const [from, to] of RISERS) riser(t(from), t(to) - t(from), 0.09);

const H = HITS;
// the hook: the list is lost (a soft fall after "never get to it")
whoosh(t(H.lost) + 0.6, 0.9, 0.04, 0);
// the talk lifts out of the list
shimmer(t(H.talkLifts) + 0.1, [79, 84], 0.025);
// the mark: the point, the snap
impact(t(H.dotLands), 0.3);
sub(t(H.dotLands), 36, 0.28, 0.6);
tick(t(H.bracketsClose), 0.1, 0.85);
sub(t(H.bracketsClose), 43, 0.18, 0.25);
// the share: tapped, pulled, landing in the mark (the bell after "Machina")
tick(t(H.shareTap), 0.09, 1.15);
whoosh(t(H.shareTap + 2), 0.45, 0.06, -0.3);
sub(t(H.shareLands), 43, 0.16, 0.25);
bell(t(H.shareLands + 16), 88, 0.05, 0, 1.4);
// the point becomes the + and the app opens around it
whoosh(t(H.toApp) - 0.1, 0.5, 0.08, 0);
// the card lands (a soft sub), is tapped open (a tick, a small whoosh)
sub(t(H.toApp + 8), 43, 0.14, 0.25);
tick(t(H.cardTap), 0.09, 1.1);
whoosh(t(H.cardTap) + 0.07, 0.35, 0.045, -0.15);
// the lifts stay silent under the lines; one chime answers the last line
bell(t(H.throw - 8), 88, 0.045, 0.2, 1.4);
// thrown out into the lockup; the mark strikes into air
whoosh(t(H.throw) - 0.1, 0.7, 0.09, 0);
impact(t(H.markStrike), 0.34);
shimmer(t(H.markStrike) + 0.3, [79, 84, 88, 91], 0.05); // between "Machina." and the tagline

S.master({ fadeInSec: 0.05, fadeOutSec: 1.1 });

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', '..', 'public', 'ads', 'card', 'score.wav');
fs.mkdirSync(path.dirname(out), { recursive: true });
S.writeWav(out);
console.log(`wrote ${path.relative(path.join(here, '..', '..'), out)}`);
