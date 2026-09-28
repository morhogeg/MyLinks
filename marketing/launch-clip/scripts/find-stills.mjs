/**
 * Stills of the FIND clip for review, and the contact sheet the owner gets.
 *
 *   node scripts/find-stills.mjs                  # the review set (every beat)
 *   node scripts/find-stills.mjs 144 320          # just these frames
 *   COMP=MachinaFindClean node scripts/find-stills.mjs
 *
 * Writes out/find-stills/fNNNN.png. Bundles once, renders every frame from it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { CAPTIONS, HITS, TOTAL_FRAMES } from '../clips/find-timeline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const out = path.join(root, 'out', 'find-stills');
fs.mkdirSync(out, { recursive: true });

const COMP = process.env.COMP ?? 'MachinaFindSilent';
const BIN = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';
// the review set, read off the timeline so it cannot go stale
const H = HITS;
const REVIEW = [
  0, CAPTIONS[0].at + 30, // the poster frame; the promise over Home
  H.fieldTap, H.type1 + 30, H.found1 - 4, // the tap, the first query typing, whole
  H.found1 + 20, H.back - 8, // the one card, with its ring; read
  H.clear + 6, H.type2 + 40, H.found2 - 4, // the delete, the second query, whole
  H.found2 + 24, H.throwOut - 8, // the one card, with its ring; read
  H.lockup, H.markStrike + 4, CAPTIONS[2].at + 40, TOTAL_FRAMES - 1, // the throw, the strike, the close, the last frame
];
const frames = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
const list = frames.length ? frames : REVIEW;

const serveUrl = await bundle({ entryPoint: path.join(root, 'src', 'index.ts') });
const composition = await selectComposition({ serveUrl, id: COMP, browserExecutable: BIN });
for (const frame of list) {
  await renderStill({
    serveUrl,
    composition,
    frame,
    output: path.join(out, `f${String(frame).padStart(4, '0')}.png`),
    browserExecutable: BIN,
    chromiumOptions: { gl: 'angle-egl' },
  });
  process.stdout.write(`${frame} `);
}
console.log(`\n${list.length} stills → ${path.relative(root, out)}`);
