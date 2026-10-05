import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HITS } from '../../../reel-timeline.mjs';
import { AppShot, Tap } from '../kit/AppShot';
import { camAt, camVelocity, type Key } from '../kit/camera';
import { EASE_MODAL } from '../kit/curves';
import { at, center, rectOf, takeOf } from '../kit/takes';

/**
 * 13.9s – 15.5s. CONNECT: the answer's Graph chip opens the real graph with
 * the three cited saves lit (the app's own Ask → Graph hand-off). The dive
 * into the chip cuts, on the downbeat the riser lands on, to INSIDE the
 * graph, close on the three while the app's own layout is still blooming;
 * the camera pulls back to the whole graph. Then the Revisit tab.
 */

const T = 'ask';
const S = HITS;

/** the frame of the take the app's graph opening starts on is `graph`; the
 *  reel joins it 12 frames in, as the three cited saves bloom */
const JOIN = 12;

export const connectKeys: Key[] = [
  // the cut lands inside the graph: the screen fills the frame, the three
  // cited saves (and their two edges) in view
  { f: S.graph, cx: 188, cy: 590, z: 3.0, fx: 540, fy: 1140 },
  // pull back to the whole graph, with a breath of tilt that settles out
  { f: S.graph + 12, cx: 197.5, cy: 600, z: 2.5, fx: 540, fy: 1150, ry: -2, rx: 1.5, ease: EASE_MODAL },
  { f: 444, ry: 0, rx: 0, ease: EASE_MODAL },
  { f: S.revisitTap, cx: 190, cy: 585, z: 2.95, ease: (t) => t },
];

export const Connect: React.FC<{ f: number }> = ({ f }) => {
  if (f < S.graph || f >= S.revisitTap) return null;
  const last = takeOf(T).count - 1;
  // the graph opening is captured at 60fps: two captured frames per source
  // frame, one per output frame at K = 2, so it plays without stepping
  const i = Math.min(last, at(T, 'graph') + Math.round((JOIN + (f - S.graph)) * 2));
  const cam = camAt(connectKeys, f);
  const v = camVelocity(connectKeys, f);
  const tab = center(rectOf(T, i, 'revisitTab'));
  return (
    <AbsoluteFill>
      <AppShot take={T} i={i} cam={cam} motion={v}>
        <Tap x={tab.x} y={tab.y} t={Math.min(1, Math.max(0, (f - (S.revisitTap - 5)) / 14))} />
      </AppShot>
    </AbsoluteFill>
  );
};
