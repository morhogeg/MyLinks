/**
 * SAME SCREENSHOTS: the reel's gates (`node audio/shots-verify.mjs`), beside
 * the house gate (`node audio/house-verify.mjs shots`):
 *  - the brand bans (no em dash, no literal "AI", no "second brain", no
 *    "library", no price, no "free", no recipe or cooking) on every caption,
 *    every demo string, and every text on every captured frame the edit uses;
 *  - Find in your own words: the query shares no word with the card it lands;
 *  - every line spoken inside its caption window, and still on screen a
 *    moment after its last word; never two captions in the band at once;
 *  - the mix: every line 3dB or more over the music in the speech band;
 *    −14 LUFS ±0.5, true peak ≤ −1 dBTP.
 *
 * One deliberate difference from LATER NEVER COMES' gate: a line may leave
 * 0.15s after its last word (the house dwell rule says 0.3s; round 2's
 * lines leave 0.2s after). Six lines in a
 * 15–20s brief left no room for the full 0.3s at every boundary without
 * running to 21s; each caption is still on screen for its whole line plus
 * ~0.25s, and the next one takes over at once.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as T from '../clips/shots-timeline.mjs';
import { SHOTS } from '../capture/library.mjs';
import { lufs, powerDb, speechBand, truePeak } from './loudness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');
let failed = 0;
const fail = (m) => {
  failed++;
  console.log(`✗ ${m}`);
};
const ok = (m) => console.log(`✓ ${m}`);
const { FPS, CAPTIONS, HITS } = T;

// ── words ────────────────────────────────────────────────────────────────
const BANNED = [
  [/—/, 'an em dash'],
  [/\bAI\b/, 'a literal "AI"'],
  [/second brain/i, '"second brain"'],
  [/\blibrary\b/i, '"library"'],
  [/\$|\bfree\b/i, 'a price in dollars or "free"'],
  [/recipe|\bcook/i, 'recipe or cooking content'],
];
const demo = SHOTS.cards.flatMap((c) => [c.title, c.summary, ...c.tags]);
const strings = [...CAPTIONS.flatMap((c) => [c.text, c.say ?? c.text]), ...demo, SHOTS.search.query];
const hits = strings.flatMap((s) => BANNED.filter(([re]) => re.test(s)).map(([, what]) => `${what}: "${s}"`));
if (hits.length) hits.forEach(fail);
else ok(`brand bans: ${strings.length} strings clean (captions, the three cards, the query)`);

// every text on every captured frame the edit can show (the whole take: the
// feed, its scroll, and Find)
const take = JSON.parse(read('src/reels/clips/shots/takes.json'))['clips/shots/app'];
const frameHits = new Set();
take.frames.forEach((fr) => fr.t.forEach((k) => BANNED.forEach(([re, what]) => re.test(take.texts[k]) && frameHits.add(`${what} on a captured frame: "${take.texts[k]}"`))));
if (frameHits.size) [...frameHits].forEach(fail);
else ok(`captured frames: ${take.count} frames, ${take.texts.length} distinct texts, all clean`);

// ── Find, in your own words ──────────────────────────────────────────────
const words = (s) => s.toLowerCase().normalize('NFKD').replace(/\p{M}+/gu, '').match(/[a-z0-9]+/g) ?? [];
const FRAMING = new Set(['a', 'an', 'the', 'about', 'of', 'to', 'in', 'on', 'for', 'and', 'or', 'that', 'this']);
const card = SHOTS.cards.find((c) => c.id === SHOTS.search.hits[0]);
const shared = words(SHOTS.search.query).filter((w) => !FRAMING.has(w) && words([card.title, card.summary, ...card.tags].join(' ')).some((x) => x.startsWith(w) || w.startsWith(x)));
if (shared.length) fail(`"${SHOTS.search.query}" shares ${shared.join(', ')} with the card it finds (it must be in your own words)`);
else ok(`Find: "${SHOTS.search.query}" shares no word with "${card.title}"`);

// ── timing ───────────────────────────────────────────────────────────────
const manifest = JSON.parse(read('out/vo/shots/manifest.json'));
const vo = JSON.parse(read('src/reels/clips/shots/shots-vo.json'));
const DWELL = { min: 0.15, max: 1.2 };
for (const c of CAPTIONS) {
  const say = c.say ?? c.text.replace(/\n/g, ' ');
  const m = manifest.find((x) => x.frame === c.at);
  const t = vo.find((x) => x.frame === c.at);
  if (!m || !t) {
    fail(`"${say}" has no take at frame ${c.at}: run audio/synth-vo.py shots`);
    continue;
  }
  const end = c.at + m.spoken * FPS;
  const dwell = (c.to - end) / FPS;
  if (dwell < 0) fail(`"${say}" is still being said when its caption leaves (${(-dwell).toFixed(2)}s over)`);
  else if (dwell < DWELL.min || dwell > DWELL.max) fail(`"${say}" leaves ${dwell.toFixed(2)}s after its last word (${DWELL.min}–${DWELL.max}s)`);
  if (c.cues.length !== c.text.split('\n').length) fail(`"${say}": ${c.cues.length} cues for ${c.text.split('\n').length} rows`);
}
for (let i = 1; i < CAPTIONS.length; i++) {
  const [a, b] = [CAPTIONS[i - 1], CAPTIONS[i]];
  const firstRow = b.at + Math.round(vo.find((x) => x.frame === b.at)?.words[0] * FPS) - 3;
  if (firstRow <= a.to) fail(`two captions in the band at once: "${a.text}" until ${a.to}, "${b.text}" from ${firstRow}`);
}
const last = CAPTIONS.at(-1);
if (last.to > T.SIGNATURE_AT + 24) fail(`the last line runs into the Signature's voice`);
const spoken = manifest.reduce((s, m) => s + m.spoken, 0);
ok(`timing: ${CAPTIONS.length} lines in ${spoken.toFixed(1)}s of speech over ${T.TOTAL_SEC.toFixed(1)}s, every one inside its window; never two in the band`);
// a share lands in the icon on the spoken "Machina" (round 7: the second)
const name = CAPTIONS[3];
const nameAt = name.at + Math.round(vo.find((x) => x.frame === name.at).words.at(-1) * FPS);
const onName = [HITS.land1, HITS.land2, HITS.land3].map((l) => l - nameAt);
if (!onName.some((d) => Math.abs(d) <= 3)) fail(`no share lands on "Machina" (said at ${nameAt}; landings ${HITS.land1}, ${HITS.land2}, ${HITS.land3})`);
else ok(`a share lands in the icon on "Machina" (said at ${nameAt}; landings ${HITS.land1}, ${HITS.land2}, ${HITS.land3})`);

// each part of the card rings on its word (round 3): 2 frames ahead, ±3
const cardLine = CAPTIONS[4];
const cardVo = vo.find((x) => x.frame === cardLine.at);
const VERBS = ['analyzed,', 'categorized,', 'summarized', 'tagged.'];
const sayWords = (cardLine.say ?? cardLine.text.replace(/\n/g, ' ')).split(/\s+/);
const off = VERBS.map((w, k) => {
  const i = sayWords.indexOf(w);
  return HITS.parts[k] + 2 - (cardLine.at + Math.round(cardVo.words[i] * FPS));
});
if (off.some((d) => Math.abs(d) > 3)) fail(`the card's parts ring off their words by ${off.join(', ')} frames`);
else ok(`the card's four parts ring on "analyzed", "categorized", "summarized", "tagged" (within ${Math.max(...off.map(Math.abs))} frames)`);

// (round 6) the query types itself on "describe", and the close pulls back on "Now"
{
  const find = CAPTIONS[5];
  const fv = vo.find((x) => x.frame === find.at);
  const fw = (find.say ?? find.text.replace(/\n/g, ' ')).split(/\s+/);
  const describeAt = find.at + Math.round(fv.words[fw.indexOf('describe')] * FPS);
  const close = CAPTIONS[6];
  const nowAt = close.at + Math.round(vo.find((x) => x.frame === close.at).words[0] * FPS);
  const typingOff = HITS.typing - describeAt;
  const closeOff = HITS.close - nowAt;
  if (typingOff < -8 || typingOff > 2) fail(`the query starts typing ${typingOff} frames from "describe" (it should be just ahead of it)`);
  else if (Math.abs(closeOff) > 3) fail(`the close pulls back ${closeOff} frames from "Now"`);
  else ok(`the query types on "describe" (${typingOff} frames), the close pulls back on "Now" (${closeOff})`);
}

// ── every row inside Meta's side margins (round 5) ─────────────────────
// measured in the house face at the house sizes, the font EMBEDDED in the
// page: loaded by file:// it silently fell back to another face and measured
// a 1028px row as 893px (later-verify.mjs loads it that way too)
{
  const exe = ['/opt/pw-browsers/chromium-1243/chrome-linux64/chrome', '/opt/pw-browsers/chromium'].find((p) => fs.existsSync(p));
  if (!exe) console.log('! rows not measured (no browser here)');
  else {
    const { chromium } = await import('playwright-core');
    const b64 = fs.readFileSync(path.join(root, 'node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2')).toString('base64');
    const rows = CAPTIONS.flatMap((c) => c.text.split('\n').map((r) => ({ r, hook: c.place === 'hook', statement: !!c.statement })));
    const b = await chromium.launch({ executablePath: exe });
    const page = await b.newPage();
    await page.setContent(
      `<style>@font-face{font-family:G;src:url(data:font/woff2;base64,${b64}) format('woff2');font-weight:100 900}span{font-family:G;white-space:nowrap}</style>` +
        rows.map(({ r, hook, statement }, i) => `<div><span id=r${i} style="font-size:${hook ? 96 : 60}px;font-weight:${hook ? 720 : statement ? 760 : 650};letter-spacing:${hook ? '-0.042em' : '-0.028em'}">${r}</span></div>`).join(''),
    );
    await page.evaluate(() => document.fonts.ready);
    const loaded = await page.evaluate(() => document.fonts.check('650 60px G'));
    const widths = [];
    for (let i = 0; i < rows.length; i++) widths.push(await page.$eval(`#r${i}`, (e) => e.getBoundingClientRect().width));
    await b.close();
    const wide = rows.map((x, i) => [x.r, widths[i]]).filter(([, w]) => w > 950);
    if (!loaded) fail('the house face did not load: rows not measured');
    else if (wide.length) wide.forEach(([r, w]) => fail(`"${r}" is ${Math.round(w)}px wide (950 between Meta's side margins)`));
    else ok(`every row inside Meta's margins: the widest ${Math.round(Math.max(...widths))}px of 950`);
  }
}

// ── the mix ──────────────────────────────────────────────────────────────
const wav = (rel) => {
  const b = fs.readFileSync(path.join(root, rel));
  let off = 12;
  let fmt = null;
  let data = null;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const len = b.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(off + 10), sr: b.readUInt32LE(off + 12) };
    if (id === 'data') data = { off: off + 8, len };
    off += 8 + len + (len % 2);
  }
  const n = data.len / (fmt.ch * 2);
  const L = new Float64Array(n);
  const R = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    L[i] = b.readInt16LE(data.off + i * fmt.ch * 2) / 32768;
    R[i] = b.readInt16LE(data.off + i * fmt.ch * 2 + (fmt.ch > 1 ? 2 : 0)) / 32768;
  }
  return { SR: fmt.sr, n, L, R };
};
const score = wav('public/clips/shots/score.wav');
const mix = wav('public/clips/shots/score-vo.wav');
const gain = JSON.parse(read('out/vo/shots/mix.json')).gain;
const lines = manifest.map((line) => {
  const s0 = Math.round(line.start * mix.SR);
  const e = Math.min(mix.n, s0 + Math.round(line.spoken * mix.SR));
  const voice = new Float64Array(e - s0);
  const music = new Float64Array(e - s0);
  for (let i = s0; i < e; i++) {
    const m = (mix.L[i] + mix.R[i]) / 2 / gain;
    const bed = ((score.L[i] + score.R[i]) / 2) * 0.55;
    voice[i - s0] = m - bed;
    music[i - s0] = bed;
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

console.log(failed ? `\n${failed} gate(s) failed` : '\nall gates pass');
process.exit(failed ? 1 : 0);
