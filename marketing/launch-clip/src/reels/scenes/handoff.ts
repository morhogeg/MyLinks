/**
 * The hook → Save match cut, shared by both scenes: the mark's point drops to
 * exactly where the app's + button sits in the Save scene's first camera (the
 * whole Home screen, upright and centred), then the screen irises open
 * around it. Both sides read these.
 */
export const SAVE_OPEN_CAM = { cx: 196.5, cy: 426, z: 1.52, fx: 540, fy: 1010, rx: 0, ry: 0, rz: 0 };

const plusY = SAVE_OPEN_CAM.fy + (811 - SAVE_OPEN_CAM.cy) * SAVE_OPEN_CAM.z;

export const HANDOFF = {
  /** the brackets part and the tagline leaves */
  part: 104,
  /** the point starts its drop */
  travel: 106,
  /** it lands on the + button: the iris starts opening around it */
  iris: 120,
  /** fully open: the hook is gone */
  end: 136,
  /** the + button in frame pixels (its radius: 20pt at the opening zoom) */
  plus: { x: SAVE_OPEN_CAM.fx, y: plusY, r: 20 * SAVE_OPEN_CAM.z },
};
