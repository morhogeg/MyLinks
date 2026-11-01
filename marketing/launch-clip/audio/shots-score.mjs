/**
 * SAME SCREENSHOTS: the score. Music-led, like LATER NEVER COMES: the house
 * instruments (audio/synth.mjs) on the reel's clock (clips/shots-timeline.mjs:
 * 120 BPM, 15 frames a beat), written around the narrator. Original audio,
 * as Instagram's originality ranking and a business account's music rules
 * both want.
 *
 * The energy curve follows the before and the after:
 *  - the hook and BEFORE: vi and IV only (Am7, Fmaj7), a soft pad and a
 *    quiet pulse; the roll's flick is a ratchet of soft ticks that speeds up
 *    and slows down with the scroll itself, and stops on a low note where
 *    the flick lands; a tick on the tap, air on each swipe;
 *  - the hinge ("So I started sharing them to Machina."): the groove drops
 *    (kick, sub, the pulse in 8ths, hats), on a bright I; a tick on each Share and a rising bell as each
 *    screenshot lands in the mark (the third lands on "Machina", so its bell
 *    waits until the word is said and rings into the iris);
 *  - the feed: the groove on, air as it reads down to each card;
 *  - Find: the drums drop out for the typing (a key tick per frame typed), a
 *    held breath, a bell when the card lands and a higher one on its ring;
 *  - the logo: the house ending (POV's bright, calm I) under the shared take.
 *
 * Melodic fills sit in the gaps between lines, never on a spoken word
 * (README: sound to picture).
 *
 *   node audio/shots-score.mjs   →   public/clips/shots/score.wav
 *   (then `node audio/mix-vo.mjs shots`: the lines + the Signature's take, mastered)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEAT, BEAT_FRAMES, CAPTIONS, FPS, HITS, SIGNATURE_AT, TOTAL_FRAMES, TOTAL_SEC, rollAt } from '../clips/shots-timeline.mjs';
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
};
/** where the story turns (round 5): the hinge, "So I started sharing them to
 *  Machina." The groove drops on it (the name is still `AFTER`: from here on
 *  it is the after) */
const AFTER = CAPTIONS[3].at;
const CHORDS = [
  [0, 'Am7'],
  [H.grow, 'Fmaj7'],
  [H.tap, 'Am7'],
  [AFTER, 'Cmaj7'],
  [H.iris, 'Fmaj7'],
  [H.parts[2], 'G6'],
  [H.find, 'Am7'],
  [H.result, 'Fmaj7'],
  // (round 6) the close lifts on V into the logo's I
  [H.close, 'G6'],
  [SIGNATURE_AT, 'Cmaj7'],
];
const chordAt = (frame) => VOICINGS[CHORDS.filter(([f]) => f <= frame).at(-1)[1]];
const STRIKE = SIGNATURE_AT + signatureWordAt(0);

/** where the narrator speaks (output frames, from the measured takes) */
const MAN = JSON.parse(fs.readFileSync(path.join(root, 'out/vo/shots/manifest.json'), 'utf8'));
const SPEECH = MAN.map((m) => [m.frame, m.frame + Math.ceil(m.spoken * FPS)]);
const speaking = (f, pad = 2) => SPEECH.some(([a, b]) => f >= a - pad && f < b + pad);

/** the drums: from "After:" to Find, and back, lighter, once the card lands */
const drums = (f) => (f >= AFTER && f < H.find) || (f >= H.result && f < SIGNATURE_AT);
/** the held breath: the typing */
const breath = (f) => f >= H.find && f < H.result;
/** how hard the groove pushes, 0–1 */
const drive = (f) => (f < AFTER ? 0 : f < H.find ? 0.55 + 0.3 * ((f - AFTER) / (H.find - AFTER)) : 0.6);

// ── pad: the chord bed under everything
CHORDS.forEach(([from, name], k) => {
  const to = k + 1 < CHORDS.length ? CHORDS[k + 1][0] : TOTAL_FRAMES;
  const level = from >= SIGNATURE_AT ? 0.075 : from < AFTER ? 0.042 : breath(from) ? 0.04 : 0.048;
  VOICINGS[name].upper.forEach((m, i) => pad(t(from), t(to - from) + 0.6, m, level, (i - 1.5) * 0.35));
});

// ── the bass: from the drop, beats 1 and 3, an 8th pickup into each bar
for (let f = AFTER; f < SIGNATURE_AT; f += BEAT_FRAMES) {
  if (breath(f)) continue;
  const k = Math.round((f - AFTER) / BEAT_FRAMES);
  const { bass } = chordAt(f);
  if (k % 2 === 0) sub(t(f), bass, 0.095 + 0.07 * drive(f), BEAT * 1.6);
  else if (k % 4 === 3) sub(t(f + EIGHTH), bass + 12, 0.05 + 0.03 * drive(f), BEAT * 0.45);
}

// ── the pulse: on the beat before the drop, 8ths after it, softly through the typing
for (let f = 0; f < SIGNATURE_AT; f += EIGHTH) {
  const onBeat = Math.round(f) % BEAT_FRAMES === 0;
  if (f < AFTER && !onBeat) continue;
  const k = Math.round(f / EIGHTH);
  const level = f < AFTER ? 0.022 : breath(f) ? 0.02 : 0.032 + 0.02 * drive(f);
  pulse(t(f), chordAt(f).upper[k % 4] + 12, level, ((k % 4) - 1.5) * 0.3);
}

// ── the scroll and the flick: a ratchet of soft ticks at the roll's own
// speed (the timeline's curve, the picture's), capped at one a frame: a slow
// tick under the hook's steady scroll, a blur of them in the flick, slowing
// to rest where it lands
{
  const M = 69686; // the roll's furthest scroll, points (Roll.tsx MAX_Y)
  let phase = 0;
  for (let f = 0; f < H.land; f += 0.25) {
    const v = (rollAt(f + 0.25, M) - rollAt(f, M)) * 4; // points a frame
    phase += Math.min(1, 0.07 + v / 260) * 0.25;
    if (phase >= 1) {
      phase -= 1;
      const k = Math.min(1, v / 600);
      tick(t(f), 0.012 + 0.012 * k, 1.4 + 0.5 * k);
    }
  }
  whoosh(t(H.grow - 1), 0.8, 0.018, -0.2);
  // it lands: a low note, nothing melodic under "screenshots"
  sub(t(H.land), 33, 0.12, 1.4);
}

// ── the opens: a tick on the tap, air on the opening and each swipe
tick(t(H.tap), 0.045, 1.2);
whoosh(t(H.tap), 0.5, 0.012, 0.1);
for (const f of [H.swipe1, H.swipe2]) whoosh(t(f), 0.45, 0.016, f === H.swipe1 ? 0.3 : -0.3);

// ── the drop, on "After:"
impact(t(AFTER), 0.1);
whoosh(t(H.target - 1), 0.7, 0.02, 0); // (round 7) the share stage: the icon rises

// ── the drums
for (let f = AFTER; f < SIGNATURE_AT; f += EIGHTH) {
  if (!drums(f)) continue;
  const d = drive(f);
  const k = Math.round((f - AFTER) / EIGHTH);
  const onBeat = k % 2 === 0;
  if (onBeat) kick(t(f), 0.17 + 0.12 * d);
  hat(t(f + (onBeat ? EIGHTH : 0)), 0.016 + 0.018 * d, onBeat ? 0.25 : -0.25);
  if (k % 4 === 2) shaker(t(f), 0.012 + 0.012 * d);
  if (f >= H.iris && k % 4 === 2) clap(t(f), 0.045 + 0.035 * d);
}

// ── the shares: a tick on each tap on the icon, a rising bell as each
// screenshot lands in it; a landing on the spoken "Machina" gets a low,
// non-melodic hit instead (nothing melodic on a word the narrator lands)
const nameStart = CAPTIONS[3].at + Math.round(JSON.parse(fs.readFileSync(path.join(root, 'src/reels/clips/shots/shots-vo.json'), 'utf8')).find((x) => x.frame === CAPTIONS[3].at).words.at(-1) * FPS);
const nameEnds = SPEECH[3][1];
const shares = [
  [H.share1, H.land1, 76],
  [H.share2, H.land2, 79],
  [H.share3, H.land3, 83],
];
shares.forEach(([tap, land, note], k) => {
  tick(t(tap), 0.045, 1.2);
  keys(t(tap), 76, 0.022, 0, 0.6);
  if (land >= nameStart - 2 && land <= nameEnds) impact(t(land), 0.08);
  else bell(t(land), note, 0.05, k % 2 ? 0.2 : -0.2, 1.8);
});
whoosh(t(H.iris), 0.7, 0.02, 0);

// ── the feed: air as it reads down past the three; then a soft, high tick
// as each part of the card rings (non-melodic: the words land on their own)
whoosh(t(H.cards), 0.75, 0.018, 0.15);
H.parts.forEach((f, k) => tick(t(f + 3), 0.026, 1.7 + 0.08 * k));

// ── Find: the cut, the drums out; a key tick per typed frame; the card, its ring
impact(t(H.find), 0.06);
for (let f = H.typing; f < H.typing + 9; f++) tick(t(f), 0.022, 1.8);
pad(t(H.find + 8), t(H.result - H.find - 8) + 0.3, 72, 0.02, 0);
riser(t(H.result - 14), t(14), 0.03);
bell(t(H.result), 79, 0.055, 0.1, 2.4);
bell(t(H.ring), 84, 0.045, -0.1, 2.2);

// ── (round 6) the close: air as the view pulls back into BEFORE | AFTER
whoosh(t(H.close), 0.8, 0.018, 0);

// ── fills: a plucked figure answering the voice in the gaps between lines
const FILL = [0, 2, 3, 1];
for (let f = AFTER + BEAT_FRAMES; f < SIGNATURE_AT - BEAT_FRAMES; f += EIGHTH) {
  if (breath(f) || speaking(f, 4)) continue;
  const k = Math.round((f - AFTER) / EIGHTH);
  const up = chordAt(f).upper;
  pluck(t(f), up[FILL[k % 4]] + 12, 0.05 + 0.03 * drive(f), k % 2 ? 0.25 : -0.25, 0.55);
}

// ── a swell into the strike as the paper rises
riser(t(SIGNATURE_AT - 8), t(STRIKE - SIGNATURE_AT + 8), 0.07);

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
if (CAPTIONS.length !== MAN.length) throw new Error(`${CAPTIONS.length} captions, ${MAN.length} voiced lines: run audio/synth-vo.py shots`);
for (const [k, c] of CAPTIONS.entries()) if (MAN[k].frame !== c.at) throw new Error(`line ${k} voiced at ${MAN[k].frame}, captioned at ${c.at}: run audio/synth-vo.py shots`);

S.master({ fadeInSec: 0, fadeOutSec: 0.8 });
const dest = path.join(root, 'public', 'clips', 'shots', 'score.wav');
fs.mkdirSync(path.dirname(dest), { recursive: true });
S.writeWav(dest);
console.log(`wrote ${path.relative(root, dest)} (${TOTAL_SEC.toFixed(2)}s, ${TOTAL_FRAMES} frames)`);
