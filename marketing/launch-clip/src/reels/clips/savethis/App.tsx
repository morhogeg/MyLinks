import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HITS, TYPE_FRAMES } from '../../../../clips/savethis-timeline.mjs';
import { AppShot, Lift, Tap } from '../../kit/AppShot';
import { camAt, camVelocity, type Cam, type Key } from '../../kit/camera';
import { EASE_GATHER, EASE_IN_OUT, EASE_MODAL, prog } from '../../kit/curves';
import { addTakes, at, center, rectOf, takeOf } from '../../kit/takes';
import TAKES from './takes.json';

/**
 * The app side of SAVE THIS: one continuous use of Home, the real app
 * (take `clips/savethis/app`, capture/shoot.mjs `savethisClip`).
 *
 *  open    the app irises open around the mark, which lands on the
 *          processing card's own mark: a share of this very reel arriving
 *  read    down to the pill, which narrates the real phases a beat apart,
 *          to "Saved to Machina"; up to the card: its cover is this reel's
 *          first frame, its summary what the reel says
 *  skip    three weeks later: the card's date goes back, and the saves made
 *          since land on top of it, one an 8th
 *  search  Search your saves, tapped on "type"; "never watch it again"
 *          types, and the feed narrows to the one card left
 *  found   the card lifts on its beat; the tagline sits above it
 *  tap     the thumb taps its cover and the camera dives at it (Dive.tsx
 *          takes over once the cover fills the frame's width)
 *
 * App motion plays at its real speed (two 60fps captures an output frame)
 * except where it must read (the result, one a frame).
 */

addTakes(TAKES);

export const T = 'clips/savethis/app';
const S = HITS;
const linear = (t: number) => t;

/** the take's 8th-note runs, from its marks */
const BURY = takeOf(T).marks.buried - takeOf(T).marks.bury0; // 9 saves x 14
const CHARS = takeOf(T).marks.result - takeOf(T).marks.typing;

/** the saves since land one an 8th, the first just before "buried" */
export const BURY_FROM = S.bury - 7;
/** the eighth character ("never wa") is where the feed is down to one */
export const NARROWED = S.type + 7 * TYPE_FRAMES;
/** the typing's last character */
export const TYPED = S.type + (CHARS - 1) * TYPE_FRAMES;

/** the take's frame for an output frame */
export const frameAt = (f: number) => {
  // the card arrived and settled before the iris: open on it in place
  if (f < S.phase0) return at(T, 'phase0');
  // five phases, a beat each, at real speed
  if (f < S.done) return at(T, 'phase0', (f - S.phase0) * 2);
  // read, and "Saved to Machina"
  if (f < S.skip) return at(T, 'done', (f - S.done) * 2);
  // three weeks later: the date goes back (the take's skip, eased over)
  if (f < BURY_FROM) return at(T, 'skip', ((f - S.skip) * 14) / (BURY_FROM - S.skip));
  // the saves since, one an 8th (14 captured frames each, at real speed)
  if (f < S.fieldTap) return at(T, 'bury0', Math.min(BURY + 16, (f - BURY_FROM) * 2));
  // the field tapped: its focus at real speed
  if (f < S.type) return at(T, 'focus', (f - S.fieldTap) * 2);
  // typed a character every TYPE_FRAMES
  if (f <= TYPED) return at(T, 'typing', (f - S.type) / TYPE_FRAMES);
  // the result settling, slowed so it reads, then held
  return at(T, 'result', Math.min(59, f - TYPED - 1));
};

/** where things sit on the captured screen (points) */
const MARK = rectOf(T, at(T, 'phase0'), 'mark');
const PILL = rectOf(T, at(T, 'phase0'), 'pill');
const FIELD = rectOf(T, at(T, 'home'), 'search');
export const CARD = rectOf(T, at(T, 'result', 59), 'card');
export const COVER = rectOf(T, at(T, 'result', 59), 'cover');

/** the camera when the app opens: the processing card, its mark in frame */
const OPEN_CAM: Cam = { cx: 196.5, cy: 330, z: 2.3, fx: 540, fy: 1150, rx: 0, ry: 0, rz: 0 };
/** where the card's mark is in frame on the iris (Opening.tsx lands on it) */
export const MARK_TO = {
  x: OPEN_CAM.fx + (center(MARK).x - OPEN_CAM.cx) * OPEN_CAM.z,
  y: OPEN_CAM.fy + (center(MARK).y - OPEN_CAM.cy) * OPEN_CAM.z,
  size: MARK[2] * OPEN_CAM.z,
};

/** the dive's end: the cover centred and exactly the frame's width, where
 *  its pixels ARE the poster's rows (see Dive.tsx) */
export const DIVE_CAM = { cx: center(COVER).x, cy: center(COVER).y, z: 1080 / COVER[2], fx: 540, fy: 960 };
/** the frame the camera reaches it: the hand-over to the poster */
export const HANDOVER = S.cardTap + 14;

export const appKeys: Key[] = [
  { f: S.iris, ...OPEN_CAM },
  // held while the mark lands on the card's own mark…
  { f: S.iris + 14, ...OPEN_CAM, z: OPEN_CAM.z * 1.02, ease: linear },
  // …then down to the pill, as the narrator starts on the reading
  { f: S.phase0 + 16, cx: 196.5, cy: center(PILL).y, z: 2.85, fx: 540, fy: 1190, ease: EASE_IN_OUT },
  { f: S.done - 4, z: 3.0, ease: linear },
  // "Saved to Machina", and up to the card: its cover, its summary
  { f: S.done + 20, cx: 196.5, cy: 330, z: 2.25, fx: 540, fy: 1180, ease: EASE_IN_OUT },
  { f: S.skip, z: 2.3, ease: linear },
  // three weeks later: back to the whole feed, the card at its top, so the
  // saves since are seen landing on it and pushing it under
  { f: S.skip + 18, cx: 196.5, cy: 430, z: 1.32, fx: 540, fy: 1210, ease: EASE_IN_OUT },
  { f: S.fieldTap - 1, z: 1.26, ease: linear },
  // the field, big, as it is tapped; the feed narrowing below it
  { f: S.fieldTap + 10, cx: 196.5, cy: FIELD[1] + FIELD[3] / 2, z: 2.7, fx: 540, fy: 800, ease: EASE_MODAL },
  { f: TYPED, z: 2.74, ease: linear },
  // the one card left, whole
  { f: TYPED + 14, cx: 196.5, cy: CARD[1] + CARD[3] / 2 - 20, z: 2.15, fx: 540, fy: 1180, ease: EASE_IN_OUT },
  { f: S.cardTap - 8, z: 2.22, ease: linear },
  // a breath back as the thumb comes down on the cover…
  { f: S.cardTap, z: 2.12, ease: EASE_IN_OUT },
  // …and the dive: the cover centred, exactly the frame's width (the hand-over)
  { f: HANDOVER, ...DIVE_CAM, ease: EASE_GATHER },
  // the app rushes on past the frame as the cover opens over it
  { f: S.poster, ...DIVE_CAM, z: DIVE_CAM.z * 1.9, ease: EASE_MODAL },
];

/** the reel's emphasis on the next beat after an arrival, eased away */
const lift = (f: number, landed: number, len = 64) =>
  prog(f, landed, landed + 12, EASE_MODAL) * (1 - prog(f, landed + len - 24, landed + len, EASE_IN_OUT));

export const App: React.FC<{ f: number }> = ({ f }) => {
  if (f < S.iris - 1 || f >= S.poster) return null;
  const i = frameAt(f);
  const cam = camAt(appKeys, f);
  const v = camVelocity(appKeys, f, 1);
  // the iris: a circle from the card's mark, open by the time it lands
  const r = prog(f, S.iris - 1, S.iris + 18, EASE_IN_OUT);
  const iris = r < 0.999 ? { x: center(MARK).x, y: center(MARK).y, r: 6 + r * 790 } : null;
  const up = f >= S.found ? lift(f, S.found, S.cardTap - S.found) : 0;
  const tapCover = { x: center(COVER).x, y: center(COVER).y };
  return (
    <AbsoluteFill>
      <AppShot take={T} i={i} cam={cam} motion={{ x: v.x, y: v.y }} iris={iris} shadow={r}>
        {/* the field, tapped on "type" (the pad lands on the frame the app focuses) */}
        <Tap x={center(FIELD).x - 60} y={center(FIELD).y} t={prog(f, S.fieldTap - 10, S.fieldTap + 18, linear)} />
        {/* the one card, lifted on its beat (kept mounted at rest: its own raster) */}
        {f >= S.found - 2 && (
          <Lift take={T} i={i} rect={CARD} radius={20} lift={Math.max(up, 0.002)} rise={2} grow={0.014} ring={0.7 * up} />
        )}
        {/* the cover, tapped */}
        <Tap x={tapCover.x} y={tapCover.y} t={prog(f, S.cardTap - 10, S.cardTap + 18, linear)} size={40} />
      </AppShot>
    </AbsoluteFill>
  );
};
