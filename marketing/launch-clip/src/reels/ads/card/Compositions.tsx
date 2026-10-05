import React from 'react';
import { Composition } from 'remotion';
import * as AD from '../../../../ads/card-timeline.mjs';
import { AdCard } from './AdCard';

/**
 * Meta ad 1, "What one save becomes" (ads/card-timeline.mjs):
 *  - MachinaAdCard       9:16, score + narrator + captions (the main cut)
 *  - MachinaAdCardMusic  9:16, score + captions, no narrator (the A/B test)
 *  - MachinaAdCardFeed   4:5 (1080×1350), score + narrator + captions
 *  - MachinaAdCardSilent 9:16, captions, no sound (stills and QA)
 *  - MachinaAdCardPoster 1:1 (1080×1080), frame 0 is the thumbnail
 */
const base = { component: AdCard, durationInFrames: AD.TOTAL_FRAMES, fps: AD.FPS, width: AD.WIDTH } as const;

export const AdCardCompositions: React.FC = () => (
  <>
    <Composition id="MachinaAdCard" {...base} height={AD.HEIGHT} defaultProps={{ format: 'tall', withAudio: true, withCaptions: true, audioFile: 'ads/card/score-vo.wav' }} />
    <Composition id="MachinaAdCardMusic" {...base} height={AD.HEIGHT} defaultProps={{ format: 'tall', withAudio: true, withCaptions: true, audioFile: 'ads/card/score-music.wav' }} />
    <Composition id="MachinaAdCardFeed" {...base} height={1350} defaultProps={{ format: 'feed', withAudio: true, withCaptions: true, audioFile: 'ads/card/score-vo.wav' }} />
    <Composition id="MachinaAdCardSilent" {...base} height={AD.HEIGHT} defaultProps={{ format: 'tall', withAudio: false, withCaptions: true }} />
    <Composition id="MachinaAdCardFeedSilent" {...base} height={1350} defaultProps={{ format: 'feed', withAudio: false, withCaptions: true }} />
    <Composition id="MachinaAdCardPoster" {...base} height={1080} defaultProps={{ format: 'square', withAudio: false, withCaptions: true }} />
  </>
);
