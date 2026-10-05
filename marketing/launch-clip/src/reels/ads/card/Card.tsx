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
 * irises open around the + the mark's point became; the shared article lands
 * at the top of the feed and is tapped open (the app's own open); then it is
 * read down:
 *
 *  GIST     the title and the gist, as it opens
 *  POINTS   one scroll down to the Key Points, lifted
 *  LINKS    on down: the three Related cards, lifted together; then the
 *           section's own "See in graph" is tapped and the real graph opens
 *           with the article in focus, its three ties lit
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
  keyPoints: stepFor('keyPoints', 250), // the Key Points heading, the list under it
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
/** the graph → card dissolve: the graph goes soft and fades under the card */
const PULL = 14;

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
    // onto the article landing at the top of the feed
    { f: HITS.toApp + 30, cx: 196.5, cy: 308, z: 2.0, fy: HERO, ease: EASE_IN_OUT },
    { f: HITS.cardTap, z: 2.03, ease: linear },
    // opened: the title and the gist (settled before the scroll)
    { f: HITS.cardTap + 20, cy: 280, z: 2.3, ease: EASE_MODAL },
    { f: S0, cy: 284, z: 2.32, ease: linear },
    // one scroll down: the Key Points, the whole list in frame
    { f: SCROLLS[0][1] as number, cy: 425, z: 1.78, ease: EASE_IN_OUT },
    { f: SCROLLS[1][0] as number, cy: 426, z: 1.8, ease: linear },
    // on down: the Related cards and the section's "See in graph"
    { f: SCROLLS[1][1] as number, cy: 662, z: 2.0, ease: EASE_IN_OUT },
    // (its last key ON the frame before the cut: a key between would read the cut as speed)
    { f: HITS.graphTap - 1, cy: 662, z: 2.02, ease: linear },
    // a cut on the tap (two keys a frame apart: nothing drawn between) to the
    // graph: the article in focus, its three ties lit, the app's panel naming
    // it (framed under the legend chips), then a slow push onto the ties
    { f: HITS.graphTap, cy: 470, z: 2.3 },
    { f: HITS.back, cy: 458, z: 2.48, ease: EASE_IN_OUT },
  ].map((k) => (k.fy !== undefined ? { ...k, fy: k.fy + dy } : k)) as Key[];


/** the three Related cards, as one block */
const relatedOf = (i: number): Rect => {
  const a = rectOf(T, i, 'related1');
  const c = rectOf(T, i, 'related3');
  return [a[0] - 3, a[1] - 3, a[2] + 6, c[1] + c[3] - a[1] + 6];
};

export const Card: React.FC<{ f: number }> = ({ f }) => {
  const { dy } = useAdFrame();
  // (round 8) the graph dissolves out through a focus pull, under the card
  if (f < HITS.toApp || f >= HITS.back + PULL) return null;
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
  const kpIn = prog(f, HITS.keyPoints, HITS.keyPoints + 16, EASE_SPRING);
  const kpOut = prog(f, (SCROLLS[1][0] as number) - 8, (SCROLLS[1][0] as number) + 2, EASE_IN_OUT);
  const relIn = prog(f, HITS.related, HITS.related + 16, EASE_SPRING);
  const relOut = prog(f, HITS.related + 16, HITS.related + 24, EASE_IN_OUT);
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
        blur={16 * prog(f, HITS.back - 10, HITS.back + 4, EASE_IN_OUT)}
        opacity={1 - prog(f, HITS.back, HITS.back + PULL, EASE_IN_OUT)}
      >
        <Tap x={card[0] + 120} y={card[1] + 40} t={prog(f, HITS.cardTap - 7, HITS.cardTap + 12, linear)} />
        <Tap x={seeGraph[0] + seeGraph[2] / 2} y={seeGraph[1] + seeGraph[3] / 2} t={prog(f, HITS.graphTap - 7, HITS.graphTap + 12, linear)} />

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
