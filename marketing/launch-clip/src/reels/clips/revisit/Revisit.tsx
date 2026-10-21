import React from 'react';
import { AbsoluteFill } from 'remotion';
import { BAND, CREEP, GLIDE, HITS, OPEN, OPENING, READS as READS_APPROVED, RECAP_Y_APPROVED, TAKE } from '../../../../clips/revisit-timeline.mjs';
import { POINT, POINT_R } from './Opening';
import { Spotlight, Touch, mixRect } from './Touch';
import { AppShot, Lift } from '../../kit/AppShot';
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
 *     (round 5, USE) Between the two: the due save's bell opens its
 *     reminder's own sheet, Smart review lifting ("Tomorrow · then 1 week &
 *     1 month"); closed (its X); then the save itself opens on its summary and the
 *     camera goes down to its Key Points; "‹ Revisit" back to the list.
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

/** (light revisit) the due save has left the list before the recap opens,
 *  so the recap sits higher than on the approved cut: its reads stop that
 *  much sooner, and every one lands exactly where the approved cut's did */
const DY = RECAP_Y_APPROVED - rectOf(T, at(T, 'ticked'), 'recap')[1];
const READS = READS_APPROVED.map(([a, b, p0, p1]) => [a, b, p0 && p0 - DY, p1 - DY]);

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
const dueOpen = rectOf(T, TAB, 'due');
const dueHeader = rectOf(T, TAB, 'dueHeader');
const OPENED = at(T, 'opened');
const dueTitle = rectOf(T, OPENED, 'dueTitle');
const keyPoints = rectOf(T, OPENED, 'keyPoints');
const TAB2 = at(T, 'tab2');
const bellBtn = rectOf(T, TAB2, 'bell');
const SHEET = at(T, 'sheet');
const smartRow = rectOf(T, SHEET, 'smart');
const weekendRow = rectOf(T, SHEET, 'weekend');
const saveBtn = rectOf(T, SHEET, 'save');
const TAB3 = at(T, 'tab3');
const tickRow = rectOf(T, TAB3, 'todoLast');
const TICKED = at(T, 'ticked');
const banner = rectOf(T, TICKED, 'recap');
const END_OF_PAGE = recap.view(recap.end).i;
const standout = rectOf(T, END_OF_PAGE, 'standout');
const CARD = at(T, 'cardSettled');
const title = rectOf(T, CARD, 'detailTitle');

/** the reading window (the approved cut): the header under the band's solid
 *  paper, the tab bar below the frame; it breathes while the page is read */
const WINDOW = { cx: 196.5, cy: 426, z: 2.35, fx: 540, fy: 1135 };
const WINDOW_END = { cy: 428, z: 2.38 };
/** where a read puts its subject: just under the clear edge of the band */
const TOP = BAND.clear + 60;

/** the glide ends on the Standout (its top just under the empty band) and
 *  the question under it */
const GLIDE_CAMERA = standout[1] + (WINDOW.fy - TOP) / WINDOW_END.z - WINDOW_END.cy;

/**
 * (light revisit) THE CLOSE FRAMINGS before the recap: one subject at a time,
 * 2.5px a point (the app's 15pt type reads at 37px), its top just under the
 * band, everything that matters above the bottom 35% Reels covers. `y` is
 * the screen point that sits at TOP.
 */
const Z = 2.5;
const shot = (y: number, z = Z) => ({ cx: 196.5, cy: y, z, fx: 540, fy: TOP });
const DUE_SHOT = shot(dueHeader[1] - 10);
const SAVE_SHOT = shot(dueTitle[1] - 24);
const POINTS_SHOT = shot(keyPoints[1] - 24);
const SHEET_SHOT = shot(smartRow[1] + 6);
/** Save low in the frame, and the toast that replaces the sheet under it */
const SAVE_BTN_SHOT = shot(saveBtn[1] + saveBtn[3] - (1150 - TOP) / Z);
/** the V60 step at the foot of the safe frame, the steps above it */
const TODO_SHOT = shot(tickRow[1] + tickRow[3] + 10 - (1220 - TOP) / Z);

/** the screen point the first framing puts under the opening's point: the
 *  iris opens from it */
const IRIS = { x: 196.5, y: DUE_SHOT.cy + (POINT.y - DUE_SHOT.fy) / DUE_SHOT.z };

const keys: Key[] = [
  // the Revisit tab, through the iris; a breath of tilt that settles
  { f: OPENING.iris[0] - OPEN, ...DUE_SHOT, rx: -4 },
  { f: HITS.settle, rx: 0, ease: EASE_MODAL },
  // 1. DUE: the save opens; its title, then down to its Key Points
  { f: HITS.openTap, cy: DUE_SHOT.cy + 2, ease: linear },
  { f: HITS.openTap + 20, ...SAVE_SHOT, ease: EASE_IN_OUT },
  { f: HITS.keyPoints[0], cy: SAVE_SHOT.cy + 3, ease: linear },
  { f: HITS.keyPoints[1], ...POINTS_SHOT, ease: EASE_IN_OUT },
  { f: HITS.back, cy: POINTS_SHOT.cy + 4, ease: linear },
  // back on the list, the bell in frame
  { f: HITS.back + 20, ...DUE_SHOT, ease: EASE_IN_OUT },
  // 2. REMIND: up onto the sheet's choices as it slides in
  { f: HITS.bell, cy: DUE_SHOT.cy + 2, ease: linear },
  { f: HITS.bell + 22, ...SHEET_SHOT, ease: EASE_IN_OUT },
  { f: HITS.weekend + 2, cy: SHEET_SHOT.cy + 3, ease: linear },
  // down to Save as the choice lands
  { f: HITS.save - 6, ...SAVE_BTN_SHOT, ease: EASE_IN_OUT },
  // the toast confirms where Save was
  { f: HITS.todo[0], cy: SAVE_BTN_SHOT.cy + 3, ease: linear },
  // 3. TO-DO: up to the "Do this" list
  { f: HITS.todo[1], ...TODO_SHOT, ease: EASE_IN_OUT },
  { f: HITS.travel[0], cy: TODO_SHOT.cy + 4, ease: linear },
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
  // the save opens: the camera eases up and back to the whole card
  { f: HITS.cardTap + 48, cx: 196.5, cy: 300, z: 2.1, fx: 540, fy: TOP + 10 + (300 - title[1]) * 2.1, ease: EASE_IN_OUT },
  { f: HITS.out - 16, cy: 316, z: 2.14, ease: linear },
  // thrown out of frame, into the lockup
  { f: HITS.out + 14, fx: -760, z: 2.4, ease: EASE_IN_OUT },
];

export const Revisit: React.FC<{ f: number }> = ({ f }) => {
  if (f > HITS.out + 15 || f < OPENING.iris[0] - OPEN) return null;
  // (round 4) the tab arrives through the opening's point: an iris from the
  // point's own size, centred on the screen point under it
  const opened = prog(f + OPEN, OPENING.iris[0], OPENING.iris[1], EASE_IN_OUT);
  const iris = opened < 1 ? { x: IRIS.x, y: IRIS.y, r: mix(POINT_R / DUE_SHOT.z, 980, opened) } : null;

  const scrolled = scrollAt(f);
  const scroll = recap.view(scrolled);
  // (light revisit) before the recap the app's transitions play at their
  // real speed: two captured 60fps frames an output frame, from the frame
  // the app first answers the tap
  const real = (mark: string, hit: number, n: number) => at(T, mark, Math.min(n, 2 * (f - hit) + 1));
  const i =
    f < HITS.openTap
      ? TAB
      : f < HITS.back
        ? real('open', HITS.openTap, 40)
        : f < HITS.bell
          ? real('back', HITS.back, 40)
          : f < HITS.weekend
            ? real('bell', HITS.bell, 40)
            : f < HITS.save
              ? real('weekend', HITS.weekend, 20)
              : f < HITS.tick
                ? real('save', HITS.save, 60)
                : f < HITS.travel[1]
                  ? // the tick; its last frame, the toast still up, holds until
                    // the camera has left the toast below the frame
                    real('tick', HITS.tick, 39)
                  : f < HITS.recapTap
                    ? TICKED
                    : f < READS[0][0]
                      ? at(T, 'expand', Math.min(35, f - HITS.recapTap))
                      : f < HITS.cardTap
                        ? scroll.i
                        : f < HITS.cardTap + 39
                          ? // (the tap lands on the first frame the app visibly answers, +1)
                            at(T, 'card', f - HITS.cardTap + 1)
                          : CARD;
  const reading = f >= READS[0][0] && f < HITS.cardTap;

  const cam = camAt(keys, f);
  // the camera takes up the step's rounding while the page is read
  const view = reading ? { ...cam, cy: cam.cy - scroll.dy } : cam;
  // motion blur from what moves on screen: the camera and the page together
  const camV = camVelocity(keys, f, 1);
  const motion = reading ? { x: camV.x, y: camV.y - cam.z * (scrolled - scrollAt(f - 1)) } : camV;

  // (light revisit) THE SPOTLIGHT: one subject at a time, the rest washed
  // back. The due save (with its "Due now"), then "This weekend", then Save,
  // then the V60 step that is ticked off
  const dueSpot: typeof dueRow = [dueRow[0], dueHeader[1] - 4, dueRow[2], dueRow[1] + dueRow[3] - dueHeader[1] + 4];
  const spot =
    f < HITS.back
      ? { rect: dueSpot, on: prog(f, HITS.due[0], HITS.due[1]) * (1 - prog(f, HITS.openTap + 2, HITS.openTap + 10)) }
      : f < HITS.save + 8
        ? {
            rect: mixRect(weekendRow, saveBtn, prog(f, HITS.weekend + 6, HITS.save - 6, EASE_IN_OUT)),
            on: prog(f, HITS.weekend - 20, HITS.weekend - 6) * (1 - prog(f, HITS.save + 1, HITS.save + 7)),
            radius: f < HITS.weekend + 6 ? 6 : 12,
          }
        : { rect: tickRow, on: prog(f, HITS.todo[0] + 8, HITS.todo[1] + 8) * (1 - prog(f, HITS.tick + 2, HITS.tick + 8)), radius: 6 };

  // the Standout: up as the glide lands on it, down before it is tapped
  const up = prog(f, HITS.standout - 1, HITS.standout + 7, EASE_SPRING) * (1 - prog(f, HITS.standoutDrop, HITS.standoutDrop + 14, EASE_MODAL));
  const lifted = reading && f >= HITS.standout - 2 ? rectOf(T, i, 'standout') : null;

  // the recap's taps (the approved cut's, drawn as this clip's Touch)
  const bannerTap = { x: banner[0] + banner[2] * 0.4, y: banner[1] + banner[3] / 2 };
  const standoutTap = center(standout);

  return (
    <AbsoluteFill>
      <AppShot take={T} i={i} cam={view} motion={motion} iris={iris}>
        <Spotlight rect={spot.rect} on={spot.on} radius={spot.radius} />
        <Touch x={dueOpen[0] + 80} y={dueOpen[1] + 14} f={f} hit={HITS.openTap} />
        <Touch x={center(bellBtn).x} y={center(bellBtn).y} f={f} hit={HITS.bell} />
        <Touch x={weekendRow[0] + 110} y={center(weekendRow).y} f={f} hit={HITS.weekend} />
        <Touch x={center(saveBtn).x} y={center(saveBtn).y} f={f} hit={HITS.save} />
        {/* the V60 step's circle: "Mark as done" */}
        <Touch x={tickRow[0] + 20} y={tickRow[1] + 22} f={f} hit={HITS.tick} />
        <Touch x={bannerTap.x} y={bannerTap.y} f={f} hit={HITS.recapTap} />
        {lifted && up > 0.01 && <Lift take={T} i={i} rect={lifted} radius={16} lift={up * 0.8} rise={4} grow={0.03} ring={0.6 * up} />}
        <Touch x={standoutTap.x} y={standoutTap.y} f={f} hit={HITS.cardTap} />
      </AppShot>
    </AbsoluteFill>
  );
};
