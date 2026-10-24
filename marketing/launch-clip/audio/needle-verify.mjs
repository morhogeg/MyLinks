/**
 * FIND THE BOOK: the gates (`node audio/needle-verify.mjs`), the reel's own
 * subset of `npm run verify`:
 *  - the brand bans (no em dash, no literal "AI", no "second brain", no
 *    "library") on every caption, the question and its answer, every save
 *    added for this reel, every card the field shows and every text on every
 *    captured frame;
 *  - every narrator line finished inside its caption window, no two band
 *    captions up at once, the script under ~75 words;
 *  - the type inside the feeds' safe area (clear of the top 250px and the
 *    bottom 340px);
 *  - every line at least 3dB over the music in the speech band;
 *  - the mix at the feeds' −14 LUFS (±0.5), true peak ≤ −1 dBTP;
 *  - the loop: the P.S. still up on the last frame, and the step across the
 *    audio seam no bigger than the score's own.
 *
 * `node audio/needle-verify.mjs video` gates the video needle (round 3).
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FPS, HEIGHT, NEEDLES, TOTAL_FRAMES } from '../clips/needle-timeline.mjs';
import { NEEDLE as BOOK, NEEDLE_VIDEO } from '../capture/library.mjs';
import { lufs, powerDb, speechBand, truePeak } from './loudness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const VIDEO = process.argv[2] === 'video';
const { captions: CAPTIONS } = NEEDLES[VIDEO ? 'video' : 'book'];
const NEEDLE = VIDEO ? NEEDLE_VIDEO : BOOK;
const VO_DIR = path.join(root, 'out', 'vo', VIDEO ? 'needle-video' : 'needle');
let failed = false;
const fail = (m) => {
  console.error(`✗ ${m}`);
  failed = true;
};
const ok = (m) => console.log(`✓ ${m}`);

// ── words
const BANNED = [
  [/—/, 'an em dash'],
  [/\bAI\b/, 'the literal "AI"'],
  [/second brain/i, '"second brain"'],
  [/\blibrar(y|ies)\b/i, '"library"'],
];
const strings = [
  ...CAPTIONS.flatMap((c) => [['caption', c.text], ...(c.say ? [['narration', c.say]] : [])]),
  ['question', NEEDLE.ask.question],
  ['answer', NEEDLE.ask.answer],
  ...NEEDLE.extra.flatMap((c) => [
    [`${c.id} title`, c.title],
    [`${c.id} summary`, c.summary],
    [`${c.id} source`, c.sourceName ?? ''],
    ...c.tags.map((t) => [`${c.id} tag`, t]),
  ]),
];
const cards = JSON.parse(fs.readFileSync(path.join(root, 'src', 'reels', 'clips', 'needle', VIDEO ? 'cards-video.json' : 'cards.json'), 'utf8'));
for (const c of cards.cards) strings.push([`field card`, c.title]);
const takes = JSON.parse(fs.readFileSync(path.join(root, 'src', 'reels', 'clips', 'needle', 'takes.json'), 'utf8'));
for (const [name, take] of Object.entries(takes)) for (const t of take.texts) strings.push([`${name} frame text`, t]);
const hits = strings.flatMap(([where, s]) => BANNED.filter(([re]) => re.test(s)).map(([, what]) => `${what} in ${where}: "${s}"`));
if (hits.length) hits.forEach(fail);
else ok(`brand bans: ${strings.length} strings clean (captions, the question and answer, the added saves, the field, every captured frame)`);
// no recipes or cooking in this reel (owner, 2026-10-02)
const cooking = cards.cards.filter((c) => /recipe|cook/i.test(c.category));
(cooking.length ? fail : ok)(`no cooking in the field${cooking.length ? `: ${cooking.map((c) => c.id).join(', ')}` : ''}`);

// ── timing
const manifest = JSON.parse(fs.readFileSync(path.join(VO_DIR, 'manifest.json'), 'utf8'));
for (const c of CAPTIONS) {
  const m = manifest.find((x) => x.frame === c.at);
  if (!m) fail(`no voice for "${c.text}"`);
  else if (m.spoken > (c.to - c.at) / FPS) fail(`"${c.text}" runs ${m.spoken}s over its ${((c.to - c.at) / FPS).toFixed(2)}s window`);
}
const band = CAPTIONS.filter((c) => c.place !== 'scene');
for (let i = 1; i < band.length; i++) if (band[i].at < band[i - 1].to) fail(`captions overlap: "${band[i - 1].text}" / "${band[i].text}"`);
if (CAPTIONS.at(-1).to - 5 < TOTAL_FRAMES) fail('the P.S. leaves before the last frame');
ok(`timing: ${CAPTIONS.length} lines inside their windows, none overlapping; the P.S. up on the last frame`);
const totalWords = CAPTIONS.reduce((n, c) => n + (c.say ?? c.text).split(/\s+/).length, 0);
(totalWords <= 75 ? ok : fail)(`script: ${totalWords} words (the brief: under about 75)`);

// ── the safe area: the dare (Needle.tsx `DARE`: top 262, the kicker and
// three lines of 96px) and the band lines (`BAND`: top
// 268, two lines of 60px) stay clear of the top 250px; the lockup's lowest
// row (812 + 261 + 55) clears the bottom 340px
const SAFE = { top: 250, bottom: HEIGHT - 340 };
const boxes = [
  ['the dare', 262, 262 + 42 * 1.1 + 14 + 3 * 96 * 1.02],
  ['a line', 268, 268 + 2 * 60 * 1.12],
  ['the lockup', 812 - 108, 812 + 261 + 55],
];
for (const [what, a, b] of boxes) if (a < SAFE.top || b > SAFE.bottom) fail(`${what} (${a}–${Math.round(b)}px) leaves the safe area`);
ok(`safe area: every line of type between ${SAFE.top}px and ${SAFE.bottom}px`);

// ── the mix
const wav = (rel) => {
  const b = fs.readFileSync(path.join(root, rel));
  const n = (b.length - 44) / 4;
  const L = new Float64Array(n);
  const R = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    L[i] = b.readInt16LE(44 + i * 4) / 32768;
    R[i] = b.readInt16LE(46 + i * 4) / 32768;
  }
  return { SR: b.readUInt32LE(24), n, L, R };
};
const score = wav(VIDEO ? 'public/clips/needle/score-video.wav' : 'public/clips/needle/score.wav');
const mix = wav(VIDEO ? 'public/clips/needle/score-video-vo.wav' : 'public/clips/needle/score-vo.wav');
const gain = JSON.parse(fs.readFileSync(path.join(VO_DIR, 'mix.json'), 'utf8')).gain;
const lines = manifest.map((line) => {
  const duck = CAPTIONS.find((c) => c.at === line.frame)?.duck ?? 0.55;
  const s0 = Math.round(line.start * mix.SR);
  const e = Math.min(mix.n, s0 + Math.round(line.spoken * mix.SR));
  const voice = new Float64Array(e - s0);
  const music = new Float64Array(e - s0);
  for (let i = s0; i < e; i++) {
    const m = (mix.L[i] + mix.R[i]) / 2 / gain;
    const b = ((score.L[i] + score.R[i]) / 2) * duck;
    voice[i - s0] = m - b;
    music[i - s0] = b;
  }
  return { text: line.text, db: powerDb(speechBand(voice, mix.SR)) - powerDb(speechBand(music, mix.SR)) };
});
for (const l of lines) console.log(`  ${l.db.toFixed(1).padStart(5)}dB  ${l.text}`);
const masked = lines.filter((l) => l.db < 3);
if (masked.length) masked.forEach((l) => fail(`the music masks "${l.text}" (${l.db.toFixed(1)}dB, min 3)`));
else ok('every line sits 3dB or more over the music in the speech band');
const I = lufs(mix.L, mix.R, mix.SR);
const tp = truePeak(mix.L, mix.R);
(Math.abs(I + 14) <= 0.5 && tp <= -1 ? ok : fail)(`mix: ${I.toFixed(2)} LUFS integrated, ${tp.toFixed(2)} dBTP (spec −14 ±0.5, ≤ −1)`);

// ── the loop: the score is the second of two back-to-back renders, so its
// end IS what precedes its start; the jump across the seam must sit inside
// the file's own sample-to-sample range
{
  const mono = (i) => (score.L[i] + score.R[i]) / 2;
  const steps = [];
  for (let i = 1; i < score.n; i++) steps.push(Math.abs(mono(i) - mono(i - 1)));
  steps.sort((a, b) => a - b);
  const p999 = steps[Math.floor(steps.length * 0.999)];
  const seam = Math.abs(mono(0) - mono(score.n - 1));
  (seam <= p999 ? ok : fail)(`loop: the step across the seam is ${seam.toFixed(4)} (the score's own 99.9th-percentile step is ${p999.toFixed(4)})`);
}

console.log(failed ? '\nFAILED' : '\nOK');
process.exit(failed ? 1 : 0);
