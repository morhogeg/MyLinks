/**
 * `npm run verify`, Meta ad 3's section ("The screenshot that becomes a
 * to-do"; hooked into audio/verify.mjs; exports `ok`). The REVISIT clip's
 * gates on the ad's own files (clips/ad-todo-timeline.mjs,
 * src/reels/ads/todo/, the `adTodo` take, public/ads/todo/, out/vo/adtodo/),
 * plus the Meta spec:
 *
 *  - captions never overlap; lines start on beats or 8ths; the narrator speaks
 *    every caption verbatim and fits it; THE DWELL RULE (0.3–1.2s after the
 *    voice, ≤4s with `until`); at most 8 words on screen at once (the hook,
 *    the owner's 10-word line, is the one exception, ≤10);
 *  - THE FIRST SECOND: the hook is the first caption, on screen whole from
 *    frame 0, its voice heard by 0.5s; the mark has formed by ~3.5s;
 *  - the close: the film's endcard line (the tagline), exactly, once, at the
 *    end, its last word landed at least 1.6s before the last frame;
 *  - length ≤ 30s;
 *  - bans, on every caption, the voice, and every frame of the take: em dash,
 *    literal "AI", "second brain", "library"; in the captions and voice also
 *    "share sheet", "bookmarks", "free", a price, "App Store", "available";
 *    on the app's frames: no recipe card (owner, 2026-10-02), no Pro surface
 *    (the Daily Brew, the weekly recap), no plan name;
 *  - the grid: taps, lifts and the strike on 8ths;
 *  - the sound, for BOTH mixes (with and without the narrator): no clipping,
 *    no hole in the per-bar level; the narrator 3dB+ over the music in the
 *    speech band on every line; −14 LUFS ±0.5, true peak ≤ −1 dBTP.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lufs, powerDb, speechBand, truePeak } from '../loudness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const P = (p) => path.join(root, p);
const read = (p) => fs.readFileSync(P(p), 'utf8');

const C = await import('../../clips/ad-todo-timeline.mjs');
console.log('\n── Meta ad: todo');
const bad = [];
const BANNED = [
  [/\u2014/, 'em dash'],
  [/\bAI\b/, 'literal "AI"'],
  [/second brain/i, '"second brain"'],
  [/librar(y|ies)/i, '"library"'],
];
// what the ad itself says (captions + voice): Meta hygiene and the listing
// not being live
const SAID = [
  [/share sheet/i, '"share sheet"'],
  [/bookmarks?/i, '"bookmarks"'],
  [/\bfree\b/i, '"free"'],
  [/[$€£]\s*\d|\d+\s*(usd|dollars?)/i, 'a price'],
  [/app store/i, '"App Store"'],
  [/\bavailable\b/i, '"available"'],
  [/\bpro\b/i, 'a plan name'],
];
// what must never be legible on the app's frames in this ad
const SHOWN = [
  [/Marcella|buttermilk|V60|tomato sauce|recipe|Cook this week/i, 'a recipe card (owner, 2026-10-02)'],
  [/Daily Brew|This week in Machina|Review \d+ cards/i, 'a Pro surface'],
  [/Machina Pro|\bPro\b|trial/, 'a plan'],
];
const scan = (where, text, extra = []) => {
  for (const [re, what] of [...BANNED, ...extra]) if (re.test(text)) bad.push(`${what} in ${where}: ${JSON.stringify(text).slice(0, 110)}`);
};

// ── captions, the narrator
const caps = [...C.CAPTIONS].sort((a, b) => a.at - b.at);
const words = (t) => t.split(/\s+/).filter(Boolean).length;
caps.forEach((c, i) => {
  scan(`caption ${i + 1}`, c.text, SAID);
  if (c.to <= c.at) bad.push(`caption "${c.text}" ends before it starts`);
  if (i && c.at < caps[i - 1].to) bad.push(`caption overlap: "${c.text}" starts at ${c.at}, "${caps[i - 1].text}" runs to ${caps[i - 1].to}`);
  if (c.to > C.TOTAL_FRAMES) bad.push(`caption "${c.text}" runs past the ad (${c.to} > ${C.TOTAL_FRAMES})`);
  if (c.at % (C.BEAT_FRAMES / 2)) bad.push(`line "${c.text}" starts at ${c.at}, not on an 8th`);
  const max = c.hook ? 10 : c.place === 'lockup' ? 6 : 8;
  const n = c.place === 'lockup' ? words(c.text.split('\n').slice(-1)[0]) : words(c.text);
  if (n > max) bad.push(`"${c.text}" puts ${n} words on screen (max ${max})`);
});
// the first second
if (!caps[0]?.hook) bad.push('the ad does not open on its hook (the first caption must be `hook`)');
const SAY_NAME = /SAY_NAME = "([^"]+)"/.exec(read('audio/synth-vo.py'))[1];
const spoken = (t) => t.split(/\s+/).join(' ').replaceAll('Machina', SAY_NAME);
const timing = JSON.parse(read('src/reels/ads/todo/vo.json'));
const hookT = timing.find((x) => x.frame === caps[0].at);
if (!hookT || caps[0].at + hookT.words[0] * C.FPS > 15) bad.push('the narrator is not heard by 0.5s');
if (C.HITS.snap > 105) bad.push(`the mark forms at ${(C.HITS.snap / C.FPS).toFixed(2)}s (spec: by about 3s)`);
if (C.TOTAL_SEC > 30) bad.push(`the ad runs ${C.TOTAL_SEC.toFixed(1)}s (max 30s)`);
caps.forEach((c) => {
  const t = timing.find((x) => x.frame === c.at);
  if (!t) return bad.push(`no narrator timing for the line at ${c.at}: run \`python3 audio/synth-vo.py adtodo\``);
  if (t.text !== spoken(c.say ?? c.text)) bad.push(`narrator ≠ caption at ${c.at}: said "${t.text}"`);
  if (t.words.length !== words(c.say ?? c.text)) bad.push(`line at ${c.at}: word count ≠ timings`);
});
const manifestPath = P('out/vo/adtodo/manifest.json');
if (fs.existsSync(manifestPath)) {
  for (const line of JSON.parse(fs.readFileSync(manifestPath, 'utf8'))) {
    const c = caps.find((x) => x.at === line.frame);
    if (!c) {
      bad.push(`a voice line at ${line.frame} has no caption: re-run synth-vo.py adtodo`);
      continue;
    }
    scan(`the voice at ${line.frame}`, line.text, SAID);
    const window = (c.to - c.at) / C.FPS;
    if (line.spoken > window + 1e-6) bad.push(`VO "${line.text}" speaks ${line.spoken}s in a ${window.toFixed(2)}s window`);
    if (c.place === 'lockup') {
      const hold = window - line.spoken;
      if (hold < 1.6) bad.push(`the tagline holds ${hold.toFixed(2)}s after its last word (min 1.6s)`);
      continue;
    }
    const dwell = window - line.spoken;
    const max = c.until ? 4 : 1.2;
    if (dwell < 0.3) bad.push(`"${c.text}" leaves ${dwell.toFixed(2)}s after its voice (min 0.3s)`);
    if (dwell > max + 1e-6) bad.push(`"${c.text}" lingers ${dwell.toFixed(2)}s after its voice (max ${max}s)`);
  }
} else {
  console.log('  (no out/vo/adtodo/manifest.json: VO fit not re-checked; run `python3 audio/synth-vo.py adtodo`)');
}
const close = caps.find((c) => c.place === 'lockup');
const closeLine = close?.text.split('\n').slice(-1)[0].replace(/\.$/, '');
if (!close || !read('src/scenes/Endcard.tsx').includes(closeLine)) bad.push('the lockup line is not the film endcard line (the tagline)');
if (close?.text !== 'Machina.\nEverything you save, finally useful.') bad.push('the ad does not close on "Machina." and the tagline, exactly');
if (close?.to !== C.TOTAL_FRAMES) bad.push('the tagline is not the last thing on screen');
for (const c of caps) if (c !== close && /finally useful/i.test(c.text)) bad.push(`the tagline appears before the end: "${c.text}"`);

// ── the grid
const H = C.HITS;
for (const k of ['snap', 'plusTap', 'imageTap', 'pick', 'saveTap', 'cardDone', 'cardTap', 'keyPoints', 'revisit', 'todoLift', 'tick', 'out', 'markStrike']) {
  if (H[k] % (C.BEAT_FRAMES / 2)) bad.push(`${k} at ${H[k]} is not on an 8th`);
}
if (C.TOTAL_FRAMES % (C.BEAT_FRAMES / 2)) bad.push(`the ad ends at ${C.TOTAL_FRAMES}, not on an 8th`);

// ── the app's own text, on every frame of the take
const takes = JSON.parse(read('src/reels/data/takes.json'));
const take = takes[C.TAKE];
if (!take) bad.push(`no take "${C.TAKE}" in takes.json: run \`CAPTURE_ONLY=${C.TAKE} npm run reel:capture\``);
else take.frames.forEach((fr, i) => fr.t.forEach((k) => scan(`the app on ${C.TAKE} frame ${i}`, take.texts[k], SHOWN)));
for (const m of ['home', 'dialogOpen', 'modeImage', 'picked', 'saving', 'done', 'landed', 'detail', 'detailScroll', 'revisit', 'todo', 'tick']) if (take && take.marks[m] === undefined) bad.push(`take ${C.TAKE} has no mark ${m}`);
// the capture material the ad seeds (capture/ad-todo.mjs)
{
  const M = await import('../../capture/ad-todo.mjs');
  for (const html of [...M.SLIDES, ...M.OTHERS]) scan('a hook screenshot', html.replace(/<[^>]+>/g, ' '), SHOWN);
  const card = M.raiseCard(['x']);
  for (const v of [card.title, card.summary, card.detailedSummary, card.actionableTakeaway, ...card.tags]) scan('the raise card', v, SHOWN);
  for (const [, t] of M.TODOS) scan('a "Do this" row', t, SHOWN);
  // the analysis prompt's rule since 2026-10-02: one sentence, ≤ 20 words, verb first
  const todo = card.actionableTakeaway;
  if (words(todo) > 20 || (todo.match(/[.!?]/g) ?? []).length !== 1) bad.push(`the raise card's "Do this" breaks rule 8 (one sentence, ≤20 words): "${todo}"`);
}

if (bad.length) {
  console.error('✗ ad todo:');
  for (const b of bad) console.error('    ' + b);
} else {
  console.log(`✓ ${caps.length} lines, no overlaps, ≤8 words on screen (hook 10); hook on screen from frame 0, voice by 0.5s, mark by ${(C.HITS.snap / C.FPS).toFixed(1)}s; ${C.TOTAL_SEC.toFixed(1)}s long`);
  console.log(`✓ narrator mirrors every line inside the dwell rule; the tagline closes, held 1.6s+; no banned word, recipe, plan or Pro surface in captions, voice or ${take.count} captured frames`);
}

// ── the sound
const wavLR = (p) => {
  const b = fs.readFileSync(p);
  const SR = b.readUInt32LE(24);
  const n = (b.length - 44) / 4;
  const L = new Float64Array(n);
  const R = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    L[i] = b.readInt16LE(44 + i * 4) / 32768;
    R[i] = b.readInt16LE(46 + i * 4) / 32768;
  }
  return { SR, n, L, R };
};
const scorePath = P('public/ads/todo/score.wav');
const mixPath = P('public/ads/todo/score-vo.wav');
const musicPath = P('public/ads/todo/score-music.wav');
let audioBad = false;
if (!fs.existsSync(scorePath) || !fs.existsSync(mixPath)) {
  console.error('✗ ad todo: no score or mix; run `node audio/ads/todo-score.mjs && node audio/mix-vo.mjs adtodo && node audio/mix-vo.mjs adtodo-music`');
  audioBad = true;
} else {
  const sc = wavLR(scorePath);
  let clipped = 0;
  for (let i = 0; i < sc.n; i++) if (Math.abs(sc.L[i]) > 0.995 || Math.abs(sc.R[i]) > 0.995) clipped++;
  const rows = [];
  for (let k = 0; k * C.BAR * sc.SR < sc.n; k++) {
    const s0 = Math.floor(k * C.BAR * sc.SR);
    const e = Math.min(sc.n, Math.floor((k + 1) * C.BAR * sc.SR));
    let sum = 0;
    for (let i = s0; i < e; i++) sum += (sc.L[i] ** 2 + sc.R[i] ** 2) / 2;
    rows.push(10 * Math.log10(sum / (e - s0) || 1e-12));
  }
  console.log(`  ad bars (dB): ${rows.map((x) => x.toFixed(1)).join('  ')}`);
  if (clipped) {
    console.error(`✗ the ad's score clips (${clipped} samples)`);
    audioBad = true;
  }
  for (let i = 1; i < rows.length - 2; i++) {
    const dip = Math.min(rows[i - 1], rows[i + 1]) - rows[i];
    if (dip > 3.5) {
      console.error(`✗ ad bar ${i} sits ${dip.toFixed(1)}dB below its neighbours`);
      audioBad = true;
    }
  }

  // the narrator over the music: the mix minus the ducked bed is the voice
  const mixInfo = P('out/vo/adtodo/mix.json');
  if (fs.existsSync(manifestPath) && fs.existsSync(mixInfo)) {
    const gain = JSON.parse(fs.readFileSync(mixInfo, 'utf8')).gain;
    const mx = wavLR(mixPath);
    const duckOf = Object.fromEntries(C.CAPTIONS.filter((c) => c.duck).map((c) => [c.at, c.duck]));
    const lines = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).map((line) => {
      const s0 = Math.round(line.start * sc.SR);
      const e = s0 + Math.round(line.spoken * sc.SR);
      const duck = duckOf[line.frame] ?? 0.55;
      const voice = new Float64Array(e - s0);
      const music = new Float64Array(e - s0);
      for (let i = s0; i < e; i++) {
        const a = (mx.L[i] + mx.R[i]) / 2 / gain;
        const c = (sc.L[i] + sc.R[i]) / 2;
        voice[i - s0] = a - c * duck;
        music[i - s0] = c * duck;
      }
      return {
        text: line.text,
        full: powerDb(voice) - powerDb(music),
        band: powerDb(speechBand(voice, sc.SR)) - powerDb(speechBand(music, sc.SR)),
      };
    });
    const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
    const worst = lines.reduce((a, b) => (b.band < a.band ? b : a));
    console.log(
      `  voice over music: median ${median(lines.map((l) => l.full)).toFixed(1)}dB full band; speech band min ${worst.band.toFixed(1)}dB ("${worst.text.slice(0, 32)}…"), median ${median(lines.map((l) => l.band)).toFixed(1)}dB`,
    );
    for (const l of lines.filter((x) => x.band < 3)) {
      console.error(`✗ the music masks "${l.text}": ${l.band.toFixed(1)}dB over it in the speech band (min 3dB)`);
      audioBad = true;
    }
    // at the film's balance (the one mix the owner has listened to), as the reel is held
    const filmManifest = P('out/vo/manifest.json');
    if (fs.existsSync(filmManifest) && fs.existsSync(P('public/score-vo.wav')) && fs.existsSync(P('public/score.wav'))) {
      const fm = wavLR(P('public/score-vo.wav'));
      const fs_ = wavLR(P('public/score.wav'));
      const film = JSON.parse(fs.readFileSync(filmManifest, 'utf8')).map((line) => {
        const s0 = Math.round(line.bar * 2.5 * fm.SR);
        const e = s0 + Math.round((line.spoken ?? line.sec) * fm.SR);
        const voice = new Float64Array(e - s0);
        const music = new Float64Array(e - s0);
        for (let i = s0; i < e; i++) {
          const a = (fm.L[i] + fm.R[i]) / 2;
          const c = (fs_.L[i] + fs_.R[i]) / 2;
          voice[i - s0] = a - c * 0.65;
          music[i - s0] = c * 0.65;
        }
        return powerDb(voice) - powerDb(music);
      });
      const filmBal = median(film);
      const clipBal = median(lines.map((l) => l.full));
      if (clipBal < filmBal - 3) {
        console.error(`✗ the ad's voice sits ${(filmBal - clipBal).toFixed(1)}dB lower in its mix than the film's`);
        audioBad = true;
      } else console.log(`✓ the narrator is 3dB+ over the music on every line, at the film's balance (film ${filmBal.toFixed(1)}dB, ad ${clipBal.toFixed(1)}dB)`);
    }
  } else {
    console.log('  (narrator balance not measured: needs out/vo/revisit/manifest.json and mix.json)');
  }
  for (const [what, p] of [['main mix', mixPath], ['music-only mix', musicPath]]) {
    if (!fs.existsSync(p)) {
      console.error(`✗ ad todo: no ${what} (${path.relative(root, p)})`);
      audioBad = true;
      continue;
    }
    const mixed = wavLR(p);
    const I = lufs(mixed.L, mixed.R, mixed.SR);
    const tp = truePeak(mixed.L, mixed.R);
    const okLoud = Math.abs(I + 14) <= 0.5 && tp <= -1;
    (okLoud ? console.log : console.error)(`${okLoud ? '✓' : '✗'} the ad's ${what}: ${I.toFixed(1)} LUFS integrated, ${tp.toFixed(2)} dBTP (spec −14 ±0.5 LUFS, ≤ −1 dBTP)`);
    if (!okLoud) audioBad = true;
  }
}

export const ok = !bad.length && !audioBad;
