import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HITS } from '../../../reel-timeline.mjs';
import { AppShot, Lift, Tap } from '../kit/AppShot';
import { camAt, camVelocity, type Key } from '../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, EASE_SPRING, prog } from '../kit/curves';
import { at, rectOf } from '../kit/takes';

/**
 * RECALL, in the slot the review deck had (owner, round 2: the deck is "not
 * interesting enough"; recall is the weekly recap). The Revisit tab opens on
 * "This week in Machina", the app's weekly recap of what you saved; it is
 * tapped open and read down to the standout it says to reread, then thrown
 * out of frame into the lockup, exactly where the deck used to go.
 *
 * SOURCE frames (the round-1 clock; the reel plays it K times slower).
 * Every pixel is the app (take "recall": `open`, `expand`, `scroll` in 6pt
 * steps).
 */

const T = 'recall';
const S = HITS;
const linear = (t: number) => t;

/** the recap's scroll: from the write-up down to the standout */
const SCROLL: [number, number] = [S.recapTap + 18, S.standout];
const STEPS = 64;

export const recallKeys: Key[] = [
  // the Revisit tab, on its "This week" recap (a breath of tilt that settles)
  { f: S.revisitTap, cx: 196.5, cy: 190, z: 2.5, fx: 540, fy: 1020, rx: -5 },
  { f: S.revisitTap + 4, rx: 0, ease: EASE_MODAL },
  { f: S.recapTap, cy: 192, z: 2.55, ease: linear },
  // opened: the recap from its masthead down, under the caption band
  { f: S.recapTap + 10, cx: 196.5, cy: 330, z: 2.3, fx: 540, fy: 1312, ease: EASE_MODAL },
  { f: SCROLL[0], cy: 332, ease: linear },
  // the camera reads down with the scroll to the standout
  { f: SCROLL[1], cy: 520, z: 2.3, fy: 1312, ease: EASE_IN_OUT },
  // the recap is thrown out of frame, into the lockup (where the deck went)
  { f: 518, cx: 196.5, fx: -760, z: 2.4, ease: EASE_IN_OUT },
];

export const Recall: React.FC<{ f: number }> = ({ f }) => {
  if (f < S.revisitTap || f > 519) return null;
  const step = Math.round(prog(f, SCROLL[0], SCROLL[1], EASE_IN_OUT) * STEPS);
  const i =
    f < S.recapTap
      ? at(T, 'open', Math.min(9, 3 + (f - S.revisitTap)))
      : step === 0
        ? at(T, 'expand', Math.min(15, f - S.recapTap))
        : at(T, 'scroll', step - 1);

  const cam = camAt(recallKeys, f);
  const v = camVelocity(recallKeys, f);
  const banner = rectOf(T, at(T, 'open', 9), 'recap');
  const standout = f >= S.standout - 2 ? rectOf(T, i, 'standout') : null;
  const up = prog(f, S.standout - 1, S.standout + 4, EASE_SPRING);

  return (
    <AbsoluteFill>
      <AppShot take={T} i={i} cam={cam} motion={v}>
        {f < S.recapTap + 4 && (
          <Tap
            x={banner[0] + banner[2] * 0.4}
            y={banner[1] + banner[3] / 2}
            t={Math.min(1, Math.max(0, (f - (S.recapTap - 7)) / 14))}
          />
        )}
        {standout && up > 0.01 && (
          <Lift take={T} i={i} rect={standout} radius={16} lift={up * 0.8} rise={4} grow={0.03} ring={0.6 * up} />
        )}
      </AppShot>
    </AbsoluteFill>
  );
};
