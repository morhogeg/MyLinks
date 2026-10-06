/**
 * THE FILM. One continuous session of the real app (live/shoot.mjs), shown
 * on a glass slab in a 3D set, with the camera, the lifts, the words and the
 * endcard choreographed around it.
 *
 * Rules this file keeps (marketing/launch-clip/README.md, "Live film"):
 *  - every pixel of app UI is a captured frame; nothing is redrawn. A lift
 *    is the SAME frame cropped onto its own plane: the app's own pixels;
 *  - the camera glides through its marks (engine/track.js) and only tilts
 *    hard in 3D while nothing on screen must be read;
 *  - the app's curves (engine/ease.js), ink, paper and Geist;
 *  - copy is the reel's owner-approved lines.
 *
 * Two media modes, one choreography:
 *  - RENDER (live/render.mjs): the slab and every lift show captured PNG
 *    frames, so each output frame is exact;
 *  - LIVE (the baked site): the slab IS the baked screen video (bake.mjs),
 *    and lifts are canvases drawn from that video (or from a still, when a
 *    lift shows a frame the screen is not showing), so the page streams one
 *    small video instead of 1,200 PNGs.
 */

import { rig } from '../engine/track.js';
import { EXIT, GATHER, GLIDE, INOUT, MODAL, SPRING, clamp, mix, prog } from '../engine/ease.js';
import { chaptersOf, makeEdit, stillFrames } from './edit.js';
import { wordsOf } from './words.js';

export const SCREEN = { w: 393, h: 852 };
/** world px per screen point */
const LW = 1;
/** the iPhone 15/16 Pro display corner radius, points */
const SCREEN_RADIUS = 55;

const div = (cls) => {
  const d = document.createElement('div');
  d.className = cls;
  return d;
};

/** Deterministic pseudo-random in [0,1) from an integer seed. */
const rand = (seed) => {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
};

/**
 * @param {object} o
 * @param {import('../engine/stage.js').Stage} o.stage
 * @param {object} o.index      the capture index (media.mjs / bake.mjs)
 * @param {object} o.captions   engine/type.js Captions
 * @param {object} o.overlay    2D layers (taps, marks, threads, brand, day)
 * @param {object} o.format     film/formats.js
 * @param {HTMLVideoElement} [o.video]  LIVE mode: the baked screen video
 */
export function buildFilm({ stage, index, captions, overlay, format, video }) {
  const session = index.takes.session;
  const cardsTake = index.takes.cards;
  const LIVE = !!video;
  // layout px per screen point: the capture's density, or the baked video's
  const LS = LIVE ? index.live.dpr : session.dpr;
  const src = (take, i) => `media/takes/${take}/${index.takes[take].files[i]}`;
  const rectOf = (take, i, name) => index.takes[take].rects[i]?.[name] ?? null;
  const F = format;

  // ───────────────────────────────────────────────────────── the edit
  const S = makeEdit(session);
  const A = S.at;
  const end = S.dur;
  const frameOf = (label, off = 0) => S.frameAt(A[label] + off);
  const STILL = stillFrames(session);
  const stills = {};
  if (LIVE) {
    for (const [k, f] of Object.entries(STILL)) {
      const img = new Image();
      img.src = index.live.stills[f];
      stills[f] = img;
    }
  }

  // ───────────────────────────────────────────────────────── planes
  const pending = new Set();
  const setSrc = (img, url) => {
    if (img.dataset.src === url) return;
    img.dataset.src = url;
    img.src = url;
    pending.add(img);
  };

  /** the glass slab carrying the app */
  const makeSlab = (id) => {
    const el = div('slab');
    el.style.borderRadius = `${SCREEN_RADIUS * LS}px`;
    el.style.boxShadow = `0 0 0 ${(0.75 * LS).toFixed(2)}px var(--hairline)`;
    let img = null;
    if (LIVE) {
      video.className = 'screen';
      el.appendChild(video);
    } else {
      img = document.createElement('img');
      img.className = 'screen';
      img.decoding = 'sync';
      el.appendChild(img);
    }
    const glass = div('glass');
    el.appendChild(glass);
    const ink = div('ink');
    el.appendChild(ink);
    const p = stage.add(id, el, { w: SCREEN.w * LS, h: SCREEN.h * LS });
    p.s = LW / LS;
    Object.assign(p, { img, glass, ink });
    return p;
  };

  /** a soft studio shadow (world px) */
  const makeShadow = (id, w, h, radius, blur = 30) => {
    const el = div('shadow');
    el.style.borderRadius = `${radius}px`;
    const soft = div('soft');
    soft.style.filter = `blur(${blur}px)`;
    el.appendChild(soft);
    const p = stage.add(id, el, { w, h });
    p.dofScale = 0;
    p.soft = soft;
    return p;
  };

  /**
   * A piece of the app lifted off its screen: a frame of the session, cropped
   * to a box. `show(frame, rect)` picks the frame and the box (both can change
   * every frame: the dialog's box does).
   */
  const makeCrop = (id, rect, radius) => {
    const el = div('crop');
    el.style.borderRadius = `${radius * LS}px`;
    let img = null;
    let canvas = null;
    let ctx = null;
    if (LIVE) {
      canvas = document.createElement('canvas');
      canvas.className = 'cropcanvas';
      ctx = canvas.getContext('2d');
      el.appendChild(canvas);
    } else {
      img = document.createElement('img');
      img.className = 'cropimg';
      img.decoding = 'sync';
      img.style.width = `${SCREEN.w * LS}px`;
      img.style.height = `${SCREEN.h * LS}px`;
      el.appendChild(img);
    }
    const p = stage.add(id, el, { w: rect[2] * LS, h: rect[3] * LS });
    p.s = LW / LS;
    p.rect = rect;
    let box = '';
    p.show = (frame, r = p.rect) => {
      p.rect = r;
      const w = Math.round(r[2] * LS);
      const h = Math.round(r[3] * LS);
      const key = r.join(',');
      if (key !== box) {
        box = key;
        p.w = w;
        p.h = h;
        el.style.width = `${w}px`;
        el.style.height = `${h}px`;
        if (img) img.style.transform = `translate(${-r[0] * LS}px, ${-r[1] * LS}px)`;
        if (canvas) {
          canvas.width = w;
          canvas.height = h;
        }
      }
      if (img) {
        setSrc(img, src('session', frame));
        return;
      }
      // LIVE: the screen video when the lift shows what the screen shows,
      // else the still bake.mjs exported for that frame
      const still = frame !== S.frameAt(p._t ?? 0) ? stills[frame] : null;
      const source = still && still.complete ? still : video;
      const k = source === video ? video.videoWidth / SCREEN.w || LS : source.naturalWidth / SCREEN.w;
      try {
        ctx.drawImage(source, r[0] * k, r[1] * k, r[2] * k, r[3] * k, 0, 0, w, h);
      } catch {
        /* the video has no frame yet */
      }
    };
    return p;
  };

  const shadow = makeShadow('slabShadow', SCREEN.w * LW * 0.92, SCREEN.h * LW * 0.94, SCREEN_RADIUS, 44);
  const slab = makeSlab('slab');

  // lifts, by the box the capture recorded at the moment each is lifted
  const settled = (label, name, off = 0) => rectOf('session', frameOf(label, off), name);
  const L = {};
  const lift = (key, rect, radius) => {
    if (!rect) return;
    const sh = makeShadow(`${key}Shadow`, rect[2] * LW, rect[3] * LW, radius);
    const p = makeCrop(key, rect, radius);
    L[key] = { p, sh, rect };
  };
  const dialogSettledRect = rectOf('session', STILL.dialogSettled, 'dialog');
  const dialogLastRect = rectOf('session', STILL.dialogLast, 'dialog') ?? dialogSettledRect;
  lift('dialog', dialogSettledRect, 24);
  lift('card', settled('landed', 'firstCard'), 24);
  lift('result', settled('resultHold', 'card'), 24);
  const takeawayRect = settled('detailEnd', 'takeaway');
  lift('takeaway', takeawayRect ? [takeawayRect[0] - 4, takeawayRect[1] - 6, takeawayRect[2] + 8, takeawayRect[3] + 10] : null, 14);
  // Revisit's first "Do this" row: the Tail End's own to-do, come back
  lift('todo', settled('revHold', 'todoRow') ?? [17, 152, 359, 86], 14);

  // the account's saves, as the feed draws them (the `cards` take)
  const CONST = [];
  Object.keys(cardsTake.marks).forEach((id, k) => {
    const i = cardsTake.marks[id];
    const r = cardsTake.rects[i]?.card;
    if (!r) return;
    const d = LIVE ? index.live.dpr : cardsTake.dpr;
    const el = div('crop');
    el.style.borderRadius = `${24 * d}px`;
    const img = document.createElement('img');
    img.className = 'cropimg';
    if (LIVE) {
      img.style.width = `${r[2] * d}px`;
      img.style.height = `${r[3] * d}px`;
      img.src = index.live.cards[id];
    } else {
      img.style.width = `${SCREEN.w * d}px`;
      img.style.height = `${SCREEN.h * d}px`;
      img.style.transform = `translate(${-r[0] * d}px, ${-r[1] * d}px)`;
      img.src = src('cards', i);
      pending.add(img);
    }
    el.appendChild(img);
    const p = stage.add(`card-${id}`, el, { w: r[2] * d, h: r[3] * d });
    p.base = LW / d;
    p.s = p.base;
    p.cardId = id;
    p.k = k;
    p.visible = false;
    CONST.push(p);
  });
  const cardById = (id) => CONST.find((p) => p.cardId === id);

  // ───────────────────────────────────────────────────────── overlays
  const taps = [
    { t: A.dialog - 0.12, rect: settled('home', 'plus') },
    { t: A.modeImage - 0.06, rect: settled('modeImage', 'tabImage', 0.3) },
    { t: A.modeNote - 0.06, rect: settled('modeNote', 'tabNote', 0.3) },
    { t: A.modeLink - 0.06, rect: settled('modeLink', 'tabLink', 0.3) },
    { t: A.phase0 - 0.1, rect: rectOf('session', session.marks.filled, 'save') },
    { t: A.detail - 0.08, rect: settled('landed', 'firstCard'), at: [120, 40] },
    { t: A.close - 0.06, rect: settled('detailEnd', 'close') },
    { t: A.focus - 0.06, rect: settled('findHome', 'search') },
    { t: A.askOpen - 0.08, rect: settled('askHome', 'askTab') },
    { t: A.sent - 0.05, rect: settled('askTyping', 'send', 1.0) },
    { t: A.graph - 0.08, rect: settled('srcHold', 'graphChip') },
    { t: A.revisit - 0.08, rect: settled('graphHold', 'revisitTab') },
    { t: A.expand - 0.08, rect: settled('revHold', 'recap'), at: [180, 26] },
  ].filter((x) => x.rect);
  taps.forEach((tp) => {
    const el = div('tap');
    overlay.taps.appendChild(el);
    tp.el = el;
  });

  // brackets: the mark's own gesture, as a viewfinder closing on what matters
  const finders = [
    { t0: A.landed + 0.35, t1: A.landed + 2.35, target: () => L.card?.p },
    { t0: A.resultHold + 0.1, t1: A.resultHold + 1.6, target: () => L.result?.p },
  ];
  finders.forEach((f) => {
    const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    el.setAttribute('class', 'finder');
    el.innerHTML = '<path class="fl"/><path class="fr"/>';
    overlay.marks.appendChild(el);
    f.el = el;
  });

  // threads from the answer's sources to the saves they came from
  const SOURCES = [
    { chip: 'chip1', id: 'tailend' },
    { chip: 'chip2', id: 'procrastinator' },
    { chip: 'chip3', id: 'naval' },
  ];
  const threadSvg = overlay.threads;
  SOURCES.forEach((s) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('class', 'thread');
    path.setAttribute('pathLength', '1');
    threadSvg.appendChild(path);
    const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    dot.setAttribute('class', 'thread-dot');
    dot.setAttribute('r', '4');
    threadSvg.appendChild(dot);
    const end2 = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    end2.setAttribute('class', 'thread-dot');
    end2.setAttribute('r', '3.2');
    threadSvg.appendChild(end2);
    Object.assign(s, { path, dot, end: end2 });
  });

  // ───────────────────────────────────────────────────────── words
  const C = F.captions;
  // the words (film/words.js, which the narrator reads too)
  for (const w of wordsOf(A, end, F.name)) captions.add({ ...w, place: w.place === 'end' ? 'end' : C[w.place] });

  // ───────────────────────────────────────────────────────── camera
  const cam = rig(F.camera(A, end), F.camDefaults, { log: ['zoom'] });
  // slab drift: a slow breath so the set is never frozen
  const slabPose = rig(F.slabPose(A, end), { rx: 0, ry: 0, rz: 0, x: 0, y: 0, z: 0 });

  // ───────────────────────────────────────────────────────── helpers
  /** place `pl` over a box of the slab (points), `h` world px off the glass */
  const placeOn = (pl, base, rectPt, h, extra = {}) => {
    const cx = (rectPt[0] + rectPt[2] / 2 - SCREEN.w / 2) * LS;
    const cy = (rectPt[1] + rectPt[3] / 2 - SCREEN.h / 2) * LS;
    const at = stage.planeToWorld(base, cx, cy, 0);
    const n = stage.planeNormal(base);
    pl.x = at[0] + n[0] * h;
    pl.y = at[1] + n[1] * h;
    pl.z = at[2] + n[2] * h;
    pl.rx = base.rx + (extra.rx ?? 0);
    pl.ry = base.ry + (extra.ry ?? 0);
    pl.rz = base.rz + (extra.rz ?? 0);
  };
  const placeShadow = (o, rect, k, dx = 10, dy = 26) => {
    placeOn(o.sh, slab, rect, 0.3);
    o.sh.x += dx * k;
    o.sh.y += dy * k;
    o.sh.w = rect[2] * LW;
    o.sh.h = rect[3] * LW;
    o.sh.el.style.width = `${o.sh.w}px`;
    o.sh.el.style.height = `${o.sh.h}px`;
    o.sh.s = 1 + 0.03 * k;
    o.sh.opacity = 0.32 * k;
    o.sh.soft.style.filter = `blur(${(8 + 22 * k).toFixed(1)}px)`;
  };
  /** lift envelope: 0 at rest on the glass → 1 fully lifted */
  const liftCurve = (t, t0, t1, up = 0.55, down = 0.45) =>
    Math.min(prog(t, t0, t0 + up, SPRING), 1 - prog(t, t1 - down, t1, INOUT));

  // the dialog's life: it rises out of the + and folds back into the feed
  const DLG = {
    rise0: A.dialog - 0.02,
    rise1: A.dialog + 0.5,
    close: A.done + (STILL.dialogLast - session.marks.done + 1) / 30,
  };
  DLG.fold1 = DLG.close + 0.45;
  const plusRect = settled('home', 'plus');
  const slotRect = settled('landed', 'firstCard') ?? [16, 172, 361, 302.5];

  // ───────────────────────────────────────────────────────── per frame
  function update(t) {
    pending.clear();
    const c = cam(t);
    stage.setCamera({ ...c, d: c.lens / c.zoom });

    // the backdrop's light shifts against the camera: depth without a set
    const dayTf = `translate(-50%, -50%) translate(${(-c.yaw * 13 - (c.fx - F.size.w / 2) * 0.18).toFixed(1)}px, ${(c.pitch * 11).toFixed(1)}px)`;
    for (const d of overlay.day) d.style.transform = dayTf;

    // the screen
    const fi = S.frameAt(t);
    if (!LIVE) setSrc(slab.img, src('session', fi));
    const pose = slabPose(t);
    Object.assign(slab, { x: pose.x, y: pose.y, z: pose.z, rx: pose.rx, ry: pose.ry, rz: pose.rz });

    // ── the outro: the screen becomes the point of the mark
    const toPoint = prog(t, A.outro + 0.5, A.outro + 1.9, GATHER);
    const tp = prog(t, A.outro + 0.5, A.outro + 1.9, INOUT);
    const P = F.endPoint;
    slab.s = (LW / LS) * mix(1, P.d / (SCREEN.w * LW), tp);
    slab.x = mix(slab.x, P.x, toPoint);
    slab.y = mix(slab.y, P.y, toPoint);
    const insetY = ((SCREEN.h - SCREEN.w) / 2) * LS * tp;
    const radius = mix(SCREEN_RADIUS * LS, (SCREEN.w * LS) / 2, tp);
    slab.el.style.clipPath = tp > 0 ? `inset(${insetY.toFixed(1)}px 0 round ${radius.toFixed(1)}px)` : '';
    slab.ink.style.opacity = String(prog(t, A.outro + 0.6, A.outro + 1.45, INOUT));
    // the glass sheen slides with the angle between slab and camera
    slab.glass.style.backgroundPosition = `${(50 + (c.yaw + slab.ry) * 2.2).toFixed(1)}% 0`;
    const pointSwap = t >= A.outro + 1.9;
    slab.visible = !pointSwap;
    shadow.visible = !pointSwap;
    slab.opacity = 1;

    placeOn(shadow, slab, [0, 0, SCREEN.w, SCREEN.h], -90);
    shadow.y += 34 * (slab.s * LS);
    shadow.s = slab.s * LS;
    shadow.opacity = 0.3 * (1 - tp);

    // ── the Add dialog: up out of the + while the screen dims behind it,
    // live while it is open, then down into the slot the new card fills
    let kDim = 0;
    {
      const o = L.dialog;
      const on = o && t >= DLG.rise0 && t <= DLG.fold1;
      if (o) {
        o.p.visible = on;
        o.sh.visible = on;
      }
      kDim = Math.min(prog(t, A.dialog - 0.05, A.dialog + 0.4, MODAL), 1 - prog(t, DLG.close, DLG.close + 0.5, INOUT));
      if (on) {
        o.p._t = t;
        // position settles (no overshoot), size springs
        const rise = prog(t, DLG.rise0, DLG.rise1, MODAL);
        const riseS = prog(t, DLG.rise0, DLG.rise1, SPRING);
        const fold = prog(t, DLG.close, DLG.fold1, INOUT);
        const live = t >= DLG.rise1 && t < DLG.close;
        const frame = t < DLG.rise1 ? STILL.dialogSettled : live ? fi : STILL.dialogLast;
        const rect = t < DLG.rise1 ? dialogSettledRect : live ? rectOf('session', fi, 'dialog') ?? dialogLastRect : dialogLastRect;
        o.p.show(frame, rect);
        // where it is: from the + to its lifted place, then into the slot
        const from = {};
        const at = {};
        const to = {};
        placeOn(from, slab, plusRect ?? rect, 0);
        placeOn(at, slab, rect, 70);
        placeOn(to, slab, slotRect, 4);
        const lerp = (k) => (k1, k2) => mix(k1, k2, k);
        const a = lerp(rise);
        const b = lerp(fold);
        o.p.x = b(a(from.x, at.x), to.x);
        o.p.y = b(a(from.y, at.y), to.y);
        o.p.z = b(a(from.z, at.z), to.z);
        o.p.rx = at.rx;
        o.p.ry = at.ry;
        o.p.rz = at.rz;
        const sRise = mix(0.14, 1.02, riseS);
        o.p.s = (LW / LS) * mix(sRise, 0.84, fold);
        o.p.opacity = clamp(prog(t, DLG.rise0, DLG.rise0 + 0.14, MODAL)) * (1 - prog(t, DLG.close + 0.2, DLG.fold1, EXIT));
        placeShadow(o, rect, rise * (1 - fold));
      }
    }
    // ── the other lifts: the same frame the screen shows, off the glass
    const liftOne = (key, t0, t1, height, tilt = {}) => {
      const o = L[key];
      if (!o) return 0;
      const k = liftCurve(t, t0, t1);
      const on = t >= t0 && t <= t1;
      o.p.visible = on;
      o.sh.visible = on;
      if (!on) return 0;
      o.p._t = t;
      o.p.show(fi, o.rect);
      placeOn(o.p, slab, o.rect, height * k + 0.5, { rx: (tilt.rx ?? 0) * k, ry: (tilt.ry ?? 0) * k, rz: (tilt.rz ?? 0) * k });
      o.p.s = (LW / LS) * (1 + (tilt.s ?? 0.04) * k);
      o.p.opacity = clamp(k * 6);
      placeShadow(o, o.rect, k);
      return k;
    };
    const kCard = liftOne('card', A.landed + 0.15, A.detail - 0.05, 190, { ry: -8, rx: 4, s: 0.06 });
    const kTake = liftOne('takeaway', A.detailEnd + 0.05, A.close - 0.02, 70, { s: 0.05 });
    const kResult = liftOne('result', A.resultHold, A.findDone - 0.02, 120, { ry: 7, rx: 4, s: 0.05 });
    const kTodo = liftOne('todo', A.revHold + 0.35, A.expand - 0.02, 95, { ry: -4, rx: 3, s: 0.06 });
    const focusLift = Math.max(kCard, kTake * 0.7, kResult, kTodo * 0.85);
    slab.blurAdd = 2.2 * focusLift + 5 * kDim;
    // behind the risen dialog the app dims its screen with a black scrim:
    // the slab steps back and fades, so the set stays light
    slab.opacity = 1 - 0.86 * kDim;
    slab.z -= 140 * kDim;

    // ── the constellation: the account's saves orbiting the slab as a ring
    const RG = F.ring;
    const N = CONST.length;
    const ringAt = (k, tt, r) => {
      const a = (k / N) * Math.PI * 2 + RG.speed * tt + RG.phase;
      const p0 = [r * Math.sin(a), 0, r * Math.cos(a)];
      const cs = Math.cos((RG.tilt * Math.PI) / 180);
      const sn = Math.sin((RG.tilt * Math.PI) / 180);
      return { x: p0[0], y: RG.y + p0[1] * cs - p0[2] * sn, z: p0[1] * sn + p0[2] * cs, a };
    };
    const openIn = prog(t, A.home + 0.2, A.home + 1.7, MODAL);
    const askIn = prog(t, A.sources + 0.45, A.sources + 1.35, MODAL);
    const askOut = prog(t, A.graph - 0.45, A.graph + 0.25, INOUT);
    CONST.forEach((p) => {
      const k = p.k;
      const srcIdx = SOURCES.findIndex((q) => q.id === p.cardId);
      let vis = false;
      let x = 0;
      let y = 0;
      let z = 0;
      let sc = RG.s;
      let op = 1;
      let ry = 0;
      let rx = 0;
      const stagger = rand(k + 3) * 0.28;
      if (t < A.home + 6.4) {
        // opening: the ring tightens in from wide, orbits, then spirals into
        // the screen
        const g = prog(t, A.home + 4.7 + stagger, A.home + 5.75 + stagger, GATHER);
        const r = mix(RG.R * 1.85, RG.R, openIn) * (1 - g);
        const q = ringAt(k, t - A.home, r);
        x = q.x;
        y = mix(q.y, 0, g);
        z = q.z;
        sc = RG.s * mix(1, 0.12, g);
        ry = Math.sin(q.a) * RG.turn * (1 - g);
        rx = -RG.tilt * 0.35 * (1 - g);
        op = clamp(openIn * 1.6) * (1 - prog(t, A.home + 5.45 + stagger, A.home + 5.8 + stagger, EXIT));
        vis = op > 0.001;
      } else if (srcIdx >= 0 && t > A.sources && t < A.graph + 0.4) {
        // Ask: the three sources rise beside the answer
        const spot = F.askSpots[srcIdx];
        const rise = prog(t, A.sources + 0.45 + srcIdx * 0.12, A.sources + 1.35 + srcIdx * 0.12, SPRING);
        x = mix(spot.x - 140, spot.x, rise) + Math.sin(t * 0.6 + srcIdx) * 4;
        y = mix(spot.y + 60, spot.y, rise) + Math.cos(t * 0.5 + srcIdx) * 3;
        z = mix(spot.z - 260, spot.z, rise) - askOut * 320;
        sc = spot.s;
        ry = spot.ry;
        rx = spot.rx;
        op = clamp(rise * 1.4) * (1 - askOut) * askIn;
        vis = op > 0.001;
      } else if (t >= A.outro - 0.4) {
        // outro: the ring comes back once more, then spirals into the point
        const b = prog(t, A.outro - 0.3, A.outro + 0.9, MODAL);
        const g = prog(t, A.outro + 0.7 + stagger * 0.6, A.outro + 1.5 + stagger * 0.6, GATHER);
        const r = mix(RG.R * 1.85, RG.R * 0.9, b) * (1 - g);
        const q = ringAt(k, t - A.outro + 2.1, r);
        x = mix(q.x, F.endPoint.x, g);
        y = mix(q.y, F.endPoint.y, g);
        z = q.z * (1 - g);
        sc = RG.s * mix(1, 0.08, g);
        ry = Math.sin(q.a) * RG.turn * (1 - g);
        rx = -RG.tilt * 0.35 * (1 - g);
        op = clamp(b * 1.6) * (1 - prog(t, A.outro + 1.2 + stagger * 0.6, A.outro + 1.55 + stagger * 0.6, EXIT));
        vis = op > 0.001;
      }
      Object.assign(p, { visible: vis, x, y, z, s: p.base * sc, ry, rx, opacity: op });
    });

    stage.commit();

    // ── overlays (2D, after the camera moved)
    // taps: a soft ink ring where a finger lands
    for (const tp2 of taps) {
      const lt = t - tp2.t;
      const on = lt > -0.05 && lt < 0.55;
      tp2.el.style.display = on ? '' : 'none';
      if (!on) continue;
      const [rx0, ry0, rw, rh] = tp2.rect;
      const u = tp2.at ? rx0 + tp2.at[0] : rx0 + rw / 2;
      const v = tp2.at ? ry0 + tp2.at[1] : ry0 + rh / 2;
      const q = stage.project(stage.planeToWorld(slab, (u - SCREEN.w / 2) * LS, (v - SCREEN.h / 2) * LS, 0));
      const press = prog(lt, -0.05, 0.12, MODAL);
      const ring = prog(lt, 0.05, 0.55, MODAL);
      const size = 46 * q.scale;
      tp2.el.style.transform = `translate(${(q.x - size / 2).toFixed(1)}px, ${(q.y - size / 2).toFixed(1)}px) scale(${(0.7 + 0.6 * ring).toFixed(3)})`;
      tp2.el.style.width = `${size}px`;
      tp2.el.style.height = `${size}px`;
      tp2.el.style.opacity = String((press * (1 - ring) * 0.9).toFixed(3));
    }

    // brackets closing on a lifted plane
    for (const f of finders) {
      const p = f.target();
      const on = p && t >= f.t0 && t <= f.t1 && p.visible;
      f.el.style.display = on ? '' : 'none';
      if (!on) continue;
      const b = stage.bbox(p);
      const close = prog(t, f.t0, f.t0 + 0.55, SPRING);
      const fade = 1 - prog(t, f.t1 - 0.35, f.t1, EXIT);
      const pad = mix(46, 16, close);
      const arm = 26;
      const x0 = b.x - pad;
      const x1 = b.x + b.w + pad;
      const y0 = b.y - pad * 0.6;
      const y1 = b.y + b.h + pad * 0.6;
      f.el.querySelector('.fl').setAttribute('d', `M${x0 + arm} ${y0} H${x0} V${y1} H${x0 + arm}`);
      f.el.querySelector('.fr').setAttribute('d', `M${x1 - arm} ${y0} H${x1} V${y1} H${x1 - arm}`);
      f.el.style.opacity = String((clamp(close * 2) * fade).toFixed(3));
    }

    // threads: answer source row → the save it came from
    const threadOn = t > A.sources + 0.6 && t < A.graph + 0.2;
    threadSvg.style.display = threadOn ? '' : 'none';
    if (threadOn) {
      const draw = prog(t, A.sources + 0.7, A.sources + 1.6, MODAL);
      const fade = 1 - prog(t, A.graph - 0.45, A.graph + 0.1, EXIT);
      SOURCES.forEach((s, k) => {
        const r = rectOf('session', fi, s.chip) ?? rectOf('session', frameOf('srcHold'), s.chip);
        const card = cardById(s.id);
        if (!r || !card || !card.visible) {
          s.path.style.opacity = '0';
          s.dot.style.opacity = '0';
          s.end.style.opacity = '0';
          return;
        }
        const a = stage.project(stage.planeToWorld(slab, (r[0] + r[2] - 2 - SCREEN.w / 2) * LS, (r[1] + r[3] / 2 - SCREEN.h / 2) * LS, 0));
        const bb = stage.bbox(card);
        const bx = bb.x;
        const by = bb.y + bb.h * 0.5;
        const mx = (a.x + bx) / 2;
        s.path.setAttribute('d', `M${a.x.toFixed(1)} ${a.y.toFixed(1)} C${mx.toFixed(1)} ${a.y.toFixed(1)}, ${mx.toFixed(1)} ${by.toFixed(1)}, ${bx.toFixed(1)} ${by.toFixed(1)}`);
        const d = clamp(draw * 1.25 - k * 0.12);
        s.path.style.strokeDasharray = '1';
        s.path.style.strokeDashoffset = String(1 - d);
        s.path.style.opacity = String((0.55 * fade).toFixed(3));
        s.dot.setAttribute('cx', a.x.toFixed(1));
        s.dot.setAttribute('cy', a.y.toFixed(1));
        s.dot.style.opacity = String((clamp(d * 3) * fade).toFixed(3));
        s.end.setAttribute('cx', bx.toFixed(1));
        s.end.setAttribute('cy', by.toFixed(1));
        s.end.style.opacity = String((clamp((d - 0.92) * 12) * fade).toFixed(3));
      });
    }

    // ── endcard: brackets close on the point, the wordmark arrives
    const brand = overlay.brand;
    const bOn = t >= A.outro + 1.75;
    brand.style.display = bOn ? '' : 'none';
    if (bOn) {
      const q = stage.project([F.endPoint.x, F.endPoint.y, 0]);
      brand.style.left = `${q.x.toFixed(1)}px`;
      brand.style.top = `${q.y.toFixed(1)}px`;
      const shut = prog(t, A.outro + 1.85, A.outro + 2.45, SPRING);
      const bl = brand.querySelector('.bl');
      const br = brand.querySelector('.br');
      bl.setAttribute('transform', `translate(${(-130 * (1 - shut)).toFixed(2)} 0)`);
      br.setAttribute('transform', `translate(${(130 * (1 - shut)).toFixed(2)} 0)`);
      bl.style.opacity = br.style.opacity = String(clamp(shut * 3).toFixed(3));
      brand.querySelector('.dot').style.opacity = pointSwap ? '1' : '0';
      const pop = prog(t, A.outro + 1.9, A.outro + 2.35, SPRING);
      brand.querySelector('.dot').setAttribute('transform', `translate(512 500) scale(${mix(0.86, 1, pop).toFixed(3)}) translate(-512 -500)`);
      const word = prog(t, A.outro + 2.5, A.outro + 3.25, MODAL);
      const wm = brand.querySelector('.wordmark');
      wm.style.opacity = String(word.toFixed(3));
      wm.style.filter = word < 0.999 ? `blur(${((1 - word) * 8).toFixed(2)}px)` : '';
      wm.style.transform = `translate(-50%, ${((1 - word) * 10).toFixed(2)}px)`;
    }

    captions.update(t);
    return [...pending];
  }

  return {
    duration: end,
    at: A,
    chapters: chaptersOf(A),
    update,
    frameAt: (t) => S.frameAt(t),
  };
}
