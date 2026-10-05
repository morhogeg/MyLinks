/**
 * Re-write the takes data from the frames already on disk, without shooting:
 *   node scripts/write-takes.mjs
 * (src/reels/data/takes.json for the reel's and the ads' takes, and each
 * feature clip's own src/reels/clips/<clip>/takes.json). capture/shoot.mjs
 * writes the same files when it finishes; this is for using the takes shot so
 * far while a long capture is still running.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'capture');
const OUT = path.join(here, '..', 'public', 'reel', 'app');

function writeTakesData() {
  const out = {};
  for (const name of fs.readdirSync(OUT).sort()) {
    const f = path.join(OUT, name, 'manifest.json');
    if (!fs.existsSync(f)) continue;
    const m = JSON.parse(fs.readFileSync(f, 'utf8'));
    const texts = [];
    const id = new Map();
    const tid = (s) => {
      if (!id.has(s)) {
        id.set(s, texts.length);
        texts.push(s);
      }
      return id.get(s);
    };
    const r1 = (v) => Math.round(v * 2) / 2;
    out[name] = {
      dpr: m.dpr,
      fps: m.fps,
      count: m.frames.length,
      marks: m.marks,
      texts,
      frames: m.frames.map((fr) => ({
        t: fr.text.map(tid),
        r: Object.fromEntries(
          Object.entries(fr.rects)
            .filter(([, v]) => v)
            .map(([k, v]) => [k, [r1(v.x), r1(v.y), r1(v.w), r1(v.h)]]),
        ),
      })),
    };
  }
  const dest = path.join(here, '..', 'src', 'reels', 'data', 'takes.json');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, JSON.stringify(out) + '\n');
  console.log(`wrote ${path.relative(path.join(here, '..'), dest)} (${Object.keys(out).join(', ')})`);
}

function writeClipTakesData() {
  const dir = path.join(OUT, 'clips');
  if (!fs.existsSync(dir)) return;
  for (const clip of fs.readdirSync(dir).sort()) {
    const out = {};
    for (const take of fs.readdirSync(path.join(dir, clip)).sort()) {
      const f = path.join(dir, clip, take, 'manifest.json');
      if (!fs.existsSync(f)) continue;
      const m = JSON.parse(fs.readFileSync(f, 'utf8'));
      // (the same summary writeTakesData makes: texts de-duplicated, rects
      // in points rounded to half a point)
      const texts = [];
      const id = new Map();
      const tid = (s) => (id.has(s) ? id.get(s) : (id.set(s, texts.length), texts.push(s) - 1));
      const r1 = (v) => Math.round(v * 2) / 2;
      out[`clips/${clip}/${take}`] = {
        dpr: m.dpr,
        fps: m.fps,
        count: m.frames.length,
        marks: m.marks,
        texts,
        frames: m.frames.map((fr) => ({
          t: fr.text.map(tid),
          r: Object.fromEntries(
            Object.entries(fr.rects)
              .filter(([, v]) => v)
              .map(([k, v]) => [k, [r1(v.x), r1(v.y), r1(v.w), r1(v.h)]]),
          ),
        })),
      };
    }
    if (!Object.keys(out).length) continue;
    const dest = path.join(here, '..', 'src', 'reels', 'clips', clip, 'takes.json');
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, JSON.stringify(out) + '\n');
    console.log(`wrote ${path.relative(path.join(here, '..'), dest)} (${Object.keys(out).join(', ')})`);
  }
}

writeTakesData();
writeClipTakesData();
