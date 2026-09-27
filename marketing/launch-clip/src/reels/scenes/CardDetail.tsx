import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HOLDS } from '../../../reel-timeline.mjs';
import { AppShot, Lift, Tap } from '../kit/AppShot';
import { camAt, camVelocity, type Key } from '../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, EASE_SPRING, prog } from '../kit/curves';
import { at, rectOf } from '../kit/takes';
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

const TAP = 20; // the card is tapped
const SCROLL: [number, number] = [90, 130]; // down to the Key Points

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
  const i =
    u < TAP
      ? at(T, 'landed')
      : u < SCROLL[0]
        ? at(T, 'detail', Math.min(35, u - TAP)) // captured at 60fps: one per output frame at K = 2
        : at(T, 'detailScroll', Math.round(prog(u, SCROLL[0], SCROLL[1], EASE_IN_OUT) * 10));

  const card = rectOf(T, at(T, 'landed'), 'firstCard');
  const kp = u >= SCROLL[0] ? rectOf(T, i, 'points') : null;
  const kpIn = prog(u, SCROLL[1] - 4, SCROLL[1] + 12, EASE_SPRING) * (1 - prog(u, INSERT.len - 22, INSERT.len - 4, EASE_MODAL));

  return (
    <AbsoluteFill>
      <AppShot take={T} i={i} cam={camAt(keys, u)} motion={camVelocity(keys, u, 1)}>
        <Tap x={card[0] + 120} y={card[1] + 40} t={prog(u, TAP - 8, TAP + 27, linear)} />
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
