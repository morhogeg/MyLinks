/**
 * The REVISIT feature clip's score: the film's and the reel's instruments
 * (audio/synth.mjs), its own arrangement on the clip's clock
 * (clips/revisit-timeline.mjs: 112.5 BPM, 16 frames a beat, OUTPUT frames).
 *
 * The arrangement follows the cut. The clip opens on the pad and the pulse
 * (the "Do this" list, the first line); the band comes in on the downbeat
 * the camera travels to "This week in Machina" and stays light while the
 * recap is read (the reading must not be crowded); it drops out as the save
 * is thrown into the lockup, so the mark strikes into air and the close
 * rests on a held C. The reel's rules: one chord a bar from its C-major
 * vocabulary, risers END on the reveal they lead into, a tap is a tick on
 * the frame the app responds, and nothing sounds on a word the narrator has
 * to land (a note or a shimmer goes after it).
 *
 *   node audio/clips/revisit-score.mjs   →   public/clips/revisit/score.wav
 *   node audio/mix-vo.mjs revisit        →   public/clips/revisit/score-vo.wav
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BAR, BAR_CHORDS, BAR_FRAMES, BEAT, FPS, HITS, RISERS, TOTAL_FRAMES, TOTAL_SEC } from '../../clips/revisit-timeline.mjs';
import { createSynth } from '../synth.mjs';

const S = createSynth({ seconds: TOTAL_SEC, beat: BEAT });
const { pad, sub, pulse, keys, bell, kick, hat, rim, shaker, clap, riser, whoosh, impact, tick, shimmer } = S;

const s = (frame) => frame / FPS; // frame → seconds
const b = (bar) => bar * BAR;
const at = (bar, beats) => b(bar) + beats * BEAT;

// the reel's (the film's) voicings
const CHORDS = {
  Fmaj7: { bass: 41, upper: [57, 60, 64, 69] },
  Cmaj7: { bass: 48, upper: [59, 64, 67, 71] },
  G6: { bass: 43, upper: [59, 62, 64, 69] },
};

const BARS = Math.ceil(TOTAL_FRAMES / BAR_FRAMES);
/** how much of the band plays, per bar: light under the reading */
const DENSITY = [0.34, 0.42, 0.5, 0.56, 0.62, 0.66, 0.68, 0.7, 0.72, 0.74, 0.68, 0.7, 0.66, 0.62, 0.42, 0.36, 0.32];
const DRUMS = [s(HITS.wide[0]), s(HITS.out)]; // from the tick (round 3) … the throw into the lockup

for (let bar = 0; bar < BARS; bar++) {
  const ch = CHORDS[BAR_CHORDS[bar]];
  const d = DENSITY[bar];
  const t0 = b(bar);
  const len = Math.min(BAR, TOTAL_SEC - t0);
  const drums = t0 >= DRUMS[0] - 0.01 && t0 < DRUMS[1] - 0.01;
  const lockup = t0 >= s(HITS.out) - 0.01;

  // ── pad
  const padLevel = 0.1 + 0.08 * d;
  if (!lockup) {
    ch.upper.forEach((m, i) => pad(t0, len, m, padLevel * (i === 0 ? 1 : 0.85), ((i / (ch.upper.length - 1)) * 2 - 1) * 0.55));
    pad(t0, len, ch.bass + 12, padLevel * 0.6, 0);
    if (drums) pad(t0, len, ch.upper[3] + 12, padLevel * 0.34, bar % 2 ? 0.35 : -0.35);
  }

  // ── bass: a moving line once the band is in
  if (!lockup) sub(t0, ch.bass, 0.3 + 0.26 * d, drums ? 0.55 : 1.6);
  if (drums) {
    sub(at(bar, 1.5), ch.bass + 7, 0.18 + 0.1 * d, 0.36);
    sub(at(bar, 2.5), ch.bass + 12, 0.16 + 0.1 * d, 0.34);
    sub(at(bar, 3.5), ch.bass + 7, 0.14, 0.3);
  }

  // ── drums: the reel's kit, lighter (the viewer is reading)
  if (drums) {
    for (let k = 0; k < 4; k++) kick(at(bar, k), (k % 2 ? 0.3 : 0.38) + 0.18 * d);
    clap(at(bar, 1), 0.14 + 0.05 * d);
    clap(at(bar, 3), 0.14 + 0.05 * d);
    rim(at(bar, 2.75), 0.07 + 0.04 * d);
    for (let k = 0; k < 16; k++) {
      const accent = k % 4 === 0 ? 0.9 : k % 2 ? 1 : 0.55;
      hat(at(bar, k / 4), 0.03 * accent * d, k % 2 ? 0.22 : -0.18);
      shaker(at(bar, k / 4), 0.018 * d, k % 2 ? 0.34 : -0.3);
    }
    for (let k = 0; k < 4; k++) hat(at(bar, k + 0.5), 0.026 * d, 0.1, true);
  }

  // ── the pulse figure: the film's scale walk (degrees 0-2-3-4-6)
  if (!lockup) {
    const SCALE = [0, 2, 4, 5, 7, 9, 11];
    const shape = [0, 2, 3, 4, 6, 4, 3, 2];
    const onsets = drums ? [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] : [0, 0.75, 1.5, 2, 2.75, 3.5];
    onsets.forEach((on, k) => {
      if (at(bar, on) >= TOTAL_SEC) return;
      const step = shape[(k + bar) % shape.length];
      const m = ch.upper[0] + SCALE[step % 7] + Math.floor(step / 7) * 12 + (on >= 2.5 ? 12 : 0);
      pulse(at(bar, on), m, (drums ? 0.09 : 0.11) * (0.62 + 0.38 * d), ((k % 4) / 3) * 1.1 - 0.55, drums ? 0.3 : 0.4);
    });
  }
}

// ── the lockup: one held voicing under the end, a single breath
for (const m of [48, 64, 67, 72]) pad(s(HITS.out), TOTAL_SEC - s(HITS.out) - 0.2, m, 0.08, m === 64 ? -0.4 : 0.35);

// ── melody (FM keys): quiet over the recap, home on C for the lockup. Placed
// in the narrator's pauses (clips/revisit-timeline.mjs CAPTIONS; the words
// are measured in src/reels/clips/revisit/vo.json), never on a word.
const MELODY = [
  // [frame, midi, level?]
  [104, 64], [120, 67], // after "when it's due."
  [240, 69], [256, 71], [288, 72], // after the to-do line; the tick
  [480, 67], [496, 69], [512, 71], // the write-up, after its line
  [528, 72], [544, 69], // read → the themes
  [696, 64], [712, 65], [728, 67], // the Standout and its question
  [752, 72], [768, 71], [784, 72], // (the tap)
  [824, 74], [856, 69], // the save, opened
  // home: C as the mark draws, E after its name, G after the last word
  [916, 72, 0.19], [976, 76, 0.12], [1056, 79, 0.19],
];
for (const [fr, m, level] of MELODY) keys(s(fr), m, level ?? 0.14, (fr / 16) % 2 ? 0.2 : -0.2, fr >= HITS.out ? 2.8 : 2);

// ── risers, each ENDING on the reveal it leads into
for (const [from, to] of RISERS) riser(s(from), s(to) - s(from), 0.09);

// ── sound design, on the picture's frames (HITS)
const H = HITS;
// the clip opens: a soft glint as the chapter word and the tab are already there
bell(s(8), 84, 0.03, 0.3, 1.4);
// (round 3) the reminder that came due lifts (in the pause after "reminder,")
bell(s(H.dueLift), 79, 0.045, 0.2, 1.4);
sub(s(H.dueLift), 43, 0.14, 0.3);
// (round 3) the V60 step ticked off: the tap, and the toast's confirmation
tick(s(H.tick), 0.09, 1.25);
shimmer(s(H.tick + 6), [76, 79, 84], 0.03);
// the "Do this" row lifts (in the pause after "action,")
bell(s(H.todoLift), 84, 0.045, -0.2, 1.4);
sub(s(H.todoLift), 48, 0.14, 0.3);
// down to the recap
whoosh(s(H.travel[0]) + 0.05, 0.9, 0.045, 0.2);
// "This week in Machina", tapped open
tick(s(H.recapTap), 0.09, 1.3);
shimmer(s(H.recapTap + 4), [72, 76, 79], 0.035);
// the Standout lifts (after "rereading.")
bell(s(H.standout), 88, 0.05, 0.2, 1.8);
sub(s(H.standout), 48, 0.2, 0.3);
// the Standout, tapped: its save opens
tick(s(H.cardTap), 0.09, 1.2);
whoosh(s(H.cardTap) + 0.07, 0.35, 0.05, -0.15);
shimmer(s(H.cardTap + 14), [79, 84, 88], 0.03);
// the save is thrown out, the mark strikes into air
whoosh(s(H.out) - 0.1, 0.7, 0.09, 0);
impact(s(H.markStrike), 0.34);
shimmer(s(H.markStrike) + 0.08, [79, 84, 88, 91], 0.055);

S.master({ fadeInSec: 0.25, fadeOutSec: 1.1 });

const here = path.dirname(fileURLToPath(import.meta.url));
S.writeWav(path.join(here, '..', '..', 'public', 'clips', 'revisit', 'score.wav'));
