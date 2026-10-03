/**
 * The Ask ad's score, "talking to a friend" edition: round 6's score
 * (audio/ads/trip-score.mjs) re-keyed to this edition's clock
 * (ads/asktalk-timeline.mjs: 112.5 BPM, 16
 * frames a beat, written in output frames).
 *
 * The music is already playing on frame 0 (a feed autoplays mid-scroll: no
 * fade from silence). The hook floats on pads and the pulse while the piles
 * drift; a riser ends as the point lands; the drums come in on the cut into
 * Ask and run through the answer (a tick on each tap, a bell on each source);
 * they drop out for the lockup so the mark strikes into air. Nothing lands on
 * a word the narrator has to land.
 *
 * Writes two files:
 *   public/ads/asktalk/score.wav        the bed (audio/mix-vo.mjs asktalk puts the
 *                                    narrator over it → score-vo.wav)
 *   public/ads/asktalk/score-music.wav  the bed alone, mastered to the feeds'
 *                                    −14 LUFS / ≤ −1 dBTP: the no-narrator
 *                                    edition (MachinaAdTripMusic)
 *
 *   node audio/ads/asktalk-score.mjs && node audio/mix-vo.mjs asktalk
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import { BAR, BAR_FRAMES, BAR_CHORDS, BEAT, CAPTIONS, FPS, HITS, RISERS, TOTAL_FRAMES, TOTAL_SEC, TYPE_STEP } from '../../ads/asktalk-timeline.mjs';
import { createSynth } from '../synth.mjs';
import { limit, lufs, truePeak } from '../loudness.mjs';

const S = createSynth({ seconds: TOTAL_SEC, beat: BEAT });
const { pad, sub, pulse, keys, bell, kick, hat, rim, shaker, clap, riser, whoosh, impact, tick, shimmer } = S;

const f = (fr) => fr / FPS; // frame → seconds
const b = (n) => n * BAR; // bar → seconds
const at = (n, beats) => b(n) + beats * BEAT;
const H = HITS;

const CHORDS = {
  Fmaj7: { bass: 41, upper: [57, 60, 64, 69] },
  Cmaj7: { bass: 48, upper: [59, 64, 67, 71] },
  G6: { bass: 43, upper: [59, 62, 64, 69] },
};

const BARS = Math.ceil(TOTAL_FRAMES / BAR_FRAMES);
/** how much of the band is playing, per bar: the hook already moving, the
 *  answer full, the lockup a breath */
const DENSITY = [0.5, 0.55, 0.6, 0.62, 0.66, 0.85, 0.95, 1.0, 0.98, 1.0, 0.95, 0.5, 0.45, 0.45];
const DRUMS = [f(H.open), f(H.lockup)];

for (let n = 0; n < BARS; n++) {
  const ch = CHORDS[BAR_CHORDS[Math.min(n, BAR_CHORDS.length - 1)]];
  const d = DENSITY[Math.min(n, DENSITY.length - 1)];
  const t0 = b(n);
  const len = Math.min(BAR, TOTAL_SEC - t0);
  const drumsFrom = Math.max(t0, DRUMS[0]);
  const drums = t0 + BAR > DRUMS[0] + 0.01 && t0 < DRUMS[1] - 0.01;

  const padLevel = 0.1 + 0.08 * d;
  const lift = 0;
  ch.upper.forEach((m, i) => {
    const panPos = ((i / (ch.upper.length - 1)) * 2 - 1) * 0.55;
    pad(t0, len, m + lift, padLevel * (i === 0 ? 1 : 0.85), panPos);
  });
  pad(t0, len, ch.bass + 12, padLevel * 0.6, 0);
  if (drums) pad(t0, len, ch.upper[3] + 12, padLevel * 0.34, n % 2 ? 0.35 : -0.35);

  if (t0 < f(H.lockup)) sub(t0, ch.bass, 0.34 + 0.26 * d, d >= 0.7 ? 0.55 : 1.6);
  if (d >= 0.7 && t0 < f(H.lockup)) {
    sub(at(n, 1.5), ch.bass + 7, 0.2 + 0.1 * d, 0.36);
    sub(at(n, 2.5), ch.bass + 12, 0.18 + 0.1 * d, 0.34);
    sub(at(n, 3.5), ch.bass + 7, 0.15, 0.3);
  }

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
  } else if (t0 < f(H.open)) {
    // the hook: a shaker and an off-beat hat already moving from frame 0
    for (let k = 0; k < 8; k++) shaker(at(n, k / 2), 0.016 * d, k % 2 ? 0.3 : -0.3);
    for (let k = 0; k < 4; k++) hat(at(n, k + 0.5), 0.02 * d, 0.1, true);
  }

  // the pulse figure: the film's scale walk (degrees 0-2-3-4-6), from frame 0
  if (t0 < f(H.lockup)) {
    const SCALE = [0, 2, 4, 5, 7, 9, 11];
    const shape = [0, 2, 3, 4, 6, 4, 3, 2];
    const onsets = drums ? [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] : [0, 0.75, 1.5, 2, 2.75, 3.5];
    onsets.forEach((o, k) => {
      if (at(n, o) >= f(H.lockup)) return;
      const step = shape[(k + n) % shape.length];
      const m = ch.upper[0] + SCALE[step % 7] + Math.floor(step / 7) * 12 + (o >= 2.5 ? 12 : 0);
      pulse(at(n, o), m, (drums ? 0.08 : 0.075) * (0.62 + 0.38 * d), ((k % 4) / 3) * 1.1 - 0.55, drums ? 0.3 : 0.4);
    });
  }
}

// the lockup: one held voicing, a single breath
for (const m of [48, 64, 67, 72]) pad(f(H.lockup), TOTAL_SEC - f(H.lockup) - 0.2, m, 0.08, m === 64 ? -0.4 : 0.35);

// melody (FM keys), sparse: in the gaps between lines, home on C at the end
const LINE = CAPTIONS.find((c) => c.place === 'lockup');
const MELODY = [
  [f(H.part), 72, 0.12], // after "That's exactly why we made Machina.", as the mark leaves
  [f(H.markStrike) - BEAT, 72, 0.16], // a beat before the mark strikes
  [f(LINE.at + 92), 79, 0.16], // AFTER the last word
];
for (const [t, m, level] of MELODY) keys(t, m, level, 0.15, t > f(H.lockup) ? 2.8 : 1.8);

for (const [from, to] of RISERS) riser(f(from), f(to) - f(from), 0.05);

// ── sound design, on the picture's frames
// the piles drift ("scattered"), then gather into the point
whoosh(f(H.lost), f(H.collapse - H.lost), 0.02, -0.2);
// (soft: "in one place" is being said as the point lands)
whoosh(f(H.collapse), f(H.dotLands - H.collapse), 0.04, 0.15);
impact(f(H.dotLands), 0.1);
tick(f(H.bracketsClose), 0.08, 0.9);
// (the name is said as the brackets close: the shimmer waits for the line)
shimmer(f(H.part) - 0.3, [79, 84, 88], 0.03);

// the mark leaves; the cut to the chat
whoosh(f(H.part), f(H.open - H.part), 0.04, 0);
impact(f(H.open), 0.1);

// the simple question typing (a character every TYPE_STEP frames, ticks on 16ths)
const Q1_END = H.open + 50 * TYPE_STEP;
for (let fr = H.open; fr < Q1_END; fr += 4) tick(f(fr), 0.028, 1.6 + ((fr / 4) % 3) * 0.08);

// send, and the answer arriving on the touch
tick(f(H.send), 0.11, 1.3);
whoosh(f(H.send), 0.4, 0.05, 0.25);

// the feed rushing past, accelerating into the cut; the big question lands
// the named saves lift (soft: each is lifted on a word the voice is saying)
bell(f(H.talk) + 0.15, 84, 0.018, -0.3, 1.2);
bell(f(H.article) + 0.15, 88, 0.018, 0.3, 1.2);
// the first answer lifts on "one clear answer"
bell(f(518) + 0.2, 84, 0.016, 0, 1.2);
// the cut to the big question
impact(f(H.ask2), 0.08);
tick(f(H.send2), 0.11, 1.3);
whoosh(f(H.send2), 0.4, 0.05, 0.25);

// the theme lifts (soft: "And it finds the themes" is being said)
bell(f(H.lead) + 0.05, 84, 0.02, 0, 1.4);
// the three saves it connected, each as it lifts
H.chips.forEach((fr, i) => {
  sub(f(fr), [48, 52, 55][i], 0.14, 0.26);
  bell(f(fr), [84, 88, 91][i], 0.024, [-0.35, 0, 0.35][i], 1.2);
});

// its Graph chip tapped: the cut into the graph (soft: "you never noticed"
// has just been said)
tick(f(H.graphTap), 0.1, 1.2);
impact(f(H.graphTap), 0.08);
shimmer(f(H.graphTap) + 0.3, [79, 84, 88], 0.025);

// the lockup: thrown out, the mark strikes into air
whoosh(f(H.lockup) - 0.3, 0.7, 0.09, 0);
// (the call to action starts on the strike: the impact stays soft and the
// shimmer waits for "Download Machina." to finish)
impact(f(H.markStrike), 0.18);
// (the name is said as the mark strikes: the shimmer waits for the tagline's end)
shimmer(f(LINE.at) + 3.0, [79, 84, 88, 91], 0.04);

// frame 0 is already playing (a short 40ms de-click, not a fade-in)
S.master({ fadeInSec: 0.04, fadeOutSec: 1.1 });

const here = path.dirname(fileURLToPath(import.meta.url));
const dir = path.join(here, '..', '..', 'public', 'ads', 'asktalk');
fs.mkdirSync(dir, { recursive: true });
const bedPath = path.join(dir, 'score.wav');
S.writeWav(bedPath);

// ── the no-narrator edition: the bed mastered alone, the way mix-vo.mjs
// masters a mix (a gain to −14 LUFS, then a look-ahead limiter under −1 dBTP)
const buf = fs.readFileSync(bedPath);
const SR = buf.readUInt32LE(24);
const n = (buf.length - 44) / 4;
let L = new Float64Array(n);
let R = new Float64Array(n);
for (let i = 0; i < n; i++) {
  L[i] = buf.readInt16LE(44 + i * 4) / 32768;
  R[i] = buf.readInt16LE(46 + i * 4) / 32768;
}
let gain = 10 ** ((-14 - lufs(L, R, SR)) / 20);
let ceiling = 10 ** (-1.3 / 20);
let out;
for (let pass = 0; pass < 6; pass++) {
  const l = L.map((v) => v * gain);
  const r = R.map((v) => v * gain);
  limit(l, r, SR, ceiling);
  const I = lufs(l, r, SR);
  const tp = truePeak(l, r);
  out = { l, r, I, tp };
  if (Math.abs(I + 14) < 0.05 && tp <= -1.2) break;
  gain *= 10 ** ((-14 - I) / 20);
  if (tp > -1.2) ceiling *= 10 ** ((-1.2 - tp - 0.05) / 20);
}
const m = Buffer.from(buf);
for (let i = 0; i < n; i++) {
  m.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out.l[i])) * 32767), 44 + i * 4);
  m.writeInt16LE(Math.round(Math.max(-1, Math.min(1, out.r[i])) * 32767), 46 + i * 4);
}
fs.writeFileSync(path.join(dir, 'score-music.wav'), m);
console.log(`music-only master: ${out.I.toFixed(2)} LUFS, ${out.tp.toFixed(2)} dBTP → public/ads/asktalk/score-music.wav`);
