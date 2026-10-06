/**
 * The stage: a CSS 3D set, a camera, and planes placed in it.
 *
 * Coordinates are CSS pixels of the design frame (1920 × 1080 landscape,
 * 1080 × 1920 portrait), origin at the camera's aim, y down, z toward the
 * viewer. Everything the film shows is a PLANE: a glass slab carrying a frame
 * of the real app, a piece of the app lifted off it, a shadow. The camera is
 * an orbit camera (target, distance, yaw, pitch, roll) with a lens (CSS
 * perspective) and an aim point in the frame (fx, fy).
 *
 * Planes get depth of field from the camera: their blur grows with their
 * distance from the focus plane, so a rack focus is just moving `focus`.
 *
 * Nothing here knows about Machina; scenes (film/) drive it.
 */

const DEG = Math.PI / 180;

/** Rotate a point by CSS rotateX/Y/Z (degrees), matching the CSS matrices. */
function rotX(p, a) {
  const c = Math.cos(a * DEG);
  const s = Math.sin(a * DEG);
  return [p[0], p[1] * c - p[2] * s, p[1] * s + p[2] * c];
}
function rotY(p, a) {
  const c = Math.cos(a * DEG);
  const s = Math.sin(a * DEG);
  return [p[0] * c + p[2] * s, p[1], -p[0] * s + p[2] * c];
}
function rotZ(p, a) {
  const c = Math.cos(a * DEG);
  const s = Math.sin(a * DEG);
  return [p[0] * c - p[1] * s, p[0] * s + p[1] * c, p[2]];
}

export const DEFAULT_CAM = {
  tx: 0,
  ty: 0,
  tz: 0,
  /** distance from the target; zoom at the target = lens / d */
  d: 2400,
  yaw: 0,
  pitch: 0,
  roll: 0,
  /** CSS perspective, px: long lens = flat and premium, short = dramatic */
  lens: 2400,
  /** where the target lands in the frame, px */
  fx: 960,
  fy: 540,
  /** focus distance from the camera (0 = the target's distance) */
  focus: 0,
  /** depth-of-field strength: blur px per 100px off the focus plane */
  dof: 0,
};

export class Stage {
  /**
   * @param {HTMLElement} root   element sized to the design frame
   * @param {{w:number,h:number}} size
   */
  constructor(root, size) {
    this.root = root;
    this.size = size;
    this.cam = { ...DEFAULT_CAM, fx: size.w / 2, fy: size.h / 2 };
    this.view = root.querySelector('.view');
    this.world = root.querySelector('.world');
    this.planes = new Map();
  }

  /** Register a plane. `el` is its DOM node (already sized: w × h px). */
  add(id, el, { w, h, layer = 'world' } = {}) {
    el.classList.add('plane');
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    (layer === 'world' ? this.world : this.root.querySelector(`.${layer}`)).appendChild(el);
    const p = {
      id,
      el,
      w,
      h,
      x: 0,
      y: 0,
      z: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      s: 1,
      opacity: 1,
      blur: 0,
      /** extra blur on top of depth of field */
      blurAdd: 0,
      visible: true,
      dofScale: 1,
      _last: {},
    };
    this.planes.set(id, p);
    return p;
  }

  get(id) {
    return this.planes.get(id);
  }

  setCamera(c) {
    Object.assign(this.cam, c);
  }

  /** World point → camera space (before projection). */
  toCamera(pt) {
    const c = this.cam;
    let p = [pt[0] - c.tx, pt[1] - c.ty, pt[2] - c.tz];
    p = rotZ(p, c.roll);
    p = rotY(p, c.yaw);
    p = rotX(p, c.pitch);
    p[2] += c.lens - c.d;
    return p;
  }

  /** World point → frame px, plus its distance from the viewer. */
  project(pt) {
    const c = this.cam;
    const q = this.toCamera(pt);
    const dist = c.lens - q[2];
    const k = c.lens / Math.max(1, dist);
    return { x: c.fx + q[0] * k, y: c.fy + q[1] * k, scale: k, dist };
  }

  /** A point given in a plane's own px (origin at its centre) → world. */
  planeToWorld(p, lx, ly, lz = 0) {
    let q = [lx * p.s, ly * p.s, lz * p.s];
    q = rotX(q, p.rx);
    q = rotY(q, p.ry);
    q = rotZ(q, p.rz);
    return [q[0] + p.x, q[1] + p.y, q[2] + p.z];
  }

  /** The plane's outward normal in world space (unit). */
  planeNormal(p) {
    let q = [0, 0, 1];
    q = rotX(q, p.rx);
    q = rotY(q, p.ry);
    q = rotZ(q, p.rz);
    return q;
  }

  /** Projected bounding box of a plane (or of a sub-rect of it, plane px). */
  bbox(p, rect) {
    const r = rect ?? { x: -p.w / 2, y: -p.h / 2, w: p.w, h: p.h };
    const pts = [
      [r.x, r.y],
      [r.x + r.w, r.y],
      [r.x, r.y + r.h],
      [r.x + r.w, r.y + r.h],
    ].map(([lx, ly]) => this.project(this.planeToWorld(p, lx, ly)));
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  }

  /** Apply the camera and every plane to the DOM. */
  commit() {
    const c = this.cam;
    const r4 = (v) => Math.round(v * 1e4) / 1e4;
    this.view.style.perspective = `${r4(c.lens)}px`;
    this.view.style.perspectiveOrigin = `${r4(c.fx)}px ${r4(c.fy)}px`;
    this.world.style.left = `${r4(c.fx)}px`;
    this.world.style.top = `${r4(c.fy)}px`;
    this.world.style.transform =
      `translateZ(${r4(c.lens - c.d)}px) rotateX(${r4(c.pitch)}deg) rotateY(${r4(c.yaw)}deg) ` +
      `rotateZ(${r4(c.roll)}deg) translate3d(${r4(-c.tx)}px, ${r4(-c.ty)}px, ${r4(-c.tz)}px)`;
    const focusDist = c.focus || c.d;
    for (const p of this.planes.values()) {
      const L = p._last;
      const show = p.visible && p.opacity > 0.001;
      if (L.show !== show) {
        p.el.style.display = show ? '' : 'none';
        L.show = show;
      }
      if (!show) continue;
      const tf =
        `translate3d(${r4(p.x - p.w / 2)}px, ${r4(p.y - p.h / 2)}px, ${r4(p.z)}px) ` +
        `rotateZ(${r4(p.rz)}deg) rotateY(${r4(p.ry)}deg) rotateX(${r4(p.rx)}deg) scale(${r4(p.s)})`;
      if (L.tf !== tf) {
        p.el.style.transform = tf;
        L.tf = tf;
      }
      const op = r4(p.opacity);
      if (L.op !== op) {
        p.el.style.opacity = String(op);
        L.op = op;
      }
      // blur is decided in FRAME px (what the eye sees), then divided by the
      // plane's on-screen scale: a CSS filter acts before the transform, and
      // a slab laid out at 3× would otherwise blur a third as much
      const pr = this.project([p.x, p.y, p.z]);
      let blur = p.blurAdd;
      if (c.dof > 0 && p.dofScale > 0) {
        blur += Math.max(0, Math.abs(pr.dist - focusDist) - 40) * (c.dof / 100) * p.dofScale;
      }
      blur = Math.min(24, blur) / Math.max(0.05, p.s * pr.scale);
      blur = Math.round(blur * 4) / 4;
      if (L.blur !== blur) {
        p.el.style.filter = blur > 0.2 ? `blur(${blur}px)` : '';
        L.blur = blur;
      }
    }
  }
}
