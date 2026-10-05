/**
 * Stills of Meta ad 3 (TODO) for review: every beat, in both shapes.
 *
 *   node scripts/ad-todo-stills.mjs              # the review set, tall + feed
 *   node scripts/ad-todo-stills.mjs 0 300 560    # just these frames
 *
 * Writes out/ad-todo-stills/{tall,feed}/fNNNN.png (the Silent compositions:
 * same picture as the cuts). `python3 scripts/ad-todo-sheet.py` then draws the
 * contact sheet, the safe-zone check and the 1080 × 1080 poster.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { HITS, TOTAL_FRAMES } from '../clips/ad-todo-timeline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const BROWSER = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

/** the review set, read off the timeline so it cannot go stale */
export const REVIEW = [
  0, HITS.stir + 8, HITS.grey + 24, // the poster, the ripple, greyed on "never"
  ...HITS.named.map((n) => n + 14), // each save lit as it is named
  HITS.bury[0] + 30, HITS.gather[1] - 4, HITS.snap + 6, HITS.iris[0] + 8, // buried, the gather, the mark, the iris
  ...HITS.lands.map((l) => l + 12), // each save landed
  HITS.glide[0] + 30, HITS.glide[1] - 8, // the glide down the summarized feed
  HITS.kpOpen + 2, HITS.kpOpen + 20, HITS.keyPoints + 14, HITS.cluster - 6, // tapped open, opened, Key Points lifted
  HITS.cluster + 4, HITS.cluster + 40, HITS.cluster2 + 30, HITS.out - 4, // both clusters
  HITS.out + 12, HITS.markStrike + 30, TOTAL_FRAMES - 1, // thrown, the name, the tagline held
];
const args = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
const list = args.length ? args : REVIEW;

const serveUrl = await bundle({ entryPoint: path.join(root, 'src', 'index.ts') });
for (const [shape, id] of [['tall', 'MachinaAdTodoSilent'], ['feed', 'MachinaAdTodoFeedSilent']]) {
  const out = path.join(root, 'out', 'ad-todo-stills', shape);
  fs.mkdirSync(out, { recursive: true });
  const composition = await selectComposition({ serveUrl, id, browserExecutable: BROWSER });
  for (const frame of list) {
    const file = path.join(out, `f${String(frame).padStart(4, '0')}.png`);
    await renderStill({ serveUrl, composition, frame, output: file, browserExecutable: BROWSER, chromiumOptions: { gl: 'angle-egl' } });
    console.log(shape, frame);
  }
}
