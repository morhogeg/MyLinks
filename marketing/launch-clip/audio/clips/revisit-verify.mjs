/**
 * `npm run verify`, the REVISIT feature clip's section (hooked into
 * audio/verify.mjs; exports `ok`). The reel's gates, on the clip's own files
 * (clips/revisit-timeline.mjs, src/reels/clips/revisit/, the `revisitClip`
 * take, public/clips/revisit/, out/vo/revisit/):
 *
 *  - captions and kickers never overlap; the clip opens on its chapter word;
 *    every narrator line starts on a beat; the narrator speaks every caption
 *    verbatim (only the SAY_NAME respelling differs) and fits its window;
 *    THE DWELL RULE (a line leaves 0.3–1.2s after its voice, ≤4s with
 *    `until`); the lockup's line is the film's endcard subtitle;
 *  - the grid: taps, lifts and the strike on 8ths, the end on a beat;
 *  - no em dash, literal "AI", "second brain" or "library" in any caption,
 *    kicker, or text the app shows on ANY frame of the take (the clip uses
 *    all of it);
 *  - the score: no clipping, no hole in its per-bar level; the narrator at
 *    least 3dB over the music in the speech band on every line, at the
 *    film's balance; the mix at −14 LUFS ±0.5, true peak ≤ −1 dBTP.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { lufs, powerDb, speechBand, truePeak } from '../loudness.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..', '..');
const P = (p) => path.join(root, p);
const read = (p) => fs.readFileSync(P(p), 'utf8');

const C = await import('../../clips/revisit-timeline.mjs');
console.log('\n── clip: revisit');
const bad = [];
const BANNED = [
  [/—/, 'em dash'],
  [/\bAI\b/, 'literal "AI"'],
  [/second brain/i, '"second brain"'],
  [/librar(y|ies)/i, '"library"'],
];
const scan = (where, text) => {
  for (const [re, what] of BANNED) if (re.test(text)) bad.push(`${what} in ${where}: ${JSON.stringify(text).slice(0, 110)}`);
};

// ── captions, kickers, the narrator
const caps = [...C.CAPTIONS].sort((a, b) => a.at - b.at);
caps.forEach((c, i) => {
  scan(`caption ${i + 1}`, c.text);
  if (c.say) scan(`caption ${i + 1} (spoken)`, c.say);
  if (c.to <= c.at) bad.push(`caption "${c.text}" ends before it starts`);
  if (i && c.at < caps[i - 1].to) bad.push(`caption overlap: "${c.text}" starts at ${c.at}, "${caps[i - 1].text}" runs to ${caps[i - 1].to}`);
  if (c.to > C.TOTAL_FRAMES) bad.push(`caption "${c.text}" runs past the clip (${c.to} > ${C.TOTAL_FRAMES})`);
  if (c.at % C.BEAT_FRAMES) bad.push(`line "${c.text}" starts at ${c.at}, not on a beat`);
});
const kick = [...C.KICKERS].sort((a, b) => a.at - b.at);
kick.forEach((k, i) => {
  scan(`kicker ${k.text}`, k.text);
  if (i && k.at < kick[i - 1].to) bad.push(`kicker overlap at ${k.at}`);
  if (!caps.some((c) => !c.place && c.to === k.to && c.at >= k.at)) bad.push(`kicker ${k.at}–${k.to} does not leave with a line`);
});
if (!kick.length || kick[0].at > -8) bad.push('the clip does not open on its chapter word (formed on frame 0)');
const SAY_NAME = /SAY_NAME = "([^"]+)"/.exec(read('audio/synth-vo.py'))[1];
const spoken = (t) => t.split(/\s+/).join(' ').replaceAll('Machina', SAY_NAME);
const timing = JSON.parse(read('src/reels/clips/revisit/vo.json'));
caps.forEach((c) => {
  const t = timing.find((x) => x.frame === c.at);
  if (!t) return bad.push(`no narrator timing for the line at ${c.at}: run \`python3 audio/synth-vo.py revisit\``);
  if (t.text !== spoken(c.say ?? c.text)) bad.push(`narrator ≠ caption at ${c.at}: said "${t.text}"`);
  if (t.words.length !== (c.say ?? c.text).split(/\s+/).filter(Boolean).length) bad.push(`line at ${c.at}: word count ≠ timings`);
});
const manifestPath = P('out/vo/revisit/manifest.json');
if (fs.existsSync(manifestPath)) {
  for (const line of JSON.parse(fs.readFileSync(manifestPath, 'utf8'))) {
    const c = caps.find((x) => x.at === line.frame);
    if (!c) {
      bad.push(`a voice line at ${line.frame} has no caption: re-run synth-vo.py revisit`);
      continue;
    }
    const window = (c.to - c.at) / C.FPS;
    if (line.spoken > window + 1e-6) bad.push(`VO "${line.text}" speaks ${line.spoken}s in a ${window.toFixed(2)}s window`);
    if (c.place === 'lockup') continue;
    const dwell = window - line.spoken;
    const max = c.until ? 4 : 1.2;
    if (dwell < 0.3) bad.push(`"${c.text}" leaves ${dwell.toFixed(2)}s after its voice (min 0.3s)`);
    if (dwell > max + 1e-6) bad.push(`"${c.text}" lingers ${dwell.toFixed(2)}s after its voice (max ${max}s)`);
  }
} else {
  console.log('  (no out/vo/revisit/manifest.json: VO fit not re-checked; run `python3 audio/synth-vo.py revisit`)');
}
const close = caps.find((c) => c.place === 'lockup');
const closeLine = close?.text.split('\n').slice(-1)[0].replace(/\.$/, '');
if (!close || !read('src/scenes/Endcard.tsx').includes(closeLine)) bad.push('the lockup line is not the film endcard subtitle');

// ── the grid
const H = C.HITS;
for (const [k, v] of Object.entries({ todoLift: H.todoLift, recapTap: H.recapTap, standout: H.standout, cardTap: H.cardTap, markStrike: H.markStrike })) {
  if (v % (C.BEAT_FRAMES / 2)) bad.push(`${k} at ${v} is not on an 8th`);
}
if (C.TOTAL_FRAMES % C.BEAT_FRAMES) bad.push(`the clip ends at ${C.TOTAL_FRAMES}, not on a beat`);

// ── the app's own text, on every frame of the take
const takes = JSON.parse(read('src/reels/data/takes.json'));
const take = takes[C.TAKE];
if (!take) bad.push(`no take "${C.TAKE}" in takes.json: run \`CAPTURE_ONLY=${C.TAKE} npm run reel:capture\``);
else take.frames.forEach((fr, i) => fr.t.forEach((k) => scan(`the app on ${C.TAKE} frame ${i}`, take.texts[k])));
for (const m of ['tab', 'expand', 'scroll', 'card', 'cardSettled']) if (take && take.marks[m] === undefined) bad.push(`take ${C.TAKE} has no mark ${m}`);

if (bad.length) {
  console.error('✗ clip revisit:');
  for (const b of bad) console.error('    ' + b);
} else {
  console.log(`✓ ${caps.length} lines + ${kick.length} kickers, no overlaps; opens on its chapter word; lines on beats; narrator mirrors every line, inside the dwell rule`);
  console.log(`✓ taps, lifts and the strike on 8ths; no em dash / "AI" / "second brain" / "library" in captions or ${take.count} captured frames`);
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
const scorePath = P('public/clips/revisit/score.wav');
const mixPath = P('public/clips/revisit/score-vo.wav');
let audioBad = false;
if (!fs.existsSync(scorePath) || !fs.existsSync(mixPath)) {
  console.error('✗ clip revisit: no score or mix; run `node audio/clips/revisit-score.mjs && node audio/mix-vo.mjs revisit`');
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
  console.log(`  clip bars (dB): ${rows.map((x) => x.toFixed(1)).join('  ')}`);
  if (clipped) {
    console.error(`✗ the clip's score clips (${clipped} samples)`);
    audioBad = true;
  }
  for (let i = 1; i < rows.length - 2; i++) {
    const dip = Math.min(rows[i - 1], rows[i + 1]) - rows[i];
    if (dip > 3.5) {
      console.error(`✗ clip bar ${i} sits ${dip.toFixed(1)}dB below its neighbours`);
      audioBad = true;
    }
  }

  // the narrator over the music: the mix minus the ducked bed is the voice
  const mixInfo = P('out/vo/revisit/mix.json');
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
        console.error(`✗ the clip's voice sits ${(filmBal - clipBal).toFixed(1)}dB lower in its mix than the film's`);
        audioBad = true;
      } else console.log(`✓ the narrator is 3dB+ over the music on every line, at the film's balance (film ${filmBal.toFixed(1)}dB, clip ${clipBal.toFixed(1)}dB)`);
    }
  } else {
    console.log('  (narrator balance not measured: needs out/vo/revisit/manifest.json and mix.json)');
  }
  const mixed = wavLR(mixPath);
  const I = lufs(mixed.L, mixed.R, mixed.SR);
  const tp = truePeak(mixed.L, mixed.R);
  const okLoud = Math.abs(I + 14) <= 0.5 && tp <= -1;
  (okLoud ? console.log : console.error)(`${okLoud ? '✓' : '✗'} the clip mix: ${I.toFixed(1)} LUFS integrated, ${tp.toFixed(2)} dBTP (spec −14 ±0.5 LUFS, ≤ −1 dBTP)`);
  if (!okLoud) audioBad = true;
}

export const ok = !bad.length && !audioBad;
