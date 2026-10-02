import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CAPTIONS, FPS, HITS, TOTAL_FRAMES } from '../../../../ads/trip-timeline.mjs';
import VO from './vo.json';
import { Lockup } from '../../kit/Brand';
import { prog } from '../../kit/curves';
import { useAdFrame } from './format';

/**
 * The close, the Ask clip's End on this ad's clock: the mark arrives with the
 * app's own launch motion (the point strikes on the score's impact), the drawn
 * wordmark wipes in as "Machina" is said, then the tagline on ONE line, word
 * by word on the narrator's timing: "Everything you save, finally useful."
 * The ad ends ON the lockup, held at least 1.6s after the last word.
 *
 * Nothing under the line: the space below it is kept clear for the App Store
 * badge, added once the listing is live (Meta's Install button carries the
 * call to action until then). No price, no availability claim.
 *
 * The mark and wordmark take the slow push; the line holds still (text under
 * a push this slow steps a pixel at a time). The kit's Lockup is drawn twice
 * with identical props: the pushed copy clipped above the line, a still copy
 * clipped to the line.
 */
const LINE = CAPTIONS.find((c) => c.place === 'lockup')!;
const timing = VO.find((v) => v.frame === LINE.at);
/** where the line's band starts inside the lockup, px from its top */
const LINE_BAND = 380;

export const End: React.FC<{ f: number }> = ({ f }) => {
  const L = useAdFrame();
  if (f < HITS.lockup) return null;
  const starts = timing?.words.map((s) => LINE.at + Math.round(s * FPS)) ?? [];
  const line = LINE.text.split('\n').slice(1).join('\n');
  const drift = prog(f, HITS.markStrike + 6, TOTAL_FRAMES, (t) => t);
  const lockup = (
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
  );
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <div
        style={{
          position: 'absolute',
          top: L.lockupTop,
          transform: `scale(${1 + drift * 0.025})`,
          clipPath: `inset(-50% -50% calc(100% - ${LINE_BAND}px) -50%)`,
        }}
      >
        {lockup}
      </div>
      <div style={{ position: 'absolute', top: L.lockupTop, clipPath: `inset(${LINE_BAND}px -50% -50% -50%)` }}>{lockup}</div>
    </AbsoluteFill>
  );
};
