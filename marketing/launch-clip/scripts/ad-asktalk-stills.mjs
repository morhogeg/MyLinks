/**
 * Stills of the Ask ad's "talking to a friend" edition (both shapes) for
 * review, the contact sheet and the poster.
 *
 *   node scripts/ad-asktalk-stills.mjs              # every beat, 9:16 and 4:5
 *   node scripts/ad-asktalk-stills.mjs 0 120 300    # just these frames
 *
 * Writes out/ads/asktalk/stills/{story,feed}/fNNNN.png (silent). Then
 * `python3 scripts/ad-trip-sheet.py asktalk` builds the sheets and the poster.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { HITS, TOTAL_FRAMES } from '../ads/asktalk-timeline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const BROWSER = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

export const REVIEW = [
  0, // the poster: the five piles and the hook's first sentence
  90, // "So why does most of it…": new saves slid in
  HITS.talk + 16, // the YouTube pile forward, the TED talk lit
  HITS.article + 16, // the Safari pile forward, The Tail End lit
  HITS.dotLands + 2, // the point lands
  HITS.wordmark + 18, // the mark, the wordmark
  HITS.open + 30, // the question typing
  HITS.send + 50, // its answer
  540, // the answer lifted on "one clear answer"
  HITS.ask2 + 2, // the big question typed (the cut)
  HITS.lead + 8, // the theme lifted
  HITS.chips[2] + 6, // the three saves lifted
  HITS.graphTap + 1, // the first frame of the graph (the cut)
  HITS.graphTap + 40, // the graph
  HITS.markStrike + 30, // the wordmark on "Machina"
  TOTAL_FRAMES - 1, // the last frame
];
const frames = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
const list = frames.length ? frames : REVIEW;

const serveUrl = await bundle({ entryPoint: path.join(root, 'src', 'index.ts') });
for (const [shape, id] of [
  ['story', 'MachinaAdAskTalk'],
  ['feed', 'MachinaAdAskTalkFeed'],
]) {
  const out = path.join(root, 'out', 'ads', 'asktalk', 'stills', shape);
  fs.mkdirSync(out, { recursive: true });
  const composition = await selectComposition({ serveUrl, id, inputProps: { audioFile: null }, browserExecutable: BROWSER });
  for (const frame of list) {
    await renderStill({
      serveUrl,
      composition,
      frame,
      output: path.join(out, `f${String(frame).padStart(4, '0')}.png`),
      inputProps: { audioFile: null },
      browserExecutable: BROWSER,
      chromiumOptions: { gl: 'angle-egl' },
    });
    console.log(`${shape} ${frame}`);
  }
}
