import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { CAPTIONS, FPS, HITS, KICKERS } from '../../../../clips/find-timeline.mjs';
import { sans } from '../../../fonts';
import { BandScrim, Captions, type ReelCaption, type ReelKicker } from '../../kit/Captions';
import { CLOCK } from '../../kit/camera';
import { prog } from '../../kit/curves';
import { Lens, Paper } from '../../kit/Paper';
import { End } from './End';
import { Search } from './Search';
import VO from './find-vo.json';

/**
 * FIND, the feature clip: "type what you remember, get the one you meant".
 * 20.8s, 1080 × 1920, the highlight reel's design language: its set
 * (Paper, Dither, Lens), its type (KineticLine, Kicker, Captions), its
 * camera and emphasis (AppShot, Lift, Tap), its narrator and its lockup,
 * on the clip's own clock (clips/find-timeline.mjs). Every frame of app UI
 * is the real app, captured by capture/shoot.mjs (`findClip`).
 */
export const FindClip: React.FC<{
  withAudio?: boolean;
  withCaptions?: boolean;
  audioFile?: string;
}> = ({ withAudio = true, withCaptions = true, audioFile = 'clips/find/score-vo.wav' }) => {
  const f = useCurrentFrame();
  // the clip runs on output frames: motion blur measures one frame
  CLOCK.perFrame = 1;
  return (
    <AbsoluteFill style={{ fontFamily: sans }}>
      {withAudio && <Audio src={staticFile(audioFile)} />}
      <Paper drift={Math.sin(f / 180) * 0.5} />
      <Search f={f} />
      <End f={f} />
      {/* type never sits on UI: the app fades out under the caption band */}
      <BandScrim opacity={1 - prog(f, HITS.lockup, HITS.lockup + 8)} />
      <Captions
        frame={f}
        fps={FPS}
        captions={CAPTIONS as ReelCaption[]}
        timing={VO}
        kickers={KICKERS as ReelKicker[]}
        showCaptions={withCaptions}
        showKickers={withCaptions}
      />
      <Lens />
    </AbsoluteFill>
  );
};
