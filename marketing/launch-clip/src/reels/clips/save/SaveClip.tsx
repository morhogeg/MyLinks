import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { CAPTIONS, FPS, HITS, KICKERS, THROW_LEN } from '../../../../clips/save-timeline.mjs';
import { sans } from '../../../fonts';
import VO from './vo.json';
import { BandScrim, Captions, type ReelCaption, type ReelKicker } from '../../kit/Captions';
import { CLOCK } from '../../kit/camera';
import { prog } from '../../kit/curves';
import { Lens, Paper } from '../../kit/Paper';
import { Hook } from './Hook';
import { Shares } from './Shares';
import { App } from './App';
import { End } from './End';

/**
 * SAVE, the feature clip: ~31s, 1080 × 1920, on its own clock
 * (clips/save-timeline.mjs), built from the reel kit (src/reels/kit) in the
 * reel's design language. The problem (Hook), the name, then the feature's
 * four parts: from any app (Shares), screenshots, key points, tags and links
 * (App: the real app, take "saveclip"), and the takeaway on the lockup (End).
 * Scenes read the global frame and each draws only its own frames.
 */
export const SaveClip: React.FC<{
  withAudio?: boolean;
  withCaptions?: boolean;
  audioFile?: string;
}> = ({ withAudio = true, withCaptions = true, audioFile = 'clips/save/score-vo.wav' }) => {
  const f = useCurrentFrame();
  // every scene here runs on output frames: motion blur per output frame
  CLOCK.perFrame = 1;
  return (
    <AbsoluteFill style={{ fontFamily: sans }}>
      {withAudio && <Audio src={staticFile(audioFile)} />}
      <Paper drift={Math.sin(f / 180) * 0.5} />
      <App f={f} />
      <Hook f={f} />
      <Shares f={f} />
      <End f={f} />
      {/* type never sits on UI: the app fades out under the caption band */}
      <BandScrim opacity={prog(f, HITS.toApp - 8, HITS.toApp) * (1 - prog(f, HITS.throw + 12, HITS.throw + THROW_LEN - 2))} />
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
