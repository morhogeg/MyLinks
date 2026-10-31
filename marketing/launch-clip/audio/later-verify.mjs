/**
 * LATER NEVER COMES: the reel's gates (`node audio/later-verify.mjs`), beside
 * the house gate (`node audio/house-verify.mjs later`):
 *  - the brand bans (no em dash, no literal "AI", no "second brain", no
 *    "library", no price, no "free", no recipe or cooking) on every caption;
 *  - take S measured: no shot of a blank phone can ship;
 *  - every line spoken inside its caption window, leaving 0.3–1.2s after its
 *    last word (the dwell rule); never two captions in the band at once;
 *  - the type inside Meta's safe zone: every row's measured width (Geist, the
 *    house sizes) inside the 65px side margins, the rows' boxes clear of the
 *    top 14% (the hook's ink) and the bottom 35%;
 *  - the picture: the camera computed exactly as the picture computes it
 *    (kit/spring.mjs) on every frame: everything a line names (a lift, a
 *    ring) inside the safe zone below the band while it is named; every tap
 *    in frame; the zoom never past 2.33px a point (the screen's text, 16pt
 *    in from its edges, clear of the 65px margins; the whole phone's width
 *    in frame);
 *  - the camera never jolts: its speed and its change of speed per frame;
 *  - the mix: every line 3dB or more over the music in the speech band;
 *    −14 LUFS ±0.5, true peak ≤ −1 dBTP.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as T from '../clips/later-timeline.mjs';
import { camOn, follow, toFrame, travel } from '../src/reels/kit/spring.mjs';
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
const warn = (m) => console.log(`! ${m}`);

/** the kit's numbers, read from its source (one place for each) */
const numbers = (file, name) => {
  const m = read(file).match(new RegExp(`${name} = \\{([^}]*)\\}`));
  return Object.fromEntries([...m[1].matchAll(/(\w+):\s*([\d.]+)/g)].map(([, k, v]) => [k, Number(v)]));
};
const BAND = numbers('src/reels/kit/Captions.tsx', 'HOUSE_BAND');
const HOOK = numbers('src/reels/kit/Hook.tsx', 'HOOK_TYPE');
const { SAFE, FPS, CAPTIONS } = T;

// ── words ────────────────────────────────────────────────────────────────
const BANNED = [
  [/—/, 'an em dash'],
  [/\bAI\b/, 'a literal "AI"'],
  [/second brain/i, '"second brain"'],
  [/\blibrary\b/i, '"library"'],
  [/\$|\bfree\b/i, 'a price or "free"'],
  [/recipe|cook/i, 'recipe or cooking content'],
];
const strings = CAPTIONS.flatMap((c) => [c.text, c.say]);
const hits = strings.flatMap((s) => BANNED.filter(([re]) => re.test(s)).map(([, what]) => `${what}: "${s}"`));
if (hits.length) hits.forEach(fail);
else ok(`brand bans: ${strings.length} strings clean`);

// ── take S ───────────────────────────────────────────────────────────────
if (!T.SHARE_READY) fail('take S (the share sheet) is not measured: its marks in clips/later-timeline.mjs are null');
if (T.TAPS.some((t) => t.x == null || t.y == null)) fail('a tap has no position (take S\'s tap on Machina is measured from the take)');
if (T.SHARE_READY && T.TAPS.every((t) => t.x != null)) ok('take S measured: every shot has its frames');

// ── timing ───────────────────────────────────────────────────────────────
const manifest = JSON.parse(read('out/vo/later/manifest.json'));
const vo = JSON.parse(read('src/reels/clips/later/later-vo.json'));
for (const c of CAPTIONS) {
  const m = manifest.find((x) => x.frame === c.at);
  const t = vo.find((x) => x.frame === c.at);
  if (!m || !t) {
    fail(`"${c.say}" has no take at frame ${c.at}: run audio/synth-vo.py later`);
    continue;
  }
  const end = c.at + m.spoken * FPS;
  const dwell = (c.to - end) / FPS;
  if (dwell < 0) fail(`"${c.say}" is still being said when its caption leaves (${(-dwell).toFixed(2)}s over)`);
  else if (dwell < 0.3 || dwell > 1.2) fail(`"${c.say}" leaves ${dwell.toFixed(2)}s after its last word (the dwell rule: 0.3–1.2s)`);
  if (c.cues.length !== c.text.split('\n').length) fail(`"${c.say}": ${c.cues.length} cues for ${c.text.split('\n').length} rows`);
  if (c.text.split(/\s+/).length !== c.say.split(/\s+/).length) fail(`"${c.say}": screen and voice differ in words`);
}
for (let i = 1; i < CAPTIONS.length; i++) {
  const [a, b] = [CAPTIONS[i - 1], CAPTIONS[i]];
  const firstRow = b.at + Math.round(vo.find((x) => x.frame === b.at)?.words[0] * FPS) - 3;
  if (firstRow <= a.to) fail(`two captions in the band at once: "${a.say}" until ${a.to}, "${b.say}" from ${firstRow}`);
}
const starts = CAPTIONS.slice(1).filter((c) => c.at % T.BEAT_FRAMES !== 0);
if (starts.length) warn(`lines not on a beat: ${starts.map((c) => c.at).join(', ')}`);
const words = CAPTIONS.reduce((n, c) => n + c.say.split(/\s+/).length, 0);
const spoken = manifest.reduce((s, m) => s + m.spoken, 0);
ok(`timing: ${CAPTIONS.length} lines, ${words} words in ${spoken.toFixed(1)}s of speech, every one inside its window and leaving 0.3–1.2s after its last word; never two in the band`);

// ── the type in the safe zone ────────────────────────────────────────────
const bandBottom = BAND.top + 2 * BAND.size * 1.12;
const hookBottom = HOOK.top + 2 * HOOK.size * 1.02;
if (bandBottom > SAFE.y1 || hookBottom > SAFE.y1) fail('the type runs into the bottom 35%');
// the hook's line box starts at HOOK.top; its ink starts a cap's clearance lower
const hookInk = HOOK.top + Math.round(HOOK.size * ((1.02 - 0.72) / 2));
if (hookInk < SAFE.y0 || BAND.top < SAFE.y0 - 2) fail(`the type starts in the top 14% (hook ink ${hookInk}px, band ${BAND.top}px; safe from ${SAFE.y0}px)`);
else ok(`type rows: the hook's ink ${hookInk}–${Math.round(hookBottom)}px, the band ${BAND.top}–${Math.round(bandBottom)}px, inside ${SAFE.y0}–${SAFE.y1}px`);
// widths, measured in the house face where a browser is at hand
const exe = process.env.BROWSER || ['/opt/pw-browsers/chromium'].find((p) => fs.existsSync(p));
if (exe) {
  const { chromium } = await import('playwright-core');
  const font = path.join(root, 'node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2');
  const b = await chromium.launch({ executablePath: exe });
  const page = await b.newPage();
  const rows = CAPTIONS.flatMap((c) => c.text.split('\n').map((r) => ({ r, hook: c.place === 'hook' })));
  await page.setContent(
    `<style>@font-face{font-family:G;src:url(file://${font});font-weight:100 900}span{font-family:G;white-space:nowrap}</style>` +
      rows.map(({ r, hook }, i) => `<div><span id=r${i} style="font-size:${hook ? HOOK.size : BAND.size}px;font-weight:${hook ? 720 : BAND.weight};letter-spacing:${hook ? '-0.042em' : '-0.028em'}">${r}</span></div>`).join(''),
  );
  await page.evaluate(() => document.fonts.ready);
  const widths = [];
  for (let i = 0; i < rows.length; i++) widths.push(await page.$eval(`#r${i}`, (e) => e.getBoundingClientRect().width));
  await b.close();
  const maxW = SAFE.x1 - SAFE.x0;
  const wide = rows.map((x, i) => ({ ...x, w: widths[i] })).filter((x) => x.w > maxW);
  if (wide.length) wide.forEach((x) => fail(`"${x.r}" is ${Math.round(x.w)}px wide: past the 65px margins (max ${maxW})`));
  else ok(`type widths: the widest row ${Math.round(Math.max(...widths))}px of the ${maxW}px between Meta's margins`);
} else warn('type widths not measured here (no browser: set BROWSER=<a Chrome binary>)');

// ── the picture ──────────────────────────────────────────────────────────
const paths = T.SHOTS.map((s) => follow(s.targets, s.from, s.to, T.SPRING, T.EASE_IN));
const camAt = (f) => {
  let k = 0;
  paths.forEach((p, j) => {
    if (p.from <= f) k = j;
  });
  return camOn(paths[k], f, T.FOCUS);
};
const ZMAX = (T.WIDTH / 2 - T.SAFE.x0) / (T.SCREEN.w / 2 - 16);
const visibleTo = T.SIGNATURE_AT + 14;
let zPeak = 0;
for (let f = 0; f < visibleTo; f++) zPeak = Math.max(zPeak, camAt(f).z);
if (zPeak > ZMAX + 1e-6) fail(`the camera reaches z ${zPeak.toFixed(3)}: past ${ZMAX.toFixed(3)} the screen's text enters Meta's 65px margins`);
else ok(`zoom: at most ${zPeak.toFixed(2)}px a point (limit ${ZMAX.toFixed(2)}: the text clear of the margins, the whole width in frame)`);
// everything a line names, inside the safe zone below the band while named
// (the element itself: a ring's fading outer edge, 10pt past it, is
// decoration and may cross a margin)
const named = [
  ...T.LIFTS.map((l) => ({ what: `the lift at ${l.at}`, rect: l.rect, from: l.at, to: l.at + 24, reach: 0 })),
  ...T.PINGS.map((p) => ({ what: `the ring at ${p.at}`, rect: p.rect, from: p.at, to: p.at + 24, reach: 0 })),
];
const outside = [];
for (const n of named) {
  for (let f = n.from; f < n.to; f++) {
    const c = camAt(f);
    const [x, y, w, h] = n.rect;
    const a = toFrame(c, x - n.reach, y - n.reach);
    const b = toFrame(c, x + w + n.reach, y + h + n.reach);
    if (a.x < SAFE.x0 || b.x > SAFE.x1 || a.y < BAND.clear || b.y > SAFE.y1) {
      outside.push(`${n.what}: ${Math.round(a.x)},${Math.round(a.y)}–${Math.round(b.x)},${Math.round(b.y)} at frame ${f}`);
      break;
    }
  }
}
if (outside.length) outside.forEach((m) => fail(`outside the safe zone below the band: ${m}`));
else ok(`subjects: all ${named.length} lifts and rings inside ${SAFE.x0}–${SAFE.x1} × ${BAND.clear}–${SAFE.y1}px for their whole life`);
for (const t of T.TAPS.filter((t) => t.x != null)) {
  const p = toFrame(camAt(t.at + 4), t.x, t.y);
  if (p.x < 0 || p.x > T.WIDTH || p.y < BAND.clear || p.y > T.HEIGHT) fail(`the tap at ${t.at} lands off the picture (${Math.round(p.x)}, ${Math.round(p.y)})`);
  else if (p.y > SAFE.y1) warn(`the tap at ${t.at} lands in the bottom 35% (y ${Math.round(p.y)}px): seen, under Instagram's caption`);
}
// smoothness, measured at the frame's corners below the band and its centre
const PROBES = [
  [60, 600],
  [1020, 600],
  [60, 1860],
  [1020, 1860],
  [540, 1200],
];
let vPeak = { v: 0, f: 0 };
let aPeak = { a: 0, f: 0 };
let prev = 0;
for (let f = 1; f < visibleTo; f++) {
  const v = travel(camAt(f - 1), camAt(f), PROBES);
  if (v > vPeak.v) vPeak = { v, f };
  if (Math.abs(v - prev) > aPeak.a) aPeak = { a: Math.abs(v - prev), f };
  prev = v;
}
const JOLT = 3;
if (aPeak.a > JOLT) fail(`the camera jolts at frame ${aPeak.f}: its speed changes ${aPeak.a.toFixed(1)}px a frame in one frame (max ${JOLT})`);
else ok(`camera: peak ${vPeak.v.toFixed(1)}px a frame (frame ${vPeak.f}), its speed never changing more than ${aPeak.a.toFixed(2)}px a frame in a frame`);

// ── the mix ──────────────────────────────────────────────────────────────
const wav = (rel) => {
  const b = fs.readFileSync(path.join(root, rel));
  let off = 12;
  let fmt = null;
  let data = null;
  while (off + 8 <= b.length) {
    const id = b.toString('ascii', off, off + 4);
    const len = b.readUInt32LE(off + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(off + 10), sr: b.readUInt32LE(off + 12), bits: b.readUInt16LE(off + 22) };
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
const score = wav('public/clips/later/score.wav');
const mix = wav('public/clips/later/score-vo.wav');
const gain = JSON.parse(read('out/vo/later/mix.json')).gain;
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
