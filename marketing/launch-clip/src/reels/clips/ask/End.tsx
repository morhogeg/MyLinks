import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CAPTIONS, FPS, HITS, TOTAL_FRAMES } from '../../../../clips/ask-timeline.mjs';
import VO from './vo.json';
import { Lockup } from '../../kit/Brand';
import { prog } from '../../kit/curves';

/**
 * The reel's close, on this clip's clock: the mark arrives with the app's own
 * launch motion (the point strikes on the score's impact, on a beat), the
 * drawn wordmark wipes in as "Machina" is said, and the App Store subtitle
 * arrives word by word on the narrator's timing, set in Geist. The clip ends
 * ON the lockup: the last frame is the one a paused player shows.
 *
 * The reel's slow push-in (2.5% over the hold) stays on the mark and the
 * wordmark, which are vector paths and scale smoothly. The line holds still:
 * text is laid out on whole pixels, so under a push this slow it stepped a
 * pixel at a time (measured: ~5,000 pixels of the line jumping at once every
 * ~28 frames). The kit's Lockup is drawn twice with identical props, so the
 * layout is identical: the pushed copy clipped above the line, a still copy
 * clipped to the line.
 */
const LINE = CAPTIONS.find((c) => c.place === 'lockup')!;
const timing = VO.find((v) => v.frame === LINE.at);

/** where the line's band starts inside the lockup, px from its top: below the
 *  wordmark and its shadow (ink ends at 338), above the line's words and
 *  their arrival blur (ink starts at 416); measured on the render */
const LINE_BAND = 380;

export const End: React.FC<{ f: number }> = ({ f }) => {
  if (f < HITS.lockup) return null;
  // "Machina. Never lose another great find.": the first word is the drawn
  // wordmark, the rest is the line
  const starts = timing?.words.map((s) => LINE.at + Math.round(s * FPS)) ?? [];
  const line = LINE.text.split('\n').slice(-1)[0];
  const drift = prog(f, HITS.markStrike + 6, TOTAL_FRAMES, (t) => t);
  const lockup = (
    <Lockup
      frame={f}
      strike={HITS.markStrike}
      wordAt={starts[0]}
      line={line}
      lineStarts={starts.slice(1)}
      lineStyle="statement"
      wordWidth={620}
    />
  );
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <div
        style={{
          position: 'absolute',
          top: 640,
          transform: `scale(${1 + drift * 0.025})`,
          clipPath: `inset(-50% -50% calc(100% - ${LINE_BAND}px) -50%)`,
        }}
      >
        {lockup}
      </div>
      <div style={{ position: 'absolute', top: 640, clipPath: `inset(${LINE_BAND}px -50% -50% -50%)` }}>{lockup}</div>
    </AbsoluteFill>
  );
};
