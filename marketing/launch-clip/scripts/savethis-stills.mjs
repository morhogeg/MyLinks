/**
 * Stills of SAVE THIS for review.
 *
 *   node scripts/savethis-stills.mjs            # the review set (every beat)
 *   node scripts/savethis-stills.mjs 0 90 643   # just these frames
 *
 * Writes out/savethis-stills/fNNNN.png. Bundles once, renders every frame.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { HITS, TOTAL_FRAMES } from '../clips/savethis-timeline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const out = path.join(root, 'out', 'savethis-stills');
fs.mkdirSync(out, { recursive: true });
const BROWSER = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

const H = HITS;
const REVIEW = [
  0, H.tapSave + 4, H.drop + 6, H.drop + 20, H.land, H.land + 24, H.gather + 16, H.markStrike + 2,
  H.iris + 6, H.phase0 + 20, H.done + 4, H.done + 30, H.graph + 2, H.graph + 20, H.graph + 45, H.graph + 75,
  H.knows - 2, H.knows + 4, H.knows + 16, H.knows + 40, H.asked - 1, H.asked + 1, H.asked + 4, H.asked + 30,
  H.proof + 3, H.proof + 10, H.proof + 18, H.proof + 30, H.tagline - 4, H.tagline + 14, H.tagline + 40, H.watch - 2, H.watch + 30, TOTAL_FRAMES - 1,
];
const frames = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
const list = frames.length ? frames : REVIEW;

const serveUrl = await bundle({ entryPoint: path.join(root, 'src', 'index.ts') });
const composition = await selectComposition({ serveUrl, id: process.env.COMP ?? 'MachinaSaveThisSilent', browserExecutable: BROWSER });
for (const frame of list) {
  await renderStill({
    serveUrl,
    composition,
    frame,
    output: path.join(out, `f${String(frame).padStart(4, '0')}.png`),
    browserExecutable: BROWSER,
    chromiumOptions: { gl: 'angle-egl' },
  });
  process.stdout.write(`${frame} `);
}
console.log(`\n${list.length} stills → ${path.relative(root, out)}`);
