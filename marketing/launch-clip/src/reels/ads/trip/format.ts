import { createContext, useContext } from 'react';

/**
 * One scene, two shapes (the film's `useFraming()` idea, src/film/format.ts,
 * kept in the ad's own folder): the 9:16 Story/Reel edition and the 4:5 Feed
 * edition read every position from here, so the same picture is REFRAMED for
 * each shape rather than cropped.
 *
 * 9:16 (1080 × 1920), Meta's safe zone: nothing that must be read in the top
 * 270px (14%), the bottom 670px (35%: caption, profile, the Install button)
 * or 65px from either side. The line sits at 346px (the kit's band), the
 * app's hero moment between about 720 and 1240px.
 *
 * 4:5 (1080 × 1350), Feed: no overlay over the picture, so the line moves up
 * to 120px and everything else follows it up; the app keeps its zoom.
 */
export type AdShape = 'story' | 'feed';

export type AdFrame = {
  shape: AdShape;
  height: number;
  /** the narrated line's top */
  lineTop: number;
  /** the paper band the line lives in (app screens fade out under it) */
  band: { solid: number; clear: number };
  /** added to every camera aim in the app (fy): the hero moment's offset */
  dy: number;
  /** where the mark gathers and the match cut lands */
  markY: number;
  /** the five piles' centres, in PILES order */
  piles: { x: number; y: number }[];
  /** the closing lockup's top */
  lockupTop: number;
};

export const FRAMES: Record<AdShape, AdFrame> = {
  story: {
    shape: 'story',
    height: 1920,
    lineTop: 346,
    band: { solid: 510, clear: 720 },
    dy: 0,
    markY: 880,
    piles: [
      { x: 305, y: 608 },
      { x: 775, y: 730 },
      { x: 305, y: 862 },
      { x: 775, y: 990 },
      { x: 305, y: 1116 },
    ],
    lockupTop: 620,
  },
  feed: {
    shape: 'feed',
    height: 1350,
    lineTop: 120,
    band: { solid: 270, clear: 430 },
    dy: -170,
    markY: 640,
    piles: [
      { x: 305, y: 450 },
      { x: 775, y: 575 },
      { x: 305, y: 704 },
      { x: 775, y: 832 },
      { x: 305, y: 958 },
    ],
    lockupTop: 360,
  },
};

export const AdFrameContext = createContext<AdFrame>(FRAMES.story);
export const useAdFrame = () => useContext(AdFrameContext);
