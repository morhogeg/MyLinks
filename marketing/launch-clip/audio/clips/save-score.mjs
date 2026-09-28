/**
 * The SAVE clip's score: the film's instruments (audio/synth.mjs, shared by
 * every Machina score), its own arrangement on the clip's clock
 * (clips/save-timeline.mjs: 112.5 BPM, 16 frames a beat, 15 bars).
 *
 * The arrangement follows the cut: the problem floats on an open IV with no
 * drums, bells as the named places lift, a soft fall as the saves are lost;
 * a riser into the point, the mark resolving to I; bells as the shares land
 * in it; a riser carries the point into the app, and the drums come in with
 * the Add dialog and run through the screenshots, the reading and the card;
 * the melody sings where the narrator is silent; the drums drop out for the
 * lockup, the mark strikes into air, the last note after the last word.
 *
 * Sound design sits on the frames the picture uses (HITS, read by the scenes
 * too): a tap is a tick, a landing a sub and a bell, a lift a shimmer, a
 * throw a whoosh, the strike an impact.
 *
 *   node audio/clips/save-score.mjs   →   public/clips/save/score.wav
 *   node audio/mix-vo.mjs save        →   public/clips/save/score-vo.wav (+ the narrator, mastered)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BAR, BAR_CHORDS, BAR_FRAMES, BEAT, CAPTIONS, DRUMS, FPS, HITS, RISERS, TOTAL_FRAMES, TOTAL_SEC } from '../../clips/save-timeline.mjs';
import { createSynth } from '../synth.mjs';

const S = createSynth({ seconds: TOTAL_SEC, beat: BEAT });
const { pad, sub, pulse, keys, bell, kick, hat, rim, shaker, clap, riser, whoosh, impact, tick, shimmer } = S;

const t = (frame) => frame / FPS; // clip frame → seconds
const b = (bar) => bar * BAR;
const at = (bar, beats) => b(bar) + beats * BEAT;

// The film's four chords, same voicings (as the reel).
const CHORDS = {
  Fmaj7: { bass: 41, upper: [57, 60, 64, 69] },
  Cmaj7: { bass: 48, upper: [59, 64, 67, 71] },
  G6: { bass: 43, upper: [59, 62, 64, 69] },
};

const BARS = Math.ceil(TOTAL_FRAMES / BAR_FRAMES);
const LOCKUP_BAR = Math.round(HITS.lockup / BAR_FRAMES);
/** how much of the band is playing, per clip bar */
const DENSITY = [0.3, 0.34, 0.5, 0.56, 0.62, 0.9, 0.95, 1.0, 0.95, 0.92, 0.9, 0.72, 0.7, 0.45, 0.45];

for (let bar = 0; bar < BARS; bar++) {
  const ch = CHORDS[BAR_CHORDS[bar]];
  const d = DENSITY[bar];
  const t0 = b(bar);
  const len = Math.min(BAR, TOTAL_SEC - t0);
  const drums = t0 >= t(DRUMS[0]) - 0.01 && t0 < t(DRUMS[1]) - 0.01;
  if (bar >= LOCKUP_BAR) continue; // the lockup has its own held voicing (below)

  // ── pad: the reel's register throughout (an octave up under the first
  // line, it sat in the speech band: the line measured 3.5dB over the music
  // there, 9.2dB at this register)
  const padLevel = 0.1 + 0.08 * d;
  ch.upper.forEach((m, i) => {
    const panPos = ((i / (ch.upper.length - 1)) * 2 - 1) * 0.55;
    pad(t0, len, m, padLevel * (i === 0 ? 1 : 0.85), panPos);
  });
  pad(t0, len, ch.bass + 12, padLevel * 0.6, 0);
  if (drums) pad(t0, len, ch.upper[3] + 12, padLevel * 0.34, bar % 2 ? 0.35 : -0.35);

  // ── bass: one long note under the shares, a moving line once the band is in
  if (bar >= 1) sub(t0, ch.bass, 0.34 + 0.26 * d, d >= 0.7 ? 0.55 : 1.6);
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
  if (bar >= 1) {
    const SCALE = [0, 2, 4, 5, 7, 9, 11];
    const shape = [0, 2, 3, 4, 6, 4, 3, 2];
    const onsets = drums ? [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] : [0, 0.75, 1.5, 2, 2.75, 3.5];
    onsets.forEach((on, k) => {
      const step = shape[(k + bar) % shape.length];
      const m = ch.upper[0] + SCALE[step % 7] + Math.floor(step / 7) * 12 + (on >= 2.5 ? 12 : 0);
      pulse(at(bar, on), m, (drums ? 0.1 : 0.12) * (0.62 + 0.38 * d), ((k % 4) / 3) * 1.1 - 0.55, drums ? 0.3 : 0.4);
    });
  }
}

// ── the lockup: one held voicing under the end, a single breath (the reel's)
for (const m of [48, 64, 67, 72]) pad(t(HITS.lockup), TOTAL_SEC - t(HITS.lockup) - 0.2, m, 0.08, m === 64 ? -0.4 : 0.35);

// ── melody (FM keys), only where no one is speaking: the breath after the
// shares, under the card's read-down between the lines, then home on C for
// the lockup: C as the mark draws, E and G after the words (the reel's
// round-13 rule: nothing sounds on a word the narrator has to land)
const closing = CAPTIONS.find((c) => c.place === 'lockup');
const MELODY = [
  [t(HITS.part), 72, 0.13], // C, the mark lets go
  [t(HITS.part) + 1.5 * BEAT, 76, 0.12], // E, the point drops
  [t(HITS.keyPoints - 8), 76, 0.13], // E, the Key Points lift (the next line starts a beat later)
  [t(HITS.markStrike) - BEAT, 72, 0.19], // C, the mark draws
  [t(closing.to - 20), 79, 0.16], // G, after the last word
];
MELODY.forEach(([sec, m, level], i) => keys(sec, m, level, i % 2 ? 0.2 : -0.2, sec >= t(HITS.lockup) ? 2.8 : 2));

// ── risers, each ENDING on the reveal it leads into
for (const [from, to] of RISERS) riser(t(from), t(to) - t(from), 0.09);

// ── sound design, on the picture's frames
const H = HITS;

// the hook: the saves come into focus (glints), the named places lift (bells
// on their words), the rest are lost (a soft fall), the rush, the point, the snap
{
  const VO = JSON.parse(fs.readFileSync(new URL('../../src/reels/clips/save/vo.json', import.meta.url), 'utf8'));
  const hook = CAPTIONS[0];
  const w = VO.find((v) => v.frame === hook.at).words;
  [6, 7, 9].forEach((k, i) => bell(t(hook.at) + w[k] + 0.12, [84, 88, 91][i], 0.045, [-0.35, 0.35, 0][i], 1.6));
  whoosh(t(hook.at) + w[3] + 0.9, 1.2, 0.045, 0);
}
[2, 5, 8, 11, 14].forEach((fr, i) => bell(t(fr), [84, 88, 91, 86, 89][i], 0.025, i % 2 ? 0.45 : -0.45, 1.2));
whoosh(t(H.collapse) - 0.1, 0.55, 0.1, -0.35);
whoosh(t(H.collapse) - 0.05, 0.5, 0.1, 0.35);
impact(t(H.dotLands), 0.34);
sub(t(H.dotLands), 36, 0.3, 0.6);
tick(t(H.bracketsClose), 0.11, 0.85);
sub(t(H.bracketsClose), 43, 0.18, 0.25);
shimmer(t(H.bracketsClose) + 0.5, [72, 79, 84, 88], 0.04);

// any app: each Share button tapped, pulled, landing in the mark
H.shareTaps.forEach((fr, i) => {
  tick(t(fr), 0.09, 1.15 + i * 0.1);
  whoosh(t(fr + 2), 0.45, 0.07, [0.4, -0.4, 0.4][i]);
  bell(t(H.shareLands[i]), [84, 88, 91][i], 0.055, 0, 1.6);
  sub(t(H.shareLands[i]), 43, 0.16, 0.25);
});

// the point becomes the + and the app opens around it; + tapped, the dialog
whoosh(t(H.toApp) - 0.1, 0.5, 0.08, 0);
tick(t(H.plusTap), 0.1, 1.1);
whoosh(t(H.dialog) - 0.08, 0.35, 0.05, 0.2);

// screenshots: the Image tab, three screens picked (a bell each, as they sit
// in order), Save
tick(t(H.imageTap), 0.09, 1.1);
bell(t(H.imageTap), 79, 0.035, -0.3, 1.1);
tick(t(H.pick), 0.08, 1.2);
[0, 1, 2].forEach((k) => bell(t(H.pick + 8 + k * 4), [83, 86, 91][k], 0.035, [-0.3, 0, 0.3][k], 1.0));
tick(t(H.saveTap), 0.1, 1.2);
whoosh(t(H.saveTap) + 0.1, 0.4, 0.05, 0);

// key points: the working card read (soft rising ticks), the card it
// becomes, the tap, the Key Points lifting
[0, 1, 2, 3].forEach((k) => tick(t(H.reading + k * 8), 0.05, 1.0 + k * 0.12));
shimmer(t(H.cardDone), [84, 88, 91], 0.045);
sub(t(H.cardDone + 8), 43, 0.3, 0.32);
tick(t(H.cardTap), 0.09, 1.2);
whoosh(t(H.cardTap) + 0.07, 0.35, 0.05, -0.15);
shimmer(t(H.keyPoints), [79, 84, 88], 0.035);
sub(t(H.keyPoints), 41, 0.18, 0.3);

// tags & links: the Related cards lift silently under the line (bells on
// them masked "…what you already saved." to 2.4dB in the speech band), and
// one chime answers after the last word
bell(t(H.throw - 16), 88, 0.05, 0.2, 1.4);
shimmer(t(H.throw - 16) + 0.05, [79, 84, 91], 0.03);

// thrown out into the lockup; the mark strikes into air
whoosh(t(H.throw) - 0.1, 0.7, 0.09, 0);
impact(t(H.markStrike), 0.34);
shimmer(t(H.markStrike) + 0.08, [79, 84, 88, 91], 0.055);

S.master({ fadeInSec: 0.25, fadeOutSec: 1.1 });

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', '..', 'public', 'clips', 'save', 'score.wav');
fs.mkdirSync(path.dirname(out), { recursive: true });
S.writeWav(out);
