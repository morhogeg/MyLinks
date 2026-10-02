/**
 * The mark → app match cut (the reel's handoff.ts, framed for the ad's safe
 * zones): the mark's point drops to exactly where the app's + button sits in
 * the first camera (the whole Home screen, upright and centred, its + at
 * ~1235px, above the bottom 670px Meta draws over), then the screen irises
 * open around it. 9:16 frame pixels; each shape adds its `dy`.
 */
export const AD_OPEN_CAM = { cx: 196.5, cy: 426, z: 1.52, fx: 540, fy: 650, rx: 0, ry: 0, rz: 0 };

export const AD_PLUS = {
  x: AD_OPEN_CAM.fx,
  y: AD_OPEN_CAM.fy + (811 - AD_OPEN_CAM.cy) * AD_OPEN_CAM.z,
  r: 20 * AD_OPEN_CAM.z,
};
