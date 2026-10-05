import React from 'react';
import { AbsoluteFill } from 'remotion';
import { RECALL_LEN, TODO_LEN } from '../../../reel-timeline.mjs';
import { AppShot, Lift, Tap } from '../kit/AppShot';
import { camAt, camVelocity, type Key } from '../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../kit/curves';
import { at, rectOf } from '../kit/takes';

/**
 * RECALL: how what you save comes back. The Revisit tab opens on its two
 * lead sections, both the app's own:
 *
 *  1. "Do this" (round 12, owner: say that the app makes an action item
 *     where one is relevant): the saves that call for an action each carry
 *     one concrete step, and Revisit lists the open ones as a to-do list. The
 *     Tail End's (the card opened in the Save beat) is lifted.
 *  2. "This week in Machina", the weekly recap: tapped open and READ, slowly
 *     (owner, round 7): the write-up, the two themes it found, the standout
 *     it says to reread, and the question it leaves you with.
 *
 * Then it is thrown out of frame into the lockup.
 *
 * OUTPUT frames: `u` runs from the `recall` hold's first frame through the
 * source frames after it, up to the lockup (RECALL_LEN, reel-timeline.mjs).
 * Take "recall": `open` (30fps), `expand` (60fps), `scroll` (6pt steps).
 */

const T = 'recall';
const linear = (t: number) => t;

const TODO_LIFT: [number, number] = [40, 100];
const TAP = TODO_LEN + 16; // the recap is tapped open
/** read, move, read: [from u, to u, from step, to step]. The recap sits 294pt
 *  (49 steps) lower than before the "Do this" list existed; the first read
 *  scrolls those away as the camera rises, so every later step shows the
 *  recap exactly where the round-7 choreography framed it. */
const READS: [number, number, number, number][] = [
  [TODO_LEN + 96, TODO_LEN + 136, 0, 83], // the write-up → both themes
  [TODO_LEN + 176, TODO_LEN + 208, 83, 113], // → the standout
  [TODO_LEN + 240, TODO_LEN + 264, 113, 140], // → the question it leaves you with
];
const STANDOUT = TODO_LEN + 208;
const OUT = RECALL_LEN;
const SHIFT = 294; // points the "Do this" list pushes the recap down

const keys: Key[] = [
  // the Revisit tab, on its "Do this" list (a breath of tilt that settles)
  { f: 0, cx: 196.5, cy: 268, z: 2.6, fx: 540, fy: 1190, rx: -4 },
  { f: 8, rx: 0, ease: EASE_MODAL },
  // (holds until its line has left, TODO_LEN - 4)
  { f: TODO_LEN - 4, cy: 272, z: 2.64, ease: linear },
  // down to "This week in Machina"
  { f: TODO_LEN + 12, cy: 479, z: 2.5, fy: 1020, ease: EASE_IN_OUT },
  { f: TAP, cy: 481, z: 2.55, ease: linear },
  // opened: the recap from its masthead down, under the caption band
  { f: TAP + 26, cy: 330 + SHIFT, z: 2.3, fy: 1312, ease: EASE_MODAL },
  { f: READS[0][0], cy: 332 + SHIFT, ease: linear },
  // the first read rises with the scroll (same curve), landing where the
  // round-7 camera sat
  { f: READS[0][1], cy: 334, ease: EASE_IN_OUT },
  { f: READS[1][0], cy: 336, ease: linear },
  // the camera reads down with the scroll: the standout, then the question
  { f: READS[1][1], cy: 520, z: 2.3, fy: 1312, ease: EASE_IN_OUT },
  { f: READS[2][0], cy: 526, ease: linear },
  { f: READS[2][1], cy: 600, z: 2.3, fy: 1320, ease: EASE_IN_OUT },
  { f: OUT - 16, cy: 606, z: 2.34, ease: linear },
  // thrown out of frame, into the lockup
  { f: OUT + 14, fx: -760, z: 2.4, ease: EASE_IN_OUT },
];

/** the scroll position the choreography wants (fractional steps) */
const stepAt = (u: number) => {
  let step = 0;
  for (const [a, b, s0, s1] of READS) if (u >= a) step = mix(s0, s1, prog(u, a, b, EASE_IN_OUT));
  return step;
};

export const Recall: React.FC<{ u: number }> = ({ u }) => {
  if (u < 0 || u > OUT + 15) return null;
  const exact = stepAt(u);
  const step = Math.round(exact);
  const i =
    u < TAP
      ? at(T, 'open', Math.min(9, 6 + u)) // from 6: the header's own crossfade has settled
      : step === 0
        ? at(T, 'expand', Math.min(31, u - TAP))
        : at(T, 'scroll', step - 1);

  // the capture scrolls in 6pt steps; the camera takes up each step's
  // rounding, so the read-down moves evenly instead of in 14px hops
  const cam = camAt(keys, u);
  const view = { ...cam, cy: cam.cy - (step - exact) * 6 };
  // motion blur from what actually moves on screen: the camera AND the
  // scroll (during a read they partly cancel; the camera alone would smear
  // text that is barely moving)
  const camV = camVelocity(keys, u, 1);
  const motion = { x: camV.x, y: camV.y - 6 * cam.z * (exact - stepAt(u - 1)) };

  const banner = rectOf(T, at(T, 'open', 9), 'recap');
  const todo = u < TAP ? rectOf(T, at(T, 'open', 9), 'todoFirst') : null;
  const lift =
    prog(u, TODO_LIFT[0], TODO_LIFT[0] + 8, EASE_SPRING) * (1 - prog(u, TODO_LIFT[1], TODO_LIFT[1] + 12, EASE_MODAL));
  const standout = u >= STANDOUT - 2 ? rectOf(T, i, 'standout') : null;
  const up = prog(u, STANDOUT - 1, STANDOUT + 6, EASE_SPRING) * (1 - prog(u, STANDOUT + 44, STANDOUT + 58, EASE_MODAL));

  return (
    <AbsoluteFill>
      <AppShot take={T} i={i} cam={view} motion={motion}>
        {todo && lift > 0.01 && (
          <Lift take={T} i={i} rect={todo} radius={14} lift={lift * 0.7} rise={3} grow={0.02} ring={0.55 * lift} />
        )}
        <Tap x={banner[0] + banner[2] * 0.4} y={banner[1] + banner[3] / 2} t={prog(u, TAP - 5, TAP + 13, linear)} />
        {standout && up > 0.01 && (
          <Lift take={T} i={i} rect={standout} radius={16} lift={up * 0.8} rise={4} grow={0.03} ring={0.6 * up} />
        )}
      </AppShot>
    </AbsoluteFill>
  );
};
