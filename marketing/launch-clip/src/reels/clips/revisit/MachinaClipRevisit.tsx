import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { CAPTIONS, FPS, HITS, KICKERS } from '../../../../clips/revisit-timeline.mjs';
import { sans } from '../../../fonts';
import VO from './vo.json';
import { BandScrim, Captions, type ReelCaption } from '../../kit/Captions';
import { prog } from '../../kit/curves';
import { Lens, Paper } from '../../kit/Paper';
import { Revisit } from './Revisit';
import { End } from './End';

/**
 * REVISIT, a Machina feature clip: 1080 × 1920, the highlight reel's design
 * language (src/reels/kit, README "Motion language"), its narrator and its
 * lockup, on its own clock (clips/revisit-timeline.mjs, OUTPUT frames).
 * Every frame of app UI is the real app (take `revisitClip`).
 */
export const MachinaClipRevisit: React.FC<{
  withAudio?: boolean;
  withCaptions?: boolean;
  audioFile?: string;
}> = ({ withAudio = true, withCaptions = true, audioFile = 'clips/revisit/score-vo.wav' }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ fontFamily: sans }}>
      {withAudio && <Audio src={staticFile(audioFile)} />}
      <Paper drift={Math.sin(f / 180) * 0.5} />
      <Revisit f={f} />
      <End f={f} />
      {/* type never sits on UI: the app fades out under the caption band */}
      <BandScrim opacity={1 - prog(f, HITS.out, HITS.out + 8)} />
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
