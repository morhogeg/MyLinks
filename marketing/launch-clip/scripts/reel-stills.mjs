/**
 * Stills of the reel for review, and the contact sheet the owner gets.
 *
 *   node scripts/reel-stills.mjs                  # the review set (every beat)
 *   node scripts/reel-stills.mjs 44 132 300       # just these frames
 *   COMP=MachinaReelClean node scripts/reel-stills.mjs
 *
 * Writes out/reel-stills/fNNNN.png. Bundles once, renders every frame from it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { HITS, MODES, SHARE_BEAT, SHARE_STARTS, TODO_LEN, TOTAL_FRAMES, holdStart, real } from '../reel-timeline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const out = path.join(root, 'out', 'reel-stills');
fs.mkdirSync(out, { recursive: true });

const COMP = process.env.COMP ?? 'MachinaReelSilent';
// the review set: the reel's key moments, read off the timeline so the list
// cannot go stale when the cut moves (round 13; the old list was frame
// numbers from the 20s cut)
const H = holdStart;
const REVIEW = [
  0, 40, // frame 0 (the poster a feed shows), the saves coming into focus
  H('problem') + 60, H('problem') + 150, H('problem') + 210, // the named saves, then bleached
  real(HITS.collapse) + 8, real(HITS.bracketsClose), real(HITS.markLocked) + 30, // the collapse, the mark, the name
  H('name') + 20, ...SHARE_STARTS.map((t) => H('share') + t + SHARE_BEAT.tap), // "All your saves…", the three shares
  real(HITS.toApp) + 8, real(HITS.dialog) + 10, // the point becomes the +, Add to Machina
  H('modes') + MODES.taps[0] + 12, H('modes') + MODES.taps[1] + 12, H('modes') + MODES.paste + 8, // Image, Note, the link
  real(HITS.phases[2]), real(HITS.saved) + 4, real(HITS.cardLands) + 4, // the phases, saved, the card lands
  H('card') + 60, H('card') + 150, // the card opened, its Key Points
  real(HITS.typeFrom) + 20, real(HITS.found) + 8, // Find
  real(HITS.askTypeFrom) + 40, real(HITS.answerFrom) + 30, real(HITS.chips[2]) + 10, // Ask
  real(HITS.graph) + 30, H('graph') + 20, // Connect
  H('recall') + 60, H('recall') + TODO_LEN + 60, H('recall') + TODO_LEN + 150, H('recall') + TODO_LEN + 230, H('recall') + TODO_LEN + 270, // Revisit
  real(HITS.markStrike) + 10, TOTAL_FRAMES - 1, // the lockup, the last frame
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
  const file = path.join(out, `f${String(frame).padStart(4, '0')}.png`);
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
