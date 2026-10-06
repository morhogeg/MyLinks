/**
 * Render the live film frame by frame: the page in ?render mode, stepped by
 * time, screenshotted, piped into ffmpeg. Same page, same code as the live
 * player, so the MP4 is exactly what a visitor's browser draws.
 *
 *   node live/render.mjs                         → out/live/machina-in-motion-landscape.mp4
 *   node live/render.mjs --format portrait
 *   node live/render.mjs --stills 0,3.5,12       → out/live/stills/<format>/*.png + sheet.png
 *   node live/render.mjs --from 20 --to 30       (a range, for checking a beat)
 *   --fps 60 (default) · --workers 3 · --takes takes-dpr1 · --crf 16 · --silent
 *
 * The score (out/live/media/score.wav, live/score.mjs) is muxed in unless
 * --silent.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { startLiveServer } from './serve.mjs';
import { CHROMIUM } from '../capture/device.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, '..', 'out', 'live');

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : dflt;
};
const FORMAT = opt('format', 'landscape');
const FPS = Number(opt('fps', 60));
const WORKERS = Number(opt('workers', 3));
const TAKES = opt('takes', process.env.LIVE_TAKES ?? 'takes');
const CRF = opt('crf', '16');
const STILLS = opt('stills', null);
const SIZE = FORMAT === 'portrait' ? { w: 1080, h: 1920 } : { w: 1920, h: 1080 };

const server = await startLiveServer({ port: 4710 + Math.floor(Math.random() * 200), takes: TAKES });
const browser = await chromium.launch({
  executablePath: CHROMIUM,
  args: ['--disable-background-networking', '--disable-component-update', '--no-first-run', '--force-color-profile=srgb', '--disable-lcd-text'],
});

async function openPage() {
  const ctx = await browser.newContext({ viewport: { width: SIZE.w, height: SIZE.h }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(`${server.url}/?render&format=${FORMAT}`);
  await page.waitForFunction(() => window.__filmReady === true, null, { timeout: 120000 });
  const cdp = await ctx.newCDPSession(page);
  return { page, cdp, errors };
}

const shot = async (cdp) => Buffer.from((await cdp.send('Page.captureScreenshot', { format: 'png', optimizeForSpeed: true })).data, 'base64');

if (STILLS) {
  const dir = path.join(OUT, 'stills', FORMAT);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const { page, cdp, errors } = await openPage();
  const times = STILLS.split(',').map(Number);
  const files = [];
  for (const t of times) {
    await page.evaluate((tt) => window.__film.seek(tt), t);
    const f = path.join(dir, `${t.toFixed(2).padStart(6, '0')}.png`);
    fs.writeFileSync(f, await shot(cdp));
    files.push(f);
  }
  if (errors.length) console.log('page errors:', errors.slice(0, 5));
  const cols = FORMAT === 'portrait' ? 6 : 4;
  execFileSync('montage', [...files, '-tile', `${cols}x`, '-geometry', FORMAT === 'portrait' ? '270x480+4+4' : '480x270+4+4', '-background', '#888', path.join(dir, 'sheet.png')]);
  console.log(`stills → ${path.relative(process.cwd(), dir)} (${files.length})`);
} else {
  const { page: probe, errors: probeErrors } = await openPage();
  const duration = await probe.evaluate(() => window.__film.duration);
  await probe.context().close();
  const from = Number(opt('from', 0));
  const to = Math.min(duration, Number(opt('to', duration)));
  const n = Math.round((to - from) * FPS);
  const chunk = Math.ceil(n / WORKERS);
  const partsDir = path.join(OUT, 'parts');
  fs.rmSync(partsDir, { recursive: true, force: true });
  fs.mkdirSync(partsDir, { recursive: true });
  const t0 = Date.now();
  let done = 0;
  const worker = async (w) => {
    const a = w * chunk;
    const b = Math.min(n, a + chunk);
    if (a >= b) return null;
    const { page, cdp, errors } = await openPage();
    const file = path.join(partsDir, `part-${w}.mp4`);
    const ff = spawn('ffmpeg', [
      '-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(FPS), '-i', '-',
      '-c:v', 'libx264', '-preset', 'slow', '-crf', CRF, '-pix_fmt', 'yuv420p', '-tune', 'film',
      '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart', file,
    ], { stdio: ['pipe', 'inherit', 'inherit'] });
    for (let i = a; i < b; i++) {
      await page.evaluate((tt) => window.__film.seek(tt), from + i / FPS);
      const png = await shot(cdp);
      if (!ff.stdin.write(png)) await new Promise((r) => ff.stdin.once('drain', r));
      done++;
      if (done % 120 === 0) {
        const el = (Date.now() - t0) / 1000;
        console.log(`  ${done}/${n} frames · ${(el / done * 1000).toFixed(0)} ms/frame · ~${Math.round((el / done) * (n - done))}s left`);
      }
    }
    ff.stdin.end();
    await new Promise((r) => ff.on('close', r));
    if (errors.length) console.log(`worker ${w} page errors:`, errors.slice(0, 5));
    await page.context().close();
    return file;
  };
  const parts = (await Promise.all([...Array(WORKERS).keys()].map(worker))).filter(Boolean);
  const list = path.join(partsDir, 'list.txt');
  fs.writeFileSync(list, parts.map((p) => `file '${p}'`).join('\n'));
  const suffix = from > 0 || to < duration ? `-${from}-${to}` : '';
  const out = path.join(OUT, `machina-in-motion-${FORMAT}${suffix}.mp4`);
  const picture = path.join(partsDir, 'picture.mp4');
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', picture]);
  // the score (live/score.mjs), unless --silent or it has not been made
  const score = path.join(OUT, 'media', 'score.wav');
  if (!args.includes('--silent') && fs.existsSync(score)) {
    execFileSync('ffmpeg', [
      '-loglevel', 'error', '-y', '-i', picture, '-ss', String(from), '-t', String(to - from), '-i', score,
      '-map', '0:v', '-map', '1:a', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out,
    ]);
  } else {
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', picture, '-c', 'copy', '-movflags', '+faststart', out]);
  }
  if (probeErrors.length) console.log('page errors:', probeErrors.slice(0, 5));
  console.log(`✓ ${path.relative(process.cwd(), out)} · ${n} frames in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
}

await browser.close();
await server.close();
