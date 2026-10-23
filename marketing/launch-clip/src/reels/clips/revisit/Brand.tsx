import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CAPTIONS, FPS, HITS, TOTAL_FRAMES } from '../../../../clips/revisit-timeline.mjs';
import { sans } from '../../../fonts';
import { AnimatedMark, Wordmark } from '../../../ui/Brand';
import { EASE_IN_OUT, EASE_MODAL, prog } from '../../kit/curves';
import { INK } from '../../kit/Type';
import VO from './revisit-vo.json';

/**
 * The sign-off in TICK IT OFF, the shipped identity (ui/Brand.tsx: the
 * Citation mark's own launch motion, the drawn wordmark): on paper, the mark
 * draws in and its point strikes on the spoken "Machina", the wordmark wipes
 * in, the tagline arrives word by word on the voice. It holds, on a slow
 * push, to the last frame (round 2, owner: the reel ends on the logo and the
 * tagline); the loop cuts from it back to the hook.
 */

const MARK_W = 300;
const MARK_H = (MARK_W * 416) / 576;
const MARK_Y = 812;
const LOCK = { nameTop: MARK_Y + 165, nameW: 440, lineTop: MARK_Y + 261, size: 50 };
const TAG = CAPTIONS.find((c) => c.place === 'scene' && c.text.startsWith('Machina'))!;
const TAG_T = (VO as { frame: number; words: number[] }[]).find((v) => v.frame === TAG.at);
/** the launch, a touch quicker than the app's 39 frames; its point strikes at 0.56 */
const MARK_DRAW = 32;

export const EndCard: React.FC<{ f: number; show: boolean }> = ({ f, show }) => {
  const starts = TAG_T?.words.map((s) => TAG.at + Math.round(s * FPS)) ?? [];
  const name = starts[0] ?? TAG.at;
  const from = name - Math.round(0.56 * MARK_DRAW);
  if (f < from) return null;
  const u = prog(f, from, from + MARK_DRAW, (t) => t);
  const wipe = prog(f, name - 3, name + 12, EASE_MODAL);
  const push = 1 + 0.03 * prog(f, from, TOTAL_FRAMES - 1, (t) => t);
  const words = TAG.text.split('\n')[1].split(' ');
  return (
    // (round 4) the slow push on a composited layer: Chromium moves it by
    // fractions of a pixel, where re-laid-out type stepped whole pixels
    <AbsoluteFill style={{ pointerEvents: 'none', transform: `scale(${push.toFixed(5)})`, transformOrigin: `540px ${MARK_Y}px`, willChange: 'transform' }}>
      <div
        style={{
          position: 'absolute',
          left: 540 - MARK_W / 2,
          top: MARK_Y - MARK_H / 2,
          width: MARK_W,
          height: MARK_H,
          color: INK,
          // (round 4) in over the last of the app's dissolve, so no frame
          // is bare paper between the two (it waited for the paper)
          opacity: prog(f, HITS.lockup - 8, HITS.lockup + 2, (t) => t * t * (3 - 2 * t)),
          filter: 'drop-shadow(0 10px 30px rgba(24,32,48,0.16))',
        }}
      >
        <AnimatedMark u={u} id="revisit-end" style={{ width: '100%', height: '100%' }} />
      </div>
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

/** the paper the sign-off sits on, over the app's dissolve (App.tsx: the tab defocusing as it recedes) */
export const signOffPaper = (f: number) => (f < HITS.lockup - 14 ? 0 : prog(f, HITS.lockup - 14, HITS.lockup + 1, EASE_IN_OUT));

export { MARK_Y };
