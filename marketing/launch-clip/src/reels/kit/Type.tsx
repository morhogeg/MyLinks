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

/** frames a word takes to come into focus; frames between words in a line */
const WORD_IN = 7;
const CASCADE = 1.5;
/** frames the whole line takes to leave */
const LINE_OUT = 6;

/**
 * One narrated line, LINE BY LINE (round 6, owner: the word-by-word mask
 * rise read "dated and sluggish"). Each line arrives when the narrator
 * reaches its first word (`starts`, frames relative to `from`, one per
 * word); its words then cascade in 1.5 frames apart, each coming into focus
 * (blur → sharp) with a small lift: the line lands as one gesture, centred,
 * and never sits half-built at the left edge. It leaves the same way,
 * together, in 6 frames, finishing on `to`. A "\n" is a hard break; `sizes`
 * sets a size per line (a name over its promise), else every line is `size`.
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
  font?: string;
  tracking?: string;
}> = ({ text, frame, from, to, starts, size = 64, sizes, width = 940, align = 'center', color = INK, weight = 600, font = sans, tracking = '-0.028em' }) => {
  if (frame < from - 2 || frame > to + 2) return null;
  const local = frame - from;
  const lines = text.split('\n').map((l) => l.split(' ').filter(Boolean));
  const out = prog(local, to - from - LINE_OUT, to - from, EASE_MODAL);
  let w = -1;
  return (
    <div
      style={{
        width,
        display: 'flex',
        flexDirection: 'column',
        alignItems: align === 'center' ? 'center' : 'flex-start',
        gap: 6,
        opacity: 1 - out,
        filter: out > 0.01 ? `blur(${(out * 8).toFixed(2)}px)` : undefined,
        transform: `translateY(${Math.round(-out * 10)}px)`,
      }}
    >
      {lines.map((words, li) => {
        const first = w + 1;
        const lineStart = starts?.[first] ?? first * 3;
        return (
          <div
            key={li}
            style={{
              fontFamily: font,
              fontSize: sizes?.[li] ?? size,
              fontWeight: weight,
              lineHeight: 1.12,
              letterSpacing: tracking,
              color,
              textAlign: align,
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: align === 'center' ? 'center' : 'flex-start',
              columnGap: '0.25em',
            }}
          >
            {words.map((word, k) => {
              w += 1;
              const s0 = lineStart + k * CASCADE;
              const t = prog(local, s0, s0 + WORD_IN, EASE_MODAL);
              return (
                <span
                  key={w}
                  style={{
                    display: 'inline-block',
                    opacity: Math.min(1, t * 1.6),
                    transform: `translateY(${((1 - t) * 0.28).toFixed(3)}em)`,
                    filter: t < 0.999 ? `blur(${((1 - t) * 12).toFixed(2)}px)` : undefined,
                  }}
                >
                  {word}
                </span>
              );
            })}
          </div>
        );
      })}
    </div>
  );
};

/**
 * The pillar word (SAVE / FIND / ASK / CONNECT / REVISIT): a small
 * letterspaced label above the line. It arrives on the scene's first beat,
 * letter by letter coming into focus (0.8 frames apart), while its tracking
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
      <div style={{ display: 'flex' }}>
        {text
          .toUpperCase()
          .split('')
          .map((ch, k) => {
            const t = prog(local, k * 0.8, k * 0.8 + 7, EASE_MODAL);
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
                  opacity: Math.min(1, t * 1.6),
                  filter: t < 0.999 ? `blur(${((1 - t) * 6).toFixed(2)}px)` : undefined,
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
