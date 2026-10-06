/**
 * Keyframes for continuous values (the camera, a lift, a plane's drift).
 *
 * Between keys the motion is a monotone cubic (Fritsch–Carlson): it passes
 * THROUGH every key without overshooting, keeps its speed across a key that
 * sits on the way somewhere (no stop-start), and comes to rest on a key that
 * is a hold or a turning point. That is the one-take camera: it glides through
 * its marks instead of parking on each.
 *
 * A key may instead name an `ease` (ease.js): the segment ARRIVING at that key
 * is then a plain eased tween, and both ends of it rest (the move-and-settle
 * the reel kit uses for a camera landing on its subject).
 *
 * Fields a key omits carry over from the key before. Fields listed in `log`
 * interpolate in log space (zoom: a push-in reads as constant-rate).
 */

const hermite = (y0, y1, m0, m1, h, s) => {
  const s2 = s * s;
  const s3 = s2 * s;
  return (2 * s3 - 3 * s2 + 1) * y0 + (s3 - 2 * s2 + s) * h * m0 + (-2 * s3 + 3 * s2) * y1 + (s3 - s2) * h * m1;
};

/** One field's curve through (t, y) keys; `eased[i]` = ease of segment i→i+1. */
function monotone(ts, ys, eased) {
  const n = ts.length;
  if (n === 1) return () => ys[0];
  const h = [];
  const d = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(Math.max(1e-6, ts[i + 1] - ts[i]));
    d.push((ys[i + 1] - ys[i]) / h[i]);
  }
  const m = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    if (eased[i - 1] || eased[i]) continue; // an eased neighbour rests here
    if (d[i - 1] * d[i] <= 0) continue; // turning point or hold
    const w1 = 2 * h[i] + h[i - 1];
    const w2 = h[i] + 2 * h[i - 1];
    m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i]);
  }
  return (t) => {
    if (t <= ts[0]) return ys[0];
    if (t >= ts[n - 1]) return ys[n - 1];
    let i = 0;
    while (ts[i + 1] < t) i++;
    const s = (t - ts[i]) / h[i];
    if (eased[i]) return ys[i] + (ys[i + 1] - ys[i]) * eased[i](s);
    return hermite(ys[i], ys[i + 1], m[i], m[i + 1], h[i], s);
  };
}

/**
 * A rig of named fields over keys `{ t, ease?, ...fields }`.
 * Returns `(t) => ({ ...fields })`.
 */
export function rig(keys, defaults, { log = [] } = {}) {
  const fields = Object.keys(defaults);
  const sorted = [...keys].sort((a, b) => a.t - b.t);
  const full = [];
  let prev = { ...defaults };
  for (const k of sorted) {
    const c = { ...prev };
    for (const f of fields) if (k[f] !== undefined) c[f] = k[f];
    full.push(c);
    prev = c;
  }
  const ts = sorted.map((k) => k.t);
  // segment i (key i → key i+1) is eased if key i+1 names an ease
  const eased = sorted.slice(1).map((k) => k.ease ?? null);
  const curves = {};
  for (const f of fields) {
    const isLog = log.includes(f);
    const ys = full.map((c) => (isLog ? Math.log(Math.max(1e-6, c[f])) : c[f]));
    const fn = monotone(ts, ys, eased);
    curves[f] = isLog ? (t) => Math.exp(fn(t)) : fn;
  }
  return (t) => {
    const out = {};
    for (const f of fields) out[f] = curves[f](t);
    return out;
  };
}

/** A single value over `[[t, v, ease?], ...]`. */
export function curve(keys, { log = false } = {}) {
  const r = rig(
    keys.map(([t, v, ease]) => ({ t, v, ease })),
    { v: keys[0][1] },
    { log: log ? ['v'] : [] },
  );
  return (t) => r(t).v;
}
