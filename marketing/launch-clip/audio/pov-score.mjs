/**
 * POV: YOU SAVED IT: the score. The house instruments (audio/synth.mjs,
 * shared by every Machina score) on the reel's own clock
 * (clips/pov-timeline.mjs: 120 BPM, 15 frames a beat).
 *
 * The owner's brief, as an energy curve:
 *  - a light ticking pulse under the blank search bar…
 *  - …that builds through the hunt: the pulse figure in 8ths, hats, a
 *    half-time kick, then four on the floor, a whoosh on every cut;
 *  - the search types over soft key ticks, and on "Nothing." the band cuts
 *    to near silence (a low thud, a pad's tail); the desperate scroll is a
 *    flurry of ticks that stops dead on the freeze, a smaller thud on the
 *    second "No results";
 *  - the turn is slow and warm: a pad on IV, a few keys notes between the
 *    words, never on them;
 *  - the gather lifts on V, the pulse back, a riser that ends on the
 *    Signature's strike;
 *  - the logo opens onto a bright, calm I: a soft impact on the strike, a
 *    bell, a shimmer, a warm pad to the end.
 *
 *   node audio/pov-score.mjs   →   public/clips/pov/score.wav
 *   (then `node audio/mix-vo.mjs pov`: the lines + the Signature's take, mastered)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BEAT, BEAT_FRAMES, CAPTIONS, CHORDS, FPS, HITS, QUERY, SIGNATURE_AT, TOTAL_FRAMES, TOTAL_SEC } from '../clips/pov-timeline.mjs';
import { SIGNATURE, signatureWordAt } from '../src/reels/kit/signature.mjs';
import { createSynth } from './synth.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');

const S = createSynth({ seconds: TOTAL_SEC, beat: BEAT });
const { pad, sub, pulse, keys, bell, kick, hat, shaker, riser, whoosh, impact, tick, shimmer } = S;
const H = HITS;
const t = (frame) => frame / FPS;

// ── where the narrator speaks (the voice manifest), the Signature's take included
const MANIFEST = JSON.parse(fs.readFileSync(path.join(root, 'out', 'vo', 'pov', 'manifest.json'), 'utf8'));
const spoken = [
  ...CAPTIONS.map((c) => {
    const m = MANIFEST.find((x) => x.frame === c.at);
    return [c.at, c.at + Math.round((m?.spoken ?? 0) * FPS)];
  }),
  [SIGNATURE_AT + SIGNATURE.voiceAt, SIGNATURE_AT + SIGNATURE.voiceAt + Math.round(SIGNATURE.voiceSec * FPS)],
];
const voiced = (from, len = 1) => spoken.some(([a, b]) => from < b + 3 && from + len > a - 3);

const VOICINGS = {
  Am7: { bass: 45, upper: [55, 60, 64, 67] },
  Fmaj7: { bass: 41, upper: [57, 60, 64, 69] },
  Cmaj7: { bass: 48, upper: [59, 64, 67, 71] },
  G6: { bass: 43, upper: [59, 62, 64, 69] },
};
const chordAt = (frame) => VOICINGS[CHORDS.filter(([f]) => f <= frame).at(-1)[1]];

/** the hunt's build, 0 → 1, from the first cut to the search */
const build = (f) => Math.max(0, Math.min(1, (f - H.insta) / (H.search - H.insta)));
/** the "Nothing." hole: from the first "No results" to the turn */
const hole = (f) => f >= H.none1 && f < H.drift;
/** the signature's strike: its dot lands on the spoken "Machina" */
const STRIKE = SIGNATURE_AT + signatureWordAt(0);

// ── pad: one voicing per chord span; it thins to a tail in the hole
CHORDS.forEach(([from, name], k) => {
  const to = k + 1 < CHORDS.length ? CHORDS[k + 1][0] : TOTAL_FRAMES;
  const ch = VOICINGS[name];
  const start = hole(from) ? H.drift : from;
  // a span that runs into the hole stops dead on the first "No results"
  const end = start < H.none1 && to > H.none1 ? H.none1 : to;
  if (start >= end) return;
  const level = from >= SIGNATURE_AT ? 0.075 : from >= H.drift ? 0.06 : 0.035 + 0.025 * build(from);
  ch.upper.forEach((m, i) => pad(t(start), t(end - start) + (end === H.none1 ? 0.05 : 0.6), m, level, (i - 1.5) * 0.35));
});
// the hole keeps one quiet note of the chord it fell from, so it is "almost" silence
pad(t(H.none1), t(H.drift - H.none1) + 0.4, 57, 0.018, 0);

// ── the ticking pulse: every beat under the hook, every 8th through the hunt
for (let f = 0; f < H.search + 8; f += BEAT_FRAMES / 2) {
  const onBeat = f % BEAT_FRAMES === 0;
  if (f < H.insta && !onBeat) continue;
  const b = build(f);
  tick(t(f), (onBeat ? 0.07 : 0.045) + 0.05 * b, onBeat ? 1 : 1.35);
}

// ── the hunt builds: the pulse figure, hats, the kick
for (let f = H.insta; f < H.search; f += BEAT_FRAMES / 2) {
  const b = build(f);
  const ch = chordAt(f);
  const k = Math.round(f / (BEAT_FRAMES / 2));
  pulse(t(f), ch.upper[k % 4] + 12, 0.05 + 0.06 * b, ((k % 4) - 1.5) * 0.3);
  if (f >= H.shots) hat(t(f), voiced(f) ? 0.022 : 0.035 + 0.02 * b, 0.2 * (k % 2 ? 1 : -1));
  if (f >= H.chat && !voiced(f)) hat(t(f + BEAT_FRAMES / 4), 0.02, -0.15);
}
for (let f = H.shots; f < H.search; f += BEAT_FRAMES) {
  const four = f >= H.chat;
  if (four || (f - H.shots) % (BEAT_FRAMES * 2) === 0) kick(t(f), 0.3 + 0.2 * build(f));
  if (f % (BEAT_FRAMES * 2) === 0) sub(t(f), chordAt(f).bass, 0.2 + 0.15 * build(f), BEAT * 1.6);
}
// a whoosh on every cut of the hunt, a riser into the search
[H.insta, H.tiktok, H.shots, H.chat].forEach((f, i) => whoosh(t(f - 9), 0.55, 0.05 + 0.012 * i, i % 2 ? 0.4 : -0.4));
riser(t(H.chat + 30), t(H.search - H.chat - 30), 0.06);

// ── the search: soft key ticks as it types, then the hole
for (let k = 0; k < QUERY.length; k++) if (QUERY[k] !== ' ') tick(t(H.type + k * 1.7), 0.035, 1.8);
// "Nothing.": no hit, just the floor dropping out (a soft low note)
sub(t(H.none1), 33, 0.1, 0.9);
// the desperate scroll: a flurry that stops dead on the freeze
for (let f = H.scroll; f < H.freeze; f += 2) tick(t(f), 0.02 + 0.02 * ((f - H.scroll) / (H.freeze - H.scroll)), 1.6);
sub(t(H.none2), 33, 0.07, 0.7);

// ── the turn: slow and warm, keys only between the words
const turnNotes = [
  [H.drift + 4, 69],
  [H.drift + 60, 72],
  [H.drift + 96, 69],
  [H.white - 8, 67],
];
for (const [f, m] of turnNotes) if (!voiced(f, 6)) keys(t(f), m, 0.07, 0.2, 2.4);
sub(t(H.drift), 41, 0.16, 3);

// ── the gather: the pulse comes back on V, a riser that ends on the strike
for (let f = H.gather; f < SIGNATURE_AT; f += BEAT_FRAMES / 2) {
  const k = Math.round(f / (BEAT_FRAMES / 2));
  const up = (f - H.gather) / (SIGNATURE_AT - H.gather);
  pulse(t(f), VOICINGS.G6.upper[k % 4] + 12, 0.07 + 0.07 * up, ((k % 4) - 1.5) * 0.3);
  if (f % BEAT_FRAMES === 0) tick(t(f), 0.05 + 0.04 * up, 1);
  if (!voiced(f)) shaker(t(f), 0.012 + 0.02 * up);
}
riser(t(H.gather + 20), t(STRIKE - H.gather - 20), 0.1);
sub(t(H.gather), 43, 0.18, 2.5);
whoosh(t(H.point - 14), 0.6, 0.06, 0);

// ── the logo: a bright, calm I
impact(t(STRIKE), 0.22);
sub(t(STRIKE), 36, 0.28, 2.4);
bell(t(STRIKE + 6), 76, 0.09, 0.15, 3.4);
shimmer(t(STRIKE + 40), [79, 83, 86], 0.035);
const lastWord = SIGNATURE_AT + signatureWordAt(SIGNATURE.words.length - 1);
keys(t(lastWord + 20), 72, 0.06, -0.2, 3);
keys(t(lastWord + 28), 76, 0.05, 0.2, 3);

S.master({ fadeInSec: 0, fadeOutSec: 0.8 });
const dest = path.join(root, 'public', 'clips', 'pov', 'score.wav');
fs.mkdirSync(path.dirname(dest), { recursive: true });
S.writeWav(dest);
console.log(`wrote ${path.relative(root, dest)} (${TOTAL_SEC.toFixed(2)}s, ${TOTAL_FRAMES} frames)`);
