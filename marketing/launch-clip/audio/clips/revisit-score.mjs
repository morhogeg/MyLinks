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
import { BAR, BAR_CHORDS, BAR_FRAMES, BEAT, FPS, HITS, OPEN, OPENING, RISERS, TOTAL_FRAMES, TOTAL_SEC, USE } from '../../clips/revisit-timeline.mjs';
import { createSynth } from '../synth.mjs';

const S = createSynth({ seconds: TOTAL_SEC, beat: BEAT });
const { pad, sub, pulse, keys, bell, kick, hat, rim, shaker, clap, riser, whoosh, impact, tick, shimmer } = S;

const s = (frame) => frame / FPS; // clip frame → seconds
const a = (frame) => (frame + OPEN) / FPS; // APP frame (HITS, MELODY) → seconds
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
// (round 5: bars 6–10 are USE, the band still out)
const DENSITY = [0.18, 0.22, 0.28, 0.34, 0.34, 0.42, 0.44, 0.46, 0.46, 0.48, 0.48, 0.5, 0.56, 0.62, 0.66, 0.68, 0.7, 0.72, 0.74, 0.68, 0.7, 0.66, 0.62, 0.42, 0.36, 0.32];
const DRUMS = [a(HITS.wide[0]), a(HITS.out)]; // from the tick (round 3) … the throw into the lockup

for (let bar = 0; bar < BARS; bar++) {
  const ch = CHORDS[BAR_CHORDS[bar]];
  const d = DENSITY[bar];
  const t0 = b(bar);
  const len = Math.min(BAR, TOTAL_SEC - t0);
  const drums = t0 >= DRUMS[0] - 0.01 && t0 < DRUMS[1] - 0.01;
  const lockup = t0 >= a(HITS.out) - 0.01;

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

  // ── the pulse figure: the film's scale walk (degrees 0-2-3-4-6); the
  // problem (bars 0-1) is pad and air only
  if (!lockup && bar >= 2) {
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
for (const m of [48, 64, 67, 72]) pad(a(HITS.out), TOTAL_SEC - a(HITS.out) - 0.2, m, 0.08, m === 64 ? -0.4 : 0.35);

// ── melody (FM keys): quiet over the recap, home on C for the lockup. Placed
// in the narrator's pauses (clips/revisit-timeline.mjs CAPTIONS; the words
// are measured in src/reels/clips/revisit/vo.json), never on a word.
const U = USE.len;
const MELODY = [
  // [frame, midi, level?]
  [104, 64], [120, 67], // after "when it's due."
  // (round 5) USE: after "…and a month."; after "…not just a link."
  [264, 69], [280, 67], [296, 72],
  [416, 67], [432, 71],
  [240 + U, 69], [256 + U, 71], [288 + U, 72], // after the to-do line; the tick
  [480 + U, 67], [496 + U, 69], [512 + U, 71], // the write-up, after its line
  [528 + U, 72], [544 + U, 69], // read → the themes
  [696 + U, 64], [712 + U, 65], [728 + U, 67], // the Standout and its question
  [752 + U, 72], [768 + U, 71], [784 + U, 72], // (the tap)
  [824 + U, 74], [856 + U, 69], // the save, opened
  // home: C as the mark draws, E after its name, G after the last word
  [916 + U, 72, 0.19], [976 + U, 76, 0.12], [1056 + U, 79, 0.19],
];
for (const [fr, m, level] of MELODY) keys(a(fr), m, level ?? 0.14, (fr / 16) % 2 ? 0.2 : -0.2, fr >= HITS.out ? 2.8 : 2);

// ── risers, each ENDING on the reveal it leads into
for (const [from, to] of RISERS) riser(s(from), s(to) - s(from), 0.09);

// ── sound design, on the picture's frames (HITS)
const H = HITS;
// THE OPENING (round 4, absolute frames): the saves come into focus as soft
// glints; a fall as they bleach on "never"; they rush together into the
// point (the riser above ends on the snap); the brackets snap; the point
// opens as an iris; a shimmer after the line ("…back to you.")
[2, 6, 10, 14, 18, 22].forEach((fr, i) => bell(s(fr), [84, 88, 91, 86, 89, 93][i], 0.026, i % 2 ? 0.45 : -0.45, 1.2));
whoosh(s(OPENING.bleach) + 0.1, 1.2, 0.05, 0);
whoosh(s(OPENING.gather[0]) + 0.1, 0.55, 0.09, -0.35);
whoosh(s(OPENING.gather[0]) + 0.15, 0.5, 0.09, 0.35);
impact(s(OPENING.gather[1]), 0.26);
sub(s(OPENING.gather[1]), 36, 0.26, 0.6);
tick(s(OPENING.snap), 0.1, 0.85);
sub(s(OPENING.snap), 43, 0.16, 0.25);
whoosh(s(OPENING.iris[0]) - 0.05, 0.5, 0.07, 0);
shimmer(s(OPEN - 12), [72, 79, 84, 88], 0.04);
// (round 3) the reminder that came due lifts (in the pause after "reminder,")
bell(a(H.dueLift), 79, 0.045, 0.2, 1.4);
sub(a(H.dueLift), 43, 0.14, 0.3);
// (round 5) USE: the bell, tapped (the sheet slides up); Smart review lifts
// after its name; the X; the save opens (a lift as its Key Points come up);
// back to the list
tick(a(H.bell), 0.08, 1.2);
whoosh(a(H.bell) + 0.05, 0.45, 0.04, 0.2);
bell(a(H.smartLift), 81, 0.045, -0.2, 1.4);
sub(a(H.smartLift), 45, 0.14, 0.3);
tick(a(H.cancel), 0.07, 1.1);
tick(a(H.openTap), 0.09, 1.25);
whoosh(a(H.openTap) + 0.07, 0.35, 0.045, -0.15);
shimmer(a(H.keyPoints[1]) - 0.1, [76, 79, 84], 0.03);
whoosh(a(H.back) + 0.05, 0.4, 0.04, 0.15);
// (round 3) the V60 step ticked off: the tap, and the toast's confirmation
tick(a(H.tick), 0.09, 1.25);
shimmer(a(H.tick + 6), [76, 79, 84], 0.03);
// the "Do this" row lifts (in the pause after "action,")
bell(a(H.todoLift), 84, 0.045, -0.2, 1.4);
sub(a(H.todoLift), 48, 0.14, 0.3);
// down to the recap
whoosh(a(H.travel[0]) + 0.05, 0.9, 0.045, 0.2);
// "This week in Machina", tapped open
tick(a(H.recapTap), 0.09, 1.3);
shimmer(a(H.recapTap + 4), [72, 76, 79], 0.035);
// the Standout lifts (after "rereading.")
bell(a(H.standout), 88, 0.05, 0.2, 1.8);
sub(a(H.standout), 48, 0.2, 0.3);
// the Standout, tapped: its save opens
tick(a(H.cardTap), 0.09, 1.2);
whoosh(a(H.cardTap) + 0.07, 0.35, 0.05, -0.15);
shimmer(a(H.cardTap + 14), [79, 84, 88], 0.03);
// the save is thrown out, the mark strikes into air
whoosh(a(H.out) - 0.1, 0.7, 0.09, 0);
impact(a(H.markStrike), 0.34);
shimmer(a(H.markStrike) + 0.08, [79, 84, 88, 91], 0.055);

S.master({ fadeInSec: 0.25, fadeOutSec: 1.1 });

const here = path.dirname(fileURLToPath(import.meta.url));
S.writeWav(path.join(here, '..', '..', 'public', 'clips', 'revisit', 'score.wav'));
