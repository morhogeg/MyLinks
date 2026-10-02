import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CAPTIONS, FPS, HITS, TOTAL_FRAMES } from '../../../../clips/ad-todo-timeline.mjs';
import VO from './vo.json';
import { Lockup } from '../../kit/Brand';
import { prog } from '../../kit/curves';
import { useShape } from './frame';

/**
 * 6 CLOSE: the kit's lockup, unchanged (kit/Brand.tsx `Lockup`, placed and
 * pushed in as the REVISIT clip's End.tsx does): the mark launches and
 * strikes on the score's impact, the drawn wordmark wipes in as the narrator
 * says "Machina", and the tagline, `Everything you save, finally useful.`,
 * arrives on the narrator's timing on one line and holds. Nothing under it:
 * that space is kept for the App Store badge once the listing is live.
 */
const LINE = CAPTIONS.find((c) => c.place === 'lockup')!;
const timing = VO.find((v) => v.frame === LINE.at);

export const End: React.FC<{ f: number }> = ({ f }) => {
  const { lockupTop } = useShape();
  if (f < HITS.out) return null;
  const starts = timing?.words.map((s) => LINE.at + Math.round(s * FPS)) ?? [];
  const line = LINE.text.split('\n').slice(-1)[0];
  const drift = prog(f, HITS.markStrike + 6, TOTAL_FRAMES, (t) => t);
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <div style={{ position: 'absolute', top: lockupTop, transform: `scale(${1 + drift * 0.025})` }}>
        <Lockup
          frame={f}
          strike={HITS.markStrike}
          wordAt={starts[0]}
          line={line}
          lineStarts={starts.slice(1)}
          lineStyle="statement"
          lineSize={50}
          wordWidth={620}
        />
      </div>
    </AbsoluteFill>
  );
};
