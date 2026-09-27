import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CAPTIONS, FPS, HITS, real } from '../../../reel-timeline.mjs';
import VO from '../data/reel-vo.json';
import { Lockup } from '../kit/Brand';
import { prog } from '../kit/curves';

/**
 * The lockup (OUTPUT frames: the mark launches at the app's own pace): the mark arrives with the app's own launch
 * motion (arms draw, brackets close, the point strikes on the score's
 * impact), the wordmark wipes in, and the App Store subtitle arrives word by
 * word as the narrator says it. The reel ends ON the lockup: the last frame
 * is the one a paused player shows.
 */
const LINE = CAPTIONS.find((c) => c.place === 'lockup')!;
const timing = VO.find((v) => v.frame === LINE.at);

export const End: React.FC<{ f: number }> = ({ f }) => {
  if (f < real(HITS.lockup)) return null;
  // "Machina. Never lose another great find.": the first word is the drawn
  // wordmark (it wipes in as the name is said), the rest is the line
  const starts = timing?.words.map((s) => LINE.at + Math.round(s * FPS)) ?? [];
  const line = LINE.text.split('\n').slice(-1)[0];
  const drift = prog(f, real(HITS.markStrike) + 6, real(600), (t) => t);
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <div style={{ position: 'absolute', top: 640, transform: `scale(${1 + drift * 0.025})` }}>
        <Lockup
          frame={f}
          strike={real(HITS.markStrike)}
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
