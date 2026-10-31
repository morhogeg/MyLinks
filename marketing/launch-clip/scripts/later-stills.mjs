/**
 * Stills of LATER NEVER COMES for review, one contact sheet, and each still
 * again with Meta's safe zone and the profile grid's 3:4 crop drawn over it.
 *
 *   node scripts/later-stills.mjs            # the review set (every beat, both sides of every move)
 *   node scripts/later-stills.mjs 0 92 425   # just these frames
 *
 * Writes out/later-stills/fNNNN.png, fNNNN-guides.png and sheet.jpg. Single
 * exposures (the shutter is scripts/shutter-render.mjs). BROWSER= a Chrome
 * binary; unset, Remotion finds a local one (Mac). COMP= another composition.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { GRID, HEIGHT, HITS, SAFE, SIGNATURE_AT, TOTAL_FRAMES, WIDTH } from '../clips/later-timeline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const out = path.join(root, 'out', 'later-stills');
fs.mkdirSync(out, { recursive: true });
const browserExecutable = process.env.BROWSER || null;

const H = HITS;
const REVIEW = [
  0, 30, 60, H.tap - 1, H.tap + 2, H.tap + 20, ...H.steps.map((f) => f + 3), H.saved + 4,
  H.revisit + 6, H.todo + 4, H.todo + 30, H.askTap, H.ask + 6, H.typeFrom + 20, H.typed, H.send + 6, H.writing + 4,
  H.answer + 6, H.answer + 40, ...H.sources.map((f) => f + 4), H.graphTap, H.graph + 7, ...H.nodes.map((f) => f + 4),
  H.out + 10, SIGNATURE_AT + 40, TOTAL_FRAMES - 1,
].filter((f, i, a) => f >= 0 && f < TOTAL_FRAMES && a.indexOf(f) === i);
const frames = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
const list = frames.length ? frames : REVIEW;

const serveUrl = await bundle({ entryPoint: path.join(root, 'src', 'index.ts') });
const composition = await selectComposition({ serveUrl, id: process.env.COMP ?? 'MachinaLaterSilent', inputProps: {}, browserExecutable });
const files = [];
// the guides: Meta's safe zone (nothing key outside it) and the grid's 3:4 crop of the cover
const guides = [
  `drawbox=x=${SAFE.x0}:y=${SAFE.y0}:w=${SAFE.x1 - SAFE.x0}:h=${SAFE.y1 - SAFE.y0}:color=red@0.7:t=3`,
  `drawbox=x=0:y=${GRID.y0}:w=${WIDTH}:h=${GRID.y1 - GRID.y0}:color=blue@0.5:t=2`,
].join(',');
for (const frame of list) {
  const output = path.join(out, `f${String(frame).padStart(4, '0')}.png`);
  await renderStill({ serveUrl, composition, frame, output, browserExecutable, timeoutInMilliseconds: 120000 });
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', output, '-vf', guides, output.replace('.png', '-guides.png')]);
  files.push(output);
  process.stdout.write(`${frame} `);
}
// a contact sheet, six across, a quarter size
const cols = 6;
const inputs = files.flatMap((f) => ['-i', f]);
const rows = Math.ceil(files.length / cols);
const pad = rows * cols - files.length;
const cw = 270;
const ch = Math.round((cw * HEIGHT) / WIDTH);
const scaled = files.map((_, i) => `[${i}]scale=${cw}:-1[s${i}]`).join(';');
const blanks = Array.from({ length: pad }, (_, k) => `color=c=white:s=${cw}x${ch}:d=1[b${k}]`).join(';');
const cells = [...files.map((_, i) => `[s${i}]`), ...Array.from({ length: pad }, (_, k) => `[b${k}]`)];
const rowsF = Array.from({ length: rows }, (_, r) => `${cells.slice(r * cols, r * cols + cols).join('')}hstack=${cols}[r${r}]`).join(';');
const graph = [scaled, blanks, rowsF, rows > 1 ? `${Array.from({ length: rows }, (_, r) => `[r${r}]`).join('')}vstack=${rows}` : '[r0]null'].filter(Boolean).join(';');
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', graph, '-frames:v', '1', '-q:v', '3', path.join(out, 'sheet.jpg')]);
console.log(`\n${list.length} stills (+ guides) + sheet.jpg → ${path.relative(root, out)}`);
