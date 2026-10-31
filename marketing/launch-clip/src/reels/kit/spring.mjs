/**
 * The one phone's camera and shutter, as plain math (no React): the picture
 * (kit/phone.tsx) and the gates (a video's verify) compute the same camera
 * from the same targets. THE APP STORE PREVIEW's camera (Preview.tsx,
 * round 8 on), made a kit part; the preview keeps its own original copy.
 *
 * A camera puts screen point (cx, cy) at a fixed frame point (`focus`) at z
 * frame px a point. It FOLLOWS a target path (straight lines between keys,
 * read through a trailing `easeIn`-frame moving average, so a new framing
 * arrives as a ramp) with a critically damped spring on each axis (zoom in
 * log space), iOS's own motion: it eases out of rest without a kick, keeps
 * its speed through a change of mind, and settles without overshoot.
 */

/** samples a frame (the shutter samples between frames) */
const STEP = 8;

/**
 * The camera path a shot's targets give ({ f, cx, cy, z, w? }; `w` is the
 * spring's rate per frame from that key on, else `spring`). Solved exactly
 * over each eighth of a frame, so it never rings and the shutter can sample
 * it between frames.
 */
export const follow = (targets, from, to, spring, easeIn) => {
  const n = Math.ceil((to - from) * STEP) + 2;
  const path = { from, to, cx: new Float64Array(n), cy: new Float64Array(n), lz: new Float64Array(n) };
  const raw = (t) => {
    let i = 0;
    while (i + 1 < targets.length && targets[i + 1].f <= t) i++;
    const a = targets[i];
    const b = targets[i + 1];
    const u = b && t > a.f ? Math.min(1, (t - a.f) / (b.f - a.f)) : 0;
    return {
      cx: a.cx + (b ? (b.cx - a.cx) * u : 0),
      cy: a.cy + (b ? (b.cy - a.cy) * u : 0),
      lz: Math.log(a.z) + (b ? (Math.log(b.z) - Math.log(a.z)) * u : 0),
      w: a.w || spring,
    };
  };
  const target = (t) => {
    const m = 13;
    const o = { cx: 0, cy: 0, lz: 0, w: raw(t).w };
    for (let k = 0; k < m; k++) {
      const r = raw(Math.max(from, t - (easeIn * k) / (m - 1)));
      o.cx += r.cx / m;
      o.cy += r.cy / m;
      o.lz += r.lz / m;
    }
    return o;
  };
  const start = raw(from);
  const x = { cx: start.cx, cy: start.cy, lz: start.lz };
  const v = { cx: 0, cy: 0, lz: 0 };
  const dt = 1 / STEP;
  for (let k = 0; k < n; k++) {
    path.cx[k] = x.cx;
    path.cy[k] = x.cy;
    path.lz[k] = x.lz;
    const T = target(from + (k + 0.5) * dt);
    const e = Math.exp(-T.w * dt);
    for (const key of ['cx', 'cy', 'lz']) {
      const A = x[key] - T[key];
      const B = v[key] + T.w * A;
      x[key] = T[key] + (A + B * dt) * e;
      v[key] = (B - T.w * (A + B * dt)) * e;
    }
  }
  return path;
};

/** where a path's camera is at instant t (inside its span), holding `focus` ({ x, y }) */
export const camOn = (p, t, focus) => {
  const u = Math.min(p.cx.length - 1.0001, (Math.min(Math.max(t, p.from), p.to) - p.from) * STEP);
  const i = Math.floor(u);
  const r = u - i;
  const at = (a) => a[i] + (a[i + 1] - a[i]) * r;
  return { cx: at(p.cx), cy: at(p.cy), z: Math.exp(at(p.lz)), fx: focus.x, fy: focus.y, rx: 0, ry: 0, rz: 0 };
};

/** a screen point (points) in the frame (px) under camera `c` */
export const toFrame = (c, x, y) => ({ x: c.fx + (x - c.cx) * c.z, y: c.fy + (y - c.cy) * c.z });

/** how far the picture under camera `a` has moved under camera `b`, at its worst probe (frame px) */
export const travel = (a, b, probes) =>
  Math.max(
    ...probes.map(([x, y]) => {
      const sx = a.cx + (x - a.fx) / a.z;
      const sy = a.cy + (y - a.fy) / a.z;
      return Math.hypot(b.fx + (sx - b.cx) * b.z - x, b.fy + (sy - b.cy) * b.z - y);
    }),
  );

/** the 180° shutter around frame f, inside a path's span */
export const shutterWindow = (f, p) => [Math.max(p.from, f - 0.25), Math.min(p.to, f + 0.25)];

/** exposure j of n: the instant a path's camera is sampled at */
export const instant = (f, p, j, n) => {
  const [t0, t1] = shutterWindow(f, p);
  return t0 + ((t1 - t0) * (j + 0.5)) / n;
};

/**
 * Every frame's exposure count (one when nothing moves, else one for every
 * ~1.5px the picture travels while the shutter is open, so the smear is
 * smooth, not stepped, at most 48), and where each frame's exposures start
 * in a video's Shutter composition.
 */
export const shutterPlan = (total, pathsAt, focus, probes) => {
  const counts = Array.from({ length: total }, (_, f) => {
    const need = (p) => {
      const [t0, t1] = shutterWindow(f, p);
      return Math.ceil(travel(camOn(p, t0, focus), camOn(p, t1, focus), probes) / 1.5);
    };
    return Math.max(1, Math.min(48, ...pathsAt(f).map(need)));
  });
  const starts = [0];
  for (let f = 0; f < total; f++) starts.push(starts[f] + counts[f]);
  return { counts, starts, total: starts[total] };
};

/** the frame and exposure a Shutter composition's frame k is */
export const exposureOf = (starts, k) => {
  let f = 0;
  while (starts[f + 1] <= k) f++;
  return { f, j: k - starts[f] };
};
