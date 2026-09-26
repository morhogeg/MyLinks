import { Easing } from 'remotion';
import { EASE_IN_OUT, EASE_MODAL, EASE_OUT, EASE_SPRING } from '../../film/anim';

/**
 * The motion personality of every Machina video: the APP's own curves, not a
 * template's. Each one has a job; use it for that job and nothing else.
 *
 *  EASE_MODAL   cubic-bezier(0.32, 0.72, 0, 1)   the app's --ease-modal. Things
 *               ARRIVING and SETTLING: a sheet, a caption word, a camera
 *               landing on its subject. Fast start, long soft landing.
 *  EASE_SPRING  cubic-bezier(0.34, 1.56, 0.64, 1) the app's --ease-spring. The
 *               one curve allowed to overshoot, kept for PHYSICAL arrivals:
 *               the brackets snapping shut, a chip lifting, a card landing.
 *  EASE_FLING   cubic-bezier(0.22, 1, 0.36, 1)   the review deck's own fling
 *               (SwipeDeck.tsx). Things THROWN: a card leaving, a whip pan.
 *  EASE_IN_OUT  cubic-bezier(0.65, 0, 0.35, 1)   TRAVEL between two holds: the
 *               camera crossing the screen, the saves converging.
 *  EASE_GATHER  accelerating (cubic-in)          moves that must END at speed:
 *               the saves collapsing into the point, and a camera diving
 *               INTO a hard cut (the next shot takes the speed). Never for
 *               anything that lands.
 */
export { EASE_MODAL, EASE_SPRING, EASE_IN_OUT };
export const EASE_FLING = EASE_OUT;
export const EASE_GATHER = Easing.bezier(0.55, 0, 1, 0.45);

type Curve = (t: number) => number;

/** 0→1 over [f0, f1], eased, clamped. */
export const prog = (frame: number, f0: number, f1: number, ease: Curve = EASE_MODAL) => {
  if (f1 <= f0) return frame >= f1 ? 1 : 0;
  const t = Math.min(1, Math.max(0, (frame - f0) / (f1 - f0)));
  return ease(t);
};

/** Linear interpolation. */
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Fade in over `inF` frames from f0, out over `outF` frames ending at f1. */
export const window01 = (frame: number, f0: number, f1: number, inF = 8, outF = 8, ease: Curve = EASE_MODAL) =>
  Math.min(prog(frame, f0, f0 + inF, ease), 1 - prog(frame, f1 - outF, f1, ease));
