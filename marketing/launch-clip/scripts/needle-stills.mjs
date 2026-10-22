/**
 * Stills of FIND THE BOOK for review.
 *
 *   node scripts/needle-stills.mjs            # the review set (every beat)
 *   node scripts/needle-stills.mjs 0 90 570   # just these frames
 *
 * Writes out/needle-stills/fNNNN.png. Bundles once, renders every frame.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { HITS, TOTAL_FRAMES } from '../clips/needle-timeline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const out = path.join(root, 'out', 'needle-stills');
fs.mkdirSync(out, { recursive: true });
const BROWSER = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

const H = HITS;
const REVIEW = [
  0, 30, H.push + 20, H.beach + 10, H.beach + 30, 196, H.talk + 15, 242, H.coffee + 20, 294, H.giveUp + 4, H.gather + 12,
  H.markStrike - 4, H.markStrike + 3, H.ask, H.ask + 8, H.ask + 26, H.typing + 20, H.tap, H.send + 4, H.send + 30,
  H.brake + 30, H.found - 10, H.found + 8, H.dive + 10, H.answer, H.answer + 10, H.answer + 30, H.ping + 4,
  H.lockup + 6, H.lockup + 40, H.lockup + 90, H.ps + 10, H.burst + 8, H.burst + 25, TOTAL_FRAMES - 1,
];
const frames = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
const list = frames.length ? frames : REVIEW;

const serveUrl = await bundle({ entryPoint: path.join(root, 'src', 'index.ts') });
const composition = await selectComposition({ serveUrl, id: process.env.COMP ?? 'MachinaNeedleSilent', browserExecutable: BROWSER });
for (const frame of list) {
  const t0 = Date.now();
  await renderStill({
    serveUrl,
    composition,
    frame,
    output: path.join(out, `f${String(frame).padStart(4, '0')}.png`),
    browserExecutable: BROWSER,
    chromiumOptions: { gl: 'angle-egl' },
    timeoutInMilliseconds: 120000,
  });
  process.stdout.write(`${frame}(${((Date.now() - t0) / 1000).toFixed(1)}s) `);
}
console.log(`\n${list.length} stills → ${path.relative(root, out)}`);
