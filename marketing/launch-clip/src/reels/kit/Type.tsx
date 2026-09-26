import React from 'react';
import { sans } from '../../fonts';
import { EASE_FLING, EASE_MODAL, mix, prog } from './curves';

/**
 * Kinetic type. Two voices, one family (Geist, the brand face):
 *
 *  - the LINE: what the narrator says, set big and revealed word by word on
 *    the voice's own timing (src/reels/data/reel-vo.json, measured from the
 *    synthesized audio). Each word rises out of a mask with EASE_MODAL and
 *    leaves the same way, upward, a hair apart. Two lines at most.
 *  - the KICKER: the pillar word (SAVE / FIND / ASK / CONNECT / REVISIT), a
 *    small letterspaced label above the line that names the chapter.
 *
 * Type rules (README "Motion language"): ink on paper, never colour; the line
 * is 56px/1.12 weight 600, tracking -0.028em, two lines at most in a 980px
 * measure (about 10 words);
 * nothing moves sub-pixel on a hold (whole-pixel rounding, the film's
 * shimmer lesson).
 */

export const INK = 'rgba(17,24,39,0.96)';
export const INK_SOFT = 'rgba(75,85,99,0.82)';

const WORD_IN = 9;
const WORD_OUT = 7;

/**
 * One narrated line, word by word. `starts` are frames relative to `from`,
 * one per word. A "\n" in `text` is a hard break (the film's rule: a caption
 * holding two sentences starts the second on its own line); `sizes` sets a
 * size per line (a name over its promise), else every line is `size`.
 */
export const KineticLine: React.FC<{
  text: string;
  frame: number;
  from: number;
  to: number;
  starts?: number[];
  size?: number;
  sizes?: number[];
  width?: number;
  align?: 'center' | 'left';
  color?: string;
  weight?: number;
}> = ({ text, frame, from, to, starts, size = 64, sizes, width = 940, align = 'center', color = INK, weight = 600 }) => {
  if (frame < from - 2 || frame > to + 2) return null;
  const local = frame - from;
  const lines = text.split('\n').map((l) => l.split(' ').filter(Boolean));
  const count = lines.reduce((n, l) => n + l.length, 0);
  // the whole line leaves together, a hair apart, finishing on `to`
  const outStart = to - from - WORD_OUT - (count - 1) * 0.5;
  let w = -1;
  return (
    <div style={{ width, display: 'flex', flexDirection: 'column', alignItems: align === 'center' ? 'center' : 'flex-start', gap: 6 }}>
      {lines.map((words, li) => (
        <div
          key={li}
          style={{
            fontFamily: sans,
            fontSize: sizes?.[li] ?? size,
            fontWeight: weight,
            lineHeight: 1.12,
            letterSpacing: '-0.028em',
            color,
            textAlign: align,
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: align === 'center' ? 'center' : 'flex-start',
            columnGap: '0.25em',
          }}
        >
          {words.map((word) => {
            w += 1;
            const s = starts?.[w] ?? w * 3;
            const tin = prog(local, s, s + WORD_IN, EASE_MODAL);
            const o0 = outStart + w * 0.5;
            const tout = prog(local, o0, o0 + WORD_OUT, EASE_FLING);
            const y = Math.round((1 - tin) * 105 - tout * 105);
            return (
              <span
                key={w}
                style={{ display: 'inline-block', overflow: 'hidden', paddingBottom: '0.12em', marginBottom: '-0.12em', verticalAlign: 'top' }}
              >
                <span style={{ display: 'inline-block', transform: `translateY(${y}%)`, opacity: Math.min(1, tin * 2.2) * (1 - tout) }}>
                  {word}
                </span>
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
};

/**
 * The pillar word (SAVE / FIND / ASK / CONNECT / REVISIT): a small
 * letterspaced label above the line. It arrives on the scene's first beat,
 * letter by letter out of a mask (one frame apart), while its tracking
 * settles; it leaves with a fade. Restraint is the point: the energy of a
 * cut belongs to the picture, the label only names the chapter.
 */
export const Kicker: React.FC<{ text: string; frame: number; from: number; to: number }> = ({ text, frame, from, to }) => {
  if (frame < from || frame > to + 8) return null;
  const local = frame - from;
  const out = prog(frame, to, to + 8, EASE_MODAL);
  const track = mix(0.62, 0.44, prog(local, 0, 14, EASE_MODAL));
  const rule = prog(local, 0, 10, EASE_MODAL);
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 18, opacity: 1 - out }}>
      <div style={{ width: 34 * rule, height: 3, borderRadius: 2, background: INK, opacity: 0.85 }} />
      <div style={{ overflow: 'hidden', paddingBottom: 3, display: 'flex' }}>
        {text
          .toUpperCase()
          .split('')
          .map((ch, k) => {
            const t = prog(local, k, k + 8, EASE_MODAL);
            return (
              <span
                key={k}
                style={{
                  display: 'inline-block',
                  fontFamily: sans,
                  fontSize: 25,
                  fontWeight: 650,
                  letterSpacing: `${track}em`,
                  color: INK_SOFT,
                  transform: `translateY(${Math.round((1 - t) * 110)}%)`,
                }}
              >
                {ch}
              </span>
            );
          })}
      </div>
      <div style={{ width: 34 * rule, height: 3, borderRadius: 2, background: INK, opacity: 0 }} />
    </div>
  );
};
