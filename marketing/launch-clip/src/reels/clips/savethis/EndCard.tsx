import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CAPTIONS, FPS, HITS, MARK_DRAW } from '../../../../clips/savethis-timeline.mjs';
import { sans } from '../../../fonts';
import { AnimatedMark, OpeningMark, Wordmark } from '../../../ui/Brand';
import { EASE_IN_OUT, EASE_MODAL, mix, prog } from '../../kit/curves';
import { Paper } from '../../kit/Paper';
import { INK } from '../../kit/Type';
import { GRADE } from './grade';
import { POSTER, PosterArt } from './Poster';
import VO from './savethis-vo.json';

/**
 * The sign-off, and the way back to frame 0 (owner, round 12: under the
 * tagline, the Machina logo animated, not the Ask chat).
 *
 *  card    the chat dissolves into the paper as the app's own launch mark
 *          draws in (AnimatedMark: the arms drawn out from their corners, the
 *          brackets closing, the point striking), the wordmark wipes in on
 *          the spoken name, then "Everything you save, / finally useful."
 *          word by word on the narrator's timing; the whole lockup holds
 *  opens   the type and the point go, the mark settles onto the hook's line
 *          and its brackets part across it, the poster between their arms,
 *          until they leave the frame: the mark opens into the reel the way
 *          it opened into the app at the start, and the frame IS frame 0
 *
 * The poster is the hook's own (Paper on the set's periodic drift, PosterArt
 * as frame 0 draws it), so the reel runs on into its hook without a seam.
 */
const TAG = CAPTIONS.find((c) => c.at === HITS.tagline)!;
const TAG_T = VO.find((v) => v.frame === TAG.at);

/** the lockup, centred a little above the frame's middle: the mark (the
 *  travel box's width; the closed mark is 3/4 of it), the name, the line */
const MARK_W = 300;
const MARK_H = (MARK_W * 416) / 576;
const K = MARK_W / 576; // px per mark unit
const LOCK = { markY: 758, nameTop: 923, nameW: 440, lineTop: 1019 };
/** the brackets' parting, in mark units each side: across the hook's widest
 *  line (its arms just outside it), then off the frame */
const CITE = 790;
const GONE = 1010;
const EASE_IN = (t: number) => t * t * t;

export const EndCard: React.FC<{ f: number; paperDrift: number; show: boolean }> = ({ f, paperDrift, show }) => {
  if (f < MARK_DRAW.from) return null;
  const starts = TAG_T?.words.map((s) => TAG.at + Math.round(s * FPS)) ?? [];
  const name = starts[0] ?? TAG.at;

  // ── the card
  const u = prog(f, MARK_DRAW.from, MARK_DRAW.from + MARK_DRAW.frames, (t) => t);
  const wipe = prog(f, name - 3, name + 12, EASE_MODAL);

  // ── the mark opens
  const O = HITS.opens;
  const typeOut = prog(f, O, O + 8, EASE_IN_OUT);
  const dot = 1 - prog(f, O, O + 6, EASE_IN_OUT);
  const markY = mix(LOCK.markY, POSTER.textY, prog(f, O + 2, O + 20, EASE_IN_OUT));
  const partA = prog(f, O + 10, O + 32, EASE_IN_OUT);
  const partB = prog(f, O + 32, HITS.poster, EASE_IN);
  const spread = CITE * partA + (GONE - CITE) * partB;
  // the poster shows between the brackets' arms (they start closed: the
  // opening grows from nothing), and the whole frame once they are gone
  const half = (116 * partA + spread) * K;

  const rows = TAG.text.split('\n').slice(1);
  let k = 0;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* the hook, between the parting brackets */}
      {f >= O + 10 && (
        <AbsoluteFill style={{ clipPath: half >= 540 ? undefined : `inset(0 ${540 - half}px 0 ${540 - half}px)` }}>
          <Paper drift={paperDrift} tone={GRADE.tone} cool={GRADE.cool} />
          <PosterArt />
        </AbsoluteFill>
      )}

      {/* the name and the line, until the mark opens */}
      {typeOut < 1 && (
        <AbsoluteFill style={{ opacity: 1 - typeOut, transform: `translateY(${Math.round(-typeOut * 12)}px)` }}>
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
            <div style={{ position: 'absolute', left: 0, right: 0, top: LOCK.lineTop, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
              {rows.map((row, r) => (
                <div key={r} style={{ display: 'flex', columnGap: '0.25em', fontFamily: sans, fontSize: 60, fontWeight: 600, letterSpacing: '-0.028em', lineHeight: 1.1, color: INK, whiteSpace: 'nowrap' }}>
                  {row.split(' ').map((w) => {
                    k++;
                    const s0 = (starts[k] ?? TAG.at) - 3;
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
              ))}
            </div>
          )}
        </AbsoluteFill>
      )}

      {/* the mark: drawn in, held, then opened */}
      {f < HITS.poster && (
        <div
          style={{
            position: 'absolute',
            left: 540 - MARK_W / 2,
            top: markY - MARK_H / 2,
            width: MARK_W,
            height: MARK_H,
            color: INK,
            // the launch starts from its corner ticks: they ease in on the
            // clear paper, not pop
            opacity: prog(f, MARK_DRAW.from, MARK_DRAW.from + 4, EASE_IN_OUT),
            filter: 'drop-shadow(0 10px 30px rgba(24,32,48,0.16))',
          }}
        >
          {u < 1 ? (
            <AnimatedMark u={u} id="endmark" style={{ width: '100%', height: '100%' }} />
          ) : (
            <OpeningMark spread={spread} dot={dot} style={{ width: '100%', height: '100%' }} />
          )}
        </div>
      )}
    </AbsoluteFill>
  );
};
