/**
 * Stills of the trip ad (both shapes) for review, the contact sheet and the
 * poster.
 *
 *   node scripts/ad-trip-stills.mjs              # every beat, 9:16 and 4:5
 *   node scripts/ad-trip-stills.mjs 0 120 300    # just these frames
 *
 * Writes out/ads/trip/stills/{story,feed}/fNNNN.png (silent: no audio needed).
 * Then `python3 scripts/ad-trip-sheet.py` builds the contact sheets and the
 * 1080 × 1080 poster.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { CAPTIONS, HITS, TOTAL_FRAMES } from '../ads/trip-timeline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const BROWSER = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

// every beat, read off the timeline so the list cannot go stale
export const REVIEW = [
  0, // the poster: the five piles and the hook line
  CAPTIONS[1].at + 30, // "…scattered across five apps": the piles drifting
  HITS.collapse + 8, // the gather
  HITS.bracketsClose + 30, // the mark, the wordmark, "Machina keeps it all in one place."
  HITS.open - 4, // the mark shrunk onto the app's (the frame before the cut)
  HITS.open + 1, // the first frame after the match cut
  HITS.typeFrom - 2, // Ask's promise
  HITS.send - 4, // the question typed
  HITS.sources - 4, // the answer, streamed
  HITS.chips[2] + 6, // the three sources lifted
  HITS.citeTap + 1, // the tap: the card opening
  HITS.summary + 24, // the card's summary lifted
  HITS.markStrike + 10, // the lockup
  TOTAL_FRAMES - 1, // the last frame
];
const frames = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
const list = frames.length ? frames : REVIEW;

const serveUrl = await bundle({ entryPoint: path.join(root, 'src', 'index.ts') });
for (const [shape, id] of [
  ['story', 'MachinaAdTrip'],
  ['feed', 'MachinaAdTripFeed'],
]) {
  const out = path.join(root, 'out', 'ads', 'trip', 'stills', shape);
  fs.mkdirSync(out, { recursive: true });
  const composition = await selectComposition({ serveUrl, id, inputProps: { audioFile: null }, browserExecutable: BROWSER });
  for (const frame of list) {
    const file = path.join(out, `f${String(frame).padStart(4, '0')}.png`);
    await renderStill({
      serveUrl,
      composition,
      frame,
      output: file,
      inputProps: { audioFile: null },
      browserExecutable: BROWSER,
      chromiumOptions: { gl: 'angle-egl' },
    });
    console.log(`${shape} ${frame}`);
  }
}
