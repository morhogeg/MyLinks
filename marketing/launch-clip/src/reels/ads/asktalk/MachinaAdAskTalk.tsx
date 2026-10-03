import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { CAPTIONS, FPS, HITS } from '../../../../ads/asktalk-timeline.mjs';
import { sans } from '../../../fonts';
import VO from './vo.json';
import { CLOCK } from '../../kit/camera';
import { prog } from '../../kit/curves';
import { Lens, Paper } from '../../kit/Paper';
import { AdBandScrim, AdCaptions } from '../trip/AdCaptions';
import { AdFrameContext, FRAMES, type AdShape } from '../trip/format';
import { AskChat } from './AskChat';
import { End } from './End';
import { Piles } from './Piles';

/**
 * Meta ad 2 of 3, the Ask ad: the "talking to a friend" edition
 * (owner-approved script, 2026-10-03), 29.6s, beside round 6
 * (`MachinaAdTrip*`, kept as it is). The reel kit's design language on its
 * own clock (ads/asktalk-timeline.mjs), in two shapes (../trip/format.ts):
 *
 *   MachinaAdAskTalk       9:16, score + narrator + captions (the main cut)
 *   MachinaAdAskTalkMusic  9:16, score + captions, no narrator (the A/B test)
 *   MachinaAdAskTalkFeed   4:5, score + narrator + captions, reframed
 *
 * Every frame of app UI is the real app, one continuous take
 * (capture/shoot.mjs `adask`).
 */
export const MachinaAdAskTalk: React.FC<{
  shape?: AdShape;
  audioFile?: string | null;
  withCaptions?: boolean;
}> = ({ shape = 'story', audioFile = 'ads/asktalk/score-vo.wav', withCaptions = true }) => {
  const f = useCurrentFrame();
  CLOCK.perFrame = 1;
  return (
    <AdFrameContext.Provider value={FRAMES[shape]}>
      <AbsoluteFill style={{ fontFamily: sans }}>
        {audioFile && <Audio src={staticFile(audioFile)} />}
        <Paper drift={Math.sin(f / 180) * 0.5} />

        <Piles f={f} />
        <AskChat f={f} />
        <End f={f} />

        {/* type never sits on UI: the app fades out under the line's band */}
        <AdBandScrim opacity={f < HITS.open ? 0 : 1 - prog(f, HITS.lockup, HITS.lockup + 8)} />
        {withCaptions && <AdCaptions frame={f} fps={FPS} captions={CAPTIONS} timing={VO} />}
        <Lens />
      </AbsoluteFill>
    </AdFrameContext.Provider>
  );
};
