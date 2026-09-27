import { EASE_MODAL } from './curves';
import type { Rect } from './takes';

/**
 * The camera over a captured screen.
 *
 * It looks at a point of the SCREEN (cx, cy, in the app's 393 × 852 points)
 * and puts it at a point of the FRAME (fx, fy, in pixels) at a zoom z (pixels
 * per point). Aiming by screen point is what lets a shot target "the chips"
 * or "the checklist" by name (their boxes come from the capture) instead of
 * guessing pixel offsets.
 *
 * Camera rules (README "Motion language"):
 *  - close-ups are 2D (zoom + pan): 2D transforms re-raster crisp; 3D tilt is
 *    for establishing moves only, under ~10°, and never while text must read;
 *  - every move ARRIVES on a beat and eases in with EASE_MODAL; travel between
 *    two holds uses EASE_IN_OUT; nothing moves linearly;
 *  - zoom stays at or under the capture's resolution (dpr px per point) so
 *    the app is never upscaled soft.
 */
export type Cam = {
  cx: number;
  cy: number;
  z: number;
  fx: number;
  fy: number;
  rx: number;
  ry: number;
  rz: number;
};

type Curve = (t: number) => number;
export type Key = { f: number; ease?: Curve } & Partial<Cam>;

const DEFAULT: Cam = { cx: 196.5, cy: 426, z: 1.6, fx: 540, fy: 1060, rx: 0, ry: 0, rz: 0 };
const FIELDS = ['cx', 'cy', 'z', 'fx', 'fy', 'rx', 'ry', 'rz'] as const;

/**
 * Keyframed camera. Each key's `ease` shapes the segment ARRIVING at it
 * (default EASE_MODAL). Fields a key omits carry over from the key before.
 * Zoom interpolates in log space, so a push-in feels constant-rate.
 */
export function camAt(keys: Key[], frame: number): Cam {
  const full: (Cam & { f: number; ease?: Curve })[] = [];
  let prev: Cam = DEFAULT;
  for (const k of keys) {
    const c = { ...prev } as Cam;
    for (const field of FIELDS) if (k[field] !== undefined) c[field] = k[field] as number;
    full.push({ ...c, f: k.f, ease: k.ease });
    prev = c;
  }
  if (frame <= full[0].f) return full[0];
  const last = full[full.length - 1];
  if (frame >= last.f) return last;
  let i = 0;
  while (full[i + 1].f < frame) i++;
  const a = full[i];
  const b = full[i + 1];
  const t = (b.ease ?? EASE_MODAL)(Math.min(1, Math.max(0, (frame - a.f) / (b.f - a.f))));
  const out = {} as Cam;
  for (const field of FIELDS) {
    out[field] =
      field === 'z' ? Math.exp(Math.log(a.z) + (Math.log(b.z) - Math.log(a.z)) * t) : a[field] + (b[field] - a[field]) * t;
  }
  return out;
}

/**
 * Aim at a box: its centre goes to (fx, fy) and it spans `width` pixels (or
 * `height`, whichever is given). Returns camera fields for a key.
 */
export const aim = (
  r: Rect,
  { width, height, fx = 540, fy = 1040, dx = 0, dy = 0 }: { width?: number; height?: number; fx?: number; fy?: number; dx?: number; dy?: number } = {},
): Partial<Cam> => {
  const z = height !== undefined ? height / r[3] : (width ?? 940) / r[2];
  return { cx: r[0] + r[2] / 2 + dx, cy: r[1] + r[3] / 2 + dy, z, fx, fy };
};

/**
 * The camera's speed this frame, for motion blur: how far the screen point
 * under the centre of the frame travels since the previous frame (px), and
 * the zoom ratio. A CUT (two keys one frame apart with a change between them)
 * is not motion: on the cut frame the speed is read forward instead, so the
 * first frame of a new shot is as sharp as the shot.
 */
/**
 * How many units of a scene's clock pass per OUTPUT frame. A reel that plays
 * its cut slower (reel-timeline.mjs K) sets this to 1 / K, so motion blur
 * stays what the viewer actually sees move in one frame.
 */
export const CLOCK = { perFrame: 1 };

export const camVelocity = (keys: Key[], frame: number, perFrame = CLOCK.perFrame) => {
  const cut = keys.some(
    (k, j) => j > 0 && k.f === frame && keys[j - 1].f >= frame - 1 && FIELDS.some((field) => k[field] !== undefined),
  );
  const a = camAt(keys, cut ? frame : frame - 1);
  const b = camAt(keys, cut ? frame + 1 : frame);
  const FX = 540;
  const FY = 960;
  // the screen point under the frame's centre, and where it is one frame on
  const sx = a.cx + (FX - a.fx) / a.z;
  const sy = a.cy + (FY - a.fy) / a.z;
  const k = perFrame;
  return { x: (b.fx + (sx - b.cx) * b.z - FX) * k, y: (b.fy + (sy - b.cy) * b.z - FY) * k, z: Math.pow(b.z / a.z, k) };
};
