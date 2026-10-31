/**
 * LATER NEVER COMES: the score. Music-led this time (a Reel may be; the App
 * Store preview's was a bed): the house instruments (audio/synth.mjs) on the
 * reel's clock (clips/later-timeline.mjs: 120 BPM, 15 frames a beat), written
 * around a narrator. Original audio, as Instagram's originality ranking and
 * a business account's music rules both want.
 *
 * The energy curve, move by move:
 *  - the hook: almost nothing (a soft pad, a light ticking pulse), so the
 *    joke lands on its own;
 *  - THE TAP: the groove drops on the finger (kick, sub, the pulse in 8ths,
 *    hats), a breath of air as Machina's card rises, a soft note on each
 *    step it reads, a riser into "Saved ✓" (a bell);
 *  - Do this: air under the cross-blur, a bell as the task lifts;
 *  - Ask: the tab's tick and air, the drums drop out for the typing (a soft
 *    key tick per character), SEND swishing up, a held breath for the wait;
 *  - the answer: the groove back, warmer (a backbeat now), a bell on the
 *    answer and a rising bell on each source;
 *  - the graph: air, a low note, a bell as it blooms, a bell on each node,
 *    a swell into the Signature's strike;
 *  - the logo: the house ending (POV's bright, calm I) under the shared take.
 *
 * The voice and the music take turns: melodic fills (a plucked figure) sit
 * in the gaps between lines, never on a word the narrator has to land
 * (README: sound to picture).
 *
 *   node audio/later-score.mjs   →   public/clips/later/score.wav
 *   (then `node audio/mix-vo.mjs later`: the lines + the Signature's take, mastered)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEAT, BEAT_FRAMES, CAPTIONS, CHORDS, FPS, HITS, LIFTS, PINGS, SIGNATURE_AT, TAPS, TOTAL_FRAMES, TOTAL_SEC, TYPED } from '../clips/later-timeline.mjs';
import { SIGNATURE, signatureWordAt } from '../src/reels/kit/signature.mjs';
import { createSynth } from './synth.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

const S = createSynth({ seconds: TOTAL_SEC, beat: BEAT });
const { pad, sub, pluck, pulse, keys, bell, kick, hat, shaker, clap, riser, whoosh, impact, tick, shimmer } = S;
const H = HITS;
const t = (frame) => frame / FPS;
const EIGHTH = BEAT_FRAMES / 2;

const VOICINGS = {
  Am7: { bass: 45, upper: [55, 60, 64, 67] },
  Fmaj7: { bass: 41, upper: [57, 60, 64, 69] },
  Cmaj7: { bass: 48, upper: [59, 64, 67, 71] },
  G6: { bass: 43, upper: [59, 62, 64, 69] },
  Em7: { bass: 40, upper: [55, 59, 62, 67] },
};
const chordAt = (frame) => VOICINGS[CHORDS.filter(([f]) => f <= frame).at(-1)[1]];
const STRIKE = SIGNATURE_AT + signatureWordAt(0);

/** where the narrator speaks (output frames, from the measured takes) */
const VO = JSON.parse(fs.readFileSync(path.join(root, 'src/reels/clips/later/later-vo.json'), 'utf8'));
const MAN = JSON.parse(fs.readFileSync(path.join(root, 'out/vo/later/manifest.json'), 'utf8'));
const SPEECH = MAN.map((m) => [m.frame, m.frame + Math.ceil(m.spoken * FPS)]);
const speaking = (f, pad = 2) => SPEECH.some(([a, b]) => f >= a - pad && f < b + pad);

/** the drums: from the tap to the question, and from the answer to the logo */
const drums = (f) => (f >= H.tap && f < H.ask) || (f >= H.answer && f < SIGNATURE_AT);
/** the held breath: the typing and the wait for the answer */
const breath = (f) => f >= H.ask && f < H.answer;
/** how hard the groove pushes, 0–1 */
const drive = (f) => (f < H.tap ? 0 : f < H.ask ? 0.55 + 0.15 * ((f - H.tap) / (H.ask - H.tap)) : 0.7 + 0.3 * Math.min(1, (f - H.answer) / (SIGNATURE_AT - H.answer)));

// ── pad: the chord bed under everything, one voicing per chord span
CHORDS.forEach(([from, name], k) => {
  const to = k + 1 < CHORDS.length ? CHORDS[k + 1][0] : TOTAL_FRAMES;
  const level = from >= SIGNATURE_AT ? 0.075 : from < H.tap ? 0.04 : breath(from) ? 0.042 : 0.048;
  VOICINGS[name].upper.forEach((m, i) => pad(t(from), t(to - from) + 0.6, m, level, (i - 1.5) * 0.35));
});

// ── the bass: from the tap, on beats 1 and 3 with an 8th pickup into each bar
for (let f = H.tap; f < SIGNATURE_AT; f += BEAT_FRAMES) {
  if (breath(f)) continue;
  const k = Math.round((f - H.tap) / BEAT_FRAMES);
  const { bass } = chordAt(f);
  // (measured against the approved preview's mix: the groove under most of
  // the reel put 4dB more energy below 100Hz, which phone speakers barely
  // play and which costs the voice headroom; trimmed)
  if (k % 2 === 0) sub(t(f), bass, 0.095 + 0.07 * drive(f), BEAT * 1.6);
  else if (k % 4 === 3) sub(t(f + EIGHTH), bass + 12, 0.05 + 0.03 * drive(f), BEAT * 0.45);
}

// ── the pulse: on the beat under the hook, 8ths from the tap on, softly
// on through the typing and the wait (a Reel never goes dead: measured, the
// held breath without it sat at −29dB for 1.5s)
for (let f = 0; f < SIGNATURE_AT; f += EIGHTH) {
  const onBeat = Math.round(f) % BEAT_FRAMES === 0;
  if (f < H.tap && !onBeat) continue;
  const k = Math.round(f / EIGHTH);
  const level = f < H.tap ? 0.022 : breath(f) ? 0.02 : 0.032 + 0.02 * drive(f);
  pulse(t(f), chordAt(f).upper[k % 4] + 12, level, ((k % 4) - 1.5) * 0.3);
  if (f < H.tap) tick(t(f), 0.03, 1);
}

// ── THE TAP: the groove drops on the finger; air as Machina's card rises
impact(t(H.tap), 0.11);
whoosh(t(H.tap + 1), 0.7, 0.022, 0.15);
H.steps.forEach((f, i) => keys(t(f), [72, 74, 76][i], 0.034, i % 2 ? 0.2 : -0.2, 0.9));
riser(t(H.saved - 40), t(40), 0.05);
bell(t(H.saved), 84, 0.06, 0.1, 2.4);

// ── the drums
for (let f = H.tap; f < SIGNATURE_AT; f += EIGHTH) {
  if (!drums(f)) continue;
  const d = drive(f);
  const k = Math.round((f - H.tap) / EIGHTH);
  const onBeat = k % 2 === 0;
  if (onBeat) kick(t(f), 0.17 + 0.12 * d);
  hat(t(f + (onBeat ? EIGHTH : 0)), 0.016 + 0.018 * d, onBeat ? 0.25 : -0.25);
  if (k % 4 === 2) shaker(t(f), 0.012 + 0.012 * d);
  // the backbeat, once the answer is in: warmer
  if (f >= H.answer && k % 4 === 2) clap(t(f), 0.05 + 0.04 * d);
}

// ── Do this: air under the cross-blur
whoosh(t(H.revisit - 1), 0.75, 0.02, -0.2);

// ── taps: the app's own small sounds
for (const tap of TAPS) {
  tick(t(tap.at + 4), 0.045, 1.2);
  keys(t(tap.at + 4), 76, 0.024, 0, 0.7);
}
// ── rings: a bell on each lifted element, each source and each node, rising
const RINGS = [...LIFTS.map((l) => l.at), ...PINGS.map((p) => p.at)].sort((a, b) => a - b);
const RING_NOTES = [79, 76, 79, 83, 79, 83, 86];
RINGS.forEach((f, i) => bell(t(f), RING_NOTES[i % RING_NOTES.length], 0.042, i % 2 ? 0.2 : -0.2, 1.8));

// ── Ask: the tab, air, the drums out; a key tick per typed character; SEND
// swishing up; a held note through the wait; the answer
whoosh(t(H.ask - 1), 0.7, 0.018, -0.25);
for (const f of TYPED) tick(t(f), 0.024, 1.8);
whoosh(t(H.send - 1), 0.75, 0.02, 0.3);
pad(t(H.send), t(H.answer - H.send) + 0.3, 72, 0.02, 0);
riser(t(H.answer - 24), t(24), 0.035);
bell(t(H.answer), 79, 0.06, 0.1, 2.6);

// ── the graph blooming in: air, a low note, a bell
whoosh(t(H.graph - 1), 0.8, 0.02, 0);
sub(t(H.graph + 2), chordAt(H.graph).bass, 0.16, 1.8);
bell(t(H.graph + 6), 83, 0.05, 0.15, 2.6);

// ── fills: a plucked figure answering the voice in the gaps between lines
// (never under a spoken word)
const FILL = [0, 2, 3, 1];
for (let f = H.tap + BEAT_FRAMES; f < SIGNATURE_AT - BEAT_FRAMES; f += EIGHTH) {
  if (breath(f) || speaking(f, 4)) continue;
  const k = Math.round((f - H.tap) / EIGHTH);
  const up = chordAt(f).upper;
  pluck(t(f), up[FILL[k % 4]] + 12, 0.05 + 0.03 * drive(f), k % 2 ? 0.25 : -0.25, 0.55);
}

// ── a swell into the strike as the phone settles back under the paper
riser(t(H.out - 20), t(STRIKE - H.out + 20), 0.075);

// ── the logo: a bright, calm I (POV's ending)
impact(t(STRIKE), 0.22);
sub(t(STRIKE), 36, 0.28, 2.4);
bell(t(STRIKE + 6), 76, 0.09, 0.15, 3.4);
shimmer(t(STRIKE + 40), [79, 83, 86], 0.035);
const lastWord = SIGNATURE_AT + signatureWordAt(SIGNATURE.words.length - 1);
keys(t(lastWord + 20), 72, 0.06, -0.2, 3);
keys(t(lastWord + 28), 76, 0.05, 0.2, 3);

// (CAPTIONS is read so a script change that moves a line without re-voicing
// it fails here, not silently in the mix)
if (CAPTIONS.length !== MAN.length) throw new Error(`${CAPTIONS.length} captions, ${MAN.length} voiced lines: run audio/synth-vo.py later`);

S.master({ fadeInSec: 0, fadeOutSec: 0.8 });
const dest = path.join(root, 'public', 'clips', 'later', 'score.wav');
fs.mkdirSync(path.dirname(dest), { recursive: true });
S.writeWav(dest);
console.log(`wrote ${path.relative(root, dest)} (${TOTAL_SEC.toFixed(2)}s, ${TOTAL_FRAMES} frames)`);
