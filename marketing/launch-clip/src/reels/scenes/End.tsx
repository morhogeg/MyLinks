import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CAPTIONS, FPS, HITS } from '../../../reel-timeline.mjs';
import VO from '../data/reel-vo.json';
import { Lockup } from '../kit/Brand';
import { prog } from '../kit/curves';

/**
 * 17.1s – 20.0s. The lockup: the mark arrives with the app's own launch
 * motion (arms draw, brackets close, the point strikes on the score's
 * impact), the wordmark wipes in, and the App Store subtitle arrives word by
 * word as the narrator says it. The reel ends ON the lockup: the last frame
 * is the one a paused player shows.
 */
const LINE = CAPTIONS.find((c) => c.place === 'lockup')!;
const timing = VO.find((v) => v.frame === LINE.at);

export const End: React.FC<{ f: number }> = ({ f }) => {
  if (f < 512) return null;
  const starts = timing?.words.map((s) => LINE.at + Math.round(s * FPS));
  const drift = prog(f, 540, 600, (t) => t);
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <div style={{ position: 'absolute', top: 690, transform: `scale(${1 + drift * 0.025})` }}>
        <Lockup frame={f} strike={HITS.markStrike} line={LINE.text} lineStarts={starts} />
      </div>
    </AbsoluteFill>
  );
};
