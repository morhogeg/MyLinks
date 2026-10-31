/**
 * THE APP STORE PREVIEW: the score, round 8 (owner: "smooth everything out,
 * effortless and natural"; the picture now dissolves from screen to screen
 * under a spring camera, and the sound follows it: air under each change,
 * nothing that hits). The house instruments (audio/synth.mjs) on the
 * preview's clock (clips/preview-timeline.mjs: 120 BPM, 15 frames a beat),
 * written UNDER a narrator: a warm bed that moves with the picture and never
 * competes with the voice (mix-vo ducks it under every line).
 *
 * The energy curve, move by move:
 *  - Save: a light ticking pulse; the LIFT a breath of air as the analysis
 *    sheet rises off the receding feed (round 10: no + tap, no paste);
 *  - Analyzed: the pulse in 8ths and hats creeping in, a soft note on each
 *    step the stepper checks off, a riser into "all done" (a soft impact);
 *    the DROP a soft fall of air, a bell as the new card lifts;
 *  - Do: the groove (a soft kick on the beat, hats, the pulse) as the camera
 *    reads into the card; it holds its breath a beat before the MATCH, and
 *    the cut lands on a chime (the word stays, the sentence becomes a task);
 *  - Ask: the tab tapped, a breath of air as Ask dissolves in; the drums
 *    drop out for the typing (a soft key tick per character); the SEND a
 *    breath of air as the chat dissolves in;
 *  - the answer on a bell, a bell on each source;
 *  - Connected: the graph blooms in on a bell and the groove at its
 *    warmest, a bell on each node; a swell into the Signature's strike;
 *  - the logo: POV's bright, calm I, the house ending under the shared take.
 *
 *   node audio/preview-score.mjs   →   public/clips/preview/score.wav
 *   (then `node audio/mix-vo.mjs preview`: the lines + the Signature's take, mastered)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEAT, BEAT_FRAMES, CHORDS, FPS, HITS, LIFTS, PINGS, SIGNATURE_AT, TAPS, TOTAL_FRAMES, TOTAL_SEC, TYPED } from '../clips/preview-timeline.mjs';
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

/** the groove's held breath: the beat before the match */
const held = (f) => f >= H.match - BEAT_FRAMES / 2 && f < H.match;
/** the drums: from the card landing to the question, and from the answer to the logo */
const drums = (f) => ((f >= H.landed && f < H.ask) || (f >= H.answer && f < SIGNATURE_AT)) && !held(f);
/** the held breath: the typing and the wait for the answer */
const breath = (f) => f >= H.ask && f < H.answer;
/** how hard the groove pushes, 0–1 */
const drive = (f) => (f < H.landed ? 0 : f < H.ask ? 0.45 + 0.2 * ((f - H.landed) / (H.ask - H.landed)) : 0.6 + 0.4 * Math.min(1, (f - H.answer) / (SIGNATURE_AT - H.answer)));

// ── pad and bass: one voicing per chord span
CHORDS.forEach(([from, name], k) => {
  const to = k + 1 < CHORDS.length ? CHORDS[k + 1][0] : TOTAL_FRAMES;
  const level = from >= SIGNATURE_AT ? 0.075 : breath(from) ? 0.042 : 0.05;
  VOICINGS[name].upper.forEach((m, i) => pad(t(from), t(to - from) + 0.6, m, level, (i - 1.5) * 0.35));
});
for (let f = 0; f < SIGNATURE_AT; f += BEAT_FRAMES * 2) {
  if (breath(f) || held(f)) continue;
  sub(t(f), chordAt(f).bass, 0.12 + 0.1 * drive(f), BEAT * 1.7);
}

// ── the pulse: on the beat under the dialog, 8ths from the card being built on
for (let f = 0; f < SIGNATURE_AT; f += EIGHTH) {
  if (breath(f) || held(f)) continue;
  const onBeat = f % BEAT_FRAMES === 0;
  if (f < H.lift && !onBeat) continue;
  const k = Math.round(f / EIGHTH);
  const build = f < H.landed ? Math.max(0, (f - H.lift) / (H.landed - H.lift)) : 1;
  pulse(t(f), chordAt(f).upper[k % 4] + 12, 0.03 + 0.025 * build + 0.015 * drive(f), ((k % 4) - 1.5) * 0.3);
  if (f < H.landed) tick(t(f), (onBeat ? 0.045 : 0.028) + 0.025 * build, onBeat ? 1 : 1.35);
}

// ── LIFT: a breath of air as the dialog rises off the receding feed
whoosh(t(H.lift - 2), 0.7, 0.022, -0.15);
keys(t(H.lift + 2), 76, 0.03, 0.15, 1.4);
// hats creep in while the card is built, a note on each step it checks off,
// a riser into "all done"
for (let f = H.lift; f < H.done; f += EIGHTH) hat(t(f), 0.01 + 0.022 * ((f - H.lift) / (H.done - H.lift)), f % BEAT_FRAMES ? 0.2 : -0.2);
H.steps.forEach((f, i) => keys(t(f), [72, 74, 76, 79][i], 0.035, i % 2 ? 0.2 : -0.2, 0.9));
riser(t(H.done - 54), t(54), 0.06);
impact(t(H.done), 0.13);
// DROP: the dialog settles back into the feed (the card's lift rings below)
whoosh(t(H.drop - 2), 0.8, 0.02, 0.2);

// ── the groove
for (let f = H.landed; f < SIGNATURE_AT; f += EIGHTH) {
  if (!drums(f)) continue;
  const d = drive(f);
  const onBeat = f % BEAT_FRAMES === 0;
  if (onBeat) kick(t(f), 0.22 + 0.14 * d);
  hat(t(f + (onBeat ? EIGHTH : 0)), 0.018 + 0.018 * d, onBeat ? 0.25 : -0.25);
  if (f % (BEAT_FRAMES * 2) === BEAT_FRAMES) shaker(t(f), 0.014 + 0.012 * d);
}

// ── MATCH: a soft rise as the camera reads into the card, a chime as the
// line becomes the task
riser(t(H.match - 22), t(24), 0.03);
bell(t(H.match + 2), 83, 0.06, -0.1, 2.8);
shimmer(t(H.match + 4), [79, 83, 88], 0.026);

// ── taps: the app's own small sounds
for (const tap of TAPS) {
  tick(t(tap.at + 4), 0.045, 1.2);
  keys(t(tap.at + 4), 76, 0.026, 0, 0.7);
}
// ── rings: a bell on each lifted element and each source and node, rising
const RINGS = [...LIFTS.map((l) => l.at), ...PINGS.map((p) => p.at)].sort((a, b) => a - b);
const RING_NOTES = [76, 79, 79, 83, 86, 79, 83, 86];
RINGS.forEach((f, i) => bell(t(f), RING_NOTES[i % RING_NOTES.length], 0.045, i % 2 ? 0.2 : -0.2, 1.8));

// ── TAB: Ask dissolving in, a breath of air
whoosh(t(H.ask - 1), 0.7, 0.018, -0.25);

// ── Ask: a key tick per typed character, SEND swishing up with the
// question, a held note through the wait, the answer
for (const f of TYPED) tick(t(f), 0.026, 1.8);
whoosh(t(H.send - 1), 0.75, 0.02, 0.3);
pad(t(H.send), t(H.answer - H.send) + 0.3, 72, 0.02, 0);
bell(t(H.answer), 79, 0.065, 0.1, 2.6);
keys(t(H.answer + 8), 72, 0.04, -0.2, 2.2);

// ── the graph blooming in: air, a low note, a bell
whoosh(t(H.graph - 1), 0.8, 0.02, 0);
sub(t(H.graph + 2), chordAt(H.graph).bass, 0.16, 1.8);
bell(t(H.graph + 6), 83, 0.05, 0.15, 2.6);

// ── a swell into the strike as the phone settles back under the paper
riser(t(H.out - 30), t(STRIKE - H.out + 30), 0.075);

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
