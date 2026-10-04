import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { HITS, THROW_LEN } from '../../../../clips/ad-todo-timeline.mjs';
import { sans } from '../../../fonts';
import { BandScrim } from '../../kit/Captions';
import { Chunks } from './Chunks';
import { prog } from '../../kit/curves';
import { Lens, Paper } from '../../kit/Paper';
import { App } from './App';
import { End } from './End';
import { Hook } from './Hook';
import { useShape } from './frame';

/**
 * Meta ad 3 (round 6: "save from anywhere, and Machina makes it useful"):
 * the reel kit's design language (README "Motion language"), its narrator
 * and its lockup, on its own clock (clips/ad-todo-timeline.mjs). Every frame
 * of app UI is the real app (take `adTodo`). One component serves both
 * shapes (frame.ts).
 *
 * THE HOOK IS THE POSTER: its question is on screen whole from frame 0 (a
 * feed shows frame 0 before it plays, and most people watch with the sound
 * off); the narrator starts at frame 8.
 */
export const AdTodo: React.FC<{
  withAudio?: boolean;
  withCaptions?: boolean;
  /** 'full' (the whole narration, chunked; owner's pick, 2026-10-04) or 'heads' (headline captions) */
  captions?: 'heads' | 'full';
  audioFile?: string;
}> = ({ withAudio = true, withCaptions = true, captions = 'full', audioFile = 'ads/todo/score-vo.wav' }) => {
  const f = useCurrentFrame();
  const { slots, band } = useShape();
  return (
    <AbsoluteFill style={{ fontFamily: sans }}>
      {withAudio && <Audio src={staticFile(audioFile)} />}
      <Paper drift={Math.sin(f / 180) * 0.5} />
      <Hook f={f} />
      <App f={f} />
      <End f={f} withCaptions={withCaptions} />
      {/* type never sits on UI: the app fades out under the caption band */}
      {withCaptions && <BandScrim band={band} opacity={prog(f, HITS.iris[0], HITS.iris[1]) * (1 - prog(f, HITS.out + THROW_LEN - 8, HITS.out + THROW_LEN))} />}
      {/* the narration on screen, in short chunks on the voice's timing */}
      {withCaptions && <Chunks frame={f} top={slots.top} mode={captions} />}
      <Lens />
    </AbsoluteFill>
  );
};
