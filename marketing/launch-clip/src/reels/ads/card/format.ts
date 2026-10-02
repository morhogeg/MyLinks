import React from 'react';

/**
 * One ad, three shapes (the film's useFraming() idea, for the ad's own
 * layout): the 9:16 main cut (1080×1920), the 4:5 Feed cut (1080×1350) and
 * the 1:1 poster (1080×1080). Every scene is written in 9:16 frame pixels and
 * reads its framing here, so one scene serves every shape, reframed, not
 * cropped:
 *
 *  - `line` / `kicker`: where the narrated line sits (the caption band);
 *  - `band`: the paper band the app fades out under (solid → clear), so type
 *    never sits on UI;
 *  - `dy`: how far everything below the band moves up, which puts the hero
 *    moment in the middle of the shape's free area;
 *  - `lockupTop`: where the closing lockup starts.
 *
 * 9:16 (Meta Reels/Stories safe zones): nothing that matters in the top 270px
 * or the bottom 670px, nor within 65px of a side. The line sits at 346, the
 * hero moment between ~620 and 1240.
 */
export type AdFormat = 'tall' | 'feed' | 'square';

export type Framing = {
  format: AdFormat;
  W: number;
  H: number;
  line: number;
  band: { solid: number; clear: number };
  dy: number;
  lockupTop: number;
};

export const FRAMINGS: Record<AdFormat, Framing> = {
  tall: { format: 'tall', W: 1080, H: 1920, line: 346, band: { solid: 550, clear: 650 }, dy: 0, lockupTop: 560 },
  feed: { format: 'feed', W: 1080, H: 1350, line: 92, band: { solid: 390, clear: 460 }, dy: -150, lockupTop: 300 },
  square: { format: 'square', W: 1080, H: 1080, line: 64, band: { solid: 234, clear: 320 }, dy: -300, lockupTop: 170 },
};

export const FramingContext = React.createContext<Framing>(FRAMINGS.tall);
export const useAdFrame = () => React.useContext(FramingContext);
