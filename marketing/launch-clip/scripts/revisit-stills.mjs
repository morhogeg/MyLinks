/**
 * Stills of TICK IT OFF for review.
 *
 *   node scripts/revisit-stills.mjs            # the review set (every beat)
 *   node scripts/revisit-stills.mjs 0 90 570   # just these frames
 *
 * Writes out/revisit-stills/fNNNN.png. Bundles once, renders every frame.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { HITS, TOTAL_FRAMES } from '../clips/revisit-timeline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const out = path.join(root, 'out', 'revisit-stills');
fs.mkdirSync(out, { recursive: true });
const BROWSER = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

const H = HITS;
const REVIEW = [
  0, 40, H.hookOut + 4, H.step1 + 6, H.step2 + 6, H.step3 + 8, H.spin + 30, H.spin + 60, H.stop - 6, H.stop + 4, H.stop + 30,
  H.tear + 4, H.tear + 9, H.card + 6, H.land + 2, H.land + 8, H.pick + 8, H.fly + 10, H.rewrite, H.rewrite + 8, H.rewrite + 20,
  H.push2 + 34, H.tick - 10, H.tick + 4, H.tick + 16, H.tick + 34, H.tick + 60, H.allDone + 4, H.weekTap - 10, H.weekTap + 4,
  H.weekTap + 10, H.weekRead, H.underline + 16, H.lockup - 6, H.lockup + 20, H.lockup + 60, H.loopLead, TOTAL_FRAMES - 1,
];
const frames = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
const list = frames.length ? frames : REVIEW;

const serveUrl = await bundle({ entryPoint: path.join(root, 'src', 'index.ts') });
const composition = await selectComposition({ serveUrl, id: process.env.COMP ?? 'MachinaRevisitSilent', browserExecutable: BROWSER });
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
