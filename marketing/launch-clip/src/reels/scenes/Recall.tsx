import React from 'react';
import { AbsoluteFill } from 'remotion';
import { AppShot, Lift, Tap } from '../kit/AppShot';
import { camAt, camVelocity, type Key } from '../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../kit/curves';
import { at, rectOf } from '../kit/takes';

/**
 * RECALL: how what you save comes back. The Revisit tab opens on "This week
 * in Machina", the app's weekly recap of what you saved; it is tapped open
 * and READ, slowly (owner, round 7: "way too fast, show the viewers what it
 * does"): the write-up, the two themes it found (each linking back to its
 * saves), the standout it says to reread, and the question it leaves you
 * with. Then it is thrown out of frame into the lockup.
 *
 * OUTPUT frames: `u` runs from the `recall` hold's first frame through the
 * source frames after it, up to the lockup (reel-timeline.mjs). Take
 * "recall": `open` (30fps), `expand` (60fps), `scroll` (6pt steps).
 */

const T = 'recall';
const linear = (t: number) => t;

export const RECALL_LEN = 288; // output frames, to the lockup
const TAP = 16;
const OPENED = TAP + 32; // the expand transition, one 60fps frame per output frame
/** read, move, read: [from u, to u, from step, to step] */
const READS: [number, number, number, number][] = [
  [96, 136, 0, 34], // the write-up → both themes
  [176, 208, 34, 64], // → the standout
  [240, 264, 64, 91], // → the question it leaves you with
];
const STANDOUT = 208;
const OUT = RECALL_LEN;

const keys: Key[] = [
  // the Revisit tab, on its "This week" recap (a breath of tilt that settles)
  { f: 0, cx: 196.5, cy: 190, z: 2.5, fx: 540, fy: 1020, rx: -4 },
  { f: 8, rx: 0, ease: EASE_MODAL },
  { f: TAP, cy: 192, z: 2.55, ease: linear },
  // opened: the recap from its masthead down, under the caption band
  { f: TAP + 26, cx: 196.5, cy: 330, z: 2.3, fx: 540, fy: 1312, ease: EASE_MODAL },
  { f: READS[1][0], cy: 336, ease: linear },
  // the camera reads down with the scroll: the standout, then the question
  { f: READS[1][1], cy: 520, z: 2.3, fy: 1312, ease: EASE_IN_OUT },
  { f: READS[2][0], cy: 526, ease: linear },
  { f: READS[2][1], cy: 600, z: 2.3, fy: 1320, ease: EASE_IN_OUT },
  { f: OUT - 16, cy: 606, z: 2.34, ease: linear },
  // thrown out of frame, into the lockup
  { f: OUT + 14, fx: -760, z: 2.4, ease: EASE_IN_OUT },
];

const stepAt = (u: number) => {
  let step = 0;
  for (const [a, b, s0, s1] of READS) if (u >= a) step = Math.round(mix(s0, s1, prog(u, a, b, EASE_IN_OUT)));
  return step;
};

export const Recall: React.FC<{ u: number }> = ({ u }) => {
  if (u < 0 || u > OUT + 15) return null;
  const step = stepAt(u);
  const i =
    u < TAP
      ? at(T, 'open', Math.min(9, 6 + u)) // from 6: the header's own crossfade (MACHINA → Revisit) has settled
      : step === 0
        ? at(T, 'expand', Math.min(31, u - TAP))
        : at(T, 'scroll', step - 1);

  const banner = rectOf(T, at(T, 'open', 9), 'recap');
  const standout = u >= STANDOUT - 2 ? rectOf(T, i, 'standout') : null;
  const up = prog(u, STANDOUT - 1, STANDOUT + 6, EASE_SPRING) * (1 - prog(u, STANDOUT + 44, STANDOUT + 58, EASE_MODAL));

  return (
    <AbsoluteFill>
      <AppShot take={T} i={i} cam={camAt(keys, u)} motion={camVelocity(keys, u, 1)}>
        <Tap x={banner[0] + banner[2] * 0.4} y={banner[1] + banner[3] / 2} t={prog(u, TAP - 5, TAP + 13, linear)} />
        {standout && up > 0.01 && (
          <Lift take={T} i={i} rect={standout} radius={16} lift={up * 0.8} rise={4} grow={0.03} ring={0.6 * up} />
        )}
      </AppShot>
    </AbsoluteFill>
  );
};
