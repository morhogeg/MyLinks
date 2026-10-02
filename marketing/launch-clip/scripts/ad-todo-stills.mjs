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
  0, HITS.drops[0] + 4, HITS.drops[2] + 10, HITS.bleach + 14, // the poster, a screenshot landing, the pile, sunk grey
  HITS.snap + 2, HITS.iris[0] + 8, // the mark, the point opening onto Home
  HITS.dialog + 8, HITS.imageTap + 6, HITS.pick + 8, // the dialog, Image, the slides
  HITS.saveTap + 16, HITS.cardDone + 8, // "Reading 3 screenshots…", the card
  HITS.cardTap + 12, HITS.keyPoints + 12, // opened, the Key Points
  HITS.cardTodo + 12, HITS.revisit - 1, HITS.revisit, HITS.revisit + 24, // the step lifts, THE MATCH CUT, the list
  HITS.tick + 10, HITS.tick + 40, HITS.tick + 66, // the ring fills, struck, folded + toast
  HITS.out + 12, HITS.markStrike + 30, TOTAL_FRAMES - 1, // thrown, "Download Machina.", the tagline held
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
