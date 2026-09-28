import React from 'react';
import { AbsoluteFill } from 'remotion';
import { DELETE_FRAMES, HITS, TYPE_FRAMES } from '../../../../clips/find-timeline.mjs';
import { AppShot, Lift, Tap } from '../../kit/AppShot';
import { camAt, camVelocity, type Key } from '../../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, prog } from '../../kit/curves';
import { addTakes, at, center, rectOf, takeOf } from '../../kit/takes';
import TAKES from './takes.json';

/**
 * FIND, the whole app side of the clip: one continuous use of the real
 * search field (take `clips/find/search`, capture/shoot.mjs `findClip`).
 *
 *  1. Home settles as the narrator promises "Find it in your own words.";
 *     the thumb taps "Search your saves" on the beat.
 *  2. "easy dinner, empty fridge" types in under a rack focus: the field
 *     sharp, the app's live literal matches flickering soft beneath it, as
 *     they really do. The query holds a beat, whole, then its ONE card lands
 *     on the beat (the app's own card-enter spring, captured at 60fps) and
 *     lifts with the reel's emphasis: a lift and an ink ring, never a
 *     recolour. Marcella Hazan's tomato sauce shares no word with it.
 *  3. Back to the field: the query deleted a word at a time, then "video
 *     about putting things off" types, and the TED talk lands on the
 *     downbeat as the narrator says "Get the one you meant."
 *  4. The screen is thrown out of frame into the lockup (End.tsx).
 *
 * All in OUTPUT frames (clips/find-timeline.mjs): a 60fps roll plays one
 * captured frame per frame and a typed character stays TYPE_FRAMES (K = 2).
 */

addTakes(TAKES);

const T = 'clips/find/search';
const S = HITS;
const linear = (t: number) => t;

/** frames a mark's run lasts in the take (e.g. the typed characters) */
const span = (from: string, to: string) => at(T, to) - at(T, from);
const CHARS1 = span('typing1', 'result1');
const STEPS = span('clear', 'typing2'); // the delete's steps; the last is the empty field
const CHARS2 = span('typing2', 'result2');
const ROLL = takeOf(T).count - at(T, 'result2'); // the result rolls' length

/** the take's frame for an output frame */
const frameAt = (f: number) => {
  if (f < S.fieldTap) return at(T, 'home');
  if (f < S.type1) return at(T, 'focus', f - S.fieldTap); // 60fps: one a frame
  if (f < S.found1) return at(T, 'typing1', Math.min(CHARS1 - 1, (f - S.type1) / TYPE_FRAMES));
  if (f < S.clear) return at(T, 'result1', Math.min(ROLL - 1, f - S.found1));
  if (f < S.type2) return at(T, 'clear', Math.min(STEPS - 1, (f - S.clear) / DELETE_FRAMES));
  if (f < S.found2) return at(T, 'typing2', Math.min(CHARS2 - 1, (f - S.type2) / TYPE_FRAMES));
  return at(T, 'result2', Math.min(ROLL - 1, f - S.found2));
};

/** the typing framing: the field just under the caption band, big, with the
 *  Done button in frame; each result lands whole below it, so the query and
 *  its one card read together in one shot */
const TYPE_CAM = { cx: 196.5, cy: 144, z: 2.7, fx: 540, fy: 800 };
/** each card read: the camera answers the landing, leaning in toward the
 *  card (the field rises to ~770px, still clear of the caption band) */
const READ_CAM = { cx: 196.5, cy: 300, z: 2.8, fx: 540, fy: 1207 };

export const searchKeys: Key[] = [
  // Home, tilted back a breath and soft, settling (to rest) as the kicker
  // arrives…
  { f: 0, cx: 196.5, cy: 300, z: 2.0, fx: 540, fy: 1140, rx: 7 },
  { f: 28, cy: 280, z: 2.2, rx: 2.5, ease: EASE_MODAL },
  // …then from rest, down onto the field as the thumb comes down on it,
  // arriving with the tap (no drift between: a drift that stopped dead for
  // the push measured as a one-frame hitch). The last of the tilt goes with
  // it: the frame it reaches 0 the slab re-rasters as 2D, a visible change
  // on a still shot, masked here by the tap's own
  { f: S.fieldTap, ...TYPE_CAM, rx: 0, ease: EASE_IN_OUT },
  { f: S.found1, z: 2.76, ease: linear },
  // the card lands: the camera answers it, leaning toward the card
  { f: S.found1 + 16, ...READ_CAM, ease: EASE_MODAL },
  { f: S.back, z: 2.86, ease: linear },
  // back up to the field for the second search
  { f: S.back + 16, ...TYPE_CAM, ease: EASE_IN_OUT },
  { f: S.found2, z: 2.76, ease: linear },
  { f: S.found2 + 16, ...READ_CAM, ease: EASE_MODAL },
  { f: S.throwOut, z: 2.88, ease: linear },
  // thrown out of frame, into the lockup
  { f: S.lockup + 14, fx: -760, z: 2.94, ease: EASE_IN_OUT },
];

/**
 * The card's emphasis (the reel's: a lift and an ink ring). The card lands
 * on the beat by the app's own card-enter spring; the lift and ring follow
 * on the NEXT beat, once that entrance has settled, on the arrival curve,
 * and leave eased in and out. Measured, both alternatives were worse: a
 * second spring on top of the app's hung for a frame at its overshoot, and
 * a ring that followed the card while it settled hopped 1.4px on alternate
 * frames (the capture measures boxes to half a point, and the spring's last
 * 1.5pt step every other frame). A small rise and growth: the card sits 8pt
 * under the field, and must not climb over it.
 */
const lift = (f: number, landed: number) =>
  prog(f, landed + 16, landed + 28, EASE_MODAL) * (1 - prog(f, landed + 40, landed + 64, EASE_IN_OUT));
/** each card's box once its entrance has settled (the roll's last frame) */
const settled = (mark: string, card: string) => rectOf(T, at(T, mark, ROLL - 1), card);

export const Search: React.FC<{ f: number }> = ({ f }) => {
  if (f > S.lockup + 15) return null;
  const i = frameAt(f);
  const cam = camAt(searchKeys, f);
  const motion = camVelocity(searchKeys, f, 1);

  // the rack focus: the field sharp while a query types, the feed soft
  // under it; each landing card pulls focus back to the whole screen. It
  // racks in eased at both ends (on a fast-start curve the feed lost 2px of
  // focus in one frame); the release is the card arriving, so it is quick
  const rack = Math.max(
    prog(f, S.fieldTap - 8, S.fieldTap + 8, EASE_IN_OUT) * (1 - prog(f, S.found1, S.found1 + 10, EASE_MODAL)),
    prog(f, S.back + 4, S.back + 20, EASE_IN_OUT) * (1 - prog(f, S.found2, S.found2 + 10, EASE_MODAL)),
  );
  // the first frame is already the app, soft, coming into focus
  const open = 1 - prog(f, 0, 16, EASE_MODAL);
  // (12px under the field: the live matches and the app's own "Searching…"
  // line stay a soft texture, never something to read)
  const field = rectOf(T, at(T, 'focus', 8), 'search');
  const tap = center(rectOf(T, at(T, 'home'), 'search'));

  const second = f >= S.found2;
  const box = second ? settled('result2', 'talk') : settled('result1', 'marcella');
  const landed = second ? S.found2 : S.found1;
  const up = f >= S.found1 && f < S.clear ? lift(f, S.found1) : second ? lift(f, S.found2) : 0;

  return (
    <AbsoluteFill>
      <AppShot
        take={T}
        i={i}
        cam={cam}
        motion={motion}
        focus={rack > 0.01 ? { y0: field[1] - 8, y1: field[1] + field[3] + 8, blur: 0 } : undefined}
        blur={Math.max(open * 4, rack * 12)}
      >
        {/* the pad lands (t 0.35) on fieldTap, the frame the app focuses the
            field and the tick sounds */}
        <Tap x={tap.x} y={tap.y} t={prog(f, S.fieldTap - 10, S.fieldTap + 18, linear)} />
        {up > 0.01 && f >= landed && (
          <Lift take={T} i={i} rect={box} radius={20} lift={up} rise={1.5} grow={0.012} ring={0.75 * up} />
        )}
      </AppShot>
    </AbsoluteFill>
  );
};
