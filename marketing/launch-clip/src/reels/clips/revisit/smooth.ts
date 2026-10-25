import type { Cam } from '../../kit/camera';

/**
 * (round 4) Motion with no breaks in it.
 *
 * The kit's camera eases each segment on its own (EASE_MODAL by default,
 * which LEAVES at 2.25 times its average speed): a move that starts from a
 * hold jolts, and a hold between two moves stops dead and starts again.
 * Here every field runs on one monotone cubic spline through its keys (the
 * Fritsch–Carlson interpolant): the speed is continuous through every key,
 * it never overshoots a key, it comes to rest only where the path turns
 * round or holds, and a key two moves share is passed through, not stopped
 * at. Keys at most a frame apart are still a CUT (the spline restarts).
 */

/** a monotone cubic through (xs, ys); `ends` pins the slope at either end */
export const pchip = (xs: number[], ys: number[], ends: { start?: number; end?: number } = {}) => {
  const n = xs.length;
  if (n === 1) return () => ys[0];
  const h = xs.slice(1).map((x, i) => x - xs[i]);
  const d = h.map((hi, i) => (ys[i + 1] - ys[i]) / hi);
  const m = new Array<number>(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    if (d[i - 1] * d[i] <= 0) continue;
    const w1 = 2 * h[i] + h[i - 1];
    const w2 = h[i] + 2 * h[i - 1];
    m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  }
  // the ends: the one-sided three-point slope, kept monotone (or as pinned)
  const endSlope = (h0: number, h1: number, d0: number, d1: number) => {
    if (h1 === undefined || d1 === undefined) return d0;
    let s = ((2 * h0 + h1) * d0 - h0 * d1) / (h0 + h1);
    if (Math.sign(s) !== Math.sign(d0)) s = 0;
    else if (Math.sign(d0) !== Math.sign(d1) && Math.abs(s) > Math.abs(3 * d0)) s = 3 * d0;
    return s;
  };
  m[0] = ends.start ?? endSlope(h[0], h[1], d[0], d[1]);
  m[n - 1] = ends.end ?? endSlope(h[n - 2], h[n - 3], d[n - 2], d[n - 3]);
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (xs[i + 1] < x) i++;
    const t = (x - xs[i]) / h[i];
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h[i] * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h[i] * m[i + 1];
  };
};

const FIELDS = ['cx', 'cy', 'z', 'fx', 'fy'] as const;
type Field = (typeof FIELDS)[number];
export type SKey = { f: number } & Partial<Record<Field, number>>;

/**
 * A camera through keys (fields a key omits carry over from the key before;
 * zoom runs in log space, so a push reads constant-rate). The first and last
 * keys of each run between cuts come to rest unless `moving` says otherwise.
 */
export const smoothCam = (keys: SKey[], { moving = false }: { moving?: boolean } = {}) => {
  const full: (Record<Field, number> & { f: number })[] = [];
  let prev: Record<Field, number> = { cx: 196.5, cy: 426, z: 1.6, fx: 540, fy: 1060 };
  for (const k of keys) {
    const c = { ...prev };
    for (const field of FIELDS) if (k[field] !== undefined) c[field] = k[field] as number;
    full.push({ ...c, f: k.f });
    prev = c;
  }
  // runs between cuts
  const runs: (typeof full)[] = [[full[0]]];
  for (let i = 1; i < full.length; i++) {
    if (full[i].f - full[i - 1].f <= 1) runs.push([full[i]]);
    else runs[runs.length - 1].push(full[i]);
  }
  const ends = moving ? {} : { start: 0, end: 0 };
  const curves = runs.map((run) => ({
    from: run[0].f,
    to: run[run.length - 1].f,
    at: Object.fromEntries(
      FIELDS.map((field) => [field, pchip(run.map((k) => k.f), run.map((k) => (field === 'z' ? Math.log(k[field]) : k[field])), ends)]),
    ) as Record<Field, (x: number) => number>,
  }));
  return (f: number): Cam => {
    let c = curves[0];
    for (const run of curves) if (f >= run.from) c = run;
    const v = (field: Field) => c.at[field](f);
    return { cx: v('cx'), cy: v('cy'), z: Math.exp(v('z')), fx: v('fx'), fy: v('fy'), rx: 0, ry: 0, rz: 0 };
  };
};

/** how far the frame's centre point travels in one frame (px), for the shutter; a cut reads forward */
export const camShift = (cam: (f: number) => Cam, f: number, cuts: number[] = []) => {
  const g = cuts.some((c) => c > f - 1 && c <= f) ? f + 1 : f;
  const a = cam(g - 1);
  const b = cam(g);
  const sx = a.cx + (540 - a.fx) / a.z;
  const sy = a.cy + (960 - a.fy) / a.z;
  return { x: b.fx + (sx - b.cx) * b.z - 540, y: b.fy + (sy - b.cy) * b.z - 960 };
};
