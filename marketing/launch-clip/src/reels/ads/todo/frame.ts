import { useVideoConfig } from 'remotion';

/**
 * One ad, two shapes (the film's `useFraming()` idea, src/film/format.ts):
 * the Story/Reels cut is 1080 × 1920, the Feed cut 1080 × 1350. Every scene
 * is written for the tall frame and reads its placement through this hook;
 * the Feed cut is a second layout of the same scenes, not a crop.
 *
 * TALL (Meta's safe zones): nothing that matters in the top 270px or the
 * bottom 670px (y > 1250), or within 65px of a side. The line sits at 346px
 * (the kit's slot), its band scrim is solid to 490 and clear by 600, and the
 * app's hero moments are aimed between ~650 and 1240.
 * FEED (4:5): no platform UI over the picture. The line moves up to 130px,
 * the band to 280 / 380, and the picture rises with it (`dy`).
 */
export type Shape = 'tall' | 'feed';

export const SHAPES = {
  tall: { dy: 0, slots: { kicker: 290, top: 346 }, band: { solid: 490, clear: 600 }, lockupTop: 640 },
  feed: { dy: -190, slots: { kicker: 80, top: 130 }, band: { solid: 280, clear: 380 }, lockupTop: 420 },
} as const;

export const useShape = () => {
  const { height } = useVideoConfig();
  const shape: Shape = height > 1600 ? 'tall' : 'feed';
  return { shape, ...SHAPES[shape] };
};
