/**
 * A contact sheet of one composition: frames rendered as stills, tiled small.
 *   node scripts/contact-sheet.mjs <CompositionId> <out.png> <frame,frame,…> [cols]
 * One bundle, one browser, every frame (much faster than a `remotion still`
 * per frame). Review tool for the night look; nothing ships from it.
 */
import path from 'node:path';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';

const [id, out, framesArg, colsArg] = process.argv.slice(2);
const frames = framesArg.split(',').map(Number);
const cols = Number(colsArg ?? 6);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const tmp = path.join(root, 'out', 'sheet', id);
fs.mkdirSync(tmp, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.join(root, 'src', 'index.ts') });
const browserExecutable = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const composition = await selectComposition({ serveUrl, id, browserExecutable });
const files = [];
for (const f of frames) {
  const file = path.join(tmp, `${String(f).padStart(5, '0')}.png`);
  await renderStill({ serveUrl, composition, frame: Math.min(f, composition.durationInFrames - 1), output: file, browserExecutable, chromiumOptions: { gl: 'angle-egl' } });
  files.push(file);
}
// tile: each still scaled to 270 wide (9:16) or 480 wide (16:9), labelled by frame
const w = composition.width > composition.height ? 480 : 270;
const inputs = files.flatMap((f) => ['-i', f]);
const rows = Math.ceil(files.length / cols);
const filters = files.map((_, i) => `[${i}]scale=${w}:-1,drawtext=text='${frames[i]}':x=8:y=8:fontsize=20:fontcolor=white:box=1:boxcolor=black@0.6[s${i}]`);
const pad = [];
for (let i = files.length; i < rows * cols; i++) pad.push(i);
let graph = filters.join(';');
const labels = files.map((_, i) => `[s${i}]`);
if (pad.length) {
  graph += `;${labels[0]}split=${pad.length + 1}${['[s0]', ...pad.map((i) => `[p${i}]`)].join('')}`;
  pad.forEach((i) => (graph += `;[p${i}]drawbox=t=fill:c=black[s${i}]`));
}
const rowsOut = [];
for (let r = 0; r < rows; r++) {
  const cells = Array.from({ length: cols }, (_, c) => `[s${r * cols + c}]`).join('');
  graph += `;${cells}hstack=${cols}[r${r}]`;
  rowsOut.push(`[r${r}]`);
}
graph += rows > 1 ? `;${rowsOut.join('')}vstack=${rows}[out]` : `;[r0]copy[out]`;
execFileSync('ffmpeg', ['-v', 'error', '-y', ...inputs, '-filter_complex', graph, '-map', '[out]', out]);
console.log(`wrote ${out} (${files.length} frames)`);
// its own bundle only: another render may be reading from a bundle next to it
fs.rmSync(serveUrl, { recursive: true, force: true });
