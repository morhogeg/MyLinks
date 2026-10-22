import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CAPTIONS, FPS, HITS, MARK_DRAW, TOTAL_FRAMES } from '../../../../clips/savethis-timeline.mjs';
import { sans } from '../../../fonts';
import { AnimatedMark, Wordmark } from '../../../ui/Brand';
import { EASE_MODAL, prog } from '../../kit/curves';
import { INK } from '../../kit/Type';
import VO from './savethis-vo.json';

/**
 * The sign-off (owner, round 12: under the tagline, the Machina logo
 * animated, not the Ask chat; round 13: and the last frame is the logo).
 *
 * The chat dissolves into the paper as the app's own launch mark draws in
 * (AnimatedMark: the arms drawn out from their corners, the brackets
 * closing, the point striking), the wordmark wipes in on the spoken name,
 * then "Everything you save, finally useful." on one line (round 13), word
 * by word on the narrator's timing. The lockup holds to the last frame on a
 * slow push, "This time, you'll watch it again." in the band above it; the
 * loop cuts from it to the hook on the beat.
 */
const TAG = CAPTIONS.find((c) => c.at === HITS.tagline)!;
const TAG_T = VO.find((v) => v.frame === TAG.at);

/** the lockup, centred a little above the frame's middle, clear under the
 *  band's last line: the mark (the travel box's width; the closed mark is
 *  3/4 of it), the name, the line */
const MARK_W = 300;
const MARK_H = (MARK_W * 416) / 576;
const LOCK = { markY: 812, nameTop: 977, nameW: 440, lineTop: 1073, size: 50 };
/** the card's push, from the mark's first tick to the loop */
const PUSH = 0.03;

export const EndCard: React.FC<{ f: number; show: boolean }> = ({ f, show }) => {
  if (f < MARK_DRAW.from) return null;
  const starts = TAG_T?.words.map((s) => TAG.at + Math.round(s * FPS)) ?? [];
  const name = starts[0] ?? TAG.at;
  const u = prog(f, MARK_DRAW.from, MARK_DRAW.from + MARK_DRAW.frames, (t) => t);
  const wipe = prog(f, name - 3, name + 12, EASE_MODAL);
  const push = 1 + PUSH * prog(f, MARK_DRAW.from, TOTAL_FRAMES, (t) => t);
  const words = TAG.text.split('\n')[1].split(' ');

  return (
    <AbsoluteFill style={{ pointerEvents: 'none', transform: `scale(${push})`, transformOrigin: `540px ${LOCK.nameTop}px` }}>
      {/* the mark */}
      <div
        style={{
          position: 'absolute',
          left: 540 - MARK_W / 2,
          top: LOCK.markY - MARK_H / 2,
          width: MARK_W,
          height: MARK_H,
          color: INK,
          // the launch starts from its corner ticks: they ease in on the
          // clear paper, not pop
          opacity: prog(f, MARK_DRAW.from, MARK_DRAW.from + 4, (t) => t * t * (3 - 2 * t)),
          filter: 'drop-shadow(0 10px 30px rgba(24,32,48,0.16))',
        }}
      >
        <AnimatedMark u={u} id="endmark" style={{ width: '100%', height: '100%' }} />
      </div>

      {/* the name, on its word */}
      <div
        style={{
          position: 'absolute',
          left: 540 - LOCK.nameW / 2,
          top: LOCK.nameTop,
          width: LOCK.nameW,
          color: INK,
          lineHeight: 0,
          clipPath: `inset(-10% ${(1 - wipe) * 100}% -10% 0)`,
          transform: `translateY(${Math.round((1 - wipe) * 10)}px)`,
        }}
      >
        <Wordmark style={{ width: '100%', height: 'auto' }} />
      </div>

      {/* the line, one row, a word on each of the narrator's */}
      {show && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: LOCK.lineTop,
            display: 'flex',
            justifyContent: 'center',
            columnGap: '0.25em',
            fontFamily: sans,
            fontSize: LOCK.size,
            fontWeight: 600,
            letterSpacing: '-0.028em',
            lineHeight: 1.1,
            color: INK,
            whiteSpace: 'nowrap',
          }}
        >
          {words.map((w, k) => {
            const s0 = (starts[k + 1] ?? TAG.at) - 3;
            const t = prog(f, s0, s0 + 8, EASE_MODAL);
            return (
              <span
                key={k}
                style={{
                  display: 'inline-block',
                  opacity: Math.min(1, t * 1.6),
                  transform: `translateY(${Math.round((1 - t) * 12)}px)`,
                  filter: t < 0.999 ? `blur(${((1 - t) * 10).toFixed(2)}px)` : undefined,
                }}
              >
                {w}
              </span>
            );
          })}
        </div>
      )}
    </AbsoluteFill>
  );
};
