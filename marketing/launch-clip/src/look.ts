/**
 * THE NIGHT LOOK (2026-10-05). Every Machina video, the launch film and the
 * reels alike, is shot on one night set, in the app's own dark face.
 *
 * The idea is light, not darkness: the saves are lost in the dark, and
 * Machina is where the light comes from. So the set is near black and lit
 * like a product stage (a cool key light behind the product, a soft top light
 * where the type lives, two coloured pools at the edges for depth), the app is
 * captured in its real dark theme (capture/device.mjs), its screen glows with
 * its own colours, and the type is white and silver: the app's dark-theme
 * accent gradient, #FFFFFF → #CBD2E0 (web/app/globals.css).
 *
 * Colour still only comes from the content (platform marks, category pills)
 * and from the two pools; everything the films draw is white, silver or black.
 */

export const NIGHT = {
  /** the set: a hair under the app's #050505, so a screen's own black still
   *  reads as a lit panel rather than a hole */
  set: '#020203',
  /** type: the line the narrator says */
  ink: '#F5F6F9',
  /** the kicker, secondary type: the app's silver */
  inkSoft: 'rgba(188,195,212,0.92)',
  /** quieter still (labels on cards) */
  inkDim: 'rgba(150,157,175,0.78)',
  /** display fill: the app's dark-theme accent gradient, run top to bottom */
  silver: 'linear-gradient(180deg, #FFFFFF 0%, #EEF0F5 46%, #C3CAD9 100%)',
  /** the key light's colour (rgb triple) */
  key: '118,136,190',
  /** a glow for luminous type and marks */
  glow: '160,178,232',
  /** the app's dark card and its hairline */
  card: '#121212',
  cardEdge: 'rgba(255,255,255,0.085)',
} as const;

/**
 * The set's light, as CSS background layers over NIGHT.set. Kept in one
 * function so the caption band (BandScrim) can draw the SAME light over the
 * app and the seam disappears. `drift` is a slow −1…1 wander.
 */
export const stageLight = (drift = 0, { key = 1, top = 1 } = {}) =>
  [
    // the soft top light: where the type lives
    `radial-gradient(58% 17% at 50% 16%, rgba(178,190,226,${(0.075 * top).toFixed(3)}) 0%, rgba(178,190,226,${(0.028 * top).toFixed(3)}) 50%, rgba(178,190,226,0) 100%)`,
    // the key light behind the product
    `radial-gradient(56% 32% at 50% ${(58 + drift * 2).toFixed(2)}%, rgba(${NIGHT.key},${(0.26 * key).toFixed(3)}) 0%, rgba(${NIGHT.key},${(0.1 * key).toFixed(3)}) 38%, rgba(${NIGHT.key},0) 74%)`,
    // a violet pool, low left, and a teal one, high right: depth, not a cast
    `radial-gradient(50% 30% at ${(10 + drift * 5).toFixed(2)}% 86%, rgba(104,82,168,0.11) 0%, rgba(104,82,168,0) 100%)`,
    `radial-gradient(46% 26% at ${(92 - drift * 5).toFixed(2)}% 18%, rgba(58,122,160,0.085) 0%, rgba(58,122,160,0) 100%)`,
  ].join(', ');

/**
 * A very soft haze: big noise clouds, rasterized ONCE (a constant data URI)
 * and slid slowly, screened over the set so the air has texture.
 */
export const HAZE_TILE =
  "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='640' height='640'%3E%3Cfilter id='h' x='0' y='0' width='100%25' height='100%25'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.0045' numOctaves='3' seed='11' stitchTiles='stitch'/%3E%3CfeColorMatrix type='matrix' values='0 0 0 0 0.72  0 0 0 0 0.78  0 0 0 0 0.95  1.6 0 0 0 -0.62'/%3E%3C/filter%3E%3Crect width='640' height='640' filter='url(%23h)'/%3E%3C/svg%3E\")";

/** Luminous type: a soft halo that reads as light, not as a drop shadow. */
export const typeGlow = (k = 1) => `drop-shadow(0 0 ${Math.round(22 * k)}px rgba(${NIGHT.glow},${(0.22 * k).toFixed(3)}))`;
