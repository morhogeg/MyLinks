import { staticFile } from 'remotion';
import TAKES_JSON from '../data/takes.json';

/**
 * The captured app, as data. `capture/shoot.mjs` records TAKES of the real app
 * (see capture/) and writes their frames to public/reel/app/<take>/NNNN.png
 * plus this summary: per frame, the text on screen and the on-screen boxes of
 * named elements, in the 393 × 852 point space of the iPhone screen.
 *
 * A scene never hard-codes a frame number; it asks for a MARK ("phase2",
 * "sources") plus an offset, so a re-capture that shifts counts keeps the
 * edit aligned.
 */
export type Rect = [x: number, y: number, w: number, h: number];

type TakeData = {
  dpr: number;
  fps: number;
  count: number;
  marks: Record<string, number>;
  texts: string[];
  frames: { t: number[]; r: Record<string, Rect> }[];
};

export const TAKES = TAKES_JSON as unknown as Record<string, TakeData>;

/** The iPhone screen the app was captured on, in points. */
export const SCREEN = { w: 393, h: 852 } as const;

export const takeOf = (name: string) => {
  const t = TAKES[name];
  if (!t) throw new Error(`no capture take "${name}": run \`npm run reel:capture\``);
  return t;
};

/** Frame index of a mark (+ offset), clamped into the take. */
export const at = (name: string, mark: string, offset = 0) => {
  const t = takeOf(name);
  const m = t.marks[mark];
  if (m === undefined) throw new Error(`take "${name}" has no mark "${mark}"`);
  return Math.max(0, Math.min(t.count - 1, m + Math.floor(offset)));
};

/** The PNG for a frame. */
export const frameSrc = (name: string, i: number) =>
  staticFile(`reel/app/${name}/${String(Math.max(0, Math.round(i))).padStart(4, '0')}.png`);

/** An element's box on a frame (or the nearest frame that measured it). */
export const rectOf = (name: string, i: number, key: string): Rect => {
  const t = takeOf(name);
  for (let d = 0; d < t.count; d++) {
    for (const j of [i - d, i + d]) {
      const r = j >= 0 && j < t.count ? t.frames[j].r[key] : undefined;
      if (r) return r;
    }
  }
  throw new Error(`take "${name}" never measured "${key}"`);
};

/** The text visible on a frame (verify reads the same data). */
export const textOf = (name: string, i: number) => {
  const t = takeOf(name);
  return t.frames[i].t.map((k) => t.texts[k]);
};

export const center = (r: Rect) => ({ x: r[0] + r[2] / 2, y: r[1] + r[3] / 2 });
