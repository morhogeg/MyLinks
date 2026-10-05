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
  0, 60, 90, H.fieldTap + 6, // the poster, the hook's scroll, the problem, the tap
  H.type1 + 40, H.found1 + 38, // 1. your own words: typing, the one card
  H.type2 + 32, H.found2 + 32, // 2. close matches
  H.chipTap - 18, H.chipTap + 44, // 3. the source offered, every video
  H.cardTap + 24, H.cardTap + 84, CAPTIONS[5].at + 42, // 4. opened, related saves; the takeaway
  H.markStrike + 18, CAPTIONS[6].at + 52, TOTAL_FRAMES - 1, // the strike, the close, the last frame
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
