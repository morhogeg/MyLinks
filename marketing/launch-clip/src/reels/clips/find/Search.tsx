import React from 'react';
import { AbsoluteFill } from 'remotion';
import { DELETE_FRAMES, HITS, TYPE_FRAMES } from '../../../../clips/find-timeline.mjs';
import { AppShot, Lift, Tap } from '../../kit/AppShot';
import { camAt, camVelocity, type Key } from '../../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, prog } from '../../kit/curves';
import { addTakes, at, center, rectOf } from '../../kit/takes';
import TAKES from './takes.json';

/**
 * FIND, the whole app side of the clip: one continuous use of Home and its
 * search (take `clips/find/search`, capture/shoot.mjs `findClip`).
 *
 *  hook   the feed scrolls past at speed and back: too many saves to scan;
 *         the camera goes to the search field as Machina is named, and the
 *         thumb taps it on the beat.
 *  1.     "easy dinner, empty fridge" types under a rack focus (the field
 *         sharp, the app's live matches soft beneath it), holds a beat
 *         whole, and ONE card lands with the app's own entrance: Marcella
 *         Hazan's tomato sauce, which shares no word with it.
 *  2.     deleted a word at a time; "sardinia swim spot": no save says
 *         "swim", and the app's "Close matches" offers the one that has the
 *         rest (Cala Goloritzé).
 *  3.     "youtube": the Sources row offers YouTube as it types; one tap,
 *         and the feed is every video saved.
 *  4.     the first of them tapped open: its gist and its related saves.
 *  Then thrown out of frame into the lockup (End.tsx).
 *
 * Emphasis is the reel's (a lift and an ink ring, on the next beat after the
 * app's own arrival, on the settled box). All in OUTPUT frames: a 60fps roll
 * plays one captured frame per frame, a typed character TYPE_FRAMES (K = 2).
 */

addTakes(TAKES);

const T = 'clips/find/search';
const S = HITS;
const linear = (t: number) => t;

/** frames a mark's run lasts in the take */
const span = (from: string, to: string) => at(T, to) - at(T, from);
const SCROLL = span('scroll', 'top'); // the hook's scroll steps
const CHARS1 = span('typing1', 'result1');
const STEPS1 = span('clear1', 'typing2');
const CHARS2 = span('typing2', 'result2');
const STEPS2 = span('clear2', 'typing3');
const CHARS3 = span('typing3', 'sources');
/** the Sources row is offered from the first keystroke; the app's "No
 *  matches" panel under it (sources match by name, cards by content) only
 *  arrives 11 captured frames after the typing: the tap lands before it */
const OFFERED = 10;
const typed3 = S.type3 + (CHARS3 - 1) * TYPE_FRAMES + 2;

/** the take's frame for an output frame */
const frameAt = (f: number) => {
  if (f < S.scroll) return at(T, 'home');
  // the hook: down the feed a step a frame, then back up twice as fast
  if (f < S.scrollBack) return at(T, 'scroll', Math.min(SCROLL - 1, f - S.scroll));
  if (f < S.scrollBack + SCROLL / 2) return at(T, 'scroll', Math.max(0, SCROLL - 1 - 2 * (f - S.scrollBack)));
  if (f < S.fieldTap) return at(T, 'top');
  if (f < S.type1) return at(T, 'focus', f - S.fieldTap); // 60fps: one a frame
  if (f < S.found1) return at(T, 'typing1', Math.min(CHARS1 - 1, (f - S.type1) / TYPE_FRAMES));
  if (f < S.clear1) return at(T, 'result1', Math.min(23, f - S.found1));
  if (f < S.type2) return at(T, 'clear1', Math.min(STEPS1 - 1, (f - S.clear1) / DELETE_FRAMES));
  if (f < S.found2) return at(T, 'typing2', Math.min(CHARS2 - 1, (f - S.type2) / TYPE_FRAMES));
  if (f < S.clear2) return at(T, 'result2', Math.min(23, f - S.found2));
  if (f < S.type3) return at(T, 'clear2', Math.min(STEPS2 - 1, (f - S.clear2) / DELETE_FRAMES));
  if (f < typed3) return at(T, 'typing3', Math.min(CHARS3 - 1, (f - S.type3) / TYPE_FRAMES));
  if (f < S.chipTap) return at(T, 'sources', Math.min(OFFERED, f - typed3));
  if (f < S.cardTap) return at(T, 'filtered', Math.min(35, f - S.chipTap));
  return at(T, 'detail', Math.min(39, f - S.cardTap));
};

/** how far the capture has scrolled at an output frame (points), for the
 *  motion blur of the hook's scroll */
const STEP = 45;
const scrolled = (f: number) =>
  f < S.scroll ? 0 : f < S.scrollBack ? Math.min(SCROLL - 1, f - S.scroll) * STEP : Math.max(0, SCROLL - 1 - 2 * (f - S.scrollBack)) * STEP;

/** the beat the narrator reaches "and the saves it connects to" */
const RELATED = 624;

/** the typing framing: the field just under the caption band, big, with
 *  Done in frame; what each query finds lands whole below it */
const TYPE_CAM = { cx: 196.5, cy: 144, z: 2.7, fx: 540, fy: 800 };
/** each card read: the camera answers the landing, leaning in (the field
 *  rises to ~770px, still clear of the caption band) */
const READ_CAM = { cx: 196.5, cy: 300, z: 2.8, fx: 540, fy: 1207 };

export const searchKeys: Key[] = [
  // Home, tilted back a breath and soft, settling as the feed starts to
  // scroll (the tilt's last frame, when the slab re-rasters as 2D, lands on
  // the scroll's first: the rule "a tilt ends on a change")
  { f: 0, cx: 196.5, cy: 330, z: 2.0, fx: 540, fy: 1180, rx: 7 },
  { f: S.scroll, cy: 320, z: 2.1, rx: 0, ease: EASE_MODAL },
  { f: S.scrollBack + SCROLL / 2, cy: 316, z: 2.14, ease: linear },
  // down onto the field as Machina is named, arriving with the tap
  { f: S.fieldTap, ...TYPE_CAM, ease: EASE_IN_OUT },
  { f: S.found1, z: 2.76, ease: linear },
  { f: S.found1 + 16, ...READ_CAM, ease: EASE_MODAL },
  { f: S.back1, z: 2.86, ease: linear },
  { f: S.back1 + 16, ...TYPE_CAM, ease: EASE_IN_OUT },
  { f: S.found2, z: 2.76, ease: linear },
  { f: S.found2 + 16, ...READ_CAM, ease: EASE_MODAL },
  { f: S.back2, z: 2.86, ease: linear },
  { f: S.back2 + 16, ...TYPE_CAM, ease: EASE_IN_OUT },
  { f: S.chipTap, z: 2.78, ease: linear },
  // the tap answered: wider, the feed of every video
  { f: S.chipTap + 20, cx: 196.5, cy: 400, z: 2.15, fx: 540, fy: 1210, ease: EASE_MODAL },
  { f: S.cardTap, cy: 396, z: 2.2, ease: linear },
  // the card opened: its gist…
  { f: S.cardTap + 24, cx: 196.5, cy: 360, z: 2.25, fx: 540, fy: 1180, ease: EASE_MODAL },
  { f: RELATED - 8, cy: 366, ease: linear },
  // …then down to the saves it connects to, as the narrator says so
  { f: RELATED + 24, cy: 640, z: 2.25, fy: 1230, ease: EASE_IN_OUT },
  { f: S.throwOut, cy: 648, z: 2.3, ease: linear },
  // thrown out of frame, into the lockup
  { f: S.lockup + 14, fx: -760, z: 2.36, ease: EASE_IN_OUT },
];

/** the reel's emphasis on the next beat after the app's own arrival, and
 *  gone eased in and out (the FIND clip's measured rule) */
const lift = (f: number, landed: number) =>
  prog(f, landed + 16, landed + 28, EASE_MODAL) * (1 - prog(f, landed + 40, landed + 64, EASE_IN_OUT));

export const Search: React.FC<{ f: number }> = ({ f }) => {
  if (f > S.lockup + 15) return null;
  const i = frameAt(f);
  const cam = camAt(searchKeys, f);
  // motion blur from what moves on screen: the camera, and the hook's scroll
  const camV = camVelocity(searchKeys, f, 1);
  const motion = { x: camV.x, y: camV.y - (scrolled(f) - scrolled(f - 1)) * cam.z };

  // the rack focus: the field (and in 3, the Sources row) sharp while a
  // query types; eased in and out, released as the result arrives
  const rack = Math.max(
    prog(f, S.fieldTap - 8, S.fieldTap + 8, EASE_IN_OUT) * (1 - prog(f, S.found1, S.found1 + 10, EASE_MODAL)),
    prog(f, S.back1 + 4, S.back1 + 20, EASE_IN_OUT) * (1 - prog(f, S.found2, S.found2 + 10, EASE_MODAL)),
    prog(f, S.back2 + 4, S.back2 + 20, EASE_IN_OUT) * (1 - prog(f, S.chipTap, S.chipTap + 10, EASE_MODAL)),
  );
  const open = 1 - prog(f, 0, 16, EASE_MODAL);
  const field = rectOf(T, at(T, 'focus', 8), 'search');
  const chip = rectOf(T, at(T, 'sources', 2), 'sourceChip');
  const bandTo = f >= S.back2 ? chip[1] + chip[3] : field[1] + field[3];
  const tapField = center(rectOf(T, at(T, 'home'), 'search'));
  const card = rectOf(T, at(T, 'filtered', 35), 'firstCard');

  const marcella = rectOf(T, at(T, 'result1', 23), 'marcella');
  const goloritze = rectOf(T, at(T, 'result2', 23), 'goloritze');
  const up1 = f >= S.found1 && f < S.clear1 ? lift(f, S.found1) : 0;
  const up2 = f >= S.found2 && f < S.clear2 ? lift(f, S.found2) : 0;
  // (each Lift stays mounted, at rest, until the screen changes anyway: the
  // lifted copy is its own raster, and removing it on a still frame measured
  // as a one-frame change across the card; so did the lift reaching exactly
  // 0, when the browser flattens the layer: a floor of 0.002 holds it)
  // the chip, as it is offered: up on the beat after the typing, into the tap
  const upChip = prog(f, S.chipTap - 16, S.chipTap - 6, EASE_MODAL) * (1 - prog(f, S.chipTap, S.chipTap + 8, EASE_IN_OUT));

  return (
    <AbsoluteFill>
      <AppShot
        take={T}
        i={i}
        cam={cam}
        motion={motion}
        focus={rack > 0.01 ? { y0: field[1] - 8, y1: bandTo + 8, blur: 0 } : undefined}
        blur={Math.max(open * 4, rack * 12)}
      >
        {/* each pad lands (t 0.35) on the frame the app responds and the tick sounds */}
        <Tap x={tapField.x} y={tapField.y} t={prog(f, S.fieldTap - 10, S.fieldTap + 18, linear)} />
        {f >= S.found1 + 16 && f < S.clear1 && <Lift take={T} i={i} rect={marcella} radius={20} lift={Math.max(up1, 0.002)} rise={1.5} grow={0.012} ring={0.75 * up1} />}
        {f >= S.found2 + 16 && f < S.clear2 && <Lift take={T} i={i} rect={goloritze} radius={20} lift={Math.max(up2, 0.002)} rise={1.5} grow={0.012} ring={0.75 * up2} />}
        {upChip > 0.01 && <Lift take={T} i={i} rect={chip} radius={17} lift={upChip} rise={2} grow={0.04} ring={0.75 * upChip} />}
        <Tap x={center(chip).x} y={center(chip).y} t={prog(f, S.chipTap - 10, S.chipTap + 18, linear)} />
        <Tap x={card[0] + 120} y={card[1] + 40} t={prog(f, S.cardTap - 10, S.cardTap + 18, linear)} />
      </AppShot>
    </AbsoluteFill>
  );
};
