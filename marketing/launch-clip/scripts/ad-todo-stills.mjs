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
  0, 60, // the poster (frame 0), the pile under the hook
  HITS.gather[1] + 2, HITS.snap + 12, // the point, the mark
  HITS.iris[1] + 4, HITS.dialog + 18, HITS.pick + 22, HITS.saveTap - 2, // the +, the dialog, Image, the slides, Save
  HITS.saveTap + 30, HITS.cardDone + 30, // "Reading 3 screenshots…", the card
  HITS.cardTap + 32, HITS.keyPoints + 14, HITS.cardTodo + 16, // opened, the Key Points, the card's own "Do this"
  HITS.revisit + 40, HITS.todoLift + 10, // "Do this", the task lifts
  HITS.tick + 10, HITS.tick + 34, HITS.tick + 76, // the ring fills, struck, folded + toast
  HITS.out + 12, HITS.markStrike + 60, TOTAL_FRAMES - 1, // thrown, the name, the tagline held
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
