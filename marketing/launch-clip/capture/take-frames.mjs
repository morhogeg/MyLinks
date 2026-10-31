/**
 * A video's frames from its simulator takes: every frame the edit uses, at
 * the capture's full resolution, lossless, under public/. The preview's
 * extractor (capture/preview-frames.mjs) made generic: a video names its
 * timeline, which exports TAKES, frameFile and usedFrames.
 *
 *   node capture/take-frames.mjs later     →  the frames clips/later-timeline.mjs uses
 *
 * Writes only frames not already written (W and X share the preview's cache:
 * the same takes). Lossless RGB decoded as the takes are tagged (BT.709,
 * video range): the app's white is 253 and its page 249/249/251, as kit
 * TOKENS.captureWhite and .capturePage say. (JPEG brightened every pixel by
 * ~2 levels: a painted-out detail showed as a faint square.)
 *
 * A frame is pulled by seeking to a quarter frame before it: the masters are
 * 60fps CFR from 0, so the first frame at or after that time is the frame
 * itself (checked: a take's start time must be 0). Each run of consecutive
 * frames is one ffmpeg call. A take is made the preview's way: `xcrun simctl
 * io <device> recordVideo --codec=h264 S.mp4` on the iPhone 17 Pro Max
 * simulator, then `ffmpeg -i S.mp4 -vf fps=60 -crf 8 S60.mp4` (the recorder
 * writes a frame only on change; fps=60 repeats the still ones).
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[2];
if (!name) throw new Error('usage: node capture/take-frames.mjs <video> (its timeline is clips/<video>-timeline.mjs)');
const { TAKES, frameFile, usedFrames } = await import(path.join(root, 'clips', `${name}-timeline.mjs`));
const FPS = 60;

/** consecutive runs of a sorted list */
const runs = (list) => {
  const out = [];
  for (const n of list) {
    const last = out.at(-1);
    if (last && n === last[1] + 1) last[1] = n;
    else out.push([n, n]);
  }
  return out;
};

const used = usedFrames();
let wrote = 0;
for (const [take, list] of Object.entries(used)) {
  const src = path.join(root, TAKES[take]);
  if (!fs.existsSync(src)) throw new Error(`no take ${src} (see this script's header)`);
  const start = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=start_time', '-of', 'csv=p=0', src]).toString().trim();
  if (Number(start) !== 0) throw new Error(`${take} starts at ${start}s, not 0: a seek by frame number would land off`);
  const dir = path.join(root, 'public', path.dirname(frameFile(take, 0)));
  fs.mkdirSync(dir, { recursive: true });
  for (const [a, b] of runs(list)) {
    const todo = Array.from({ length: b - a + 1 }, (_, j) => a + j).filter((n) => !fs.existsSync(path.join(root, 'public', frameFile(take, n))));
    if (!todo.length) continue;
    const tmp = path.join(dir, `.run-${a}`);
    fs.mkdirSync(tmp, { recursive: true });
    execFileSync('ffmpeg', [
      '-v', 'error', '-y', '-ss', ((a - 0.25) / FPS).toFixed(5), '-i', src,
      '-frames:v', String(b - a + 1), '-pix_fmt', 'rgb24', '-start_number', String(a),
      path.join(tmp, '%05d.png'),
    ]);
    for (let n = a; n <= b; n++) {
      const to = path.join(root, 'public', frameFile(take, n));
      if (!fs.existsSync(to)) fs.renameSync(path.join(tmp, `${String(n).padStart(5, '0')}.png`), to);
      wrote++;
    }
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`${take}: ${list.length} frames in ${runs(list).length} runs`);
}
console.log(`wrote ${wrote} frames`);
