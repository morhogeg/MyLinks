/**
 * Render deliverables with ONE bundle (much faster than `remotion render` per
 * composition):
 *   node scripts/render-all.mjs <CompositionId>[:file] …   → out/final/<file>.mp4
 * Uses the project's render settings (remotion.config.ts: JPEG 96, H.264
 * CRF 17, concurrency 2, the container's headless shell).
 */
import fs from 'node:fs';
import path from 'node:path';
import { bundle } from '@remotion/bundler';
import { renderMedia, selectComposition } from '@remotion/renderer';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const outDir = path.join(root, 'out', 'final');
fs.mkdirSync(outDir, { recursive: true });
const browserExecutable = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
const t0 = Date.now();
const serveUrl = await bundle({ entryPoint: path.join(root, 'src', 'index.ts') });
console.log(`bundled in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
for (const arg of process.argv.slice(2)) {
  const [id, file = id] = arg.split(':');
  const composition = await selectComposition({ serveUrl, id, browserExecutable });
  const output = path.join(outDir, `${file}.mp4`);
  const t = Date.now();
  let last = -1;
  await renderMedia({
    serveUrl,
    composition,
    codec: 'h264',
    crf: 17,
    imageFormat: 'jpeg',
    jpegQuality: 96,
    concurrency: 2,
    outputLocation: output,
    browserExecutable,
    chromiumOptions: { gl: 'angle-egl' },
    timeoutInMilliseconds: 120000,
    onProgress: ({ progress }) => {
      const p = Math.floor(progress * 10);
      if (p !== last) {
        last = p;
        console.log(`  ${id} ${p * 10}% (${((Date.now() - t) / 1000).toFixed(0)}s)`);
      }
    },
  });
  console.log(`✓ ${id} → out/final/${file}.mp4 in ${((Date.now() - t) / 60000).toFixed(1)} min (${(fs.statSync(output).size / 1e6).toFixed(1)}MB)`);
}
fs.rmSync(serveUrl, { recursive: true, force: true });
