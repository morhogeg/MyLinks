import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CAPTIONS, FPS, FULL_CAPTIONS } from '../../../../clips/ad-todo-timeline.mjs';
import VO from './vo.json';
import { HEAD_LEAD, Headline } from '../../kit/Type';

/**
 * The captions as HEADLINES (2026-10-04, owner: "headline captions", and the
 * old word-by-word reveal read "dated and laggy"). The narrator says every
 * word; the screen shows each line's point (the timeline's `heads`: [the
 * spoken word it lands on, the headline]). A headline arrives `HEAD_LEAD`
 * frames before its word and stays until the next one arrives: the old one
 * rolls up and out in the 5 frames before, then the new one rises (`ROLL` = 0:
 * an overlap let the next peek out under the last), the last before the
 * lockup until its line's `to`. The hook's
 * headline is in place on frame 0: it is the poster.
 */
type Head = [number, string];
type Line = { at: number; to: number; hook?: boolean; place?: string; heads?: Head[] };

const ROLL = 0;

/** the captions, as headlines (`heads`) or the full narration (`full`) */
const build = (mode: 'heads' | 'full') => {
  const lines = (CAPTIONS as Line[]).filter((c) => c.heads);
  const starts = lines.flatMap((c, li) => {
    const timing = VO.find((v) => v.frame === c.at);
    const set = mode === 'full' ? (FULL_CAPTIONS as Head[][])[li] : c.heads!;
    return set.map(([word, text], k) => ({
      from: c.hook && k === 0 ? 0 : c.at + Math.round((timing?.words[word] ?? 0) * FPS) - HEAD_LEAD,
      text,
      poster: !!c.hook && k === 0,
      lineTo: c.to,
    }));
  });
  return starts.map((h, i) => ({ ...h, to: i + 1 < starts.length ? starts[i + 1].from + ROLL : h.lineTo }));
};

/** every headline, with its frames (absolute) */
export const HEADLINES = build('heads');
const FULL = build('full');

export const Chunks: React.FC<{ frame: number; top: number; mode?: 'heads' | 'full' }> = ({ frame, top, mode = 'heads' }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    {(mode === 'full' ? FULL : HEADLINES).map((h) =>
      frame >= h.from - 1 && frame <= h.to + 1 ? (
        <div key={h.from} style={{ position: 'absolute', left: 0, right: 0, top, display: 'flex', justifyContent: 'center' }}>
          <Headline text={h.text} frame={frame} from={h.from} to={h.to} poster={h.poster} size={mode === 'full' ? 56 : 66} />
        </div>
      ) : null,
    )}
  </AbsoluteFill>
);
