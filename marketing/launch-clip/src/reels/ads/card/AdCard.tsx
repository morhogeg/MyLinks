import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { CAPTIONS, FPS, HITS, KICKERS, THROW_LEN } from '../../../../ads/card-timeline.mjs';
import { sans } from '../../../fonts';
import VO from './vo.json';
import { CLOCK } from '../../kit/camera';
import { prog } from '../../kit/curves';
import { Lens, Paper } from '../../kit/Paper';
import { AdCaptions, type AdCaption, type AdKicker } from './AdCaptions';
import { FRAMINGS, FramingContext, useAdFrame, type AdFormat } from './format';
import { Hook } from './Hook';
import { Share } from './Share';
import { Card } from './Card';
import { Remind } from './Remind';
import { End } from './End';

/**
 * Meta ad 1, "What one save becomes": ~26s on its own clock
 * (ads/card-timeline.mjs), built from the reel kit in the reel's design
 * language. The Watch later pile and the hook (Hook), the share into the mark
 * (Share), the card read down in the real app (Card: take "adcard"), the
 * reminder and its return (Remind), the tagline on the lockup (End). Three shapes from one scene code (format.ts):
 * `tall` 9:16, `feed` 4:5, `square` 1:1 (the poster).
 */

/** the paper band the app fades out under, from the shape's framing */
const AdBandScrim: React.FC<{ opacity: number }> = ({ opacity }) => {
  const { band } = useAdFrame();
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        opacity,
        background: `linear-gradient(180deg, #EEF0F4 0px, #EEF0F4 ${band.solid}px, rgba(238,240,244,0) ${band.clear}px)`,
      }}
    />
  );
};

export const AdCard: React.FC<{
  format?: AdFormat;
  withAudio?: boolean;
  withCaptions?: boolean;
  audioFile?: string;
}> = ({ format = 'tall', withAudio = true, withCaptions = true, audioFile = 'ads/card/score-vo.wav' }) => {
  const f = useCurrentFrame();
  // every scene here runs on output frames: motion blur per output frame
  CLOCK.perFrame = 1;
  return (
    <FramingContext.Provider value={FRAMINGS[format]}>
      <AbsoluteFill style={{ fontFamily: sans, overflow: 'hidden' }}>
        {withAudio && <Audio src={staticFile(audioFile)} />}
        <Paper drift={Math.sin(f / 180) * 0.5} />
        <Card f={f} />
        <Remind f={f} />
        <Hook f={f} />
        <Share f={f} />
        <End f={f} />
        {/* type never sits on UI: the app fades out under the caption band */}
        <AdBandScrim opacity={prog(f, HITS.toApp - 8, HITS.toApp) * (1 - prog(f, HITS.throw + 12, HITS.throw + THROW_LEN - 2))} />
        {withCaptions && <AdCaptions frame={f} fps={FPS} captions={CAPTIONS as AdCaption[]} kickers={KICKERS as AdKicker[]} timing={VO} />}
        <Lens />
      </AbsoluteFill>
    </FramingContext.Provider>
  );
};
