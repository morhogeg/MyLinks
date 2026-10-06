/**
 * The film's index of its captures: for each take, its pixel density, frame
 * count, named marks and the on-screen boxes recorded per frame (what the
 * camera aims at and what a lift crops). Built from the manifests that
 * live/shoot.mjs writes; the frames themselves stay where the capture put them.
 */

import fs from 'node:fs';
import path from 'node:path';

const r1 = (v) => Math.round(v * 2) / 2;

/** Phrases whose frames the edit needs to find (e.g. a one-keystroke flash of
 *  the partial-match tier while the Find question is typed). */
const FLAGS = ['Close matches'];

/** @param {string} takesDir  out/live/takes (or a copy) */
export function buildIndex(takesDir) {
  const takes = {};
  for (const name of fs.readdirSync(takesDir).sort()) {
    const f = path.join(takesDir, name, 'manifest.json');
    if (!fs.existsSync(f)) continue;
    const m = JSON.parse(fs.readFileSync(f, 'utf8'));
    takes[name] = {
      dpr: m.dpr,
      fps: m.fps,
      count: m.frames.length,
      screen: m.screen,
      marks: m.marks,
      files: m.frames.map((fr) => fr.file),
      // frames showing a phrase the edit steps around (FLAGS)
      flags: Object.fromEntries(
        FLAGS.map((phrase) => [phrase, m.frames.flatMap((fr, i) => ((fr.text ?? []).some((s) => s.includes(phrase)) ? [i] : []))]),
      ),
      rects: m.frames.map((fr) =>
        Object.fromEntries(
          Object.entries(fr.rects ?? {})
            .filter(([, v]) => v)
            .map(([k, v]) => [k, [r1(v.x), r1(v.y), r1(v.w), r1(v.h)]]),
        ),
      ),
    };
  }
  return { takes };
}

/** Every string the app put on screen in the frames the film uses (verify). */
export function visibleTexts(takesDir, take, frames) {
  const m = JSON.parse(fs.readFileSync(path.join(takesDir, take, 'manifest.json'), 'utf8'));
  const out = new Set();
  for (const i of frames) for (const s of m.frames[i]?.text ?? []) out.add(s);
  return [...out];
}
