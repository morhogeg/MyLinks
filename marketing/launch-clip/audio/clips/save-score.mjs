/**
 * The SAVE clip's score: the film's instruments (audio/synth.mjs, shared by
 * every Machina score), its own arrangement on the clip's clock
 * (clips/save-timeline.mjs: 112.5 BPM, 16 frames a beat, 14 bars).
 *
 * The arrangement follows the cut (the reel's Save chapter, then the card and
 * the lockup): the shares arrive over an open pad, each one rung in with a
 * bell as it lands in the mark; a riser carries the point into the app; the
 * drums come in on the downbeat the Add dialog's tour starts and run through
 * the phases and the card; the melody sings only
 * where the narrator is silent (the card's Key Points); the drums drop out
 * for the lockup so the mark strikes into air, and the last note lands after
 * the last word.
 *
 * Sound design sits on the frames the picture uses (HITS, read by the scenes
 * too): a tap is a tick, a phase is a rising tick and bell, a landing is a
 * sub, a throw is a whoosh, the strike an impact. The reel's cues for the
 * same moments (audio/reel-score.mjs) are reused note for note.
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
const DENSITY = [0.34, 0.44, 0.5, 0.62, 0.9, 0.95, 1.0, 1.0, 0.92, 0.88, 0.84, 0.5, 0.45, 0.45];

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

// ── melody (FM keys), only where no one is speaking: over the card's read-down
// and Key Points (IV → V → IV), then home on C for the lockup: C as the mark
// draws, E (softer) in the breath after its name, G AFTER the last word (the
// reel's round-13 rule: nothing sounds on a word the narrator has to land)
// (the closing notes sit where the reel's do against the same take of the
// line: E a beat after the line starts, G five beats after, both on beats)
const closing = CAPTIONS.find((c) => c.place === 'lockup');
const MELODY = [
  [t(HITS.cardLands) + 1 * BEAT, 69, 0.14], // A, the card settled
  [t(HITS.cardLands) + 2.5 * BEAT, 72, 0.14], // C
  [t(HITS.cardTap) + 3.5 * BEAT, 71, 0.15], // B, the detail open
  [t(HITS.cardTap) + 5 * BEAT, 74, 0.15], // D
  [t(HITS.keyPoints), 76, 0.16], // E, the Key Points lift
  [t(HITS.keyPoints) + 2 * BEAT, 72, 0.15], // C
  [t(HITS.markStrike) - BEAT, 72, 0.19], // C, the mark draws
  [t(closing.at + 16), 76, 0.12], // E, in the breath after "Machina."
  [t(closing.at + 80), 79, 0.19], // G, after "find." (spoken by +2.47s)
];
MELODY.forEach(([sec, m, level], i) => keys(sec, m, level, i % 2 ? 0.2 : -0.2, sec >= t(HITS.lockup) ? 2.8 : 2));

// ── risers, each ENDING on the reveal it leads into
for (const [from, to] of RISERS) riser(t(from), t(to) - t(from), 0.09);

// ── sound design, on the picture's frames
const H = HITS;

// the opening: the mark and its name come into focus
shimmer(0.12, [79, 84, 88], 0.03);

// the shares (the reel's cues): each Share button tapped, pulled, landing
H.shareTaps.forEach((fr, i) => {
  tick(t(fr), 0.09, 1.15 + i * 0.1);
  whoosh(t(H.sharePulls[i] - 2), 0.45, 0.07, [0.4, -0.4, 0.4][i]);
  bell(t(H.shareLands[i]), [84, 88, 91][i], 0.055, 0, 1.6);
  sub(t(H.shareLands[i]), 43, 0.16, 0.25);
});

// the point becomes the + and the app opens around it; + tapped, the dialog
whoosh(t(H.toApp) - 0.1, 0.5, 0.08, 0);
tick(t(H.plusTap), 0.1, 1.1);
whoosh(t(H.dialog) - 0.08, 0.35, 0.05, 0.2);

// the tour: Image, Note, Link tapped on beats, the link pasted, Save tapped
H.modeTaps.forEach((fr, i) => {
  tick(t(fr), 0.09, 1.1 + i * 0.1);
  bell(t(fr), [79, 83, 86][i], 0.035, [-0.3, 0.3, 0][i], 1.1);
});
tick(t(H.paste), 0.06, 1.4);
tick(t(H.saveTap), 0.1, 1.2);

// the five phases climbing, saved, the card landing
H.phases.forEach((fr, i) => {
  tick(t(fr), 0.075, 1.0 + i * 0.12);
  bell(t(fr), [72, 76, 79, 83, 84][i], 0.035, i % 2 ? 0.3 : -0.3, 0.9);
});
shimmer(t(H.saved), [84, 88, 91], 0.045);
sub(t(H.cardLands), 43, 0.3, 0.32);
tick(t(H.cardLands), 0.09, 0.9);

// the card: tapped open, its Key Points lifting
tick(t(H.cardTap), 0.09, 1.2);
whoosh(t(H.cardTap) + 0.07, 0.35, 0.05, -0.15);
shimmer(t(H.keyPoints), [79, 84, 88], 0.035);
sub(t(H.keyPoints), 41, 0.18, 0.3);

// thrown out into the lockup; the mark strikes into air
whoosh(t(H.throw) - 0.1, 0.7, 0.09, 0);
impact(t(H.markStrike), 0.34);
shimmer(t(H.markStrike) + 0.08, [79, 84, 88, 91], 0.055);

S.master({ fadeInSec: 0.25, fadeOutSec: 1.1 });

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', '..', 'public', 'clips', 'save', 'score.wav');
fs.mkdirSync(path.dirname(out), { recursive: true });
S.writeWav(out);
