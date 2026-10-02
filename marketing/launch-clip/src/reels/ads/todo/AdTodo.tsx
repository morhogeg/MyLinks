import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { CAPTIONS, FPS, HITS, KICKERS, THROW_LEN } from '../../../../clips/ad-todo-timeline.mjs';
import { sans } from '../../../fonts';
import VO from './vo.json';
import { BandScrim, Captions, type ReelCaption, type WordTiming } from '../../kit/Captions';
import { prog } from '../../kit/curves';
import { Lens, Paper } from '../../kit/Paper';
import { App } from './App';
import { End } from './End';
import { Hook } from './Hook';
import { useShape } from './frame';

/**
 * Meta ad 3, "The screenshot that becomes a to-do": the reel kit's design
 * language (README "Motion language"), its narrator and its lockup, on its
 * own clock (clips/ad-todo-timeline.mjs). Every frame of app UI is the real
 * app (take `adTodo`). One component serves both shapes (frame.ts).
 *
 * THE HOOK IS THE POSTER: its line is on screen whole from frame 0 (a feed
 * shows frame 0 before it plays, and most people watch with the sound off);
 * the narrator starts saying it at frame 8.
 */
const captions = CAPTIONS.map((c) => (c.hook ? { ...c, at: 0 } : c)) as ReelCaption[];
const timing: WordTiming = VO.map((v) => {
  const c = CAPTIONS.find((x) => x.at === v.frame);
  return c?.hook ? { frame: 0, words: v.words.map(() => -1) } : v;
});

export const AdTodo: React.FC<{
  withAudio?: boolean;
  withCaptions?: boolean;
  audioFile?: string;
}> = ({ withAudio = true, withCaptions = true, audioFile = 'ads/todo/score-vo.wav' }) => {
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
      <BandScrim band={band} opacity={prog(f, HITS.iris[0], HITS.iris[1]) * (1 - prog(f, HITS.out + THROW_LEN - 8, HITS.out + THROW_LEN))} />
      <Captions
        frame={f}
        fps={FPS}
        captions={captions}
        timing={timing}
        kickers={KICKERS}
        showCaptions={withCaptions}
        showKickers={withCaptions}
        slots={slots}
      />
      <Lens />
    </AbsoluteFill>
  );
};
