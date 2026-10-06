/**
 * The film's motion personality: the APP's own curves (web/app/globals.css),
 * the same set the reel kit uses (src/reels/kit/curves.ts). Each has one job.
 *
 *  MODAL   cubic-bezier(0.32, 0.72, 0, 1)    --ease-modal. Arriving and
 *          settling: a sheet, a word, a camera landing on its subject.
 *  SPRING  cubic-bezier(0.34, 1.56, 0.64, 1) --ease-spring. The one curve that
 *          overshoots, kept for physical arrivals: brackets snapping shut, a
 *          card landing, a lift.
 *  FLING   cubic-bezier(0.22, 1, 0.36, 1)    SwipeDeck's fling. Things thrown.
 *  INOUT   cubic-bezier(0.65, 0, 0.35, 1)    travel between two holds.
 *  GATHER  cubic-bezier(0.55, 0, 1, 0.45)    accelerating: moves that END at
 *          speed (a dive into the point). Never for anything that lands.
 */

/** A CSS cubic-bezier as a function of t ∈ [0, 1] (Newton + bisection). */
export function bezier(x1, y1, x2, y2) {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t) => ((ax * t + bx) * t + cx) * t;
  const sy = (t) => ((ay * t + by) * t + cy) * t;
  const dx = (t) => (3 * ax * t + 2 * bx) * t + cx;
  const solve = (x) => {
    let t = x;
    for (let i = 0; i < 8; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-7) return t;
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 40; i++) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-7) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return t;
  };
  return (x) => (x <= 0 ? 0 : x >= 1 ? 1 : sy(solve(x)));
}

export const LINEAR = (t) => t;
export const MODAL = bezier(0.32, 0.72, 0, 1);
export const SPRING = bezier(0.34, 1.56, 0.64, 1);
export const FLING = bezier(0.22, 1, 0.36, 1);
export const INOUT = bezier(0.65, 0, 0.35, 1);
export const GATHER = bezier(0.55, 0, 1, 0.45);
/** A gentle symmetric S for long camera travel (slower to leave than INOUT). */
export const GLIDE = bezier(0.45, 0, 0.2, 1);
/** Soft exit: eased in AND out, never a fast start (reel round 13). */
export const EXIT = bezier(0.4, 0, 0.6, 1);

export const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
export const mix = (a, b, t) => a + (b - a) * t;

/** 0→1 over [t0, t1], eased and clamped. */
export const prog = (t, t0, t1, ease = MODAL) => {
  if (t1 <= t0) return t >= t1 ? 1 : 0;
  return ease(clamp((t - t0) / (t1 - t0)));
};

/** In over `fadeIn` seconds from t0, out over `fadeOut` ending at t1. */
export const window01 = (t, t0, t1, fadeIn = 0.4, fadeOut = 0.4, ease = MODAL) =>
  Math.min(prog(t, t0, t0 + fadeIn, ease), 1 - prog(t, t1 - fadeOut, t1, EXIT));
