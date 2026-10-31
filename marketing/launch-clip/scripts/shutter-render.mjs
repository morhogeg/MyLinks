/**
 * A one-phone video's picture with a real shutter (the preview's
 * scripts/preview-render.mjs, made generic for the videos after it).
 *
 *   node scripts/shutter-render.mjs later                 →  out/later/master-soon.mp4
 *   node scripts/shutter-render.mjs later --ending store  →  out/later/master-store-tail.mp4
 *   (--fresh re-renders the exposures even if they exist; CONCURRENCY=n)
 *
 * 1. Renders the video's Shutter composition: every exposure of every frame,
 *    one after another (counts[f] of them for frame f, one when the camera
 *    is still), near-lossless 4:4:4.
 * 2. Decodes that once and averages each frame's exposures in floating
 *    point, encoding the master. (Summing them in the browser rounds to 8
 *    bits at every exposure: text tones drifted by up to 4 levels at 8.)
 *
 * Another ending differs from today's only in the Signature's footer, so
 * for it only the Signature's frames are rendered (master-<ending>-tail.mp4,
 * from SIGNATURE_AT); the posting encode (scripts/later-encode.mjs) joins
 * them to today's frames in the same pass, so both files are the same
 * generation. (Decoding today's master to splice it here cost the store
 * file one more encode: 0.6–0.8 levels off on frames that should match.)
 *
 * One colour matrix end to end: BT.709, video range, tagged as such.
 * BROWSER= a Chrome binary; unset, Remotion finds a local one (Mac).
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[2];
const VIDEOS = {
  later: { composition: 'MachinaLaterShutter', timeline: 'clips/later-timeline.mjs', out: 'out/later' },
};
const V = VIDEOS[name];
if (!V) throw new Error(`usage: node scripts/shutter-render.mjs <${Object.keys(VIDEOS).join('|')}> [--ending store] [--fresh]`);
const arg = (k) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? process.argv[i + 1] : null;
};
const ending = arg('--ending') ?? 'soon';
const T = await import(path.join(root, V.timeline));
const { WIDTH, HEIGHT, TOTAL_FRAMES, SIGNATURE_AT } = T;
const out = path.join(root, V.out);
fs.mkdirSync(out, { recursive: true });
const browserExecutable = process.env.BROWSER || null;
const COLOUR = ['-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-color_range', 'tv'];

const serveUrl = await bundle({ entryPoint: path.join(root, 'src', 'index.ts') });
const composition = await selectComposition({ serveUrl, id: V.composition, inputProps: { ending }, browserExecutable });
const counts = composition.props.counts;
if (counts.length !== TOTAL_FRAMES) throw new Error(`${counts.length} exposure counts for ${TOTAL_FRAMES} frames`);
const starts = [0];
for (let f = 0; f < TOTAL_FRAMES; f++) starts.push(starts[f] + counts[f]);

// another ending renders only the Signature's frames
const first = ending === 'soon' ? 0 : SIGNATURE_AT;
const exposures = path.join(out, `exposures-${ending}.mp4`);
const master = path.join(out, ending === 'soon' ? 'master-soon.mp4' : `master-${ending}-tail.mp4`);
const moving = counts.filter((n) => n > 1).length;
console.log(`${ending}: ${starts[TOTAL_FRAMES] - starts[first]} exposures for frames ${first}–${TOTAL_FRAMES - 1} (${moving} frames with a shutter, up to ${Math.max(...counts)} exposures)`);

// 1. the exposures
if (!fs.existsSync(exposures) || process.argv.includes('--fresh')) {
  const t0 = Date.now();
  let last = 0;
  await renderMedia({
    serveUrl,
    composition,
    inputProps: { ending },
    frameRange: [starts[first], starts[TOTAL_FRAMES] - 1],
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
        process.stdout.write(`${renderedFrames} (${Math.round((Date.now() - t0) / 1000)}s) `);
      }
    },
  });
  console.log(`\nexposures rendered in ${Math.round((Date.now() - t0) / 1000)}s`);
}

// 2. each frame, the mean of its exposures
const SIZE = WIDTH * HEIGHT * 3;
const enc = spawn('ffmpeg', [
  '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${WIDTH}x${HEIGHT}`, '-r', '30', '-i', '-',
  '-vf', 'scale=out_color_matrix=bt709:out_range=tv,format=yuv420p', '-c:v', 'libx264', '-preset', 'slow', '-crf', '8',
  ...COLOUR, '-movflags', '+faststart', master,
]);
enc.stderr.pipe(process.stderr);
const write = async (buf) => {
  if (!enc.stdin.write(buf)) await new Promise((r) => enc.stdin.once('drain', r));
};
const decode = (file) =>
  spawn('ffmpeg', ['-v', 'error', '-i', file, '-vf', 'scale=in_color_matrix=bt709:in_range=tv,format=rgb24', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-']);

let f = first;
const dec = decode(exposures);
dec.stderr.pipe(process.stderr);
const sum = new Uint16Array(SIZE);
const frame = Buffer.alloc(SIZE);
let filled = 0;
let got = 0;
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
      if (++got === counts[f]) {
        const n = counts[f];
        const outFrame = Buffer.alloc(SIZE);
        for (let i = 0; i < SIZE; i++) outFrame[i] = Math.floor((sum[i] + n / 2) / n);
        sum.fill(0);
        await write(outFrame);
        f++;
        got = 0;
      }
    }
  }
}
enc.stdin.end();
await new Promise((r) => enc.on('close', r));
if (f !== TOTAL_FRAMES) throw new Error(`wrote frames ${first}–${f - 1}, expected ${first}–${TOTAL_FRAMES - 1}`);
console.log(`master: ${path.relative(root, master)} (frames ${first}–${f - 1})`);
