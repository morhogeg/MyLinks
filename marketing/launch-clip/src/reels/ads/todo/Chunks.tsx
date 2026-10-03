import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CAPTIONS, FPS } from '../../../../clips/ad-todo-timeline.mjs';
import VO from './vo.json';
import { KineticLine } from '../../kit/Type';

/**
 * The narration on screen, round 6. Each narrator line is spoken whole and
 * set in short chunks (the timeline's `chunks`: at most 8 words each), in the
 * kit's line style (`KineticLine`): a chunk arrives as its first word is
 * said, its words coming into focus on the narrator's measured timing, and
 * leaves as the next chunk arrives (or at the line's `to`). The hook's first
 * chunk is already whole on frame 0: it is the poster.
 *
 * (The kit's Captions sets one caption per voice line; a whole spoken line is
 * too long for one screen, so the ad has its own, built on the kit's type.)
 */
type Chunk = [number, string];
type Line = { at: number; to: number; hook?: boolean; place?: string; chunks?: Chunk[] };

const words = (t: string) => t.split(/\s+/).filter(Boolean);

/** every chunk, with its frames and its words' arrival frames (absolute) */
export const CHUNKS = (CAPTIONS as Line[])
  .filter((c) => c.chunks)
  .flatMap((c) => {
    const timing = VO.find((v) => v.frame === c.at);
    const wordAt = (i: number) => c.at + Math.round((timing?.words[i] ?? 0) * FPS);
    return c.chunks!.map(([first, text], k) => {
      const hookPoster = c.hook && k === 0;
      const from = hookPoster ? 0 : wordAt(first);
      const next = c.chunks![k + 1];
      const to = next ? wordAt(next[0]) : c.to;
      const starts = words(text).map((_, j) => (hookPoster ? -30 : wordAt(first + j) - from));
      return { from, to, text, starts };
    });
  });

export const Chunks: React.FC<{ frame: number; top: number }> = ({ frame, top }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    {CHUNKS.map((c) =>
      frame >= c.from - 2 && frame <= c.to + 2 ? (
        <div key={c.from} style={{ position: 'absolute', left: 0, right: 0, top, display: 'flex', justifyContent: 'center' }}>
          <KineticLine text={c.text} frame={frame} from={c.from} to={c.to} starts={c.starts} size={56} width={980} />
        </div>
      ) : null,
    )}
  </AbsoluteFill>
);
