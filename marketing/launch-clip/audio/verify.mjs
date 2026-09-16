/**
 * Pre-render checks that catch the things a still review cannot.
 *
 *   node audio/verify.mjs
 *
 * 1. CAPTION OVERLAPS. Two lines on screen at once is the one thing the subtitle
 *    track must never do — the component renders every cue whose window contains
 *    the frame, so a 0.2-bar overlap silently stacks two lines in the same place.
 *    (This is not hypothetical: cue 3 ran 0.2 bars into cue 4 and it took a
 *    by-hand audit to notice.)
 * 0. EM DASHES. The app bans them from every string a user can see
 *    (web/scripts/check-em-dash.mjs, a build gate since 2026-08-27). Burned-in
 *    captions and the endcard are user-facing copy, so the film has the same
 *    gate: every SUBTITLES text, plus every non-comment line of src/. A
 *    legitimate non-copy use is exempted with `emdash-ok` on the line.
 * 2. SCORE DYNAMICS. There is no audio device in the render environment, so the
 *    mix is verified numerically: per-bar RMS and peak, DC offset, and a
 *    near-clip count. What to look for — a quiet cold open, a build through
 *    capture/library, the peak on Ask, and no bar sitting more than ~3dB below
 *    its neighbours (a bigger hole reads as "the music stopped").
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { BAR, SUBTITLES, TOTAL_BARS } from '../timeline.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
let failed = false;

// ── 0. em dashes (the app-wide ban, mirrored)
{
  const hits = [];
  SUBTITLES.forEach((c, i) => {
    if (c.text.includes('—')) hits.push(`caption ${i + 1}: ${c.text}`);
  });
  const srcRoot = path.join(here, '..', 'src');
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.tsx?$/.test(name)) scan(p);
    }
  };
  // comment-aware, same heuristics as web/scripts/check-em-dash.mjs
  const scan = (file) => {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    let inBlock = false;
    lines.forEach((raw, i) => {
      if (raw.includes('emdash-ok')) return;
      let l = raw;
      if (inBlock) {
        const end = l.indexOf('*/');
        if (end === -1) return;
        l = l.slice(end + 2);
        inBlock = false;
      }
      let open;
      while ((open = l.indexOf('/*')) !== -1) {
        const close = l.indexOf('*/', open + 2);
        if (close === -1) {
          l = l.slice(0, open);
          inBlock = true;
          break;
        }
        l = l.slice(0, open) + l.slice(close + 2);
      }
      if (/^\s*\*/.test(raw)) return;
      const slash = l.indexOf('//');
      if (slash !== -1 && !/https?:$/.test(l.slice(0, slash).trimEnd().slice(-6))) l = l.slice(0, slash);
      if (l.includes('—')) hits.push(`${path.relative(path.join(here, '..'), file)}:${i + 1}: ${raw.trim().slice(0, 120)}`);
    });
  };
  walk(srcRoot);
  if (hits.length) {
    console.error('✗ em dash in user-facing film text (the app-wide ban; use a period, colon or comma):');
    for (const h of hits) console.error('    ' + h);
    failed = true;
  } else {
    console.log('✓ no em dashes in captions or src/');
  }
}

// ── 1. captions
{
  const sorted = [...SUBTITLES].sort((a, b) => a.bar - b.bar);
  let prevEnd = -Infinity;
  let prev = null;
  for (const cue of sorted) {
    if (cue.bar < prevEnd - 1e-9) {
      console.error(
        `✗ caption overlap: "${cue.text}" starts at bar ${cue.bar} but "${prev.text}" runs to ${prevEnd.toFixed(2)}`,
      );
      failed = true;
    }
    prevEnd = cue.bar + cue.bars;
    prev = cue;
  }
  if (prevEnd > TOTAL_BARS) {
    console.error(`✗ last caption runs to bar ${prevEnd} past the film's ${TOTAL_BARS}`);
    failed = true;
  }
  if (!failed) console.log(`✓ ${SUBTITLES.length} captions, no overlaps, last ends bar ${prevEnd.toFixed(2)}`);
}

// ── 2. score
{
  const wav = path.join(here, '..', 'public', 'score.wav');
  if (!fs.existsSync(wav)) {
    console.error('✗ public/score.wav missing — run `npm run score` first');
    process.exit(1);
  }
  const b = fs.readFileSync(wav);
  const SR = b.readUInt32LE(24);
  const n = (b.length - 44) / 4;
  const at = (i) => b.readInt16LE(44 + i * 4) / 32768;

  let dc = 0;
  let clipped = 0;
  for (let i = 0; i < n; i++) {
    const v = at(i);
    dc += v;
    if (Math.abs(v) > 0.995) clipped++;
  }
  console.log(`\nDC offset ${(dc / n).toFixed(5)} · near-clip samples ${clipped}`);
  if (clipped > 0) {
    console.error('✗ the master is clipping');
    failed = true;
  }

  const rows = [];
  for (let bar = 0; bar * BAR * SR < n; bar++) {
    const s = Math.floor(bar * BAR * SR);
    const e = Math.min(n, Math.floor((bar + 1) * BAR * SR));
    let sum = 0;
    let peak = 0;
    for (let i = s; i < e; i++) {
      const v = at(i);
      sum += v * v;
      peak = Math.max(peak, Math.abs(v));
    }
    const db = 20 * Math.log10(Math.sqrt(sum / (e - s)) || 1e-9);
    rows.push({ bar, db, peak });
  }

  for (const r of rows) {
    const bars = '#'.repeat(Math.max(0, Math.round(r.db + 40)));
    console.log(
      `bar ${String(r.bar).padStart(2)}  ${r.db.toFixed(1).padStart(6)}dB  peak ${r.peak.toFixed(2)}  ${bars}`,
    );
  }

  // a hole mid-film reads as the score dropping out
  for (let i = 1; i < rows.length - 2; i++) {
    const dip = Math.min(rows[i - 1].db, rows[i + 1].db) - rows[i].db;
    if (dip > 3.5) {
      console.error(`✗ bar ${rows[i].bar} sits ${dip.toFixed(1)}dB below its neighbours`);
      failed = true;
    }
  }
}

console.log(failed ? '\nFAILED' : '\nOK');
process.exit(failed ? 1 : 0);
