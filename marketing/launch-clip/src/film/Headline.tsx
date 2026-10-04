import React from 'react';
import { sans } from '../fonts';

/*
 * The kit's Headline (claude/ad-todo, src/reels/kit/Type.tsx, 2026-10-04),
 * brought into the film unchanged in motion. The film has no reels kit on
 * this branch, so it lives here; `align` is the one addition (the film's
 * landscape product beats set type in a left column).
 */

/** a quick, decisive ease-out (quint): fast off the mark, long soft landing */
const OUT_QUINT = (t: number) => 1 - Math.pow(1 - t, 5);
const IN_CUBIC = (t: number) => t * t * t;
/** frames a headline line takes to rise in; between lines; to roll out */
const HEAD_IN = 9;
const HEAD_STAGGER = 2;
const HEAD_OUT = 5;
/** a headline arrives this many frames BEFORE its anchor word: the eye leads
 *  the ear (word times are estimated, and late text reads as lag) */
export const HEAD_LEAD = 3;

const INK = 'rgba(17,24,39,0.96)';

/**
 * A HEADLINE (2026-10-04, owner: headline captions instead of the full
 * narration; the old caption motion read "dated and laggy"). The voice says
 * the whole line; the screen carries its point in 2–5 words.
 *
 * Motion: each line rises out of its own mask in one decisive move
 * (`HEAD_IN` frames, ease-out quint, lines `HEAD_STAGGER` apart), no blur;
 * it leaves by rolling up out of the same mask (`HEAD_OUT` frames) just
 * before the next one rises: one clean roll, never two headlines at once. One
 * phrase may be marked `*like this*`: an ink highlighter sweeps under it
 * once the line has landed. `poster`: already in place on its first frame.
 * Ink on paper; whole-pixel moves on the hold.
 */
export const Headline: React.FC<{
  text: string;
  frame: number;
  from: number;
  to: number;
  poster?: boolean;
  size?: number;
  width?: number;
  color?: string;
  align?: 'center' | 'left';
}> = ({ text, frame, from, to, poster = false, size = 66, width = 980, color = INK, align = 'center' }) => {
  if (frame < from - 1 || frame > to + 1) return null;
  const local = frame - from;
  const lines = text.split('\n');
  const outStart = to - from - HEAD_OUT;
  return (
    <div
      style={{
        width,
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'left' ? 'flex-start' : 'center',
        gap: 2,
      }}
    >
      {lines.map((line, li) => {
        const tin = poster ? 1 : OUT_QUINT(Math.min(1, Math.max(0, (local - li * HEAD_STAGGER) / HEAD_IN)));
        const tout = IN_CUBIC(Math.min(1, Math.max(0, (local - outStart - li) / HEAD_OUT)));
        const y = (1 - tin) * 108 - tout * 108;
        // the marked phrase's highlighter: sweeps in once the line has landed
        const sweep = poster ? 1 : OUT_QUINT(Math.min(1, Math.max(0, (local - li * HEAD_STAGGER - HEAD_IN + 2) / 10)));
        const parts = line.split('*');
        return (
          // the mask: a little taller than the line, so descenders never clip
          <div key={li} style={{ overflow: 'hidden', padding: '0.06em 0.1em 0.14em', margin: '-0.06em 0 -0.14em' }}>
            <div
              style={{
                transform: `translateY(${Math.round(y)}%)`,
                fontFamily: sans,
                fontSize: size,
                fontWeight: 700,
                lineHeight: 1.08,
                letterSpacing: '-0.034em',
                color,
                textAlign: align,
                whiteSpace: 'nowrap',
              }}
            >
              {parts.map((p, k) =>
                k % 2 ? (
                  <span key={k} style={{ position: 'relative', display: 'inline-block' }}>
                    <span
                      style={{
                        position: 'absolute',
                        left: '-0.06em',
                        right: '-0.06em',
                        bottom: '0.06em',
                        height: '0.36em',
                        borderRadius: '0.08em',
                        background: 'rgba(17,24,39,0.11)',
                        transform: `scaleX(${sweep.toFixed(3)})`,
                        transformOrigin: 'left center',
                      }}
                    />
                    <span style={{ position: 'relative' }}>{p}</span>
                  </span>
                ) : (
                  <span key={k}>{p}</span>
                ),
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
};
