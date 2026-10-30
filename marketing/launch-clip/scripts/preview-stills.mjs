/**
 * Stills of the App Store preview for review, and one contact sheet.
 *
 *   node scripts/preview-stills.mjs            # the review set (every beat)
 *   node scripts/preview-stills.mjs 0 90 450   # just these frames
 *
 * Writes out/preview-stills/fNNNN.png and out/preview-stills/sheet.jpg. Bundles
 * once. BROWSER= a Chrome binary; unset, Remotion finds a local one (Mac).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { SIGNATURE_AT, TOTAL_FRAMES } from '../clips/preview-timeline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const out = path.join(root, 'out', 'preview-stills');
fs.mkdirSync(out, { recursive: true });
const browserExecutable = process.env.BROWSER || null;

const REVIEW = [
  0, 30, 48, 66, 92, 110, 128, 146, 164, 185, 205, 225, 250, 275, 330, 352, 385, 420, 435, 470, 520, 570, 590, 640,
  SIGNATURE_AT + 40, TOTAL_FRAMES - 1,
];
const frames = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
const list = frames.length ? frames : REVIEW;

const serveUrl = await bundle({ entryPoint: path.join(root, 'src', 'index.ts') });
const composition = await selectComposition({ serveUrl, id: process.env.COMP ?? 'MachinaAppPreviewSilent', inputProps: {}, browserExecutable });
const files = [];
for (const frame of list) {
  const output = path.join(out, `f${String(frame).padStart(4, '0')}.png`);
  await renderStill({ serveUrl, composition, frame, output, browserExecutable, timeoutInMilliseconds: 120000 });
  files.push(output);
  process.stdout.write(`${frame} `);
}
// a contact sheet, six across, a quarter size
const cols = 6;
const inputs = files.flatMap((f) => ['-i', f]);
const rows = Math.ceil(files.length / cols);
const pad = rows * cols - files.length;
const scaled = files.map((_, i) => `[${i}]scale=270:-1[s${i}]`).join(';');
const blanks = Array.from({ length: pad }, (_, k) => `color=c=white:s=270x585:d=1[b${k}]`).join(';');
const cells = [...files.map((_, i) => `[s${i}]`), ...Array.from({ length: pad }, (_, k) => `[b${k}]`)];
const rowsF = Array.from({ length: rows }, (_, r) => `${cells.slice(r * cols, r * cols + cols).join('')}hstack=${cols}[r${r}]`).join(';');
const graph = [scaled, blanks, rowsF, rows > 1 ? `${Array.from({ length: rows }, (_, r) => `[r${r}]`).join('')}vstack=${rows}` : '[r0]null'].filter(Boolean).join(';');
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', graph, '-frames:v', '1', '-q:v', '3', path.join(out, 'sheet.jpg')]);
console.log(`\n${list.length} stills + sheet.jpg → ${path.relative(root, out)}`);
