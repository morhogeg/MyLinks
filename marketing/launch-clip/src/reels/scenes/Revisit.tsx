import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HITS } from '../../../reel-timeline.mjs';
import { AppShot, Tap } from '../kit/AppShot';
import { camAt, camVelocity, type Key } from '../kit/camera';
import { EASE_FLING, EASE_IN_OUT, EASE_MODAL } from '../kit/curves';
import { at, center, rectOf } from '../kit/takes';

/**
 * 15.5s – 17.1s. REVISIT: the Revisit tab, "Review 5 cards / From today's
 * Daily Brew", and the review deck dealing: Keep, Keep. Each fling is the
 * deck's own transition (its curve, its KEEP stamp) captured frame by frame;
 * the camera only follows through in the direction of the throw. The third
 * fling carries the reel out into the lockup.
 */

const T = 'revisit';
const S = HITS;

export const revisitKeys: Key[] = [
  // the Revisit screen, on its Daily Brew row
  { f: 464, cx: 196.5, cy: 160, z: 2.42, fx: 540, fy: 842, rx: -5 },
  { f: 468, rx: 0, z: 2.5, ease: EASE_MODAL },
  { f: 471, cy: 164, z: 2.56, ease: (t) => t },
  // CUT (on the tap's beat) to the deck as it deals in
  { f: 472, cx: 196.5, cy: 470, z: 1.96, fx: 540, fy: 1190, ease: (t) => t },
  { f: 480, z: 2.0, ease: (t) => t },
  { f: 484, cx: 204, ease: EASE_FLING },
  { f: 494, cx: 196.5, ease: EASE_MODAL },
  { f: 500, cx: 204, ease: EASE_FLING },
  { f: 506, cx: 196.5, ease: EASE_MODAL },
  // the last card is thrown and the camera goes with it, out of the app
  { f: 518, cx: 196.5, fx: -760, z: 2.1, ease: EASE_IN_OUT },
];

export const Revisit: React.FC<{ f: number }> = ({ f }) => {
  if (f < 464 || f > 519) return null;
  const i =
    f < 470
      ? at(T, 'open', Math.min(9, 5 + (f - 464)))
      : f < 472
        ? at(T, 'open', 9)
        : f < S.flings[0]
          ? at(T, 'deck', Math.min(13, f - 472))
          : f < S.flings[1]
            ? at(T, 'fling0', f - S.flings[0])
            : f < 506
              ? at(T, 'fling1', f - S.flings[1])
              : at(T, 'fling2', f - 506);
  const cam = camAt(revisitKeys, f);
  const v = camVelocity(revisitKeys, f);
  const row = center(rectOf(T, at(T, 'open', 6), 'review'));
  return (
    <AbsoluteFill>
      <AppShot take={T} i={i} cam={cam} motion={v}>
        {/* the tap that opens the deck; the cut to the deck lands on it */}
        {f < S.reviewTap && <Tap x={row.x} y={row.y} t={Math.min(1, Math.max(0, (f - (S.reviewTap - 7)) / 14))} />}
      </AppShot>
    </AbsoluteFill>
  );
};
