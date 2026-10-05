/**
 * Stills of Meta ad 1 ("What one save becomes") for review, its contact sheet
 * and its poster.
 *
 *   node scripts/ad-card-stills.mjs                # every beat, 9:16 and 4:5, + contact sheets + poster
 *   node scripts/ad-card-stills.mjs 0 120 260      # just these frames (both shapes)
 *
 * Writes out/ads/card/stills/{tall,feed}-fNNNN.png, the contact sheets
 * out/ads/card/contact-{tall,feed}.png (every beat, the 9:16 sheet with the
 * Meta safe zones drawn as guides) and the 1080×1080 poster
 * out/ads/card/machina-ad-card-poster.png (frame 0 of the square framing).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { HITS, TOTAL_FRAMES } from '../ads/card-timeline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(here, '..');
const outDir = path.join(root, 'out', 'ads', 'card');
const stills = path.join(outDir, 'stills');
fs.mkdirSync(stills, { recursive: true });
const BROWSER = '/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell';

// every beat, read off the timeline
const REVIEW = [
  0, 60, HITS.lost + 24, // the poster; a new save in each list; "never open again"
  HITS.article + 30, HITS.thread + 30, HITS.screenshot + 40, // the article, the thread, the screenshot
  HITS.collapse + 8, HITS.bracketsClose + 30, // the gather, the mark and the name
  ...HITS.shareTaps, // the three shares
  HITS.toApp + 20, HITS.cardTap + 30, // the app opens; the article opened, its gist
  HITS.keyPoints + 14, HITS.related + 16, HITS.graphTap + 30, // the Key Points; the Related cards; the graph
  HITS.smart + 8, HITS.saveTap, HITS.due + 2, HITS.dueLift + 16, // Smart review; Save; tomorrow; Reminders due
  HITS.throw + 14, HITS.markStrike + 10, TOTAL_FRAMES - 30, TOTAL_FRAMES - 1, // the throw, the lockup, the tagline held
];
const args = process.argv.slice(2).map(Number).filter((n) => !Number.isNaN(n));
const list = args.length ? args : REVIEW;

const serveUrl = await bundle({ entryPoint: path.join(root, 'src', 'index.ts') });
const shot = async (id, frame, file) => {
  const composition = await selectComposition({ serveUrl, id, browserExecutable: BROWSER });
  await renderStill({ serveUrl, composition, frame, output: file, browserExecutable: BROWSER, chromiumOptions: { gl: 'angle-egl' } });
};
for (const [shape, id] of [['tall', 'MachinaAdCardSilent'], ['feed', 'MachinaAdCardFeedSilent']]) {
  for (const frame of list) {
    const file = path.join(stills, `${shape}-f${String(frame).padStart(4, '0')}.png`);
    await shot(id, frame, file);
    console.log(`✓ ${path.relative(root, file)}`);
  }
}
if (args.length) process.exit(0);

await shot('MachinaAdCardPoster', 0, path.join(outDir, 'machina-ad-card-poster.png'));
console.log('✓ out/ads/card/machina-ad-card-poster.png');

// contact sheets: every beat in order, frame numbers burned in; the 9:16 one
// with Meta's safe zones as guides (top 270px, bottom 670px, 65px sides)
const sheet = (shape, w, h, guides) => {
  const inputs = list.flatMap((fr) => ['-i', path.join(stills, `${shape}-f${String(fr).padStart(4, '0')}.png`)]);
  const cols = 6;
  const tw = 360;
  const th = Math.round((h / w) * tw);
  const cells = list.map((fr, k) => {
    const g = guides
      ? `,drawbox=x=0:y=0:w=${tw}:h=${Math.round((270 / h) * th)}:color=red@0.18:t=fill,drawbox=x=0:y=${Math.round(((h - 670) / h) * th)}:w=${tw}:h=${th}:color=red@0.18:t=fill,drawbox=x=${Math.round((65 / w) * tw)}:y=0:w=${tw - 2 * Math.round((65 / w) * tw)}:h=${th}:color=red@0.5:t=1`
      : '';
    return `[${k}]scale=${tw}:${th}${g},drawtext=text='${list[k]}':x=8:y=8:fontsize=22:fontcolor=white:box=1:boxcolor=black@0.55:boxborderw=4[c${k}]`;
  });
  const rows = Math.ceil(list.length / cols);
  const pads = [];
  for (let k = list.length; k < rows * cols; k++) pads.push(`color=c=white:s=${tw}x${th}:d=1[c${k}]`);
  const layout = Array.from({ length: rows * cols }, (_, k) => `${(k % cols) * tw}_${Math.floor(k / cols) * th}`).join('|');
  const graph = [...cells, ...pads, `${Array.from({ length: rows * cols }, (_, k) => `[c${k}]`).join('')}xstack=inputs=${rows * cols}:layout=${layout}:fill=white`].join(';');
  const file = path.join(outDir, `contact-${shape}.png`);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', ...inputs, '-filter_complex', graph, '-frames:v', '1', file]);
  console.log(`✓ ${path.relative(root, file)}`);
};
sheet('tall', 1080, 1920, true);
sheet('feed', 1080, 1350, false);
