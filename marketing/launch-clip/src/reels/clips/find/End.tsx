import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CAPTIONS, FPS, HITS, TOTAL_FRAMES } from '../../../../clips/find-timeline.mjs';
import { Lockup } from '../../kit/Brand';
import { prog } from '../../kit/curves';
import VO from './find-vo.json';

/**
 * The reel's lockup, on the clip's clock (the reel's End.tsx, reading this
 * clip's timeline): the mark launches with the app's own motion and strikes
 * on the score's impact, the drawn wordmark wipes in as the narrator says
 * "Machina", then "Never lose another great find." in Geist, word by word
 * on the voice, and the end card holds. The clip ends ON the lockup.
 */
const LINE = CAPTIONS.find((c) => c.place === 'lockup')!;
const timing = VO.find((v) => v.frame === LINE.at);

export const End: React.FC<{ f: number }> = ({ f }) => {
  if (f < HITS.lockup) return null;
  // "Machina. Never lose another great find.": the first word is the drawn
  // wordmark, the rest is the line
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
