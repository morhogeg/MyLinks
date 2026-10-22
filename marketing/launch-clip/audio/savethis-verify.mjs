/**
 * SAVE THIS: the gates (`node audio/savethis-verify.mjs`), the reel's own
 * subset of `npm run verify`:
 *  - the brand bans (no em dash, no literal "AI", no "second brain", no
 *    "library") on every caption, the demo card, the query, and every text
 *    on every captured frame the edit shows;
 *  - every narrator line finished inside its caption window, and no two
 *    band captions on screen at once;
 *  - every line at least 3dB over the music in the speech band;
 *  - the mix at the feeds' −14 LUFS (±0.5), true peak ≤ −1 dBTP;
 *  - the last line still up on the last frame (the loop cuts from it);
 *  - the loop: the step across the seam no bigger than the score's own.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPTIONS, FPS, HITS, KICKERS, TOTAL_FRAMES } from '../clips/savethis-timeline.mjs';
import { SAVETHIS } from '../capture/library.mjs';
import { lufs, powerDb, speechBand, truePeak } from './loudness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
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
  ...CAPTIONS.map((c) => ['caption', c.text]),
  ...KICKERS.map((k) => ['kicker', k.text]),
  ['card title', SAVETHIS.title],
  ['card summary', SAVETHIS.summary],
  ['query', SAVETHIS.query],
  ...SAVETHIS.tags.map((t) => ['tag', t]),
];
const takes = JSON.parse(fs.readFileSync(path.join(root, 'src', 'reels', 'clips', 'savethis', 'takes.json'), 'utf8'));
for (const [name, take] of Object.entries(takes)) for (const t of take.texts) strings.push([`${name} frame text`, t]);
const hits = strings.flatMap(([where, s]) => BANNED.filter(([re]) => re.test(s)).map(([, what]) => `${what} in ${where}: "${s}"`));
if (hits.length) hits.forEach(fail);
else ok(`brand bans: ${strings.length} strings clean (captions, card, query, every captured frame)`);

// ── timing
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'out', 'vo', 'savethis', 'manifest.json'), 'utf8'));
for (const c of CAPTIONS) {
  const m = manifest.find((x) => x.frame === c.at);
  if (!m) fail(`no voice for "${c.text}"`);
  else if (m.spoken > (c.to - c.at) / FPS) fail(`"${c.text}" runs ${m.spoken}s over its ${((c.to - c.at) / FPS).toFixed(2)}s window`);
}
const band = CAPTIONS.filter((c) => c.place !== 'scene' && c.place !== 'lockup');
for (let i = 1; i < band.length; i++) if (band[i].at < band[i - 1].to) fail(`captions overlap: "${band[i - 1].text}" / "${band[i].text}"`);
// (owner, round 13) the last frame is the logo under the last line: it is
// still fully up there (a line rolls out over the 5 frames before its `to`)
if (CAPTIONS.at(-1).to - 5 < TOTAL_FRAMES) fail('the last line leaves before the last frame');
ok(`timing: ${CAPTIONS.length} lines inside their windows; the last one up on the last frame`);
const totalWords = CAPTIONS.reduce((n, c) => n + c.text.split(/\s+/).length, 0);
// the brief's "under about 75"; (owner, rounds 5 to 8, round 10's bridge
// into Ask, and round 15's "a million saves you never opened") the ceiling
// is 81
(totalWords <= 81 ? ok : fail)(`script: ${totalWords} words (about 75: at most 81)`);

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
const score = wav('public/clips/savethis/score.wav');
const mix = wav('public/clips/savethis/score-vo.wav');
const gain = JSON.parse(fs.readFileSync(path.join(root, 'out', 'vo', 'savethis', 'mix.json'), 'utf8')).gain;
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

// ── the loop: the score's last sample runs into its first like any other
// pair of neighbours (it is the second of two back-to-back renders, so its
// end IS what precedes its start); the jump across the seam must sit inside
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
void HITS;

console.log(failed ? '\nFAILED' : '\nOK');
process.exit(failed ? 1 : 0);
