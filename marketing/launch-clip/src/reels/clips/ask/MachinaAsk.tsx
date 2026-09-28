import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { CAPTIONS, FPS, HITS, KICKERS } from '../../../../clips/ask-timeline.mjs';
import { sans } from '../../../fonts';
import VO from './vo.json';
import { BandScrim, Captions, type ReelCaption } from '../../kit/Captions';
import { CLOCK } from '../../kit/camera';
import { prog } from '../../kit/curves';
import { Lens, Paper } from '../../kit/Paper';
import { AskScene } from './AskScene';
import { End } from './End';

/**
 * The ASK feature clip (≈22s, 1080 × 1920): "ask your saves anything; every
 * answer shows its sources". The highlight reel's design language, built
 * from the reel kit (src/reels/kit) unchanged, on the clip's own clock
 * (clips/ask-timeline.mjs). Every frame of app UI is the real app, one
 * continuous take (capture/shoot.mjs `askcite`).
 */
export const MachinaAsk: React.FC<{
  withAudio?: boolean;
  withCaptions?: boolean;
  audioFile?: string;
}> = ({ withAudio = true, withCaptions = true, audioFile = 'ask-score-vo.wav' }) => {
  const f = useCurrentFrame();
  // the clip is written in output frames: motion blur is what moved in one
  CLOCK.perFrame = 1;
  return (
    <AbsoluteFill style={{ fontFamily: sans }}>
      {withAudio && <Audio src={staticFile(audioFile)} />}
      <Paper drift={Math.sin(f / 180) * 0.5} />

      <AskScene f={f} />
      <End f={f} />

      {/* type never sits on UI: the app fades out under the caption band */}
      <BandScrim opacity={1 - prog(f, HITS.lockup, HITS.lockup + 8)} />
      <Captions
        frame={f}
        fps={FPS}
        captions={CAPTIONS as ReelCaption[]}
        timing={VO}
        kickers={KICKERS}
        showCaptions={withCaptions}
        showKickers={withCaptions}
      />
      <Lens />
    </AbsoluteFill>
  );
};
