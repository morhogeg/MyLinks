import { Easing } from 'remotion';
import { HITS } from '../../../../clips/needle-timeline.mjs';
import { NEEDLE } from './variant';

/**
 * The field: the demo account's saves, every one a card the REAL app
 * rendered (capture/shoot.mjs `needleCards`, shot alone on transparency),
 * hung in space and flown through by a pinhole camera.
 *
 * World units are frame pixels at depth FOCAL: a card at depth d is drawn
 * FOCAL / d times its world size, and its world size puts its rounded rect
 * at CARD_W. The camera looks down −z; a card is in front of it when its
 * depth (cam.z − card.z) is positive.
 *
 * Two layouts, both deterministic (seeded), neither a mockup: the haystack
 * (A) the hook dares you into and the camera searches, whose first frame is
 * art-directed so the needle is IN it, in plain sight; and the tunnel (B)
 * the camera tears through after the question, braking onto the needle.
 */

export const FOCAL = 1100;
export const FRAME = { w: 1080, h: 1920, cx: 540, cy: 960 };
export const CARD_W = 600;

export type CardInfo = {
  id: string;
  title: string;
  category: string;
  sourceType: string;
  w: number;
  h: number;
  img: [number, number];
  box: [number, number, number, number];
};
export const CARDS = (NEEDLE.cards as { cards: CardInfo[] }).cards;
export const CARD: Record<string, CardInfo> = Object.fromEntries(CARDS.map((c) => [c.id, c]));

/** a card's image (margins and shadow included) in world px, and its rect in it */
export const geom = (id: string) => {
  const c = CARD[id];
  const k = CARD_W / c.box[2];
  return {
    imgW: c.img[0] * k,
    imgH: c.img[1] * k,
    rect: { x: c.box[0] * k, y: c.box[1] * k, w: c.box[2] * k, h: c.box[3] * k },
    /** the app's card corner (rounded-[20px], so 20pt) in world px */
    radius: 20 * (CARD_W / c.w),
  };
};

export type Inst = { key: string; id: string; x: number; y: number; z: number; rx: number; ry: number; rz: number; s?: number };
export type Cam = { x: number; y: number; z: number; roll?: number };

const rng = (seed: number) => () => {
  seed |= 0;
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

/** world position of a card whose rect centre sits at screen (sx, sy), sw px wide, seen from `cam` */
const fromScreen = (sx: number, sy: number, sw: number, cam: Cam = { x: 0, y: 0, z: 0 }) => {
  const d = (FOCAL * CARD_W) / sw;
  return { x: cam.x + ((sx - FRAME.cx) * d) / FOCAL, y: cam.y + ((sy - FRAME.cy) * d) / FOCAL, z: cam.z - d };
};

// ─────────────────────────────────────────────────────────── layout A

/** the needle: Sam's screenshot, or (round 3) Sam's YouTube pick (capture/library.mjs `NEEDLE.needle`) */
export const NEEDLE_ID = NEEDLE.needleId;

/**
 * Frame 0, art-directed: [id, screen x, screen y, rect width px, rx, ry, rz].
 * Sam's screenshot is lower left, sharp, readable if you know what you are
 * looking for; (round 2) every book around it is one people know, so the
 * hunt is a hunt: Project Hail Mary and Dune lead the eye.
 */
const BOOK_FIRST_FRAME: [string, number, number, number, number, number, number][] = [
  // the decoys lead the eye: two famous novels, one of them nearest
  ['hailmary', 700, 902, 520, 2, -12, 4],
  ['dune', 214, 826, 420, 3, 12, -6],
  ['tailend', 878, 1452, 556, -2, -9, 3],
  // the needle: lower left, smaller, turned away a little, its corner under
  // a nearer decoy; sharp, so a viewer who goes back can read it
  [NEEDLE_ID, 300, 1252, 432, -4, 16, -7],
  ['kahneman', 528, 1428, 468, -2, -10, 5],
  ['fourthousand', 470, 752, 300, 0, -7, 4],
  ['webb', 1046, 1186, 330, 1, -16, -3],
  ['mulafossur', 128, 1606, 468, -3, 12, 5],
  ['range', 934, 690, 262, 0, 6, -2],
  ['spirited', 150, 1074, 262, 2, -8, 3],
  ['pantheon', 646, 636, 220, -1, -10, 2],
  ['sinek', 706, 1196, 282, 1, -5, -4],
  ['seljalandsfoss', 986, 1716, 330, 2, -12, -4],
];

/**
 * (round 3) The video's frame 0: the same slots, the needle in the book's,
 * and the decoys are videos people know (the TED talk, The Egg), with the
 * one trap a fan walks into: Mark Manson's other save, an ARTICLE, over the
 * needle's corner where Thinking, Fast and Slow was.
 */
const VIDEO_FIRST_FRAME: typeof BOOK_FIRST_FRAME = [
  ['robinson', 700, 902, 520, 2, -12, 4],
  ['egg', 214, 826, 420, 3, 12, -6],
  ['tailend', 878, 1452, 556, -2, -9, 3],
  [NEEDLE_ID, 300, 1252, 432, -4, 16, -7],
  ['question', 528, 1428, 468, -2, -10, 5],
  ['walker', 470, 752, 300, 0, -7, 4],
  ['webb', 1046, 1186, 330, 1, -16, -3],
  ['mulafossur', 128, 1606, 468, -3, 12, 5],
  ['entropy', 934, 690, 262, 0, 6, -2],
  ['freesolo', 150, 1074, 262, 2, -8, 3],
  ['pantheon', 646, 636, 220, -1, -10, 2],
  ['sinek', 706, 1196, 282, 1, -5, -4],
  ['seljalandsfoss', 986, 1716, 330, 2, -12, -4],
];

const FIRST_FRAME = NEEDLE.name === 'video' ? VIDEO_FIRST_FRAME : BOOK_FIRST_FRAME;

/** the three the narrator names, each read as the camera passes it */
export const NAMED: Record<'goloritze' | 'jobs' | 'coffee', { x: number; y: number; z: number; rx: number; ry: number; rz: number }> = {
  goloritze: { x: -430, y: 250, z: -3700, rx: 2, ry: 9, rz: -3 },
  jobs: { x: 430, y: -190, z: -5500, rx: -2, ry: -9, rz: 3 },
  coffee: { x: -330, y: 150, z: -7200, rx: 2, ry: 8, rz: -2 },
};

export const LAYOUT_A: Inst[] = (() => {
  const r = rng(20261022);
  const out: Inst[] = [];
  for (const [id, sx, sy, sw, rx, ry, rz] of FIRST_FRAME) {
    out.push({ key: `a-${id}`, id, ...fromScreen(sx, sy, sw), rx, ry, rz });
  }
  for (const [id, p] of Object.entries(NAMED)) out.push({ key: `a-${id}`, id, ...p });
  const placed = new Set(out.map((i) => i.id));
  const rest = CARDS.map((c) => c.id).filter((id) => !placed.has(id));
  // keep the named cards' sightlines clear: nothing between the camera and
  // a named card while it is read (the 1400 in front of it), near its axis
  const clear = (x: number, y: number, z: number) =>
    Object.values(NAMED).every((n) => !(z > n.z - 200 && z < n.z + 1500 && Math.hypot(x - n.x, y - n.y) < 760));
  const put = (id: string, z0: number, z1: number, n: number, k: number, tag: string) => {
    for (let tries = 0; tries < 40; tries++) {
      const z = z0 + (z1 - z0) * ((k + r()) / n);
      const a = r() * Math.PI * 2;
      const rad = 430 + r() * 1150;
      const x = Math.cos(a) * rad * 0.82;
      const y = Math.sin(a) * rad * 1.1;
      if (!clear(x, y, z)) continue;
      out.push({ key: `${tag}-${id}`, id, x, y, z, rx: (r() - 0.5) * 10, ry: (r() - 0.5) * 30, rz: (r() - 0.5) * 14 });
      return;
    }
  };
  rest.forEach((id, k) => put(id, -2100, -8800, rest.length, k, 'a'));
  // the deep haystack: everything but the needle and the named three, twice
  // more: once through the search, once past where it stops
  const deep = CARDS.map((c) => c.id).filter((id) => id !== NEEDLE_ID && !(id in NAMED));
  deep.forEach((id, k) => put(id, -2600, -8600, deep.length, k, 'am'));
  deep.forEach((id, k) => put(id, -8900, -14500, deep.length, k, 'a2'));
  // behind frame 0: small, soft cards between the heroes, so the first look
  // is a crowd, not a layout
  const behind = deep.filter((id) => !FIRST_FRAME.some(([h]) => h === id));
  behind.slice(0, 22).forEach((id, k) => {
    for (let tries = 0; tries < 30; tries++) {
      const sx = 60 + r() * 960;
      const sy = 700 + r() * 1100;
      const sw = 150 + r() * 120;
      const p = fromScreen(sx, sy, sw);
      if (!clear(p.x, p.y, p.z)) continue;
      out.push({ key: `a0-${id}-${k}`, id, ...p, rx: (r() - 0.5) * 10, ry: (r() - 0.5) * 30, rz: (r() - 0.5) * 14 });
      break;
    }
  });
  // no save twice on frame 0 (the frame a viewer goes back to and reads):
  // the first placement of each card in view wins
  const seen = new Set<string>();
  return out.filter((q) => {
    const d = -q.z;
    const s0 = FOCAL / d;
    const sx = FRAME.cx + q.x * s0;
    const sy = FRAME.cy + q.y * s0;
    const half = (CARD_W * s0) / 2;
    // (only where a card can be read: past ~3500 it is a speck in the fog)
    const onFrame0 = d > 150 && d < 3500 && sx + half > 0 && sx - half < FRAME.w && sy + half > 0 && sy - half < FRAME.h;
    if (!onFrame0) return true;
    if (seen.has(q.id)) return false;
    seen.add(q.id);
    return true;
  });
})();

// camera A: the dare, the search (a slalom, slow on each named card, a
// whoosh between), the dead stop on "Give up?"

/** the camera that puts a named card's centre at screen (540, 1080), `d` away */
const aimAt = (n: { x: number; y: number; z: number }, d: number): Cam => ({ x: n.x, y: n.y - (120 * d) / FOCAL, z: n.z + d });

type CamKey = { f: number } & Cam;
const STOP: Cam = { x: NAMED.coffee.x + 760, y: 40, z: NAMED.coffee.z - 260 };
const KEYS_A: CamKey[] = [
  { f: 0, x: 0, y: 0, z: 0 },
  { f: HITS.push, x: 0, y: 10, z: -200 },
  { f: HITS.beach, ...aimAt(NAMED.goloritze, 1250) },
  { f: 188, ...aimAt(NAMED.goloritze, 900) },
  { f: HITS.talk, ...aimAt(NAMED.jobs, 1250) },
  { f: 236, ...aimAt(NAMED.jobs, 900) },
  { f: HITS.coffee, ...aimAt(NAMED.coffee, 1250) },
  { f: 290, ...aimAt(NAMED.coffee, 900) },
  { f: HITS.giveUp, ...STOP },
];

/**
 * Monotone cubic (Fritsch–Carlson) through the keys, per axis: the velocity
 * is continuous through every key, so the dwell on a named card flows into
 * the whoosh to the next without a hitch, and it never overshoots a key.
 */
const monotone = (fs: number[], vs: number[]) => {
  const n = fs.length;
  const dx = fs.slice(1).map((f, i) => f - fs[i]);
  const m = vs.slice(1).map((v, i) => (v - vs[i]) / dx[i]);
  const t = new Array(n).fill(0);
  t[0] = m[0];
  t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i] / m[i];
    const b = t[i + 1] / m[i];
    const h = a * a + b * b;
    if (h > 9) {
      const s = 3 / Math.sqrt(h);
      t[i] = s * a * m[i];
      t[i + 1] = s * b * m[i];
    }
  }
  return (f: number) => {
    if (f <= fs[0]) return vs[0];
    if (f >= fs[n - 1]) return vs[n - 1];
    let i = 0;
    while (fs[i + 1] < f) i++;
    const h = dx[i];
    const u = (f - fs[i]) / h;
    const u2 = u * u;
    const u3 = u2 * u;
    return (2 * u3 - 3 * u2 + 1) * vs[i] + (u3 - 2 * u2 + u) * h * t[i] + (-2 * u3 + 3 * u2) * vs[i + 1] + (u3 - u2) * h * t[i + 1];
  };
};

const SEARCH_END = 290;
const axisA = (k: 'x' | 'y' | 'z') => {
  const keys = KEYS_A.filter((q) => q.f <= SEARCH_END);
  return monotone(
    keys.map((q) => q.f),
    keys.map((q) => q[k]),
  );
};
const CAM_A = { x: axisA('x'), y: axisA('y'), z: axisA('z') };
const EASE_IN2 = (t: number) => t * t;

/** the haystack camera (frames 0 to the gather, held after) */
export const cameraA = (f: number): Cam => {
  if (f <= SEARCH_END) return { x: CAM_A.x(f), y: CAM_A.y(f), z: CAM_A.z(f) };
  const from: Cam = { x: CAM_A.x(SEARCH_END), y: CAM_A.y(SEARCH_END), z: CAM_A.z(SEARCH_END) };
  if (f <= HITS.giveUp) {
    // the last of the search accelerates past the coffee… and stops dead
    const t = EASE_IN2((f - SEARCH_END) / (HITS.giveUp - SEARCH_END));
    return { x: from.x + (STOP.x - from.x) * t, y: from.y + (STOP.y - from.y) * t, z: from.z + (STOP.z - from.z) * t };
  }
  // the slam: a short, damped overshoot after the stop
  const u = f - HITS.giveUp;
  const bounce = 70 * Math.sin((Math.PI * u) / 7) * Math.exp(-u / 5);
  return { x: STOP.x, y: STOP.y, z: STOP.z - bounce };
};

/** the focal distance: on each named card while it is read, mid-field otherwise */
export const focusA = (f: number) => {
  const c = cameraA(f);
  const named = (n: keyof typeof NAMED, f0: number, f1: number) => (f >= f0 - 8 && f <= f1 + 4 ? c.z - NAMED[n].z : null);
  return (
    named('goloritze', HITS.beach, 188) ??
    named('jobs', HITS.talk, 236) ??
    named('coffee', HITS.coffee, 290) ??
    (f < HITS.push + 20 ? 1380 : 1350)
  );
};

/** the named card each line is about, and the frames it is lifted */
export const READS: { id: keyof typeof NAMED; from: number; to: number }[] = [
  { id: 'goloritze', from: HITS.beach - 2, to: 192 },
  { id: 'jobs', from: HITS.talk - 2, to: 238 },
  { id: 'coffee', from: HITS.coffee - 2, to: 294 },
];

// ─────────────────────────────────────── the gather, and the burst back

/** where the field gathers: on screen at (540, GATHER_Y), GATHER_D away */
export const GATHER_Y = 900;
export const GATHER_D = 1400;
/** where it bursts back out from: the sign-off mark's point */
export const BURST_Y = 812;
const gatherPoint = (cam: Cam, y = GATHER_Y): Cam => ({ x: cam.x, y: cam.y + ((y - FRAME.cy) * GATHER_D) / FOCAL, z: cam.z - GATHER_D });
const EASE_GATHER = Easing.bezier(0.55, 0, 1, 0.45);
const EASE_BURST = Easing.bezier(0.16, 1, 0.3, 1);

const hash01 = (s: string) => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10000) / 10000;
};

/** visible from `cam`: in front, and inside the frame with a margin */
const inView = (i: Inst, cam: Cam, margin = 500) => {
  const d = cam.z - i.z;
  if (d < 150 || d > 9500) return false;
  const s = FOCAL / d;
  const sx = FRAME.cx + (i.x - cam.x) * s;
  const sy = FRAME.cy + (i.y - cam.y) * s;
  return sx > -margin && sx < FRAME.w + margin && sy > -margin && sy < FRAME.h + margin;
};

/** the gather's start and end, per card (frames) */
const gatherWindow = (key: string) => {
  const h = hash01(key);
  const start = HITS.gather + 1 + Math.round(h * 9);
  return { start, end: Math.min(HITS.markStrike - 4, start + 14 + Math.round((1 - h) * 6)) };
};

/** layout A at frame f: the search, then every visible card rushing into the point */
export const fieldA = (f: number): { cam: Cam; insts: Inst[] } => {
  const cam = cameraA(f);
  if (f < HITS.gather) return { cam, insts: LAYOUT_A };
  const at = cameraA(HITS.gather);
  const p = gatherPoint(cameraA(HITS.markStrike));
  const insts: Inst[] = [];
  for (const i of LAYOUT_A) {
    if (!inView(i, at, 300)) continue;
    const w = gatherWindow(i.key);
    const t = EASE_GATHER(Math.min(1, Math.max(0, (f - w.start) / (w.end - w.start))));
    if (t >= 0.999) continue;
    const spin = (hash01(i.key + 's') - 0.5) * 60;
    insts.push({
      ...i,
      x: i.x + (p.x - i.x) * t,
      y: i.y + (p.y - i.y) * t,
      z: i.z + (p.z - i.z) * t,
      rz: i.rz + spin * t,
      s: 1 - 0.97 * t,
    });
  }
  return { cam, insts };
};

/**
 * The burst (the P.S.): out of the mark's point, every card that is on frame
 * 0 flies back to where it was, decelerating into place; Sam's screenshot
 * leaves last and lands as the loop comes round, so the last frame IS the
 * first frame's field.
 */
export const BURST = { from: HITS.burst, to: 836, needleFrom: 806 };
const FIRST_CAM: Cam = { x: 0, y: 0, z: 0 };
export const FIRST_FRAME_INSTS = LAYOUT_A.filter((i) => inView(i, FIRST_CAM, 200));
export const fieldBurst = (f: number): { cam: Cam; insts: Inst[] } => {
  const p = gatherPoint(FIRST_CAM, BURST_Y);
  const insts: Inst[] = [];
  for (const i of FIRST_FRAME_INSTS) {
    const needle = i.id === NEEDLE_ID;
    const h = hash01(i.key + 'b');
    const start = needle ? BURST.needleFrom : BURST.from + Math.round(h * 10);
    const end = needle ? BURST.to : Math.min(BURST.to - 2, start + 22 + Math.round(h * 8));
    if (f < start) continue;
    const t = EASE_BURST(Math.min(1, (f - start) / (end - start)));
    const spin = (hash01(i.key + 's') - 0.5) * 60;
    insts.push({
      ...i,
      x: p.x + (i.x - p.x) * t,
      y: p.y + (i.y - p.y) * t,
      z: p.z + (i.z - p.z) * t,
      rz: i.rz + spin * (1 - t),
      s: 0.03 + 0.97 * t,
    });
  }
  return { cam: FIRST_CAM, insts };
};

// ─────────────────────────────────────────────────────────── layout B

/** the tunnel: the camera tears through every save and brakes onto the needle */
export const WARP = { v0: 172, cruiseTo: HITS.brake, brakeTo: HITS.found, dFinal: 820, creep: 40 };
const CRUISE = WARP.v0 * (WARP.cruiseTo - HITS.send);
const BRAKE = (WARP.v0 * (WARP.brakeTo - WARP.cruiseTo)) / 3;
/** the needle, at the end of the tunnel */
export const TARGET = { id: NEEDLE_ID, x: 60, y: 40, z: -(CRUISE + BRAKE + WARP.dFinal) };

export const LAYOUT_B: Inst[] = (() => {
  const r = rng(7);
  const out: Inst[] = [];
  const ids = CARDS.map((c) => c.id).filter((id) => id !== NEEDLE_ID);
  const n = ids.length * 5;
  for (let k = 0; k < n; k++) {
    const id = ids[k % ids.length];
    const z = -300 + (TARGET.z + 1700 + 300) * ((k + r()) / n);
    const a = r() * Math.PI * 2;
    // a clear corridor down the middle: near saves stream past at the edges,
    // far ones gather at the vanishing point
    const rad = 400 + Math.pow(r(), 0.8) * 900;
    out.push({ key: `b${k}-${id}`, id, x: Math.cos(a) * rad * 0.85, y: Math.sin(a) * rad * 1.15, z, rx: (r() - 0.5) * 14, ry: (r() - 0.5) * 40, rz: (r() - 0.5) * 18 });
  }
  // around the needle: a ring of saves, clear of it, sharp-edged by the focus
  for (let k = 0; k < 16; k++) {
    const id = ids[(k * 7 + 3) % ids.length];
    const a = (k / 16) * Math.PI * 2 + r() * 0.3;
    const rad = 980 + r() * 600;
    const z = TARGET.z + 900 - r() * 2400;
    out.push({ key: `bn${k}-${id}`, id, x: TARGET.x + Math.cos(a) * rad, y: TARGET.y + Math.sin(a) * rad * 1.25, z, rx: (r() - 0.5) * 12, ry: (r() - 0.5) * 36, rz: (r() - 0.5) * 16 });
  }
  // behind it, far and soft
  for (let k = 0; k < 22; k++) {
    const id = ids[(k * 5 + 11) % ids.length];
    const a = r() * Math.PI * 2;
    const rad = 200 + r() * 1700;
    out.push({ key: `bb${k}-${id}`, id, x: Math.cos(a) * rad, y: Math.sin(a) * rad * 1.3, z: TARGET.z - 1600 - r() * 5000, rx: 0, ry: (r() - 0.5) * 30, rz: (r() - 0.5) * 16 });
  }
  return out;
})();

const EASE_OUT3 = (t: number) => 1 - Math.pow(1 - t, 3);

/** the tunnel camera, from the cut on the send to the cut into the answer */
export const cameraB = (f: number): Cam => {
  const t0 = HITS.send;
  const end: Cam = { x: TARGET.x, y: TARGET.y - (40 * WARP.dFinal) / FOCAL, z: TARGET.z + WARP.dFinal };
  // a banking roll while it tears through, levelling out as it brakes
  const roll = (u: number, k: number) => 5.5 * Math.sin(u / 15 + 0.6) * (1 - k);
  if (f <= WARP.cruiseTo) {
    // already at full speed on the cut (the drop), a breath of sway
    const u = f - t0;
    return { x: 26 * Math.sin(u / 9), y: 18 * Math.sin(u / 13 + 1), z: -WARP.v0 * u, roll: roll(u, 0) };
  }
  if (f <= WARP.brakeTo) {
    const t = (f - WARP.cruiseTo) / (WARP.brakeTo - WARP.cruiseTo);
    const e = EASE_OUT3(t);
    const sway = (1 - e) * 26 * Math.sin((f - t0) / 9);
    return {
      x: sway + (end.x - sway) * EASE_OUT3(Math.min(1, t * 1.15)),
      y: (1 - e) * 18 * Math.sin((f - t0) / 13 + 1) + end.y * EASE_OUT3(Math.min(1, t * 1.15)),
      z: -CRUISE - BRAKE * e,
      roll: roll(f - t0, EASE_OUT3(Math.min(1, t * 1.3))),
    };
  }
  if (f <= HITS.dive) {
    // the held beat: the needle faces the camera; on the find a punch-in
    // that settles, then a slow creep
    const t = (f - WARP.brakeTo) / (HITS.dive - WARP.brakeTo);
    const u = f - WARP.brakeTo;
    const punch = u > 0 ? 52 * (u / 3) * Math.exp(1 - u / 3) : 0;
    return { ...end, z: end.z - WARP.creep * t - punch };
  }
  // the dive: accelerating into the card, onto the cut
  const t = Math.min(1, (f - HITS.dive) / (HITS.answer - HITS.dive));
  const g = t * t * t;
  const u = f - WARP.brakeTo;
  const punch = 52 * (u / 3) * Math.exp(1 - u / 3);
  return { x: end.x, y: end.y + 60 * g, z: end.z - WARP.creep - punch - (WARP.dFinal - WARP.creep - punch - 95) * g };
};

/** the needle's own move: it turns to face the camera as the camera brakes onto it */
export const targetAt = (f: number): Inst => {
  const t = Math.min(1, Math.max(0, (f - WARP.cruiseTo) / (WARP.brakeTo - WARP.cruiseTo)));
  // a spring settle: it swings past square by a hair and comes back
  const e = 1 - Math.exp(-5 * t) * Math.cos(4.2 * t);
  const k = Math.min(1, e);
  return { key: 'target', id: TARGET.id, x: TARGET.x, y: TARGET.y, z: TARGET.z, rx: 7 * (1 - k), ry: 34 * (1 - e), rz: -8 * (1 - e) };
};

export const focusB = (f: number) => {
  const c = cameraB(f);
  const onNeedle = c.z - TARGET.z;
  if (f <= WARP.cruiseTo) return 1500;
  const t = Math.min(1, (f - WARP.cruiseTo) / (WARP.brakeTo - WARP.cruiseTo - 10));
  return 1500 + (onNeedle - 1500) * EASE_OUT3(t);
};

export const fieldB = (f: number): { cam: Cam; insts: Inst[] } => ({ cam: cameraB(f), insts: [...LAYOUT_B, targetAt(f)] });
