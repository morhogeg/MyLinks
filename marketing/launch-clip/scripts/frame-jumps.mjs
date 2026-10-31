/**
 * Frame by frame, the jumps a viewer would see in one frame: the owner's
 * check before any cut is sent ("check frame by frame for single-frame
 * jumps"). For any rendered video (a master or the posting file).
 *
 *   node scripts/frame-jumps.mjs out/later/master-soon.mp4 [--from 0 --to 719]
 *
 * Each frame is decoded small (270 wide, luma) and compared with the frame
 * before it: d(f) = mean |Y(f) − Y(f−1)| in levels. Smooth motion and soft
 * dissolves spread change over many frames; a jump puts it in one. Flagged:
 *  - SPIKE: d(f) over 1.5 levels and at least 3× both frames beside it:
 *    a change that lands in one frame (a move or an exit spreads over
 *    several, however fast; measured on the reel's type: a 5-frame roll-out
 *    peaks at 4 levels with its neighbours close behind);
 *  - FLIP: frames f−1 and f+1 nearly agree while f differs from both (a
 *    one-frame flash or a frame from the wrong place);
 *  - STEP: the share of pixels changing by more than 24 levels at once over
 *    8% (a hard change of screen, the preview's round-7 measure).
 * Exits 1 if anything is flagged; prints every frame's d with --all.
 */
import { spawn } from 'node:child_process';

const file = process.argv[2];
if (!file) throw new Error('usage: node scripts/frame-jumps.mjs <video> [--from f] [--to f] [--all]');
const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 ? Number(process.argv[i + 1]) : d;
};
const W = 270;
const probe = await new Promise((res) => {
  const p = spawn('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file]);
  let s = '';
  p.stdout.on('data', (d) => (s += d));
  p.on('close', () => res(s.trim().split(',').map(Number)));
});
const H = Math.round((W * probe[1]) / probe[0] / 2) * 2;
const N = W * H;
const dec = spawn('ffmpeg', ['-v', 'error', '-i', file, '-vf', `scale=${W}:${H}:flags=area,format=gray`, '-f', 'rawvideo', '-pix_fmt', 'gray', '-']);
const frames = [];
let buf = Buffer.alloc(0);
for await (const chunk of dec.stdout) {
  buf = Buffer.concat([buf, chunk]);
  while (buf.length >= N) {
    frames.push(Uint8Array.from(buf.subarray(0, N)));
    buf = buf.subarray(N);
  }
}
const from = Math.max(1, arg('--from', 1));
const to = Math.min(frames.length - 1, arg('--to', frames.length - 1));
const diff = (a, b) => {
  let s = 0;
  let big = 0;
  for (let i = 0; i < N; i++) {
    const d = Math.abs(a[i] - b[i]);
    s += d;
    if (d > 24) big++;
  }
  return { mean: s / N, big: big / N };
};
const d = frames.map((f, i) => (i ? diff(frames[i - 1], f) : { mean: 0, big: 0 }));
const flags = [];
for (let f = from; f <= to; f++) {
  const beside = Math.max(d[f - 1]?.mean ?? 0, d[f + 1]?.mean ?? 0);
  if (d[f].mean > 1.5 && d[f].mean >= 3 * Math.max(beside, 0.1)) flags.push(`${f}: SPIKE ${d[f].mean.toFixed(2)} levels (the frames beside it ${beside.toFixed(2)})`);
  if (f + 1 < frames.length) {
    const across = diff(frames[f - 1], frames[f + 1]).mean;
    if (d[f].mean > 1.5 && across < 0.35 * d[f].mean) flags.push(`${f}: FLIP (f−1 and f+1 differ by ${across.toFixed(2)}, f by ${d[f].mean.toFixed(2)})`);
  }
  if (d[f].big > 0.08) flags.push(`${f}: STEP ${(d[f].big * 100).toFixed(1)}% of the picture changed by >24 levels at once`);
  if (process.argv.includes('--all')) console.log(`${String(f).padStart(4)} ${d[f].mean.toFixed(2).padStart(6)} ${(d[f].big * 100).toFixed(1).padStart(5)}%`);
}
const peak = d.slice(from, to + 1).reduce((a, x, i) => (x.mean > a.v ? { v: x.mean, f: from + i } : a), { v: 0, f: 0 });
console.log(`${frames.length} frames; frames ${from}–${to} checked; the largest frame-to-frame change ${peak.v.toFixed(2)} levels at ${peak.f}`);
if (flags.length) {
  console.log(flags.join('\n'));
  process.exit(1);
}
console.log('no single-frame jumps');
