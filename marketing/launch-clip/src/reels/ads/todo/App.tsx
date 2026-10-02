import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HITS, LANDS, PLAY, TAKE, THROW_LEN } from '../../../../clips/ad-todo-timeline.mjs';
import { AppShot } from '../../kit/AppShot';
import { camAt, camVelocity, type Key } from '../../kit/camera';
import { EASE_IN_OUT, mix, prog } from '../../kit/curves';
import { at } from '../../kit/takes';
import { POINT_R } from './Hook';
import { useShape } from './frame';

/**
 * The real app (take `adTodo`, capture/shoot.mjs), round 5, from the iris to
 * the throw into the lockup, at the app's REAL speed (two captured 60fps
 * frames per output frame). OUTPUT frames.
 *
 *  3 ANYWHERE  the feed opens round the mark's point (the iris); a YouTube
 *              video, an Instagram post, an article and a screenshot land at
 *              its top one after another (the app's own arrival), each
 *              already showing where it came from.
 *  4 MADE      a glide down the feed (the capture's even 4pt scroll steps; the
 *    SENSE     camera takes up each step's remainder, so it never hops):
 *              every save already summarized. On "linked" a cut into the Graph
 *              view as the app zooms onto its largest cluster (the capture
 *              tapped its chip off camera), the saves it links lit together.
 *  5           thrown out of frame into the lockup (End.tsx).
 *
 * No beat opens one save: the ad is about all of them (owner, round 5).
 * Every pixel of the app is the capture; the added thing is the camera.
 */

const T = TAKE;
const linear = (t: number) => t;
type Seg = keyof typeof PLAY;
/** the capture frame a stretch shows at output frame f, at its rate */
const seg = (mark: Seg, f: number, offset = 0) => {
  const p = PLAY[mark];
  return at(T, mark, Math.min(p.n - 1, Math.max(0, p.from + Math.floor((f - p.at) * p.rate) + offset)));
};

// ── the glide: the capture scrolled the feed 1500pt in even 4pt steps, one
// frame each (marks `glide` to `graph`)
const STEP_PT = 4;
const STEPS = at(T, 'graph') - at(T, 'glide');
const [G0, G1] = HITS.glide;
const glideAt = (f: number) => STEPS * prog(f, G0, G1, EASE_IN_OUT);

/** the capture frame the screen shows */
const screenFrame = (f: number) => {
  if (f < HITS.lands[0]) return at(T, 'home');
  if (f < G0) {
    let k = 0;
    while (k + 1 < LANDS.length && f >= HITS.lands[k + 1]) k++;
    return seg(`${LANDS[k]}Land` as Seg, f);
  }
  if (f < HITS.graph) {
    const k = Math.round(glideAt(f));
    return k <= 0 ? at(T, 'landed') : at(T, 'glide', k - 1);
  }
  // (+1: the capture's first frame after the click is unchanged)
  return seg('cluster', f, 1);
};

/** the feed, framed on the top of the list where the saves land */
const FEED_CAM = { cx: 196.5, cy: 330, z: 1.9, fx: 540, fy: 960 };
/** the cluster the app zooms onto: its lit saves and their links fill the
 *  frame, the head of its panel ("time · 10 cards") at the bottom of it */
const CLUSTER_CAM = { cx: 205, cy: 370, z: 2.9, fx: 540, fy: 900 };

const keysFor = (dy: number): Key[] =>
  ([
    { f: HITS.iris[0], ...FEED_CAM },
    // a slow push while the saves land and the feed glides
    { f: G0, cy: 331, z: 1.94, ease: linear },
    { f: HITS.graph - 1, cy: 332, z: 1.97, ease: linear },
    // cut on "linked" into the graph, the app zooming onto the lit cluster;
    // a slow push while it holds
    { f: HITS.graph, ...CLUSTER_CAM, z: 2.7 },
    { f: HITS.graph + 30, ...CLUSTER_CAM, ease: EASE_IN_OUT },
    { f: HITS.out, cy: 372, z: 3.0, ease: linear },
    // thrown out of frame, into the lockup
    { f: HITS.out + THROW_LEN, fx: -760, z: 2.4, ease: EASE_IN_OUT },
  ] as Key[]).map((k) => (k.fy !== undefined ? { ...k, fy: k.fy + dy } : k));


export const App: React.FC<{ f: number }> = ({ f }) => {
  const { dy } = useShape();
  if (f < HITS.iris[0] || f > HITS.out + THROW_LEN) return null;
  const keys = keysFor(dy);
  const i = screenFrame(f);
  const cam = camAt(keys, f);
  const camV = camVelocity(keys, f, 1);

  // the glide: show the nearest captured step, and move the camera by the
  // remainder, so the feed moves continuously
  const gliding = f >= G0 && f < HITS.graph;
  const s = glideAt(f);
  const view = gliding ? { ...cam, cy: cam.cy + STEP_PT * (s - Math.round(s)) } : cam;
  const motion = gliding ? { x: camV.x, y: camV.y - STEP_PT * (s - glideAt(f - 1)) * cam.z } : camV;

  // the iris: the app opens round the mark's point (centred on the screen
  // point the first camera puts under it)
  const opened = prog(f, HITS.iris[0], HITS.iris[1], EASE_IN_OUT);
  const iris = opened < 1 ? { x: FEED_CAM.cx, y: FEED_CAM.cy, r: mix(POINT_R / FEED_CAM.z, 980, opened) } : null;

  return (
    <AbsoluteFill>
      <AppShot take={T} i={i} cam={view} motion={motion} iris={iris} />
    </AbsoluteFill>
  );
};
