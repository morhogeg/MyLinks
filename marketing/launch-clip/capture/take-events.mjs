/**
 * Where a simulator take changes: the frames to measure a timeline's marks
 * from (the share sheet settled, the tap, each step of a card, "Saved ✓").
 *
 *   node capture/take-events.mjs out/later-takes/S60.mp4 [--from f] [--to f]
 *     → a list of events (60fps frame numbers) and out/take-events/<take>/sheet.jpg
 *
 * The take is decoded small (luma, 165 wide); an EVENT starts where the
 * picture begins to change after holding still for at least 6 frames, and
 * ends where it is still again. Each event's frames before, at its start,
 * and after it settles are written to the sheet (labelled), so a mark is
 * chosen by looking, then confirmed at full size with ffmpeg.
 */
import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const file = process.argv[2];
if (!file) throw new Error('usage: node capture/take-events.mjs <take.mp4> [--from f] [--to f]');
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? Number(process.argv[i + 1]) : d;
};
const W = 165;
const [w0, h0] = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]).toString().trim().split(',').map(Number);
const H = Math.round((W * h0) / w0 / 2) * 2;
const N = W * H;
const dec = spawn('ffmpeg', ['-v', 'error', '-i', file, '-vf', `scale=${W}:${H}:flags=area,format=gray`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
const d = [0];
let prev = null;
let buf = Buffer.alloc(0);
for await (const chunk of dec.stdout) {
  buf = Buffer.concat([buf, chunk]);
  while (buf.length >= N) {
    const f = buf.subarray(0, N);
    if (prev) {
      let s = 0;
      for (let i = 0; i < N; i++) s += Math.abs(f[i] - prev[i]);
      d.push(s / N);
    }
    prev = Uint8Array.from(f);
    buf = buf.subarray(N);
  }
}
const from = arg('--from', 0);
const to = Math.min(d.length - 1, arg('--to', d.length - 1));
const STILL = 0.08;
const events = [];
let still = 0;
let open = null;
for (let f = from + 1; f <= to; f++) {
  if (d[f] > STILL) {
    if (!open && still >= 6) open = { start: f, peak: d[f] };
    if (open) open.peak = Math.max(open.peak, d[f]);
    still = 0;
  } else {
    still++;
    if (open && still >= 6) {
      events.push({ ...open, end: f - 6 });
      open = null;
    }
  }
}
if (open) events.push({ ...open, end: to });
console.log(`${d.length} frames; ${events.length} events (60fps frame numbers):`);
for (const e of events) console.log(`  ${String(e.start).padStart(6)}–${String(e.end).padEnd(6)} ${((e.end - e.start + 1) / 60).toFixed(2)}s  peak ${e.peak.toFixed(2)}`);

// the sheet: before, start and settled, for each event
const take = path.basename(file, path.extname(file));
const dir = path.join(root, 'out', 'take-events', take);
fs.rmSync(dir, { recursive: true, force: true });
fs.mkdirSync(dir, { recursive: true });
const cells = events.flatMap((e) => [
  [Math.max(0, e.start - 1), 'before'],
  [e.start, 'start'],
  [e.end + 6, 'settled'],
]);
cells.forEach(([f, what], k) => {
  execFileSync('ffmpeg', [
    '-v', 'error', '-y', '-ss', ((f - 0.25) / 60).toFixed(5), '-i', file, '-frames:v', '1',
    '-vf', `scale=264:-2,drawtext=text='${f} ${what}':x=8:y=8:fontsize=18:fontcolor=red:box=1:boxcolor=white@0.8`, path.join(dir, `${String(k).padStart(3, '0')}.png`),
  ]);
});
if (cells.length) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-framerate', '1', '-i', path.join(dir, '%03d.png'), '-vf', `tile=3x${events.length}`, '-frames:v', '1', '-q:v', '3', path.join(dir, 'sheet.jpg')]);
  console.log(`sheet: ${path.relative(root, path.join(dir, 'sheet.jpg'))} (each row: before, start, settled)`);
}
