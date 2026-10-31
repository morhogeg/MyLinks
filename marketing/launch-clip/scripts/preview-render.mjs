/**
 * The App Store preview's picture, with a real shutter.
 *
 *   node scripts/preview-render.mjs          →  out/preview/master.mp4 (1080 × 2340, silent)
 *   node scripts/preview-render.mjs --fresh  (re-render the exposures even if they exist)
 *
 * 1. Renders MachinaAppPreviewShutter: every exposure of every frame, one
 *    after another (SHUTTER_COUNTS[f] of them for frame f, one when the
 *    camera is still), into out/preview/exposures.mp4, near-lossless 4:4:4.
 * 2. Decodes that once and averages each frame's exposures in floating
 *    point, encoding the master. (Summing them in the browser rounds to 8
 *    bits at every exposure: text tones drifted by up to 4 levels at 8.)
 *
 * One colour matrix end to end: BT.709, video range, tagged as such (the
 * final encode in README keeps it). BROWSER= a Chrome binary; unset,
 * Remotion finds a local one (Mac).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';
import { HEIGHT, TOTAL_FRAMES, WIDTH } from '../clips/preview-timeline.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'out', 'preview');
fs.mkdirSync(out, { recursive: true });
const exposures = path.join(out, 'exposures.mp4');
const master = path.join(out, 'master.mp4');
const browserExecutable = process.env.BROWSER || null;
const COLOUR = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];

const serveUrl = await bundle({ entryPoint: path.join(root, 'src', 'index.ts') });
const composition = await selectComposition({ serveUrl, id: 'MachinaAppPreviewShutter', inputProps: {}, browserExecutable });
const counts = composition.props.counts;
if (counts.length !== TOTAL_FRAMES) throw new Error(`${counts.length} exposure counts for ${TOTAL_FRAMES} frames`);
const moving = counts.filter((n) => n > 1).length;
console.log(`${composition.durationInFrames} exposures for ${TOTAL_FRAMES} frames (${moving} frames with a shutter, up to ${Math.max(...counts)} exposures)`);

// 1. the exposures
if (!fs.existsSync(exposures) || process.argv.includes('--fresh')) {
  const t0 = Date.now();
  let last = 0;
  await renderMedia({
    serveUrl,
    composition,
    codec: 'h264',
    crf: 1,
    pixelFormat: 'yuv444p',
    colorSpace: 'bt709',
    imageFormat: 'png',
    muted: true,
    concurrency: Number(process.env.CONCURRENCY ?? 4),
    outputLocation: exposures,
    browserExecutable,
    timeoutInMilliseconds: 120000,
    onProgress: ({ renderedFrames }) => {
      if (renderedFrames - last >= 100) {
        last = renderedFrames;
        process.stdout.write(`${renderedFrames}/${composition.durationInFrames} (${Math.round((Date.now() - t0) / 1000)}s) `);
      }
    },
  });
  console.log(`\nexposures rendered in ${Math.round((Date.now() - t0) / 1000)}s`);
}

// 2. each frame, the mean of its exposures
const SIZE = WIDTH * HEIGHT * 3;
const dec = spawn('ffmpeg', ['-v', 'error', '-i', exposures, '-vf', 'scale=in_color_matrix=bt709:in_range=tv,format=rgb24', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);
const enc = spawn('ffmpeg', [
  '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${WIDTH}x${HEIGHT}`, '-r', '30', '-i', '-',
  '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '8',
  ...COLOUR, '-movflags', '+faststart', master,
]);
dec.stderr.pipe(process.stderr);
enc.stderr.pipe(process.stderr);

const sum = new Uint16Array(SIZE);
const frame = Buffer.alloc(SIZE);
let filled = 0;
let f = 0;
let got = 0;
const emit = async () => {
  const n = counts[f];
  const outFrame = Buffer.alloc(SIZE);
  for (let i = 0; i < SIZE; i++) outFrame[i] = Math.floor((sum[i] + n / 2) / n);
  sum.fill(0);
  if (!enc.stdin.write(outFrame)) await new Promise((r) => enc.stdin.once('drain', r));
  f++;
  got = 0;
};
for await (const chunk of dec.stdout) {
  let off = 0;
  while (off < chunk.length) {
    const take = Math.min(SIZE - filled, chunk.length - off);
    chunk.copy(frame, filled, off, off + take);
    filled += take;
    off += take;
    if (filled === SIZE) {
      for (let i = 0; i < SIZE; i++) sum[i] += frame[i];
      filled = 0;
      if (++got === counts[f]) await emit();
    }
  }
}
enc.stdin.end();
await new Promise((r) => enc.on('close', r));
if (f !== TOTAL_FRAMES) throw new Error(`averaged ${f} frames, expected ${TOTAL_FRAMES}`);
console.log(`master: ${path.relative(root, master)} (${f} frames)`);
