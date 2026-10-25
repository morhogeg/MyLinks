/**
 * TICK IT OFF: the gates (`node audio/revisit-verify.mjs`), the reel's own
 * subset of `npm run verify`:
 *  - the brand bans (no em dash, no literal "AI", no "second brain", no
 *    "library") on every caption, every save added for this reel, the
 *    synthesis, every "Do this" line, the ink list and every text on every
 *    captured frame; nothing naming a plan, a price or the App Store;
 *  - the ink list is the account's: every item a save in REVISIT's account,
 *    its title word for word; no cooking;
 *  - the video is what YouTube and Machina say it is: title and channel
 *    (oEmbed), 11:45 (the channel's upload list), and its "Do this" line is
 *    Machina's own analysis, verbatim (capture/video-facts/-Feev1ZK6L4.json);
 *  - every narrator line finished inside its caption window, no two band
 *    captions up at once, the script under ~75 words;
 *  - the type inside the feeds' safe area (clear of the top 250px and the
 *    bottom 340px);
 *  - every line at least 3dB over the music in the speech band;
 *  - the mix at the feeds' −14 LUFS (±0.5), true peak ≤ −1 dBTP;
 *  - the loop: the step across the audio seam no bigger than the score's own.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CAPTIONS, FPS, HEIGHT } from '../clips/revisit-timeline.mjs';
import { BAND, ITEMS } from '../clips/revisit-list.mjs';
import { CARDS, REVISIT } from '../capture/library.mjs';
import { lufs, powerDb, speechBand, truePeak } from './loudness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const VO_DIR = path.join(root, 'out', 'vo', 'revisit');
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
const SYN = REVISIT.synthesis;
const strings = [
  ...CAPTIONS.map((c) => ['caption', c.text]),
  ...REVISIT.extra.flatMap((c) => [
    [`${c.id} title`, c.title],
    [`${c.id} summary`, c.summary],
    [`${c.id} source`, c.sourceName ?? ''],
    ...c.tags.map((t) => [`${c.id} tag`, t]),
  ]),
  ['synthesis title', SYN.title],
  ['synthesis narrative', SYN.narrative],
  ...SYN.themes.flatMap((t) => [['theme', t.title], ['theme insight', t.insight]]),
  ['standout', SYN.standoutReason],
  ['question', SYN.openQuestion],
  ...Object.values(REVISIT.takeaways).map((t) => ['Do this', t]),
  ...ITEMS.flatMap((it) => [['ink list', `${it.verb} ${it.title}`], ['ink list meta', it.meta]]),
];
const takes = JSON.parse(fs.readFileSync(path.join(root, 'src', 'reels', 'clips', 'revisit', 'takes.json'), 'utf8'));
for (const [name, take] of Object.entries(takes)) for (const t of take.texts) strings.push([`${name} frame text`, t]);
const hits = strings.flatMap(([where, s]) => BANNED.filter(([re]) => re.test(s)).map(([, what]) => `${what} in ${where}: "${s}"`));
if (hits.length) hits.forEach(fail);
else ok(`brand bans: ${strings.length} strings clean (captions, the added saves, the synthesis, the "Do this" lines, the ink list, every captured frame)`);
// the reel names no plan and claims nothing is free or on the App Store
const claims = CAPTIONS.filter((c) => /\b(free|pro|premium|trial|plan|price|app store|download)\b/i.test(c.text));
(claims.length ? fail : ok)(`no plan, price or store claims in the script${claims.length ? `: ${claims.map((c) => c.text).join(' / ')}` : ''}`);

// ── the ink list is the account's saves, word for word
const account = [...CARDS.filter((c) => !REVISIT.without.includes(c.id)), ...REVISIT.extra];
const wrong = ITEMS.filter((it) => {
  const c = account.find((x) => x.id === it.id);
  return !c || c.title !== it.title;
});
(wrong.length ? fail : ok)(`ink list: ${ITEMS.length} items, every one a save in the account, titled as saved${wrong.length ? `: ${wrong.map((w) => w.id).join(', ')}` : ''}`);
const cooking = ITEMS.filter((it) => /recipe|cook/i.test(account.find((x) => x.id === it.id)?.category ?? ''));
(cooking.length ? fail : ok)(`no cooking in the list${cooking.length ? `: ${cooking.map((c) => c.id).join(', ')}` : ''}`);
const acts = ITEMS.filter((it) => it.act !== undefined).sort((a, b) => a.act - b.act).map((it) => it.id);
const order = Object.keys(REVISIT.takeaways);
(JSON.stringify(acts) === JSON.stringify(order) ? ok : fail)(`the five picked saves are the five "Do this" lines, in Revisit's order (${order.join(', ')})`);

// ── the video
{
  const facts = JSON.parse(fs.readFileSync(path.join(root, 'capture', 'video-facts', '-Feev1ZK6L4.json'), 'utf8'));
  const channel = JSON.parse(fs.readFileSync(path.join(root, 'capture', 'video-facts', 'channel-iammarkmanson.json'), 'utf8'));
  const v = REVISIT.extra.find((c) => c.id === REVISIT.video);
  const listed = channel.videos.find((x) => x.id === '-Feev1ZK6L4');
  const item = ITEMS.find((it) => it.id === REVISIT.video);
  const mmss = `${Math.floor(listed.seconds / 60)}:${String(listed.seconds % 60).padStart(2, '0')}`;
  const checks = [
    [v.title === facts.oembed.title, `title is YouTube's ("${facts.oembed.title}")`],
    [v.youtubeChannel === facts.oembed.author_name, `channel is YouTube's (${facts.oembed.author_name})`],
    [item.meta.endsWith(mmss), `length on the list is the channel's (${mmss})`],
    [REVISIT.takeaways[REVISIT.video] === facts.analysis.actionableTakeaway, 'its "Do this" is Machina\'s analysis, verbatim'],
    [JSON.stringify(v.highlights) === JSON.stringify(facts.analysis.videoHighlights), 'its key moments are the analysis\''],
    [!!facts.clips && Object.keys(facts.clips).length >= 1, `transcribed spans on file (${Object.keys(facts.clips ?? {}).join(', ')})`],
  ];
  for (const [good, what] of checks) (good ? ok : fail)(`the video: ${what}`);
}

// ── timing
const manifest = JSON.parse(fs.readFileSync(path.join(VO_DIR, 'manifest.json'), 'utf8'));
for (const c of CAPTIONS) {
  const m = manifest.find((x) => x.frame === c.at);
  if (!m) fail(`no voice for "${c.text}"`);
  else if (m.spoken > (c.to - c.at) / FPS) fail(`"${c.text}" runs ${m.spoken}s over its ${((c.to - c.at) / FPS).toFixed(2)}s window`);
}
const band = CAPTIONS.filter((c) => c.place !== 'scene');
for (let i = 1; i < band.length; i++) if (band[i].at < band[i - 1].to) fail(`captions overlap: "${band[i - 1].text}" / "${band[i].text}"`);
ok(`timing: ${CAPTIONS.length} lines inside their windows, none overlapping`);
const totalWords = CAPTIONS.reduce((n, c) => n + c.text.split(/\s+/).length, 0);
(totalWords <= 75 ? ok : fail)(`script: ${totalWords} words (the brief: under about 75)`);

// ── the safe area: the hook (top 262, two lines of 118px), the band lines
// (BAND.top, round 7: 258; up to three lines of 68px) and the lockup's lowest row
const SAFE = { top: 250, bottom: HEIGHT - 340 };
const most = Math.max(...band.map((c) => c.text.split('\n').length));
const boxes = [
  ['the hook', 262, 262 + 2 * 118 * 1.02],
  ['a line', BAND.top, BAND.top + most * 68 * 1.12],
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
const score = wav('public/clips/revisit/score.wav');
const mix = wav('public/clips/revisit/score-vo.wav');
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
