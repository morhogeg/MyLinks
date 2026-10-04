import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CAPTIONS, FPS } from '../../../../clips/ask-timeline.mjs';
import VO from './vo.json';
import { HEAD_LEAD, Headline } from '../../kit/Type';

/**
 * The captions as HEADLINES (2026-10-04, owner, for every video: headline
 * captions, and the word-by-word reveal read "dated and laggy"). The narrator
 * says every word of each line; the screen shows its point in 2–5 words (the
 * timeline's `heads`: [the spoken word it lands on, the headline]). A
 * headline arrives `HEAD_LEAD` frames before its word and stays until the
 * next one arrives, which it hands over to with no overlap (it rolls out in
 * the 5 frames before); the last before the lockup leaves with its line. The
 * hook's headline is in place on frame 0: it is the poster. Meta ad 3's
 * headline layer (claude/ad-todo, src/reels/ads/todo/Chunks.tsx), on this
 * clip's timeline.
 */
type Head = [number, string];
type Line = { at: number; to: number; hook?: boolean; heads?: Head[] };

const starts = (CAPTIONS as Line[])
  .filter((c) => c.heads)
  .flatMap((c) => {
    const timing = VO.find((v) => v.frame === c.at);
    return c.heads!.map(([word, text], k) => ({
      from: c.hook && k === 0 ? 0 : c.at + Math.round((timing?.words[word] ?? 0) * FPS) - HEAD_LEAD,
      text,
      poster: !!c.hook && k === 0,
      lineTo: c.to,
    }));
  });

/** every headline, with its frames (absolute) */
export const HEADLINES = starts.map((h, i) => ({
  ...h,
  to: i + 1 < starts.length ? starts[i + 1].from : h.lineTo,
}));

export const Heads: React.FC<{ frame: number; top: number }> = ({ frame, top }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    {HEADLINES.map((h) =>
      frame >= h.from - 1 && frame <= h.to + 1 ? (
        <div key={h.from} style={{ position: 'absolute', left: 0, right: 0, top, display: 'flex', justifyContent: 'center' }}>
          <Headline text={h.text} frame={frame} from={h.from} to={h.to} poster={h.poster} />
        </div>
      ) : null,
    )}
  </AbsoluteFill>
);
