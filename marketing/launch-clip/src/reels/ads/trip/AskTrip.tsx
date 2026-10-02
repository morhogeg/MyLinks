import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HITS, K, TAKE, TYPE_STEP } from '../../../../ads/trip-timeline.mjs';
import { AppShot, Lift, Tap } from '../../kit/AppShot';
import { camAt, camVelocity, type Key } from '../../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../../kit/curves';
import { at, center, rectOf, takeOf, type Rect } from '../../kit/takes';
import { MATCH_Z } from './Piles';
import { useAdFrame, type AdFrame } from './format';

/**
 * The app, from ONE take of the real app (`adtrip`):
 *
 *  open     a match cut on the mark: the cut lands framed on the Ask screen's
 *           own mark at the size and place the brand mark shrank to, and
 *           pulls back onto its promise ("Answers come only from your 29
 *           saves, with sources you can open.").
 *  typing   down to the composer as "What should we do in Sardinia?" types.
 *  answer   Send; the cut to the answer lands on the touch. It streams in.
 *           The app's thinking line is not in the take at all.
 *  sources  the three sources (Instagram, YouTube, a screenshot) lift on
 *           their beats; a move comes to rest as the finger lands on the
 *           first; its card opens in that still frame, then the camera finds
 *           its summary, the passage the answer drew on, which lifts. Thrown
 *           out into the lockup (End.tsx).
 *
 * Output frames throughout (ads/trip-timeline.mjs). Camera aims carry the
 * shape's offset (`dy`, format.ts), so the hero moment sits in the safe zone
 * of either shape.
 */

const T = TAKE;
const S = HITS;
const linear = (t: number) => t;
const take = takeOf(T);
const span = (from: string, to: string | null) => (to ? take.marks[to] : take.count) - take.marks[from];
const OPENED = span('open', 'typing');
const TYPED = span('typing', 'stream');
const STREAMED = span('stream', 'sources');
const SOURCED = span('sources', 'card');
const CARD = span('card', null);

/** the Ask screen, settled: its mark has struck and holds */
const SETTLED = 100;
/** the camera reaches the composer this long after the line starts */
const TO_COMPOSER = 16;

/** output frame → the take's frame (each tap lands on the frame the app
 *  answers it: the card's first changed frame is card + 1, measured) */
export const frameAt = (f: number) => {
  if (f < S.typeFrom) return at(T, 'open', Math.min(OPENED - 1, SETTLED + Math.max(0, f - S.open)));
  if (f < S.send) return at(T, 'typing', Math.min(TYPED - 1, Math.floor((f - S.typeFrom) / TYPE_STEP)));
  if (f < S.sources) return at(T, 'stream', Math.min(STREAMED - 1, Math.floor((f - S.send) / K)));
  if (f < S.citeTap) return at(T, 'sources', Math.min(SOURCED - 1, Math.floor((f - S.sources) / K)));
  return at(T, 'card', Math.min(CARD - 1, f - S.citeTap + 1));
};

const CHIPS = ['chip1', 'chip2', 'chip3'] as const;

/** a Lift's box on whole points (the Ask clip's lesson: a half-point box hops) */
const wholePoints = ([x, y, w, h]: Rect): Rect => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  return [x0, y0, Math.ceil(x + w) - x0, Math.ceil(y + h) - y0];
};

const markCenter = center(rectOf(T, at(T, 'open', SETTLED), 'mark'));

export const tripKeys = (L: AdFrame): Key[] => {
  const y = (v: number) => v + L.dy;
  return [
    // the match cut: the app's mark exactly where the brand mark shrank to
    { f: S.open, cx: markCenter.x, cy: markCenter.y, z: MATCH_Z, fx: 540, fy: L.markY },
    // …then back onto the promise (the cut already carries the speed)
    { f: S.open + 14, cx: 196.5, cy: 300, z: 2.3, fy: y(920), ease: EASE_MODAL },
    { f: S.typeFrom - 1, cy: 302, z: 2.32, ease: linear },
    // down to the composer as the question types
    { f: S.typeFrom + TO_COMPOSER, cx: 196.5, cy: 740, z: 2.4, fy: y(1000), ease: EASE_IN_OUT },
    { f: S.send - 1, cy: 742, z: 2.44, ease: linear },
    // CUT on the Send touch to the answer arriving
    { f: S.send, cx: 196.5, cy: 300, z: 2.3, fy: y(980) },
    { f: S.sources, cy: 304, z: 2.33, ease: linear },
    // down onto the three sources, arriving as the first lifts
    { f: S.chips[0], cx: 196.5, cy: 530, z: 2.4, fy: y(990), ease: EASE_IN_OUT },
    { f: S.chips[2] + 16, cy: 532, z: 2.42, ease: linear },
    // at rest on the first source as the finger lands: the card opens in a
    // still frame (a move over the app's transition smears it)
    { f: S.citeTap, cy: 420, z: 2.2, fy: y(980), ease: EASE_IN_OUT },
    { f: S.citeTap + 10, cy: 420, z: 2.2, ease: linear },
    // then onto the card's summary, the passage the answer drew on
    { f: S.summary + 8, cy: 300, z: 2.5, fy: y(1000), ease: EASE_IN_OUT },
    { f: S.lockup - 1, cy: 302, z: 2.55, ease: linear },
    // thrown out of frame, into the lockup
    { f: S.lockup + 14, fx: -760, z: 2.6, ease: EASE_IN_OUT },
  ];
};

const tapAt = (f: number, hit: number) => prog(f, hit - 10, hit + 18, linear);

export const AskTrip: React.FC<{ f: number }> = ({ f }) => {
  const L = useAdFrame();
  if (f < S.open || f > S.lockup + 15) return null;
  const i = frameAt(f);
  const keys = tripKeys(L);
  const cam = camAt(keys, f);
  const motion = camVelocity(keys, f, 1);

  const send = center(rectOf(T, at(T, 'typing', TYPED - 1), 'send'));
  const chip1 = center(rectOf(T, at(T, 'sources', 0), 'chip1'));
  const summary = f >= S.citeTap ? rectOf(T, i, 'summary') : null;

  // the sources settle flat just before the tap, so nothing is lifted off
  // the screen when the card opens over it
  const flat = 1 - prog(f, S.citeTap - 10, S.citeTap - 1, EASE_IN_OUT);
  const proof = prog(f, S.summary - 4, S.summary + 12, EASE_SPRING) * (1 - prog(f, S.lockup - 8, S.lockup + 4, EASE_IN_OUT));

  return (
    <AbsoluteFill>
      <AppShot take={T} i={i} cam={cam} motion={motion}>
        {/* Send: a light tap on the dark button; the cut lands on the touch */}
        <Tap x={send.x} y={send.y} tone="light" t={tapAt(f, S.send)} />
        {f >= S.sources &&
          f < S.citeTap &&
          CHIPS.map((key, k) => {
            const hit = S.chips[k];
            const up = prog(f, hit - 2, hit + 10, EASE_SPRING);
            const down = prog(f, hit + 14, hit + 36, EASE_MODAL);
            return (
              <Lift
                key={key}
                take={T}
                i={i}
                rect={wholePoints(rectOf(T, i, key))}
                radius={12}
                lift={up * mix(1, 0.28, down) * flat}
                rise={5}
                grow={0.05}
                ring={0.7 * up * (1 - down)}
              />
            );
          })}
        <Tap x={chip1.x} y={chip1.y} t={tapAt(f, S.citeTap)} />
        {summary && proof > 0.01 && (
          <Lift
            take={T}
            i={i}
            rect={wholePoints([summary[0] - 6, summary[1] - 6, summary[2] + 12, summary[3] + 12])}
            radius={12}
            lift={proof * 0.35}
            rise={2}
            grow={0.01}
            ring={0.55 * proof}
          />
        )}
      </AppShot>
    </AbsoluteFill>
  );
};
