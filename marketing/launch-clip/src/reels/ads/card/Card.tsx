import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HITS, SCROLLS } from '../../../../ads/card-timeline.mjs';
import { AppShot, Lift, Tap } from '../../kit/AppShot';
import { camAt, camVelocity, type Key } from '../../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../../kit/curves';
import { at, rectOf, takeOf, type Rect } from '../../kit/takes';
import { useAdFrame } from './format';
import { AD_OPEN_CAM } from './handoff';

/**
 * The card, in the real app (take "adcard", capture/shoot.mjs): the app
 * irises open around the + the mark's point became; the shared video lands
 * at the top of the feed and is tapped open (the app's own open); then it is
 * read down:
 *
 *  MOMENTS  its four Key moments, each lifted in turn, the timestamp first
 *           (the lift opens from the timestamp across the row): the peak
 *  POINTS   one scroll down to the Key Points, lifted
 *  LINKS    on down: the three Related cards, lifted together; then the
 *           section's own "See in graph" is tapped and the real graph opens
 *           with the video in focus, its three ties lit
 *
 * then a cut back to the card for the reminder (Remind.tsx). The detail view's scroll is captured in
 * 3pt steps; the camera takes up each step's rounding (the reel's round-13
 * fix), so the read-down never hops. OUTPUT frames; rolls were captured at
 * 60fps and play one frame per output frame.
 */

const T = 'adcard';
const linear = (t: number) => t;

/** the landing roll is 36 frames; the tap comes before it ends */
const LAND_N = 36;
const OPEN_N = 48;

// ── the read-down: step 0 is the opened view, settled
const STEPS = takeOf(T).marks.graph - at(T, 'scroll');
const stepFrame = (k: number) => (k <= 0 ? at(T, 'open', OPEN_N - 1) : at(T, 'scroll', k - 1));
const refY = (k: number) => rectOf(T, stepFrame(k), 'keyPoints')[1];
/** the step that puts `key`'s top nearest `y` (points) */
const stepFor = (key: string, y: number) => {
  let best = 0;
  for (let k = 0; k <= STEPS; k++) if (Math.abs(rectOf(T, stepFrame(k), key)[1] - y) < Math.abs(rectOf(T, stepFrame(best), key)[1] - y)) best = k;
  return best;
};
const TARGET: Record<string, number> = {
  keyPoints: stepFor('keyPoints', 235), // the Key Points heading, the list under it
  related: STEPS, // the end: Related cards, all three
};
const scrollAt = (f: number) => {
  let s = 0;
  for (const [a, b, to] of SCROLLS as [number, number, string][]) if (f >= a) s = mix(s, TARGET[to], prog(f, a, b, EASE_IN_OUT));
  return s;
};
const wantY = (s: number) => {
  const k = Math.min(STEPS - 1, Math.floor(s));
  return mix(refY(k), refY(k + 1), s - k);
};
const S0 = (SCROLLS[0] as [number, number, string])[0];

/** the graph's opening roll (150 frames at 60fps). Its first frames are the
 *  app before the graph mounts, then the view's own fade-in from white (to
 *  roll frame 5): the cut lands on frame 5, opaque, the ties still settling */
const GRAPH_N = 150;
const GRAPH_FROM = 5;

const frameAt = (f: number) => {
  if (f >= HITS.graphTap) return at(T, 'graph', Math.min(GRAPH_N - 1, GRAPH_FROM + f - HITS.graphTap));
  if (f < HITS.cardTap) return at(T, 'land', Math.min(LAND_N - 1, f - HITS.toApp));
  if (f < HITS.cardTap + OPEN_N) return at(T, 'open', f - HITS.cardTap);
  if (f < S0) return stepFrame(0);
  return stepFrame(Math.round(scrollAt(f)));
};

// ── the camera (9:16 frame pixels; `dy` moves it for the other shapes).
// The hero sits around 930px: under the caption band, above Meta's bottom 670px.
const HERO = 930;
const keysFor = (dy: number): Key[] =>
  [
    // the + button, exactly where the mark's point lands (the match cut)
    { f: HITS.toApp, ...AD_OPEN_CAM, rx: 9 },
    { f: HITS.toApp + 14, z: 1.56, rx: 0, ease: EASE_MODAL },
    // onto the video landing at the top of the feed
    { f: HITS.toApp + 30, cx: 196.5, cy: 328, z: 2.0, fy: HERO, ease: EASE_IN_OUT },
    { f: HITS.cardTap, z: 2.03, ease: linear },
    // opened: the Key moments' heading and the first moments
    { f: HITS.cardTap + 24, cy: 262, z: 2.35, ease: EASE_MODAL },
    { f: HITS.moments[0], cy: 264, z: 2.36, ease: linear },
    // down the moments as each lifts
    { f: HITS.moments[3] + 8, cy: 350, z: 2.36, ease: EASE_IN_OUT },
    { f: S0, cy: 352, z: 2.37, ease: linear },
    // one scroll down: the Key Points
    { f: SCROLLS[0][1] as number, cy: 382, z: 2.05, ease: EASE_IN_OUT },
    { f: SCROLLS[1][0] as number, cy: 383, z: 2.07, ease: linear },
    // on down: the Related cards
    { f: SCROLLS[1][1] as number, cy: 664, z: 2.05, ease: EASE_IN_OUT },
    { f: HITS.related + 22, cy: 664, z: 2.06, ease: linear },
    // up a little, so the section's "See in graph" clears the band, as the finger comes
    // (its last key ON the frame before the cut: a key between would read the cut as speed)
    { f: HITS.graphTap - 1, cy: 604, z: 2.1, ease: EASE_IN_OUT },
    // a cut on the tap (two keys a frame apart: nothing drawn between) to the
    // graph: the video in focus, its three ties lit, the app's panel naming it
    // (framed under the legend chips), then a slow push onto the ties
    { f: HITS.graphTap, cy: 462, z: 2.25 },
    { f: HITS.back, cy: 440, z: 2.5, ease: EASE_IN_OUT },
  ].map((k) => (k.fy !== undefined ? { ...k, fy: k.fy + dy } : k)) as Key[];

const MOMENTS = ['moment1', 'moment2', 'moment3', 'moment4'];
/** the timestamp chip at the left of each moment row (points) */
const CHIP_W = 46;

/** the three Related cards, as one block */
const relatedOf = (i: number): Rect => {
  const a = rectOf(T, i, 'related1');
  const c = rectOf(T, i, 'related3');
  return [a[0] - 3, a[1] - 3, a[2] + 6, c[1] + c[3] - a[1] + 6];
};

export const Card: React.FC<{ f: number }> = ({ f }) => {
  const { dy } = useAdFrame();
  if (f < HITS.toApp || f >= HITS.back) return null;
  const keys = keysFor(dy);
  const i = frameAt(f);
  const scrolling = f >= S0 && f < HITS.graphTap;
  const s = scrollAt(f);
  const cam = camAt(keys, f);
  // the step on screen vs where the scroll curve wants it (points)
  const view = scrolling ? { ...cam, cy: cam.cy + (refY(Math.round(s)) - wantY(s)) } : cam;
  const camV = camVelocity(keys, f, 1);
  const motion = scrolling ? { x: camV.x, y: camV.y + (wantY(s) - wantY(scrollAt(f - 1))) * cam.z } : camV;

  const iris = f < HITS.toApp + 16 ? { x: 196.5, y: 811, r: mix(20, 980, prog(f, HITS.toApp, HITS.toApp + 16, EASE_IN_OUT)) } : null;
  const card = rectOf(T, at(T, 'landed'), 'firstCard');

  // lifts, each on its beat, each gone before its screen moves
  const momOut = prog(f, HITS.moments[3] + 8, S0, EASE_IN_OUT);
  const kpIn = prog(f, HITS.keyPoints, HITS.keyPoints + 16, EASE_SPRING);
  const kpOut = prog(f, (SCROLLS[1][0] as number) - 8, (SCROLLS[1][0] as number) + 2, EASE_IN_OUT);
  const relIn = prog(f, HITS.related, HITS.related + 16, EASE_SPRING);
  const relOut = prog(f, HITS.related + 20, HITS.related + 28, EASE_IN_OUT);
  const seeGraph = rectOf(T, stepFrame(STEPS), 'seeGraph');

  return (
    <AbsoluteFill>
      <AppShot
        take={T}
        i={i}
        cam={view}
        iris={iris}
        shadow={iris ? 0 : 1}
        motion={motion}
        sheen={f < HITS.toApp + 24 ? prog(f, HITS.toApp, HITS.toApp + 24, EASE_MODAL) : 0}
      >
        <Tap x={card[0] + 120} y={card[1] + 40} t={prog(f, HITS.cardTap - 7, HITS.cardTap + 12, linear)} />
        <Tap x={seeGraph[0] + seeGraph[2] / 2} y={seeGraph[1] + seeGraph[3] / 2} t={prog(f, HITS.graphTap - 7, HITS.graphTap + 12, linear)} />

        {/* the Key moments, one by one: the timestamp lifts first, then the lift opens across its row */}
        {f < S0 &&
          MOMENTS.map((m, k) => {
            const h = HITS.moments[k];
            const on = prog(f, h, h + 14, EASE_SPRING);
            if (on <= 0.01 || momOut >= 1) return null;
            const r = rectOf(T, i, m);
            const open = prog(f, h + 3, h + 12, EASE_IN_OUT);
            const rect: Rect = [r[0] - 4, r[1] - 2, mix(CHIP_W, r[2] + 8, open), r[3] + 4];
            return <Lift key={m} take={T} i={i} rect={rect} radius={10} lift={on * 0.35} rise={2} grow={0.012} ring={0.5 * on} opacity={1 - momOut} />;
          })}

        {/* the Key Points */}
        {scrolling && kpIn > 0.01 && kpOut < 1 && (() => {
          const p = rectOf(T, i, 'points');
          return <Lift take={T} i={i} rect={[p[0] - 6, p[1] - 6, p[2] + 12, p[3] + 12]} radius={12} lift={kpIn * 0.35} rise={2} grow={0.01} ring={0.55 * kpIn} opacity={1 - kpOut} />;
        })()}

        {/* the Related cards */}
        {scrolling && f >= HITS.related && relIn > 0.01 && relOut < 1 && (
          <Lift take={T} i={i} rect={relatedOf(i)} radius={14} lift={relIn * 0.35} rise={2} grow={0.008} ring={0.55 * relIn} opacity={1 - relOut} />
        )}
      </AppShot>
    </AbsoluteFill>
  );
};
