/**
 * SAME SCREENSHOTS: the posting files and the review copy, from the rendered
 * ranges (out/shots/seg-{a,b,c,d}.mp4, MachinaShotsSilent) and the mix
 * (public/clips/shots/score-vo.wav), then the frame-by-frame check on each
 * posting file (scripts/frame-jumps.mjs).
 *
 *   HS=…/chrome-headless-shell
 *   for r in a:0-187 b:188-375 c:376-562 d:563-749; do
 *     npx remotion render out/shots/bundle MachinaShotsSilent out/shots/seg-${r%%:*}.mp4 \
 *       --frames=${r#*:} --concurrency=1 --muted --crf=14 --browser-executable=$HS &
 *   done; wait
 *   # launch day: only the Signature's frames, with the store footer
 *   npx remotion render out/shots/bundle MachinaShotsStore out/shots/tail-store.mp4 --frames=600-749 --concurrency=1 --muted --crf=14 --browser-executable=$HS
 *   node scripts/shots-encode.mjs
 *     → out/shots/Machina-Same-Screenshots-Reel.mp4         today's footer ("Coming soon")
 *     → out/shots/Machina-Same-Screenshots-Reel-store.mp4   launch day's, if tail-store.mp4 exists
 *     → out/shots/Machina-Same-Screenshots-review-copy.mp4  a small copy for phones, never the upload
 *
 * The posting file is what the feeds want: 1080 × 1920, 30fps, H.264 High
 * 4.1, yuv420p, BT.709 video range (Remotion's JPEG frames are full-range
 * BT.601: converted here, FIND THE BOOK's recipe), AAC 320k 48kHz stereo,
 * faststart.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SIGNATURE_AT } from '../clips/shots-timeline.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'out', 'shots');
const mix = path.join(root, 'public', 'clips', 'shots', 'score-vo.wav');
const SEGS = ['a', 'b', 'c', 'd'].map((s) => path.join(out, `seg-${s}.mp4`));
const missing = SEGS.filter((s) => !fs.existsSync(s));
if (missing.length) {
  console.log(`(missing ${missing.map((m) => path.relative(root, m)).join(', ')}: render the ranges first)`);
  process.exit(1);
}
// join the ranges losslessly (same encoder settings, so a stream copy)
const list = path.join(out, 'concat.txt');
fs.writeFileSync(list, SEGS.map((s) => `file '${s}'`).join('\n') + '\n');
const joined = path.join(out, 'joined.mp4');
execFileSync('ffmpeg', ['-v', 'error', '-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);

const RANGE = 'scale=in_range=full:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p';
const COLOUR = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv'];
const ENCODE = ['-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-profile:v', 'high', '-level:v', '4.1', ...COLOUR, '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2', '-shortest', '-movflags', '+faststart'];
/** today's picture; or, with a tail, today's frames up to the Signature and the tail's from it, in one encode */
const posting = (tail, dest) =>
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-i', joined, ...(tail ? ['-i', tail] : []), '-i', mix,
    ...(tail
      ? ['-filter_complex', `[0:v]trim=end_frame=${SIGNATURE_AT},setpts=PTS-STARTPTS[a];[1:v]setpts=PTS-STARTPTS[b];[a][b]concat=n=2:v=1:a=0,${RANGE}[v]`, '-map', '[v]', '-map', '2:a']
      : ['-vf', RANGE, '-map', '0:v', '-map', '1:a']),
    ...ENCODE, dest,
  ]);

const made = [];
for (const [tailName, name] of [[null, 'Machina-Same-Screenshots-Reel.mp4'], ['tail-store.mp4', 'Machina-Same-Screenshots-Reel-store.mp4']]) {
  const tail = tailName ? path.join(out, tailName) : null;
  if (tail && !fs.existsSync(tail)) {
    console.log(`(no ${path.relative(root, tail)}: render MachinaShotsStore --frames=${SIGNATURE_AT}-${SIGNATURE_AT + 149} for launch day)`);
    continue;
  }
  const dest = path.join(out, name);
  posting(tail, dest);
  made.push(dest);
  console.log(`posting file: ${path.relative(root, dest)} (${(fs.statSync(dest).size / 1e6).toFixed(1)}MB)`);
}

// the review copy, from today's posting file: phone-sized and small
const review = path.join(out, 'Machina-Same-Screenshots-review-copy.mp4');
execFileSync('ffmpeg', [
  '-v', 'error', '-y', '-i', made[0], '-vf', 'scale=720:1280:flags=lanczos', '-c:v', 'libx264', '-preset', 'slow', '-crf', '21',
  '-profile:v', 'high', '-pix_fmt', 'yuv420p', ...COLOUR, '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', review,
]);
console.log(`review copy: ${path.relative(root, review)} (${(fs.statSync(review).size / 1e6).toFixed(1)}MB)`);

// frame by frame, every posting file
let jumps = 0;
for (const file of made) {
  try {
    console.log(execFileSync('node', [path.join(root, 'scripts', 'frame-jumps.mjs'), file]).toString().trim());
  } catch (e) {
    jumps++;
    console.log(e.stdout?.toString().trim());
  }
}
process.exit(jumps ? 1 : 0);
