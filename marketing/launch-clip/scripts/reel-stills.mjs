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
  6, 20, 36, 46, 52, 60, 76, 100, 116, 124, // hook
  130, 138, 150, 170, 186, 194, 200, // save
  210, 226, 244, 258, 268, // find
  276, 290, 312, 322, 334, 348, 360, 372, 392, 402, // ask
  408, 420, 440, 460, // connect
  466, 474, 482, 488, 500, // revisit
  516, 532, 546, 566, 599, // lockup
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
