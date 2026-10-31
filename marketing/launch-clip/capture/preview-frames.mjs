/**
 * The App Preview's frames: every frame of the simulator takes the picture
 * uses, at the capture's full resolution, as JPEGs under public/.
 *
 *   node capture/preview-frames.mjs     →  public/clips/preview/frames/<take>/<frame>.png
 *
 * The edit lives in clips/preview-timeline.mjs (SCREEN_RUNS, DIALOG_RUNS:
 * which 60fps frame of which take is on screen at each output frame); this
 * script asks it for the set of frames and writes only those, skipping any
 * already written. Full resolution (1320 × 2868, 3px a point) so the camera
 * can frame up to z 3 without upscaling anything, and lossless RGB decoded
 * as the take is tagged (BT.709, video range): the app's white is 253 and
 * its page 249/249/251, as kit TOKENS.captureWhite and .capturePage say.
 * (JPEG, tried first, brightened every pixel by ~2 levels: the painted-out
 * favicon showed as a faint square.)
 *
 * The takes are 60fps CFR masters of the simulator's own recordings, not in
 * git (out/preview-takes/): `xcrun simctl io <device> recordVideo
 * --codec=h264` on the iPhone 17 Pro Max simulator (1320 × 2868), signed into
 * the review account, made CFR with `ffmpeg -i W.mp4 -vf fps=60 -crf 8
 * W60.mp4` (the recorder writes a frame only on change; fps=60 repeats the
 * still ones).
 *   W60  round 5: the feed opening on Kurzgesagt and TED (the Manson test
 *        cards archived), + -> a Wait But Why article's link -> Save -> the
 *        analysis stepper -> the card on the feed -> Revisit
 *   X60  round 5: Ask: "Briefly, how is procrastination linked to phone
 *        addiction?" -> an answer citing three saves from three channels ->
 *        its Graph chip -> the three cited cards, linked
 *
 * A frame is pulled by seeking to a quarter frame before it: the masters
 * start at 0 with every frame exactly 1/60s apart, so the first frame at or
 * after that time is the frame itself (checked: the takes' start times must
 * be 0). Each run of consecutive frames is one ffmpeg call.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TAKES, frameFile, usedFrames } from '../clips/preview-timeline.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
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
