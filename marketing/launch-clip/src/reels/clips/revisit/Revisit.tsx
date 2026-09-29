import React from 'react';
import { AbsoluteFill } from 'remotion';
import { BAND, CREEP, GLIDE, HITS, OPEN, OPENING, READS, TAKE } from '../../../../clips/revisit-timeline.mjs';
import { POINT_R } from './Opening';
import { AppShot, Lift, Tap } from '../../kit/AppShot';
import { camAt, camVelocity, type Key } from '../../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../../kit/curves';
import { steppedScroll } from '../../kit/scroll';
import { at, center, rectOf } from '../../kit/takes';

/**
 * REVISIT, what you save comes back to you. One continuous use of the real
 * app (take `revisitClip`, capture/shoot.mjs), in OUTPUT frames:
 *
 *  0. (round 4) It arrives through the opening's point as an iris
 *     (Opening.tsx: the problem, then the turn). APP frames: `f` is the
 *     clip's frame minus OPEN.
 *  1. The Revisit tab, as it opens on what is asking for you (round 3):
 *     "Due now", a reminder the user set on Four Thousand Weeks, lifts after
 *     "reminder,"; then the "Do this" list, the steps the app writes only for
 *     saves that call for one (web/lib/takeaway.ts): The Tail End's row lifts
 *     after "action,", and the V60 step is ticked off (the app's own "Marked
 *     as done": the row leaves the list, the toast confirms it).
 *  2. "This week in Machina", tapped open (the app's own expand), and READ,
 *     slowly (owner: the recap is never rushed): the write-up rises into the
 *     reading window, then the two themes and the saves they link to, then
 *     the page runs out on the Standout, which lifts, and the question it
 *     leaves you with.
 *  3. The Standout, tapped: the save it names opens (the app's own
 *     transition): The Tail End, whose "Do this" is the row that lifted.
 *  4. Thrown out of frame into the lockup (End.tsx).
 *
 * THE READING WINDOW. The recap is read by scrolling the page (the capture's
 * ~3pt steps, kit/scroll.ts) under a camera that holds still, the way a
 * person reads it. The camera takes up each step's rounding, which moves the
 * whole screen, so the window is placed where the app's fixed chrome cannot
 * be seen: the header under the band's solid paper, the tab bar below the
 * frame. The camera only leaves it (for the Standout and its question, at
 * the end of the page) once the page has stopped.
 */

const T = TAKE;
const linear = (t: number) => t;

const recap = steppedScroll({ take: T, mark: 'scroll', steps: at(T, 'card') - at(T, 'scroll'), key: 'recap' });

/** the page's drift while a read is held (clips/revisit-timeline.mjs CREEP) */
const creepAt = (u: number) =>
  CREEP.reduce((sum, [a, b, pts]) => sum + (pts * (1 - Math.cos(Math.PI * prog(u, a, b, linear)))) / 2, 0);

/** THE GLIDE (clips/revisit-timeline.mjs GLIDE): one eased motion of
 *  PAGE + CAMERA points, the page taking the first part until it runs out
 *  and the camera the rest (see the key that ends the glide) */
const GLIDE_PAGE = recap.end - READS[READS.length - 1][3] - creepAt(GLIDE[0]);
const glided = (u: number) => prog(u, GLIDE[0], GLIDE[1], EASE_IN_OUT);

/** how far the choreography wants the recap scrolled, in points */
const scrollAt = (u: number) => {
  let p = 0;
  for (const [a, b, p0, p1] of READS) if (u >= a) p = mix(p0, p1, prog(u, a, b, EASE_IN_OUT));
  p += creepAt(u);
  if (u >= GLIDE[0]) p += Math.min(GLIDE_PAGE, glided(u) * (GLIDE_PAGE + GLIDE_CAMERA));
  return p;
};

/** where things are on the screens the camera aims at */
const TAB = at(T, 'tab');
const dueRow = rectOf(T, TAB, 'dueRow');
const todoRow = rectOf(T, TAB, 'todoFirst');
const tickRow = rectOf(T, TAB, 'todoLast');
const TICKED = at(T, 'ticked');
const banner = rectOf(T, TICKED, 'recap');
const END_OF_PAGE = recap.view(recap.end).i;
const standout = rectOf(T, END_OF_PAGE, 'standout');
const CARD = at(T, 'cardSettled');
const title = rectOf(T, CARD, 'detailTitle');

/** the reading window: the header (to 112pt) under the band's solid paper,
 *  the tab bar (from 770pt) below the frame; it breathes (a slow zoom) while
 *  the page is read. The band is the clip's (round 3: higher than the reel's) */
const WINDOW = { cx: 196.5, cy: 426, z: 2.35, fx: 540, fy: 1135 };
const WINDOW_END = { cy: 428, z: 2.38 };
/** where a read puts its subject: just under the clear edge of the band */
const TOP = BAND.clear + 60;

/** the glide ends on the Standout (its top just under the empty band) and
 *  the question under it, both above the bottom quarter that Reels and
 *  TikTok cover with their own UI */
const GLIDE_CAMERA = standout[1] + (WINDOW.fy - TOP) / WINDOW_END.z - WINDOW_END.cy;

/** (round 3) the list, the recap and the toast in one frame, for the tick */
const WIDE = { cx: 196.5, cy: 560, z: 2.3, fx: 540, fy: TOP - 20 + (560 - 280) * 2.3 };

const keys: Key[] = [
  // the Revisit tab on "Due now" and "Do this", a breath of tilt that
  // settles before the first line (the reel's establishing move for this tab)
  { f: 0, cx: 196.5, cy: 340, z: 2.4, fx: 540, fy: TOP - 30 + (340 - 124) * 2.4, rx: -4 },
  { f: HITS.settle, rx: 0, ease: EASE_MODAL },
  { f: HITS.wide[0], cy: 344, z: 2.44, ease: linear },
  // back a little: the list, the recap below it and where the toast will be
  { f: HITS.wide[1], ...WIDE, ease: EASE_IN_OUT },
  { f: HITS.travel[0], cy: WIDE.cy + 2, z: 2.32, ease: linear },
  // into the reading window, the toast left below the frame
  { f: HITS.travel[1], ...WINDOW, ease: EASE_IN_OUT },
  // the window holds (a slow breath of zoom) while the page is read
  { f: GLIDE[0], ...WINDOW_END, ease: linear },
  // the glide: the camera takes over the motion where the page runs out
  {
    f: GLIDE[1],
    cy: WINDOW_END.cy + GLIDE_CAMERA,
    ease: (t) => Math.max(0, EASE_IN_OUT(t) * (GLIDE_PAGE + GLIDE_CAMERA) - GLIDE_PAGE) / GLIDE_CAMERA,
  },
  // a slow push toward the question while it is read (a hold is never dead still)
  { f: HITS.cardTap, cy: WINDOW_END.cy + GLIDE_CAMERA + 10, z: 2.44, ease: linear },
  // the save opens: the camera eases up and back to the whole card, its
  // title high, its "Do this" low, as the app's transition plays
  { f: HITS.cardTap + 48, cx: 196.5, cy: 300, z: 2.1, fx: 540, fy: TOP + 10 + (300 - title[1]) * 2.1, ease: EASE_IN_OUT },
  { f: HITS.out - 16, cy: 316, z: 2.14, ease: linear },
  // thrown out of frame, into the lockup
  { f: HITS.out + 14, fx: -760, z: 2.4, ease: EASE_IN_OUT },
];

export const Revisit: React.FC<{ f: number }> = ({ f }) => {
  if (f > HITS.out + 15 || f < OPENING.iris[0] - OPEN) return null;
  // (round 4) the tab arrives through the opening's point: an iris from the
  // point's own size, centred on the screen point the first camera puts
  // under it (Opening.tsx POINT)
  const opened = prog(f + OPEN, OPENING.iris[0], OPENING.iris[1], EASE_IN_OUT);
  const iris = opened < 1 ? { x: 196.5, y: 340, r: mix(POINT_R / 2.4, 980, opened) } : null;

  // which real frame: the tab; the recap opening (60fps: one captured frame
  // per output frame); the page, scrolled; the save, opening (60fps)
  const scrolled = scrollAt(f);
  const scroll = recap.view(scrolled);
  const i =
    f < HITS.tick
      ? TAB
      : f < HITS.travel[1]
        ? // the tick (60fps); its last frame, the toast still up, holds until
          // the camera has left the toast below the frame
          at(T, 'tick', Math.min(39, f - HITS.tick))
        : f < HITS.recapTap
          ? TICKED
          : f < READS[0][0]
        ? at(T, 'expand', Math.min(35, f - HITS.recapTap))
        : f < HITS.cardTap
          ? scroll.i
          : f < HITS.cardTap + 39
            ? // (the capture's first frame after the click is unchanged: the
              // tap lands on the first frame the app visibly answers, +1)
              at(T, 'card', f - HITS.cardTap + 1)
            : CARD;
  const reading = f >= READS[0][0] && f < HITS.cardTap;

  const cam = camAt(keys, f);
  // the camera takes up the step's rounding while the page is read
  const view = reading ? { ...cam, cy: cam.cy - scroll.dy } : cam;
  // motion blur from what moves on screen: the camera and the page together
  const camV = camVelocity(keys, f, 1);
  const motion = reading
    ? { x: camV.x, y: camV.y - cam.z * (scrolled - scrollAt(f - 1)) }
    : camV;

  // the reminder that came due: up in the pause after "reminder,"
  const due = prog(f, HITS.dueLift, HITS.dueLift + 8, EASE_SPRING) * (1 - prog(f, HITS.dueDrop, HITS.dueDrop + 12, EASE_MODAL));
  // the "Do this" row: up in the pause after "action,", down before the tick
  const todo = prog(f, HITS.todoLift, HITS.todoLift + 8, EASE_SPRING) * (1 - prog(f, HITS.todoDrop, HITS.todoDrop + 12, EASE_MODAL));
  // the Standout: up as the glide lands on it, down before it is tapped
  const up = prog(f, HITS.standout - 1, HITS.standout + 7, EASE_SPRING) * (1 - prog(f, HITS.standoutDrop, HITS.standoutDrop + 14, EASE_MODAL));
  const lifted = reading && f >= HITS.standout - 2 ? rectOf(T, i, 'standout') : null;

  // (the pad lands at 35% of the gesture: on the frame the app responds)
  const tap = (hit: number) => prog(f, hit - 7, hit + 13, linear);
  const bannerTap = { x: banner[0] + banner[2] * 0.4, y: banner[1] + banner[3] / 2 };
  const standoutTap = center(standout);

  return (
    <AbsoluteFill>
      <AppShot take={T} i={i} cam={view} motion={motion} iris={iris}>
        {f < HITS.tick && due > 0.01 && (
          <Lift take={T} i={i} rect={dueRow} radius={16} lift={due * 0.7} rise={3} grow={0.02} ring={0.55 * due} />
        )}
        {f < HITS.tick && todo > 0.01 && (
          <Lift take={T} i={i} rect={todoRow} radius={14} lift={todo * 0.7} rise={3} grow={0.02} ring={0.55 * todo} />
        )}
        {/* the V60 step's circle: "Mark as done" */}
        <Tap x={tickRow[0] + 26} y={tickRow[1] + 22} t={tap(HITS.tick)} />
        <Tap x={bannerTap.x} y={bannerTap.y} t={tap(HITS.recapTap)} />
        {lifted && up > 0.01 && (
          <Lift take={T} i={i} rect={lifted} radius={16} lift={up * 0.8} rise={4} grow={0.03} ring={0.6 * up} />
        )}
        <Tap x={standoutTap.x} y={standoutTap.y} t={tap(HITS.cardTap)} />
      </AppShot>
    </AbsoluteFill>
  );
};
