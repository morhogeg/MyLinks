/**
 * Framing per format. The film (script.js) says WHAT happens and when; a
 * format says where the camera stands for it and where the words sit.
 *
 * World px: the slab is 393 × 852 at the origin, so a screen point (u, v)
 * sits at (u − 196.5, v − 426, 0). `zoom` is frame px per world px at the
 * camera's target (1 = the slab at 852px tall).
 */

import { GLIDE, INOUT, MODAL } from '../engine/ease.js';

/** screen point → world (slab at rest at the origin) */
const W = (u, v) => ({ tx: u - 196.5, ty: v - 426 });

export const landscape = {
  name: 'landscape',
  size: { w: 1920, h: 1080 },
  captions: { side: 'left' },
  camDefaults: { tx: 0, ty: 0, tz: 0, zoom: 1, yaw: 0, pitch: 0, roll: 0, lens: 2400, fx: 960, fy: 540, focus: 0, dof: 0 },
  /** the opening ring of saves: radius, tilt (deg, front swings low), orbit
   *  speed (rad/s), card scale, how far side cards turn in (deg) */
  ring: { R: 1020, tilt: -20, speed: 0.2, phase: 0.4, s: 0.95, turn: 18, y: -30 },
  askSpots: [
    { x: 455, y: -275, z: 50, s: 0.72, ry: -6, rx: 1 },
    { x: 545, y: 25, z: 140, s: 0.72, ry: -6, rx: 0 },
    { x: 455, y: 330, z: 50, s: 0.72, ry: -6, rx: -1 },
  ],
  /** the outro: where the screen becomes the mark's point, and its size */
  endPoint: { x: 0, y: -40, d: 52 },
  slabPose: (A, end) => [
    { t: 0, ry: 0, rx: 0 },
    { t: A.home + 1.5, ry: 2.5, rx: -1 },
    { t: A.home + 5.6, ry: 0, rx: 0 },
    { t: A.landed, ry: 0 },
    { t: A.outro, ry: 0, rx: 0 },
    { t: end, ry: 0, rx: 0 },
  ],
  camera: (A, end) => {
    const side = 1380; // the slab's x when the words sit on the left
    return [
      // OPEN: the app booting on a slab seen from the side, turning to face us
      { t: 0, ...W(196.5, 426), zoom: 0.86, yaw: -26, pitch: 10, fx: 960, fy: 540, lens: 1900 },
      { t: A.boot + 1.8, zoom: 0.93, yaw: -10, pitch: 4 },
      // the app's own push-through: the camera leans in with it
      { t: A.bootExit + 0.35, zoom: 1.04, yaw: -2, pitch: 1, lens: 2200 },
      { t: A.home, zoom: 1.0, yaw: 0, pitch: 0, lens: 2400 },
      // pull back: everything this person saved, orbiting it
      { t: A.home + 1.4, zoom: 0.66, yaw: 10, pitch: -6, fy: 520, lens: 1800, dof: 0.5, ease: MODAL },
      { t: A.home + 4.4, zoom: 0.72, yaw: 2, pitch: -3.5 },
      // the saves spiral in; the phone, holding all of it, comes to rest
      { t: A.home + 5.6, zoom: 0.86, yaw: 0, pitch: 0, fy: 540, lens: 2300, dof: 0, ease: GLIDE },
      { t: A.dialog, zoom: 0.95, fx: side, lens: 2400, ease: GLIDE },
      // SAVE: the Add dialog floats off the screen; a slow look across it
      { t: A.dialogSet + 0.3, ...W(196.5, 426), zoom: 1.12, yaw: 5, pitch: -2, ease: MODAL },
      { t: A.modeNote, zoom: 1.15, yaw: -3, pitch: 1 },
      { t: A.filled, zoom: 1.18, yaw: 0, pitch: 0 },
      { t: A.phase0 + 0.35, ...W(176, 400), zoom: 1.85, ease: MODAL },
      { t: A.phase4 + 0.8, ...W(176, 404), zoom: 2.0 },
      { t: A.done + 1.0, ...W(196.5, 426), zoom: 1.0, ease: INOUT },
      // the new card, lifted: seen from the side so its depth reads
      { t: A.landed + 0.35, ...W(196.5, 330), zoom: 1.18, yaw: -10, pitch: 3, ease: MODAL },
      { t: A.landed + 2.6, zoom: 1.22, yaw: -5, pitch: 1.5 },
      { t: A.detail + 0.4, ...W(196.5, 426), zoom: 1.04, yaw: 0, pitch: 0 },
      { t: A.detailScroll + 0.6, ...W(196.5, 560), zoom: 1.3 },
      { t: A.detailEnd + 1.4, ...W(196.5, 650), zoom: 1.42, yaw: -3 },
      // FIND
      { t: A.findHome, ...W(196.5, 426), zoom: 1.0, yaw: 0, ease: INOUT },
      { t: A.typing + 0.3, ...W(176, 150), zoom: 1.9, ease: MODAL },
      { t: A.searching + 0.8, zoom: 1.95 },
      { t: A.result + 0.45, ...W(196.5, 320), zoom: 1.22, ease: MODAL },
      { t: A.resultHold + 0.3, yaw: 8, pitch: 2 },
      { t: A.resultHold + 1.9, yaw: 5 },
      { t: A.findDone + 0.25, ...W(196.5, 426), zoom: 1.0, yaw: 0, pitch: 0, ease: INOUT },
      // ASK: a swing as the tab opens, then the question, then the answer
      { t: A.askHome, zoom: 0.98, yaw: 0 },
      { t: A.askOpen + 0.3, zoom: 0.92, yaw: -9, pitch: 2, ease: GLIDE },
      { t: A.askTyping + 0.45, ...W(196.5, 640), zoom: 1.45, yaw: 0, pitch: 0, ease: MODAL },
      { t: A.sent + 0.35, ...W(196.5, 330), zoom: 1.32, ease: INOUT },
      { t: A.stream + 1.7, ...W(196.5, 360), zoom: 1.3 },
      // the sources: a three-quarter view, the saves rising beside the answer
      { t: A.sources + 0.7, ...W(196.5, 426), zoom: 0.82, fx: 930, yaw: -16, pitch: 3, ease: MODAL },
      { t: A.srcHold + 2.6, zoom: 0.85, yaw: -11, pitch: 2 },
      // CONNECT
      { t: A.graph + 0.5, ...W(197, 560), zoom: 1.12, fx: side, yaw: 0, pitch: 0, ease: INOUT },
      { t: A.graph + 2.8, ...W(197, 610), zoom: 1.45, yaw: 4, pitch: -3 },
      { t: A.graphHold + 1.2, zoom: 1.5, yaw: 2, pitch: -2 },
      // REVISIT: a swing the other way, then the to-do the first save became
      { t: A.revisit + 0.35, ...W(196.5, 426), zoom: 0.96, yaw: 9, pitch: 2, ease: GLIDE },
      { t: A.revHold + 0.4, ...W(196.5, 230), zoom: 1.35, yaw: 0, pitch: 0, ease: MODAL },
      { t: A.revHold + 2.2, zoom: 1.38, yaw: -3 },
      { t: A.expand + 0.6, ...W(196.5, 360), zoom: 1.16, yaw: 0 },
      { t: A.recap + 4.0, ...W(196.5, 430), zoom: 1.12 },
      { t: A.end + 1.2, zoom: 1.04 },
      // OUTRO: the ring once more, then the screen becomes the mark's point
      { t: A.outro + 0.6, ...W(196.5, 426), zoom: 0.74, fx: 960, yaw: 0, pitch: -3, lens: 2000, dof: 0.4, ease: INOUT },
      { t: A.outro + 1.9, tx: 0, ty: 70, zoom: 1.0, pitch: 0, lens: 2400, dof: 0, ease: MODAL },
      { t: end, tx: 0, ty: 70, zoom: 1.03 },
    ];
  },
};


/**
 * 9:16 (phones, Reels, Shorts). The words sit in the top band, centred, clear
 * of the platforms' chrome (roughly the top 12% and the bottom quarter), and
 * the slab stands below them; the Ask sources rise to the slab's right with
 * the slab drawn left to make room.
 */
export const portrait = {
  name: 'portrait',
  size: { w: 1080, h: 1920 },
  captions: { side: 'top' },
  camDefaults: { tx: 0, ty: 0, tz: 0, zoom: 1, yaw: 0, pitch: 0, roll: 0, lens: 2600, fx: 540, fy: 1160, focus: 0, dof: 0 },
  ring: { R: 760, tilt: -30, speed: 0.22, phase: 0.4, s: 0.82, turn: 14, y: 40 },
  askSpots: [
    { x: 400, y: -310, z: 50, s: 0.64, ry: -8, rx: 1 },
    { x: 470, y: 10, z: 130, s: 0.64, ry: -8, rx: 0 },
    { x: 400, y: 330, z: 50, s: 0.64, ry: -8, rx: -1 },
  ],
  endPoint: { x: 0, y: -40, d: 52 },
  slabPose: (A, end) => [
    { t: 0, ry: 0, rx: 0 },
    { t: A.home + 1.5, ry: 2.5, rx: -1 },
    { t: A.home + 5.6, ry: 0, rx: 0 },
    { t: end, ry: 0, rx: 0 },
  ],
  camera: (A, end) => {
    const full = { fx: 540, fy: 1180 };
    return [
      { t: 0, ...W(196.5, 426), zoom: 1.12, yaw: -24, pitch: 9, fx: 540, fy: 980, lens: 2000 },
      { t: A.boot + 1.8, zoom: 1.2, yaw: -9, pitch: 4 },
      { t: A.bootExit + 0.35, zoom: 1.34, yaw: -2, pitch: 1, lens: 2300 },
      { t: A.home, zoom: 1.28, yaw: 0, pitch: 0, lens: 2600, fy: 1000 },
      { t: A.home + 1.4, zoom: 0.82, yaw: 10, pitch: -7, fy: 1080, lens: 1900, dof: 0.5, ease: MODAL },
      { t: A.home + 4.4, zoom: 0.88, yaw: 2, pitch: -4 },
      { t: A.home + 5.6, zoom: 1.08, yaw: 0, pitch: 0, fy: 1120, lens: 2400, dof: 0, ease: GLIDE },
      { t: A.dialog, zoom: 1.22, ...full, lens: 2600, ease: GLIDE },
      // SAVE
      { t: A.dialogSet + 0.3, ...W(196.5, 426), zoom: 1.4, yaw: 5, pitch: -2, ease: MODAL },
      { t: A.modeNote, zoom: 1.44, yaw: -3, pitch: 1 },
      { t: A.filled, zoom: 1.46, yaw: 0, pitch: 0 },
      { t: A.phase0 + 0.35, ...W(190, 400), zoom: 2.3, ease: MODAL },
      { t: A.phase4 + 0.8, ...W(190, 404), zoom: 2.45 },
      { t: A.done + 1.0, ...W(196.5, 426), zoom: 1.25, ease: INOUT },
      { t: A.landed + 0.35, ...W(196.5, 330), zoom: 1.5, yaw: -10, pitch: 3, ease: MODAL },
      { t: A.landed + 2.6, zoom: 1.55, yaw: -5, pitch: 1.5 },
      { t: A.detail + 0.4, ...W(196.5, 426), zoom: 1.28, yaw: 0, pitch: 0 },
      { t: A.detailScroll + 0.6, ...W(196.5, 540), zoom: 1.6 },
      { t: A.detailEnd + 1.4, ...W(196.5, 630), zoom: 1.75, yaw: -3 },
      // FIND
      { t: A.findHome, ...W(196.5, 426), zoom: 1.25, yaw: 0, ease: INOUT },
      { t: A.typing + 0.3, ...W(190, 170), zoom: 2.4, ease: MODAL },
      { t: A.searching + 0.8, zoom: 2.45 },
      { t: A.result + 0.45, ...W(196.5, 320), zoom: 1.55, ease: MODAL },
      { t: A.resultHold + 0.3, yaw: 8, pitch: 2 },
      { t: A.resultHold + 1.9, yaw: 5 },
      { t: A.findDone + 0.25, ...W(196.5, 426), zoom: 1.25, yaw: 0, pitch: 0, ease: INOUT },
      // ASK
      { t: A.askHome, zoom: 1.22, yaw: 0 },
      { t: A.askOpen + 0.3, zoom: 1.16, yaw: -9, pitch: 2, ease: GLIDE },
      { t: A.askTyping + 0.45, ...W(196.5, 640), zoom: 1.8, yaw: 0, pitch: 0, ease: MODAL },
      { t: A.sent + 0.35, ...W(196.5, 330), zoom: 1.62, ease: INOUT },
      { t: A.stream + 1.7, ...W(196.5, 360), zoom: 1.6 },
      { t: A.sources + 0.7, ...W(196.5, 426), zoom: 1.0, fx: 320, fy: 1170, yaw: -14, pitch: 3, ease: MODAL },
      { t: A.srcHold + 2.6, zoom: 1.03, yaw: -10, pitch: 2 },
      // CONNECT
      { t: A.graph + 0.5, ...W(197, 560), zoom: 1.35, ...full, yaw: 0, pitch: 0, ease: INOUT },
      { t: A.graph + 2.8, ...W(197, 610), zoom: 1.8, yaw: 4, pitch: -3 },
      { t: A.graphHold + 1.2, zoom: 1.85, yaw: 2, pitch: -2 },
      // REVISIT
      { t: A.revisit + 0.35, ...W(196.5, 426), zoom: 1.2, yaw: 9, pitch: 2, ease: GLIDE },
      { t: A.revHold + 0.4, ...W(196.5, 230), zoom: 1.7, yaw: 0, pitch: 0, ease: MODAL },
      { t: A.revHold + 2.2, zoom: 1.74, yaw: -3 },
      { t: A.expand + 0.6, ...W(196.5, 360), zoom: 1.45, yaw: 0 },
      { t: A.recap + 4.0, ...W(196.5, 430), zoom: 1.4 },
      { t: A.end + 1.2, zoom: 1.3 },
      // OUTRO
      { t: A.outro + 0.6, ...W(196.5, 426), zoom: 0.9, fx: 540, fy: 1000, yaw: 0, pitch: -4, lens: 2100, dof: 0.4, ease: INOUT },
      { t: A.outro + 1.9, tx: 0, ty: 90, zoom: 1.0, fy: 880, pitch: 0, lens: 2600, dof: 0, ease: MODAL },
      { t: end, tx: 0, ty: 90, zoom: 1.03 },
    ];
  },
};

export const FORMATS = { landscape, portrait };
