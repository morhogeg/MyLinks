/**
 * Bake the live film into a self-contained site: the same page as the
 * renderer uses, with the capture packed for the web.
 *
 *   node live/bake.mjs   →   out/live/site/  (index.html, scripts, media/)
 *
 * The 1,200 captured PNGs (~0.5 GB) become ONE video of the screen laid out
 * on the film's own clock (film/edit.js): frame k of screen.mp4 is what the
 * slab shows at k/30 s, so the page just plays it and draws everything else
 * around it. Lifted pieces are drawn from that same video into canvases, so
 * they stay the app's own pixels, moving with the app. The cards in the
 * opening ring become small WebP crops. Plus the score and the app's font.
 *
 * Env: LIVE_DPR (default 2: 786 × 1704, crisp up to 2 px per point on a
 * 1x display) · LIVE_CRF (default 24).
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildIndex } from './media.mjs';
import { makeEdit, stillFrames } from './film/edit.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const clip = path.join(here, '..');
const TAKES = path.join(clip, 'out', 'live', process.env.LIVE_TAKES ?? 'takes');
const SITE = path.join(clip, 'out', 'live', 'site');
const MEDIA = path.join(SITE, 'media');
const DPR = Number(process.env.LIVE_DPR ?? 2);
const CRF = process.env.LIVE_CRF ?? '24';
const FPS = 30;

const index = buildIndex(TAKES);
const session = index.takes.session;
const cards = index.takes.cards;
const E = makeEdit(session);

fs.rmSync(SITE, { recursive: true, force: true });
fs.mkdirSync(path.join(MEDIA, 'cards'), { recursive: true });

// 1. the page and its code. The font is inlined (a hosted page may only load
// faces it carries itself), and artifact.html is the same page without its
// document wrapper, for hosts that add their own (claude.ai artifacts).
for (const f of ['main.js', 'package.json']) fs.copyFileSync(path.join(here, f), path.join(SITE, f));
for (const d of ['engine', 'film']) fs.cpSync(path.join(here, d), path.join(SITE, d), { recursive: true });
{
  const font = fs.readFileSync(path.join(clip, 'node_modules', 'geist', 'dist', 'fonts', 'geist-sans', 'Geist-Variable.woff2'));
  const html = fs
    .readFileSync(path.join(here, 'index.html'), 'utf8')
    .replace("url('media/fonts/Geist-Variable.woff2')", `url('data:font/woff2;base64,${font.toString('base64')}')`);
  fs.writeFileSync(path.join(SITE, 'index.html'), html);
}

// 2. the screen, on the film's clock
const W = 393 * DPR;
const H = 852 * DPR;
const n = Math.ceil(E.dur * FPS);
const list = [];
let prev = null;
let run = 0;
for (let k = 0; k <= n; k++) {
  const fi = k < n ? E.frameAt(k / FPS) : null;
  if (fi === prev && k < n) {
    run++;
    continue;
  }
  if (prev !== null) list.push(`file '${path.join(TAKES, 'session', session.files[prev])}'\nduration ${(run / FPS).toFixed(6)}`);
  prev = fi;
  run = 1;
}
// the concat demuxer needs the last file repeated to honour its duration
list.push(`file '${path.join(TAKES, 'session', session.files[E.frameAt((n - 1) / FPS)])}'`);
const listFile = path.join(clip, 'out', 'live', 'screen-list.txt');
fs.writeFileSync(listFile, list.join('\n'));
const screen = path.join(MEDIA, 'screen.mp4');
console.log(`screen: ${n} frames at ${FPS}fps, ${W}×${H}, from ${list.length} runs`);
execFileSync('ffmpeg', [
  '-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
  '-vf', `fps=${FPS},scale=${W}:${H}:flags=lanczos,format=yuv420p`,
  '-c:v', 'libx264', '-preset', 'slow', '-crf', CRF, '-tune', 'animation', '-g', '30', '-bf', '2',
  '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709',
  '-movflags', '+faststart', '-an', screen,
]);
console.log(`  → screen.mp4 ${(fs.statSync(screen).size / 1e6).toFixed(1)} MB`);
// the same screen as VP9 WebM, for browsers without H.264 (open Chromium)
const screenWebm = path.join(MEDIA, 'screen.webm');
execFileSync('ffmpeg', [
  '-loglevel', 'error', '-y', '-i', screen, '-c:v', 'libvpx-vp9', '-b:v', '0', '-crf', '34', '-row-mt', '1',
  '-deadline', 'good', '-cpu-used', '2', '-g', '30', '-pix_fmt', 'yuv420p', '-an', screenWebm,
]);
console.log(`  → screen.webm ${(fs.statSync(screenWebm).size / 1e6).toFixed(1)} MB`);

// 3. the ring's cards: each one cropped from its frame, as WebP
const cardFiles = {};
for (const [id, i] of Object.entries(cards.marks)) {
  const r = cards.rects[i]?.card;
  if (!r) continue;
  const src = path.join(TAKES, 'cards', cards.files[i]);
  const out = path.join(MEDIA, 'cards', `${id}.webp`);
  const s = cards.dpr;
  const scale = DPR / s;
  execFileSync('ffmpeg', [
    '-loglevel', 'error', '-y', '-i', src,
    '-vf', `crop=${Math.round(r[2] * s)}:${Math.round(r[3] * s)}:${Math.round(r[0] * s)}:${Math.round(r[1] * s)},scale=${Math.round(r[2] * s * scale)}:-1:flags=lanczos`,
    '-c:v', 'libwebp', '-quality', '86', out,
  ]);
  cardFiles[id] = `cards/${id}.webp`;
}
console.log(`  → ${Object.keys(cardFiles).length} card crops`);

// 3b. the frames a lift shows while the screen shows another (edit.js)
fs.mkdirSync(path.join(MEDIA, 'stills'), { recursive: true });
const stillFiles = {};
for (const f of new Set(Object.values(stillFrames(session)))) {
  const out = path.join(MEDIA, 'stills', `${f}.webp`);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', path.join(TAKES, 'session', session.files[f]), '-vf', `scale=${W}:${H}:flags=lanczos`, '-c:v', 'libwebp', '-quality', '90', out]);
  stillFiles[f] = `media/stills/${f}.webp`;
}

// the soundtrack: the narrated mix when there is one (npm run live:voice)
const narrated = path.join(clip, 'out', 'live', 'media', 'score-vo.wav');
const scoreWav = fs.existsSync(narrated) ? narrated : path.join(clip, 'out', 'live', 'media', 'score.wav');

// 4. the index the page reads: marks + rects, and where the live media is
const slim = (t) => ({ dpr: t.dpr, fps: t.fps, count: t.count, screen: t.screen, marks: t.marks, flags: t.flags, rects: t.rects, files: [] });
fs.writeFileSync(
  path.join(MEDIA, 'index.json'),
  JSON.stringify({
    takes: { session: slim(session), cards: slim(cards) },
    live: {
      screen: 'media/screen.mp4',
      screenWebm: 'media/screen.webm',
      dpr: DPR,
      fps: FPS,
      cards: Object.fromEntries(Object.entries(cardFiles).map(([k, v]) => [k, `media/${v}`])),
      stills: stillFiles,
      score: fs.existsSync(scoreWav) ? 'media/score.mp3' : null,
    },
  }),
);

// 5. score and font
// (MP3: the one audio format every browser plays and every static host,
// claude.ai artifacts included, serves)
if (fs.existsSync(scoreWav)) {
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', scoreWav, '-c:a', 'libmp3lame', '-b:a', '192k', path.join(MEDIA, 'score.mp3')]);
}
else console.warn('  ! no score (run node live/score.mjs first)');
fs.mkdirSync(path.join(MEDIA, 'fonts'), { recursive: true });
fs.copyFileSync(path.join(clip, 'node_modules', 'geist', 'dist', 'fonts', 'geist-sans', 'Geist-Variable.woff2'), path.join(MEDIA, 'fonts', 'Geist-Variable.woff2'));

// 6. artifact.html: the same page for hosts that wrap it in their own
// document (claude.ai artifacts): no doctype/head/body, the scripts bundled
// into one inline module (esbuild) and the index inline, so the page fetches
// nothing but its media
{
  const html = fs.readFileSync(path.join(SITE, 'index.html'), 'utf8');
  const title = html.match(/<title>[\s\S]*?<\/title>/)[0];
  const style = html.match(/<style>[\s\S]*?<\/style>/)[0];
  const body = html.match(/<body>([\s\S]*?)<\/body>/)[1].replace(/<script type="module" src="main.js"><\/script>/, '').trim();
  const esbuild = path.join(clip, 'node_modules', '.bin', 'esbuild');
  const bundle = execFileSync(esbuild, [path.join(here, 'main.js'), '--bundle', '--format=esm', '--minify', '--target=es2022', '--log-level=warning'])
    .toString()
    .replace(/<\/script/gi, '<\\/script');
  const idx = fs.readFileSync(path.join(MEDIA, 'index.json'), 'utf8').replace(/<\/script/gi, '<\\/script');
  fs.writeFileSync(
    path.join(SITE, 'artifact.html'),
    `${title}\n${style}\n${body}\n<script>window.__MACHINA_INDEX__ = ${idx};</script>\n<script type="module">${bundle}</script>\n`,
  );
  console.log(`  → artifact.html ${(fs.statSync(path.join(SITE, 'artifact.html')).size / 1e3).toFixed(0)} KB (scripts + index inline)`);
}

const total = execFileSync('du', ['-sh', SITE]).toString().split('\t')[0];
console.log(`✓ site → ${path.relative(process.cwd(), SITE)} (${total})`);
void spawn;
