import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HITS } from '../../../reel-timeline.mjs';
import { AppShot, Lift, Tap } from '../kit/AppShot';
import { camAt, camVelocity, type Key } from '../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../kit/curves';
import { at, center, rectOf } from '../kit/takes';

/**
 * 30.9s – 39.5s. RECALL: how what you save comes back. The Revisit tab
 * opens on "This week in Machina", the app's weekly recap (a write-up of the
 * week's saves, generated on the user's recap day), and the reel READS it:
 * the write-up, the two themes it found (each linking back to its saves),
 * the standout it says to reread, and the question it leaves you with.
 *
 * Replaces the pilot's review-deck beat (owner, round 2: "not interesting
 * enough"; the recall story is the weekly recap). Every pixel is the app
 * (take "recall"); the scroll is the capture's, stepped, and the reel pauses
 * it where there is something to read.
 */

const T = 'recall';
const S = HITS;
const linear = (t: number) => t;

/** the recap's scroll, in the capture's 6pt steps: read, move, read… */
const READS: [from: number, to: number, stepFrom: number, stepTo: number][] = [
  [1000, 1036, 0, 34], // the write-up → both themes
  [1060, 1086, 34, 64], // → the standout
  [1122, 1146, 64, 91], // → the question it leaves you with
];

const scrollStep = (f: number) => {
  let step = 0;
  for (const [a, b, s0, s1] of READS) if (f >= a) step = Math.round(mix(s0, s1, prog(f, a, b, EASE_IN_OUT)));
  return step;
};

/** the throw out into the lockup */
const OUT = S.lockup - 18;

export const recallKeys: Key[] = [
  // the Revisit tab, on its "This week" recap (a breath of tilt that settles)
  { f: S.revisitTap, cx: 196.5, cy: 190, z: 2.5, fx: 540, fy: 1020, rx: -4 },
  { f: S.revisitTap + 8, rx: 0, ease: EASE_MODAL },
  { f: S.recapTap, cy: 192, z: 2.55, ease: linear },
  // opened: the recap from its masthead down, just under the caption band
  { f: S.recapTap + 20, cx: 196.5, cy: 330, z: 2.3, fx: 540, fy: 1312, ease: EASE_MODAL },
  { f: READS[1][0], cy: 334, ease: linear },
  // the camera reads down with the scroll: the standout, then the question
  { f: READS[1][1], cy: 520, z: 2.3, fy: 1312, ease: EASE_IN_OUT },
  { f: READS[2][0], cy: 524, ease: linear },
  { f: READS[2][1], cy: 600, z: 2.3, fy: 1320, ease: EASE_IN_OUT },
  { f: OUT, cy: 604, z: 2.34, ease: linear },
  // thrown out of frame, into the lockup
  { f: S.lockup + 6, fx: -760, z: 2.4, ease: EASE_IN_OUT },
];

export const Recall: React.FC<{ f: number }> = ({ f }) => {
  if (f < S.revisitTap || f > S.lockup + 7) return null;

  const step = scrollStep(f);
  const i =
    f < S.recapTap
      ? at(T, 'open', Math.min(9, 2 + (f - S.revisitTap)))
      : f < S.recapTap + 16 || step === 0
        ? at(T, 'expand', Math.min(15, f - S.recapTap))
        : at(T, 'scroll', step - 1);

  const cam = camAt(recallKeys, f);
  const v = camVelocity(recallKeys, f);
  const banner = rectOf(T, at(T, 'open', 9), 'recap');
  const tapAt = { x: banner[0] + banner[2] * 0.4, y: banner[1] + banner[3] / 2 };

  // the standout: the one save the recap says to reread, lifted as it arrives
  const standout = f >= S.standout - 4 ? rectOf(T, i, 'standout') : null;
  const up = prog(f, S.standout - 2, S.standout + 6, EASE_SPRING) * (1 - prog(f, S.standout + 30, S.standout + 44, EASE_MODAL));

  return (
    <AbsoluteFill>
      <AppShot take={T} i={i} cam={cam} motion={v}>
        <Tap x={tapAt.x} y={tapAt.y} t={prog(f, S.recapTap - 5, S.recapTap + 9, linear)} />
        {standout && up > 0.01 && (
          <Lift take={T} i={i} rect={standout} radius={16} lift={up * 0.8} rise={4} grow={0.03} ring={0.6 * up} />
        )}
      </AppShot>
    </AbsoluteFill>
  );
};
