/**
 * LATER NEVER COMES: the posting files and the review copy, from the
 * shutter masters (scripts/shutter-render.mjs later [--ending store]) and the
 * mix (public/clips/later/score-vo.wav), then the frame-by-frame check on
 * each posting file (scripts/frame-jumps.mjs).
 *
 *   node scripts/later-encode.mjs
 *     → out/later/Machina-Later-Reel.mp4          today's footer ("Coming soon")
 *     → out/later/Machina-Later-Reel-store.mp4    launch day's ("Now on the App Store"), if its master exists
 *     → out/later/Machina-Later-review-copy.mp4   a small copy for phones, never the upload
 *
 * The posting file is what the feeds want: 1080 × 1920, 30fps, H.264 High
 * 4.1, yuv420p, BT.709 video range tagged (the masters are BT.709 end to
 * end, so nothing is converted), AAC 320k 48kHz stereo, faststart.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'out', 'later');
const mix = path.join(root, 'public', 'clips', 'later', 'score-vo.wav');
const COLOUR = ['-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-color_range', 'tv'];
const posting = (master, dest) =>
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-i', master, '-i', mix, '-map', '0:v', '-map', '1:a',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '15', '-profile:v', 'high', '-level:v', '4.1', '-pix_fmt', 'yuv420p', ...COLOUR,
    '-c:a', 'aac', '-b:a', '320k', '-ar', '48000', '-ac', '2', '-shortest', '-movflags', '+faststart', dest,
  ]);

const made = [];
for (const [ending, name] of [['soon', 'Machina-Later-Reel.mp4'], ['store', 'Machina-Later-Reel-store.mp4']]) {
  const master = path.join(out, `master-${ending}.mp4`);
  if (!fs.existsSync(master)) {
    console.log(`(no ${path.relative(root, master)}: run scripts/shutter-render.mjs later${ending === 'soon' ? '' : ' --ending store'})`);
    continue;
  }
  const dest = path.join(out, name);
  posting(master, dest);
  made.push(dest);
  console.log(`posting file: ${path.relative(root, dest)} (${(fs.statSync(dest).size / 1e6).toFixed(1)}MB)`);
}
if (!made.length) process.exit(1);

// the review copy, from today's posting file: phone-sized and small
const review = path.join(out, 'Machina-Later-review-copy.mp4');
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
