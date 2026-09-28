import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CARD, K, THROW_LEN } from '../../../../clips/save-timeline.mjs';
import { HOLDS } from '../../../../reel-timeline.mjs';
import { AppShot, Lift, Tap } from '../../kit/AppShot';
import { camAt, camVelocity, type Key } from '../../kit/camera';
import { EASE_FLING, EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../../kit/curves';
import { at, rectOf, takeOf } from '../../kit/takes';
import { findKeys } from '../../scenes/Find';

/**
 * The payoff of "summarizes it": the new card, tapped open, read down from
 * its title and gist to its Key Points, then thrown out of frame into the
 * lockup. The reel's card insert (scenes/CardDetail.tsx) is the model: the
 * same take, the same framings and the same stepped-scroll handling; what is
 * the clip's own is the timing (tap on a beat, Key Points on the downbeat of
 * bar 10, no line over it) and the exit, the reel's throw (Recall → End).
 *
 * `u` is OUTPUT frames from the clip's CARD_AT (clips/save-timeline.mjs).
 * Take "save": the `landed` feed, then `detail` (the app's own open
 * transition, captured at 60fps: one frame per output frame) and
 * `detailScroll` (down to the Key Points, in 5pt steps).
 */

const T = 'save';
const linear = (t: number) => t;

/** the reel's source frame the clip leaves the reel on (its card hold) */
const FROM = HOLDS.find((h) => h.id === 'card')!.at;
const { tap: TAP, keyPoints: KP, throw: THROW } = CARD;
const SCROLL = CARD.scroll as [number, number];

/** The capture scrolls the detail view in ~5pt steps; step 0 is the
 *  unscrolled view the open transition ends on. The camera takes up the
 *  difference between the step on screen and where the scroll curve wants the
 *  Key Points, so the read-down glides (the reel's round-13 fix). */
const STEPS = takeOf(T).count - at(T, 'detailScroll');
const stepFrame = (k: number) => (k <= 0 ? at(T, 'detail', 35) : at(T, 'detailScroll', k - 1));
const stepY = (k: number) => rectOf(T, stepFrame(k), 'points')[1];
const scrollAt = (u: number) => prog(u, SCROLL[0], SCROLL[1], EASE_IN_OUT) * STEPS;
const wantY = (u: number) => {
  const e = scrollAt(u);
  const k = Math.min(STEPS - 1, Math.floor(e));
  return mix(stepY(k), stepY(k + 1), e - k);
};

/**
 * The hand-over. On the frame the clip leaves the reel, the reel's feed
 * camera is already moving (easing up toward the search field, where the reel
 * goes next). The reel's card insert drifts the other way from here, a
 * reversal measured at ~2px/frame down, then 2px/frame up; this camera carries
 * the reel's velocity on and coasts to rest by the tap, on EASE_FLING (the
 * thrown curve: its speed only decays; EASE_MODAL would surge to 4× its
 * average in its third frame first). The resting point is set so the first
 * frame moves exactly as far as the reel's last one did (zoom in log space,
 * as camAt does).
 */
const c0 = camAt(findKeys, FROM);
const cPrev = camAt(findKeys, FROM - 1 / K); // one output frame earlier
const carry = 1 / EASE_FLING(1 / TAP); // frames of that velocity the coast covers
const rest = {
  cy: c0.cy + (c0.cy - cPrev.cy) * carry,
  fy: c0.fy + (c0.fy - cPrev.fy) * carry,
  z: c0.z * Math.pow(c0.z / cPrev.z, carry),
};

const keys: Key[] = [
  // exactly where the reel's feed camera is on the frame the clip leaves it
  { f: 0, ...c0 },
  { f: TAP, ...rest, ease: EASE_FLING },
  // the detail view: title, the gist and the top of the Key Points
  { f: TAP + 40, cx: 196.5, cy: 255, z: 2.4, fx: 540, fy: 1180, ease: EASE_MODAL },
  { f: SCROLL[0], cy: 258, z: 2.42, ease: linear },
  // down onto the Key Points and the one thing the card asks you to do
  { f: SCROLL[1], cy: 384, z: 2.4, fy: 1150, ease: EASE_IN_OUT },
  { f: THROW, cy: 390, z: 2.45, ease: linear },
  // thrown out of frame, into the lockup (the reel's Recall → End)
  { f: THROW + THROW_LEN, fx: -760, z: 2.5, ease: EASE_IN_OUT },
];

export const Card: React.FC<{ u: number }> = ({ u }) => {
  // (gone once thrown: at fx −760 the whole slab and its shadow are off frame)
  if (u < 0 || u > THROW + THROW_LEN) return null;
  const step = Math.round(scrollAt(u));
  const i =
    u < TAP
      ? at(T, 'landed')
      : u < SCROLL[0]
        ? at(T, 'detail', Math.min(35, u - TAP))
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
  // the Key Points lift on the downbeat (the reel's gesture) and are gone
  // before the throw: a Lift is a sharp copy outside the screen's motion
  // blur, so thrown with it, it stayed crisp on a smeared page. They leave by
  // FADING at full lift, not by lowering: any lift above 0 draws the copy ~1pt
  // below its own pixels (the rise at 0.35 cancels it, measured +0.2px), so a
  // lift easing down sagged 2.5px and snapped back as the Lift was removed
  const kpIn = prog(u, KP, KP + 16, EASE_SPRING);
  const kpOut = prog(u, THROW - 16, THROW - 2, EASE_MODAL);

  return (
    <AbsoluteFill>
      <AppShot take={T} i={i} cam={view} motion={motion}>
        {/* the pad lands (t 0.35) on TAP: the frame the app opens the card
            and the tick sounds */}
        <Tap x={card[0] + 120} y={card[1] + 40} t={prog(u, TAP - 12, TAP + 23, linear)} />
        {kp && kpIn > 0.01 && kpOut < 1 && (
          <Lift
            take={T}
            i={i}
            rect={[kp[0] - 6, kp[1] - 6, kp[2] + 12, kp[3] + 12]}
            radius={12}
            lift={kpIn * 0.35}
            rise={2}
            grow={0.01}
            ring={0.55 * kpIn}
            opacity={1 - kpOut}
          />
        )}
      </AppShot>
    </AbsoluteFill>
  );
};
