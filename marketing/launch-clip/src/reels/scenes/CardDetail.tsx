import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HOLDS } from '../../../reel-timeline.mjs';
import { AppShot, Lift, Tap } from '../kit/AppShot';
import { camAt, camVelocity, type Key } from '../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../kit/curves';
import { at, rectOf, takeOf } from '../kit/takes';
import { findKeys } from './Find';

const INSERT = HOLDS.find((h) => h.id === 'card')!;

/**
 * The insert (round 3, owner: "clarify that each save gets turned into a card
 * with the key info"). Right after the new card lands, it is tapped open: the
 * real detail view, its summary, its Key Points and its "Do this" line. The
 * reel's clock holds while this plays (reel-timeline.mjs INSERT), then cuts
 * back to the feed, where Find picks up exactly as before.
 *
 * `u` is OUTPUT frames into the insert (0 … INSERT.len). Take "save": the
 * `landed` feed, then `detail` (the app's open transition) and
 * `detailScroll` (down to the Key Points).
 */

const T = 'save';
const linear = (t: number) => t;

const TAP = 20; // the card is tapped (the app opens it on this frame)
const SCROLL: [number, number] = [90, 130]; // down to the Key Points

/** The capture scrolls the detail view in ~5pt steps (`detailScroll`); step 0
 *  is the unscrolled view the open transition ends on. Where the Key Points
 *  sit on each step, in screen points: the camera takes up the difference
 *  between the step on screen and the position the scroll curve wants, so
 *  the read-down glides instead of hopping 12px every few frames (round 13;
 *  Recall's recap does the same). */
const STEPS = takeOf(T).count - at(T, 'detailScroll');
const stepFrame = (k: number) => (k <= 0 ? at(T, 'detail', 35) : at(T, 'detailScroll', k - 1));
const stepY = (k: number) => rectOf(T, stepFrame(k), 'points')[1];
const scrollAt = (u: number) => prog(u, SCROLL[0], SCROLL[1], EASE_IN_OUT) * STEPS;
/** where the scroll curve wants the Key Points (fractional steps interpolate) */
const wantY = (u: number) => {
  const e = scrollAt(u);
  const k = Math.min(STEPS - 1, Math.floor(e));
  return mix(stepY(k), stepY(k + 1), e - k);
};

const keys: Key[] = [
  { f: 0, ...camAt(findKeys, INSERT.at) },
  { f: TAP, cy: 306, z: 2.36, ease: linear },
  // the detail view: title, the gist and the Key Points in one frame
  { f: TAP + 40, cx: 196.5, cy: 255, z: 2.4, fx: 540, fy: 1180, ease: EASE_MODAL },
  { f: SCROLL[0], cy: 258, z: 2.42, ease: linear },
  // down onto the Key Points and the one thing the card asks you to do
  { f: SCROLL[1], cy: 384, z: 2.4, fy: 1150, ease: EASE_IN_OUT },
  { f: INSERT.len, cy: 390, z: 2.46, ease: linear },
];

export const CardDetail: React.FC<{ u: number }> = ({ u }) => {
  const step = Math.round(scrollAt(u));
  const i =
    u < TAP
      ? at(T, 'landed')
      : u < SCROLL[0]
        ? at(T, 'detail', Math.min(35, u - TAP)) // captured at 60fps: one per output frame at K = 2
        : stepFrame(step);
  const cam = camAt(keys, u);
  const scrolling = u >= SCROLL[0];
  // the step on screen vs the scroll the curve wants (points)
  const view = scrolling ? { ...cam, cy: cam.cy + (stepY(step) - wantY(u)) } : cam;
  // motion blur from what moves on screen: the camera and the scroll together
  const camV = camVelocity(keys, u, 1);
  const motion = scrolling ? { x: camV.x, y: camV.y + (wantY(u) - wantY(u - 1)) * cam.z } : camV;

  const card = rectOf(T, at(T, 'landed'), 'firstCard');
  const kp = u >= SCROLL[0] ? rectOf(T, i, 'points') : null;
  const kpIn = prog(u, SCROLL[1] - 4, SCROLL[1] + 12, EASE_SPRING) * (1 - prog(u, INSERT.len - 22, INSERT.len - 4, EASE_MODAL));

  return (
    <AbsoluteFill>
      <AppShot take={T} i={i} cam={view} motion={motion}>
        {/* the pad lands (t 0.35) on TAP, the frame the app opens the card
            and the tick sounds (it used to land 4 frames after both) */}
        <Tap x={card[0] + 120} y={card[1] + 40} t={prog(u, TAP - 12, TAP + 23, linear)} />
        {kp && kpIn > 0.01 && (
          <Lift
            take={T}
            i={i}
            rect={[kp[0] - 6, kp[1] - 6, kp[2] + 12, kp[3] + 12]}
            radius={12}
            lift={kpIn * 0.35}
            rise={2}
            grow={0.01}
            ring={0.55 * kpIn}
          />
        )}
      </AppShot>
    </AbsoluteFill>
  );
};
