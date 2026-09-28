import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CAPTIONS, FPS, LOCKUP, STRIKE, TOTAL_FRAMES } from '../../../../clips/save-timeline.mjs';
import VO from './vo.json';
import { Lockup } from '../../kit/Brand';
import { prog } from '../../kit/curves';

/**
 * The reel's lockup, on the clip's clock (scenes/End.tsx is the model): the
 * mark arrives with the app's own launch motion and strikes on STRIKE (the
 * score's impact), the drawn wordmark wipes in as the narrator says
 * "Machina", then "Never lose another great find." in Geist, word by word on
 * the voice, and holds. The clip ends ON the lockup.
 */
const LINE = CAPTIONS.find((c) => c.place === 'lockup')!;
const timing = VO.find((v) => v.frame === LINE.at);

export const End: React.FC<{ f: number }> = ({ f }) => {
  if (f < LOCKUP) return null;
  const starts = timing?.words.map((s) => LINE.at + Math.round(s * FPS)) ?? [];
  const line = LINE.text.split('\n').slice(-1)[0];
  const drift = prog(f, STRIKE + 6, TOTAL_FRAMES, (t) => t);
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <div style={{ position: 'absolute', top: 640, transform: `scale(${1 + drift * 0.025})` }}>
        <Lockup
          frame={f}
          strike={STRIKE}
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
