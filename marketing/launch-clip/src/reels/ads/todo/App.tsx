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
 * The real app (take `adTodo`, capture/shoot.mjs), round 4, from the iris to
 * the throw into the lockup, at the app's REAL speed (two captured 60fps
 * frames per output frame). OUTPUT frames.
 *
 *  3 ANY KIND  the feed opens round the mark's point (the iris); four saves
 *              land at its top one after another, each on its word: a
 *              screenshot, an article, an Instagram post, a YouTube video,
 *              each already with its source and its topic (the app's own
 *              arrival).
 *  4 STANDOUT  the video's card, tapped: it opens on its Key moments, with
 *              timestamps; they lift one by one on "key moments".
 *  5 SORTED    a cut on the beat to the feed as a list: every save with its
 *              source and its colour-coded topic; the four new rows lift.
 *  6           thrown out of frame into the lockup (End.tsx).
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
  return at(T, mark, Math.min(p.n - 1, Math.max(0, Math.floor((f - p.at) * p.rate) + offset)));
};

/** the capture frame the screen shows */
const screenFrame = (f: number) => {
  if (f < HITS.lands[0]) return at(T, 'home');
  if (f < HITS.cardTap) {
    let k = 0;
    while (k + 1 < LANDS.length && f >= HITS.lands[k + 1]) k++;
    return seg(`${LANDS[k]}Land` as Seg, f);
  }
  // (+1: the capture's first frame after a click is unchanged; the tap lands
  // on the first frame the app answers)
  if (f < HITS.list) return seg('open', f, 1);
  return at(T, 'list');
};

/** the feed, framed on the top of the list where the saves land */
const FEED_CAM = { cx: 196.5, cy: 330, z: 1.9, fx: 540, fy: 960 };

const keysFor = (dy: number): Key[] =>
  [
    { f: HITS.iris[0], ...FEED_CAM },
    // a slow push while the saves land
    { f: HITS.cardTap, cy: 332, z: 1.96, ease: linear },
    // the card opens: its Key moments, whole
    { f: HITS.cardTap + 16, cy: 316, z: 1.75, fy: 940, ease: EASE_MODAL },
    { f: HITS.list - 1, cy: 318, z: 1.8, ease: linear },
    // cut on the beat to the list: the four new saves and the ones before them
    // (close enough that the topic tags read: the four new rows fill the
    // frame between the band and Meta's bottom zone)
    { f: HITS.list, cy: 341.5, z: 2.05, fy: 915 },
    { f: HITS.out, cy: 343, z: 2.09, ease: linear },
    // thrown out of frame, into the lockup
    { f: HITS.out + THROW_LEN, fx: -760, z: 2.1, ease: EASE_IN_OUT },
  ].map((k) => (k.fy !== undefined ? { ...k, fy: k.fy + dy } : k));

const OPENED = at(T, 'open', PLAY.open.n - 1);
const MOMENTS = [1, 2, 3, 4].map((k) => rectOf(T, OPENED, `moment${k}`));
const LIST = at(T, 'list');
const ROWS = ['youtube', 'instagram', 'article', 'screenshot'].map((k) => rectOf(T, LIST, k));
const TOP_CARD = rectOf(T, at(T, 'landed'), 'firstCard');

export const App: React.FC<{ f: number }> = ({ f }) => {
  const { dy } = useShape();
  if (f < HITS.iris[0] || f > HITS.out + THROW_LEN) return null;
  const keys = keysFor(dy);
  const i = screenFrame(f);
  const cam = camAt(keys, f);
  const motion = camVelocity(keys, f, 1);

  // the iris: the app opens round the mark's point (centred on the screen
  // point the first camera puts under it)
  const opened = prog(f, HITS.iris[0], HITS.iris[1], EASE_IN_OUT);
  const iris = opened < 1 ? { x: FEED_CAM.cx, y: FEED_CAM.cy, r: mix(POINT_R / FEED_CAM.z, 980, opened) } : null;

  // the Key moments lift one by one, and settle before the cut
  const momentUp = (k: number) =>
    prog(f, HITS.moments + k * 6, HITS.moments + k * 6 + 10, EASE_SPRING) * (1 - prog(f, HITS.list - 12, HITS.list - 2, EASE_IN_OUT));
  // the four new rows lift one by one, and settle before the throw
  const rowUp = (k: number) => prog(f, HITS.rows + k * 6, HITS.rows + k * 6 + 10, EASE_SPRING) * (1 - prog(f, HITS.out - 12, HITS.out - 2, EASE_MODAL));

  return (
    <AbsoluteFill>
      <AppShot take={T} i={i} cam={cam} motion={motion} iris={iris}>
        <Tap x={TOP_CARD[0] + 120} y={TOP_CARD[1] + 40} t={prog(f, HITS.cardTap - 7, HITS.cardTap + 13, linear)} />
        {f >= HITS.cardTap &&
          f < HITS.list &&
          MOMENTS.map((r, k) =>
            momentUp(k) > 0.01 ? <Lift key={k} take={T} i={i} rect={[r[0] - 4, r[1] - 3, r[2] + 8, r[3] + 6]} radius={12} lift={momentUp(k) * 0.45} rise={2} grow={0.015} ring={0.55 * momentUp(k)} /> : null,
          )}
        {f >= HITS.list &&
          ROWS.map((r, k) =>
            rowUp(k) > 0.01 ? <Lift key={k} take={T} i={i} rect={r} radius={16} lift={rowUp(k) * 0.45} rise={2} grow={0.012} ring={0.55 * rowUp(k)} /> : null,
          )}
      </AppShot>
    </AbsoluteFill>
  );
};
