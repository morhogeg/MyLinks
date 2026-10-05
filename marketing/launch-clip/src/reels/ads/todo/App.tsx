import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HITS, LANDS, PLAY, TAKE, THROW_LEN } from '../../../../clips/ad-todo-timeline.mjs';
import { AppShot, Lift, Tap } from '../../kit/AppShot';
import { camAt, camVelocity, type Key } from '../../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../../kit/curves';
import { at, rectOf } from '../../kit/takes';
import { POINT_R } from './Hook';
import { useShape } from './frame';

/**
 * The real app (take `adTodo`, capture/shoot.mjs), round 6, from the iris to
 * the throw into the lockup, at the app's REAL speed (two captured 60fps
 * frames per output frame). OUTPUT frames.
 *
 *  3 SAVE          the feed opens round the mark's point (the iris); a YouTube
 *                  video, an Instagram post, an article and a screenshot land
 *                  at its top, each on its word ("Videos, posts, articles,
 *                  screenshots"), each already showing where it came from.
 *  4 WHAT IT DOES  a glide down the feed (the capture's even 4pt scroll steps;
 *                  the camera takes up each step's remainder, so it never
 *                  hops): every save already summarized. Then a cut on the
 *                  beat, closer, onto one card as it is tapped open, read
 *                  down to its Key Points, which lift on "key points".
 *  5 LINKED        a cut into the Graph view as the app zooms onto a cluster
 *                  of linked saves, lit together; then a second cluster.
 *  6               thrown out of frame into the lockup (End.tsx).
 *
 * Every pixel of the app is the capture; the added things are the camera,
 * the tap and the lifts (the reel kit).
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
// frame each (marks `glide` to `kpOpen`)
const STEP_PT = 4;
const GLIDE_STEPS = at(T, 'kpOpen') - at(T, 'glide');
/** the steps the glide actually travels (owner, 2026-10-04: the scroll looked
 *  "jittery"): all 375 (1500pt) in ~3.5s peaked at 80px a frame, which at
 *  30fps strobes; 160 steps (640pt) keeps the peak near 30px a frame */
const GLIDE_USE = Math.min(GLIDE_STEPS, 160);
const [G0, G1] = HITS.glide;
/** a sine ease: the speed spreads over the glide instead of peaking in its
 *  middle (EASE_IN_OUT's peak is ~2x the average speed; a sine's is ~1.6x) */
const SINE = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t);
const glideAt = (f: number) => GLIDE_USE * prog(f, G0, G1, SINE);

// ── the read-down to the Key Points: the capture's 4pt steps inside the open
// card, aimed off each step's MEASURED position (the Key Points list), since
// steps inside a scroller are not perfectly even
const KP_STEPS = at(T, 'graphSettled') - at(T, 'kpScroll');
const kpFrame = (k: number) => (k <= 0 ? at(T, 'kpOpen', PLAY.kpOpen.n - 1) : at(T, 'kpScroll', k - 1));
const kpRef = (k: number) => rectOf(T, kpFrame(k), 'points')[1];
const [K0, K1] = HITS.kpScroll;
const kpAt = (f: number) => KP_STEPS * prog(f, K0, K1, EASE_IN_OUT);
const kpWant = (s: number) => {
  const k = Math.min(KP_STEPS - 1, Math.floor(s));
  return mix(kpRef(k), kpRef(k + 1), s - k);
};

/** the capture frame the screen shows */
const screenFrame = (f: number) => {
  if (f < HITS.lands[0]) return at(T, 'home');
  if (f < G0) {
    let k = 0;
    while (k + 1 < LANDS.length && f >= HITS.lands[k + 1]) k++;
    return seg(`${LANDS[k]}Land` as Seg, f);
  }
  if (f < HITS.kpOpen) {
    const k = Math.round(glideAt(f));
    return k <= 0 ? at(T, 'landed') : at(T, 'glide', k - 1);
  }
  // (+1: the capture's first frame after a click is unchanged; the tap lands
  // on the first frame the app answers)
  if (f < K0) return seg('kpOpen', f, 1);
  if (f < HITS.cluster) return kpFrame(Math.round(kpAt(f)));
  if (f < HITS.cluster2) return seg('cluster', f, 1);
  return seg('cluster2', f, 1);
};

/** the feed, framed on the top of the list where the saves land */
const FEED_CAM = { cx: 196.5, cy: 330, z: 1.9, fx: 540, fy: 960 };
/** the opened card: its photo and title, then down to the Key Points */
const OPEN_CAM = { cx: 196.5, cy: 420, z: 1.75, fx: 540, fy: 960 };
const KP_CAM = { cx: 196.5, cy: 520, z: 2.05, fx: 540, fy: 960 };
/** the cluster the app zooms onto: its lit saves and their links fill the
 *  frame, the head of its panel at the bottom of it */
const CLUSTER_CAM = { cx: 205, cy: 370, z: 2.9, fx: 540, fy: 900 };

const keysFor = (dy: number): Key[] =>
  ([
    { f: HITS.iris[0], ...FEED_CAM },
    // a slow push while the saves land and the feed glides
    { f: G0, cy: 331, z: 1.94, ease: linear },
    { f: HITS.kpOpen - 1, cy: 332, z: 1.97, ease: linear },
    // a cut on the beat, closer, onto the post as it is tapped; it opens
    { f: HITS.kpOpen, cx: 196.5, cy: 520, z: 2.0, fy: 960 },
    { f: HITS.kpOpen + 18, ...OPEN_CAM, ease: EASE_MODAL },
    { f: K0, cy: 424, z: 1.8, ease: linear },
    // down to its Key Points
    { f: K1, ...KP_CAM, ease: EASE_IN_OUT },
    { f: HITS.cluster - 1, cy: 524, z: 2.12, ease: linear },
    // cut into the graph as the app zooms onto the first cluster
    { f: HITS.cluster, ...CLUSTER_CAM, z: 2.7 },
    { f: HITS.cluster + 30, ...CLUSTER_CAM, ease: EASE_IN_OUT },
    { f: HITS.cluster2, cy: 372, z: 2.98, ease: linear },
    // the second cluster: the app re-centres on it; a slow push
    { f: HITS.out, cy: 374, z: 3.06, ease: linear },
    // thrown out of frame, into the lockup
    { f: HITS.out + THROW_LEN, fx: -760, z: 3.3, ease: EASE_IN_OUT },
  ] as Key[]).map((k) => (k.fy !== undefined ? { ...k, fy: k.fy + dy } : k));

/** where the post sat in the feed when it was tapped (the capture clicked
 *  20pt into its top edge; measured on the frame: its photo starts at 455pt) */
const CARD_TAP = { x: 200, y: 475 };

export const App: React.FC<{ f: number }> = ({ f }) => {
  const { dy } = useShape();
  if (f < HITS.iris[0] || f > HITS.out + THROW_LEN) return null;
  const keys = keysFor(dy);
  const i = screenFrame(f);
  const cam = camAt(keys, f);
  const camV = camVelocity(keys, f, 1);

  // a stepped scroll: show the nearest captured step, and move the camera by
  // the remainder, so the page moves continuously
  const gliding = f >= G0 && f < HITS.kpOpen;
  const reading = f >= K0 && f < HITS.cluster;
  let view = cam;
  let motion = camV;
  if (gliding) {
    const s = glideAt(f);
    view = { ...cam, cy: cam.cy + STEP_PT * (s - Math.round(s)) };
    motion = { ...camV, y: camV.y - STEP_PT * (s - glideAt(f - 1)) * cam.z };
  } else if (reading) {
    const s = kpAt(f);
    view = { ...cam, cy: cam.cy + (kpRef(Math.round(s)) - kpWant(s)) };
    motion = { ...camV, y: camV.y + (kpWant(s) - kpWant(kpAt(f - 1))) * cam.z };
  }

  // the iris: the app opens round the mark's point
  const opened = prog(f, HITS.iris[0], HITS.iris[1], EASE_IN_OUT);
  const iris = opened < 1 ? { x: FEED_CAM.cx, y: FEED_CAM.cy, r: mix(POINT_R / FEED_CAM.z, 980, opened) } : null;

  // the Key Points lift on "key points", and settle before the cut
  const kpUp = prog(f, HITS.keyPoints, HITS.keyPoints + 12, EASE_SPRING) * (1 - prog(f, HITS.cluster - 12, HITS.cluster - 2, EASE_IN_OUT));

  return (
    <AbsoluteFill>
      <AppShot take={T} i={i} cam={view} motion={motion} iris={iris}>
        {/* the post, tapped open */}
        <Tap x={CARD_TAP.x} y={CARD_TAP.y} t={prog(f, HITS.kpOpen - 7, HITS.kpOpen + 13, linear)} />
        {reading && kpUp > 0.01 && (() => {
          const kp = rectOf(T, i, 'keyPoints');
          const pts = rectOf(T, i, 'points');
          return <Lift take={T} i={i} rect={[kp[0] - 4, kp[1] - 6, kp[2] + 8, pts[1] + pts[3] - kp[1] + 12]} radius={14} lift={kpUp * 0.4} rise={2} grow={0.01} ring={0.55 * kpUp} />;
        })()}
      </AppShot>
    </AbsoluteFill>
  );
};
