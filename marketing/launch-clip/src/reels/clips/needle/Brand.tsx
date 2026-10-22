import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CAPTIONS, FPS, HITS, TOTAL_FRAMES } from '../../../../clips/needle-timeline.mjs';
import { sans } from '../../../fonts';
import { AnimatedMark, CitationGlyph, Wordmark } from '../../../ui/Brand';
import { EASE_IN_OUT, EASE_MODAL, EASE_SPRING, prog } from '../../kit/curves';
import { INK } from '../../kit/Type';
import { MATCH_INK_PX } from './App';
import { BURST_Y, GATHER_Y } from './field';
import VO from './needle-vo.json';

/**
 * The brand in FIND THE BOOK, all of it the shipped identity (ui/Brand.tsx:
 * the Citation mark's path data and the app's own launch motion, the drawn
 * wordmark):
 *
 *  GatherMark  "Or just ask Machina": the field rushes into one point and
 *              the brackets snap shut around it; the point strikes on
 *              "Machina", then pulls back to exactly the size and place of
 *              Ask's own mark, where the real app takes over (App.tsx)
 *  EndCard     the sign-off on paper: the app's launch mark draws in, the
 *              wordmark wipes in on the spoken name, the tagline word by word
 *              on the voice; on "P.S." it all folds back into the point the
 *              field then bursts out of (field.ts `fieldBurst`), back to
 *              frame 0
 */

/** the glyph's ink box is 432 of its 448 viewBox units wide */
const INK_OF_TIGHT = 432 / 448;

/** the gathered mark's ink width at the strike, and at the cut (Ask's own) */
const STRIKE_INK = 268;

export const GatherMark: React.FC<{ f: number }> = ({ f }) => {
  if (f < HITS.gather + 8 || f >= HITS.ask) return null;
  // the brackets come in from wide and snap (EASE_SPRING overshoots inward,
  // the app's own snap), the point strikes on "Machina"
  const close = EASE_SPRING(Math.min(1, Math.max(0, (f - (HITS.markStrike - 16)) / 14)));
  const dot = EASE_SPRING(Math.min(1, Math.max(0, (f - (HITS.markStrike - 3)) / 6)));
  const appear = prog(f, HITS.gather + 8, HITS.markStrike - 12, EASE_MODAL);
  // after the strike, the pull-back the app shot continues
  const ink = STRIKE_INK + (MATCH_INK_PX - STRIKE_INK) * prog(f, HITS.markStrike + 1, HITS.ask, (t) => t * t);
  const w = ink / INK_OF_TIGHT;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      <div
        style={{
          position: 'absolute',
          left: 540 - w / 2,
          top: GATHER_Y - (w * 416) / 448 / 2,
          width: w,
          color: INK,
          lineHeight: 0,
          opacity: appear,
        }}
      >
        <CitationGlyph assembly={Math.max(0.0001, close)} dot={dot} style={{ width: '100%', height: 'auto', overflow: 'visible' }} />
      </div>
    </AbsoluteFill>
  );
};

/** the sign-off: the mark (its launch travel box; the closed mark is 3/4 of
 *  it), the name, the line; a slow push to the fold */
const MARK_W = 300;
const MARK_H = (MARK_W * 416) / 576;
const LOCK = { markY: BURST_Y, nameTop: BURST_Y + 165, nameW: 440, lineTop: BURST_Y + 261, size: 50 };
const PUSH = 0.03;
const TAG = CAPTIONS.find((c) => c.at === HITS.lockup)!;
const TAG_T = VO.find((v) => v.frame === TAG.at);
/** the launch, a touch quicker than the app's 39 frames; its point strikes at 0.56 */
export const MARK_DRAW = { frames: 32 };
/** the fold on "P.S.": the line and the name go into the mark, the brackets open */
const FOLD = { from: HITS.ps, to: HITS.burst };

export const EndCard: React.FC<{ f: number; show: boolean }> = ({ f, show }) => {
  const starts = TAG_T?.words.map((s) => TAG.at + Math.round(s * FPS)) ?? [];
  const name = starts[0] ?? TAG.at;
  const from = name - Math.round(0.56 * MARK_DRAW.frames);
  if (f < from || f >= HITS.burst + 12) return null;
  const u = prog(f, from, from + MARK_DRAW.frames, (t) => t);
  const wipe = prog(f, name - 3, name + 12, EASE_MODAL);
  const push = 1 + PUSH * prog(f, from, FOLD.from, (t) => t);
  const words = TAG.text.split('\n')[1].split(' ');
  // the fold: the name and the line sink into the mark…
  const sink = prog(f, FOLD.from, FOLD.from + 12, (t) => t * t * t);
  // …the brackets open and go, the point stays: the field comes out of it
  const open = prog(f, FOLD.from + 4, FOLD.to - 1, EASE_IN_OUT);
  const dotGone = prog(f, HITS.burst + 2, HITS.burst + 12, EASE_IN_OUT);
  const folding = f >= FOLD.from;
  const tightW = MARK_W * (448 / 576);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', transform: `scale(${push})`, transformOrigin: `540px ${LOCK.markY}px` }}>
      <div
        style={{
          position: 'absolute',
          left: 540 - (folding ? tightW : MARK_W) / 2,
          top: LOCK.markY - MARK_H / 2,
          width: folding ? tightW : MARK_W,
          height: MARK_H,
          color: INK,
          opacity: prog(f, from, from + 4, (t) => t * t * (3 - 2 * t)) * (1 - dotGone),
          filter: `drop-shadow(0 10px 30px rgba(24,32,48,${0.16 * (1 - open)}))`,
        }}
      >
        {folding ? (
          <CitationGlyph assembly={Math.max(0.0001, 1 - open)} dot={1} style={{ width: '100%', height: '100%', overflow: 'visible' }} />
        ) : (
          <AnimatedMark u={u} id="needle-end" style={{ width: '100%', height: '100%' }} />
        )}
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
          opacity: 1 - sink,
          filter: sink > 0.01 ? `blur(${(sink * 10).toFixed(2)}px)` : undefined,
          transform: `translateY(${Math.round((1 - wipe) * 10 - sink * 150)}px) scale(${1 - 0.6 * sink})`,
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
            opacity: 1 - sink,
            filter: sink > 0.01 ? `blur(${(sink * 12).toFixed(2)}px)` : undefined,
            transform: `translateY(${Math.round(-sink * 240)}px) scale(${1 - 0.7 * sink})`,
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

/** the paper the sign-off sits on, over the app's dissolve and under the burst */
export const signOffPaper = (f: number) =>
  f < HITS.lockup - 15 || f >= HITS.burst + 30 ? 0 : Math.min(prog(f, HITS.lockup - 15, HITS.lockup - 3, EASE_IN_OUT), 1);

export const LAST = TOTAL_FRAMES - 1;
