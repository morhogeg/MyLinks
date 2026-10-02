import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { CAPTIONS, FPS, HITS } from '../../../../ads/trip-timeline.mjs';
import { sans } from '../../../fonts';
import VO from './vo.json';
import { CLOCK } from '../../kit/camera';
import { prog } from '../../kit/curves';
import { Lens, Paper } from '../../kit/Paper';
import { AdBandScrim, AdCaptions } from './AdCaptions';
import { AskTrip } from './AskTrip';
import { End } from './End';
import { Piles } from './Piles';
import { AdFrameContext, FRAMES, type AdShape } from './format';

/**
 * Meta ad 2 of 3, "The trip you already planned" (Ask), 22.9s. The reel kit's
 * design language (src/reels/kit, unchanged), on the ad's own clock
 * (ads/trip-timeline.mjs), in two shapes (format.ts):
 *
 *   MachinaAdTrip       9:16, score + narrator + captions (the main cut)
 *   MachinaAdTripMusic  9:16, score + captions, no narrator (the A/B test)
 *   MachinaAdTripFeed   4:5, score + narrator + captions, reframed
 *
 * Every frame of app UI is the real app, one continuous take
 * (capture/shoot.mjs `adtrip`).
 */
export const MachinaAdTrip: React.FC<{
  shape?: AdShape;
  audioFile?: string | null;
  withCaptions?: boolean;
}> = ({ shape = 'story', audioFile = 'ads/trip/score-vo.wav', withCaptions = true }) => {
  const f = useCurrentFrame();
  // the ad is written in output frames: motion blur is what moved in one
  CLOCK.perFrame = 1;
  return (
    <AdFrameContext.Provider value={FRAMES[shape]}>
      <AbsoluteFill style={{ fontFamily: sans }}>
        {audioFile && <Audio src={staticFile(audioFile)} />}
        <Paper drift={Math.sin(f / 180) * 0.5} />

        <Piles f={f} />
        <AskTrip f={f} />
        <End f={f} />

        {/* type never sits on UI: the app fades out under the line's band */}
        <AdBandScrim opacity={f < HITS.open ? 0 : 1 - prog(f, HITS.lockup, HITS.lockup + 8)} />
        {withCaptions && <AdCaptions frame={f} fps={FPS} captions={CAPTIONS} timing={VO} />}
        <Lens />
      </AbsoluteFill>
    </AdFrameContext.Provider>
  );
};
