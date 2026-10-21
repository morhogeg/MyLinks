import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { BAND, CAPTIONS, FPS, HITS, KICKERS, OPEN, SLOTS } from '../../../../clips/revisit-timeline.mjs';
import { sans } from '../../../fonts';
import VO from './vo.json';
import type { ReelCaption } from '../../kit/Captions';
import { EASE_IN_OUT, mix, prog } from '../../kit/curves';
import { Captions } from './light/Captions';
import { BandScrim, Lens, Paper } from './light/Paper';
import { Revisit } from './Revisit';
import { End } from './End';
import { Opening } from './Opening';

/**
 * REVISIT, a Machina feature clip: 1080 × 1920, the highlight reel's design
 * language (src/reels/kit, README "Motion language"), its narrator and its
 * lockup, on its own clock (clips/revisit-timeline.mjs, OUTPUT frames), in
 * the LIGHT look (owner, 2026-10-21): ink on paper, the app in its light
 * theme (light/, the kit's light-grade pieces; every other film stays on
 * the night set).
 * Every frame of app UI is the real app (take `revisitClip`).
 */
export const MachinaClipRevisit: React.FC<{
  withAudio?: boolean;
  withCaptions?: boolean;
  audioFile?: string;
}> = ({ withAudio = true, withCaptions = true, audioFile = 'clips/revisit/score-vo.wav' }) => {
  const f = useCurrentFrame();
  // (light look) while the reminder's sheet is up, the paper comes down to
  // the sheet's top edge: the app's dimmed backdrop above it reads as a grey
  // smudge on the light theme, so the sheet sits on the paper like a card
  const sheet = prog(f - OPEN, HITS.bell + 6, HITS.bell + 20, EASE_IN_OUT) * (1 - prog(f - OPEN, HITS.cancel, HITS.cancel + 10, EASE_IN_OUT));
  const band = { solid: mix(BAND.solid, 552, sheet), clear: mix(BAND.clear, 578, sheet) };
  return (
    <AbsoluteFill style={{ fontFamily: sans }}>
      {withAudio && <Audio src={staticFile(audioFile)} />}
      <Paper drift={Math.sin(f / 180) * 0.5} />
      {/* the problem, then the turn (round 4); then the app, on its own clock */}
      <Opening f={f} />
      <Revisit f={f - OPEN} />
      <End f={f} />
      {/* type never sits on UI: the app fades out under the caption band */}
      <BandScrim band={band} drift={Math.sin(f / 180) * 0.5} opacity={prog(f, OPEN - 24, OPEN) * (1 - prog(f, OPEN + HITS.out, OPEN + HITS.out + 8))} />
      <Captions
        frame={f}
        fps={FPS}
        captions={CAPTIONS as ReelCaption[]}
        timing={VO}
        kickers={KICKERS}
        showCaptions={withCaptions}
        showKickers={withCaptions}
        slots={SLOTS}
      />
      <Lens />
    </AbsoluteFill>
  );
};
