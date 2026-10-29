/**
 * THE APP STORE PREVIEW: the score, round 4 (owner: narration on every
 * beat). The house instruments (audio/synth.mjs) on the preview's clock
 * (clips/preview-timeline.mjs: 120 BPM, 15 frames a beat), written UNDER a
 * narrator: a warm bed that moves with the picture and never competes with
 * the voice (mix-vo ducks it under every line).
 *
 * The energy curve, beat by beat:
 *  - Save: a light ticking pulse, a tick on + and on Save;
 *  - Summary: the pulse in 8ths and hats creeping in, a riser that lands
 *    WITH the card (a soft impact and a bell);
 *  - Moments and Do: a gentle groove (a soft kick on the beat, hats, the
 *    pulse), a bell on each ring;
 *  - Ask: the drums drop out for the typing (a key tick per character) and
 *    the wait, back on the answer with a bell;
 *  - Connected: the full groove at its warmest, a riser into the
 *    Signature's strike;
 *  - the logo: POV's bright, calm I, the house ending under the shared take.
 *
 *   node audio/preview-score.mjs   →   public/clips/preview/score.wav
 *   (then `node audio/mix-vo.mjs preview`: the lines + the Signature's take, mastered)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEAT, BEAT_FRAMES, BEATS, CHORDS, FPS, HITS, PINGS, SIGNATURE_AT, TAPS, TOTAL_FRAMES, TOTAL_SEC, TYPED } from '../clips/preview-timeline.mjs';
import { SIGNATURE, signatureWordAt } from '../src/reels/kit/signature.mjs';
import { createSynth } from './synth.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

const S = createSynth({ seconds: TOTAL_SEC, beat: BEAT });
const { pad, sub, pulse, keys, bell, kick, hat, shaker, riser, whoosh, impact, tick, shimmer } = S;
const H = HITS;
const t = (frame) => frame / FPS;
const EIGHTH = BEAT_FRAMES / 2;

const VOICINGS = {
  Am7: { bass: 45, upper: [55, 60, 64, 67] },
  Fmaj7: { bass: 41, upper: [57, 60, 64, 69] },
  Cmaj7: { bass: 48, upper: [59, 64, 67, 71] },
  G6: { bass: 43, upper: [59, 62, 64, 69] },
};
const chordAt = (frame) => VOICINGS[CHORDS.filter(([f]) => f <= frame).at(-1)[1]];
const STRIKE = SIGNATURE_AT + signatureWordAt(0);

/** the drums: from the card landing to the question, and from the answer to the logo */
const drums = (f) => (f >= H.landed && f < BEATS.ask) || (f >= H.answer && f < SIGNATURE_AT);
/** the held breath: the typing and the wait for the answer */
const breath = (f) => f >= BEATS.ask && f < H.answer;
/** how hard the groove pushes, 0–1 */
const drive = (f) => (f < H.landed ? 0 : f < BEATS.ask ? 0.45 + 0.2 * ((f - H.landed) / (BEATS.ask - H.landed)) : 0.6 + 0.4 * Math.min(1, (f - H.answer) / (SIGNATURE_AT - H.answer)));

// ── pad and bass: one voicing per chord span
CHORDS.forEach(([from, name], k) => {
  const to = k + 1 < CHORDS.length ? CHORDS[k + 1][0] : TOTAL_FRAMES;
  const level = from >= SIGNATURE_AT ? 0.075 : breath(from) ? 0.042 : 0.05;
  VOICINGS[name].upper.forEach((m, i) => pad(t(from), t(to - from) + 0.6, m, level, (i - 1.5) * 0.35));
});
for (let f = 0; f < SIGNATURE_AT; f += BEAT_FRAMES * 2) {
  if (breath(f)) continue;
  sub(t(f), chordAt(f).bass, 0.12 + 0.1 * drive(f), BEAT * 1.7);
}

// ── the pulse: on the beat under the sheet, 8ths from the card being built on
for (let f = 0; f < SIGNATURE_AT; f += EIGHTH) {
  if (breath(f)) continue;
  const onBeat = f % BEAT_FRAMES === 0;
  if (f < BEATS.summary && !onBeat) continue;
  const k = Math.round(f / EIGHTH);
  const build = f < H.landed ? Math.max(0, (f - BEATS.summary) / (H.landed - BEATS.summary)) : 1;
  pulse(t(f), chordAt(f).upper[k % 4] + 12, 0.03 + 0.025 * build + 0.015 * drive(f), ((k % 4) - 1.5) * 0.3);
  if (f < H.landed) tick(t(f), (onBeat ? 0.045 : 0.028) + 0.025 * build, onBeat ? 1 : 1.35);
}
// hats creep in while the card is built; a riser lands with it
for (let f = BEATS.summary; f < H.landed; f += EIGHTH) hat(t(f), 0.01 + 0.022 * ((f - BEATS.summary) / (H.landed - BEATS.summary)), f % BEAT_FRAMES ? 0.2 : -0.2);
riser(t(H.sheetClose), t(H.landed - H.sheetClose), 0.06);
impact(t(H.landed), 0.14);
bell(t(H.landed + 2), 76, 0.065, 0.1, 2.6);

// ── the groove
for (let f = H.landed; f < SIGNATURE_AT; f += EIGHTH) {
  if (!drums(f)) continue;
  const d = drive(f);
  const onBeat = f % BEAT_FRAMES === 0;
  if (onBeat) kick(t(f), 0.22 + 0.14 * d);
  hat(t(f + (onBeat ? EIGHTH : 0)), 0.018 + 0.018 * d, onBeat ? 0.25 : -0.25);
  if (f % (BEAT_FRAMES * 2) === BEAT_FRAMES) shaker(t(f), 0.014 + 0.012 * d);
}

// ── taps: the app's own small sounds
for (const tap of TAPS) {
  tick(t(tap.at + 4), 0.055, 1.2);
  keys(t(tap.at + 4), 76, 0.03, 0, 0.7);
}
// ── rings: a bell each, rising through the Do this list
PINGS.forEach((p, i) => bell(t(p.at), [79, 76, 79, 83, 84, 79][i], 0.045, i % 2 ? 0.2 : -0.2, 1.8));
// ── the scene changes: a breath of air on each dissolve
[BEATS.todo, BEATS.ask, BEATS.graph].forEach((f, i) => whoosh(t(f - 6), 0.5, 0.035, i % 2 ? 0.3 : -0.3));

// ── Ask: a key tick per typed character, a held note through the wait, the answer
for (const f of TYPED) tick(t(f), 0.035, 1.8);
pad(t(H.send), t(H.answer - H.send) + 0.3, 72, 0.02, 0);
bell(t(H.answer), 79, 0.065, 0.1, 2.6);
keys(t(H.answer + 8), 72, 0.04, -0.2, 2.2);

// ── connected: a riser into the strike
riser(t(BEATS.graph + 30), t(STRIKE - BEATS.graph - 30), 0.085);

// ── the logo: a bright, calm I (POV's ending)
impact(t(STRIKE), 0.22);
sub(t(STRIKE), 36, 0.28, 2.4);
bell(t(STRIKE + 6), 76, 0.09, 0.15, 3.4);
shimmer(t(STRIKE + 40), [79, 83, 86], 0.035);
const lastWord = SIGNATURE_AT + signatureWordAt(SIGNATURE.words.length - 1);
keys(t(lastWord + 20), 72, 0.06, -0.2, 3);
keys(t(lastWord + 28), 76, 0.05, 0.2, 3);

S.master({ fadeInSec: 0, fadeOutSec: 0.8 });
const dest = path.join(root, 'public', 'clips', 'preview', 'score.wav');
fs.mkdirSync(path.dirname(dest), { recursive: true });
S.writeWav(dest);
console.log(`wrote ${path.relative(root, dest)} (${TOTAL_SEC.toFixed(2)}s, ${TOTAL_FRAMES} frames)`);
