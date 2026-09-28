import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CAPTIONS, FPS, HITS, TOTAL_FRAMES } from '../../../../clips/revisit-timeline.mjs';
import VO from './vo.json';
import { Lockup } from '../../kit/Brand';
import { prog } from '../../kit/curves';

/**
 * The reel's lockup, unchanged (kit/Brand.tsx `Lockup`, placed and pushed in
 * exactly as the reel's scenes/End.tsx does): the mark arrives with the
 * app's own launch motion and strikes on the score's impact, the drawn
 * wordmark wipes in as the narrator says "Machina", and "Never lose another
 * great find." arrives on the narrator's timing, in Geist. The clip ends ON
 * it: the last frame is the one a paused player shows.
 */
const LINE = CAPTIONS.find((c) => c.place === 'lockup')!;
const timing = VO.find((v) => v.frame === LINE.at);

export const End: React.FC<{ f: number }> = ({ f }) => {
  if (f < HITS.out) return null;
  const starts = timing?.words.map((s) => LINE.at + Math.round(s * FPS)) ?? [];
  const line = LINE.text.split('\n').slice(-1)[0];
  const drift = prog(f, HITS.markStrike + 6, TOTAL_FRAMES, (t) => t);
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <div style={{ position: 'absolute', top: 640, transform: `scale(${1 + drift * 0.025})` }}>
        <Lockup
          frame={f}
          strike={HITS.markStrike}
          wordAt={starts[0]}
          line={line}
          lineStarts={starts.slice(1)}
          lineStyle="statement"
          wordWidth={620}
        />
      </div>
    </AbsoluteFill>
  );
};
