/**
 * Stills of the reel for review, and the contact sheet the owner gets.
 *
 *   node scripts/reel-stills.mjs                  # the review set (every beat)
 *   node scripts/reel-stills.mjs 44 132 300       # just these frames
 *   COMP=MachinaReelClean node scripts/reel-stills.mjs
 *
 * Writes out/reel-stills/fNNN.png. Bundles once, renders every frame from it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const out = path.join(root, 'out', 'reel-stills');
fs.mkdirSync(out, { recursive: true });

const COMP = process.env.COMP ?? 'MachinaReelSilent';
const REVIEW = [
  20, 50, 80, 96, 120, 160, 196, 208, // hook
  220, 236, 250, 280, 310, 330, 345, 362, 376, 392, 420, 450, // save + the card
  468, 476, 500, 530, 560, 590, 604, // find
  614, 636, 660, 700, 730, 756, 772, 790, 812, 826, // ask
  836, 860, 900, 924, // connect
  932, 950, 970, 1010, 1050, 1075, 1095, 1130, 1160, 1175, 1188, // recall
  1200, 1230, 1279, // lockup
];
const frames = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
const list = frames.length ? frames : REVIEW;

const serveUrl = await bundle({ entryPoint: path.join(root, 'src', 'index.ts') });
const composition = await selectComposition({
  serveUrl,
  id: COMP,
  browserExecutable: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
});
for (const frame of list) {
  const file = path.join(out, `f${String(frame).padStart(3, '0')}.png`);
  await renderStill({
    serveUrl,
    composition,
    frame,
    output: file,
    browserExecutable: '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell',
    chromiumOptions: { gl: 'angle-egl' },
  });
  process.stdout.write(`${frame} `);
}
console.log(`\n${list.length} stills → ${path.relative(root, out)}`);
