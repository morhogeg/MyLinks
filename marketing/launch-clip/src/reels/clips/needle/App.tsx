import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HITS } from '../../../../clips/needle-timeline.mjs';
import { AppShot, Lift, Ping, Tap } from '../../kit/AppShot';
import { camAt, camVelocity, type Key } from '../../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, prog } from '../../kit/curves';
import { addTakes, at, rectOf, takeOf } from '../../kit/takes';
import { GATHER_Y } from './field';
import TAKES from './takes.json';
import { NEEDLE } from './variant';

/**
 * The real app in FIND THE BOOK (take `clips/needle/app`, capture/shoot.mjs
 * `needleClip`, today's web/ on main; the video's is `clips/needle/video`):
 * Ask, on the same account the field is made of.
 *
 *  ask     the gathered mark IS Ask's mark: the cut lands on it, same size,
 *          same place, and the screen irises open around it as the camera
 *          pulls back: "What do you want to recall? Answers come only from
 *          your 53 saves, with sources you can open."
 *  type    down to the composer: the half-remembered question, typed a
 *          character an output frame; the thumb sends it (the cut)
 *  answer  the dive out of the needle lands INSIDE the answer, on its one
 *          source (Sam's screenshot, the same card), and pulls back to the
 *          question, the answer and the citation, which is pinged (the
 *          video's ping is the answer's key moment, the minute: 3:16)
 */

addTakes(TAKES);

export const T = NEEDLE.take;
const linear = (t: number) => t;

/** the app's mark, settled (its own entry is over by here), in points */
const SETTLED = at(T, 'typing', -6);
/** the mark's ink box on that frame, measured off the capture (pixels at
 *  DPR 4 / 4): the glyph is 36.5pt wide, centred here */
export const APP_MARK = { cx: 197.0, cy: 246.5, ink: 36.5 };
/** the match: the camera that puts Ask's mark where the gathered mark is */
export const MATCH_Z = 4.0;
export const MATCH_INK_PX = APP_MARK.ink * MATCH_Z;

const TYPED = takeOf(T).marks.typed - takeOf(T).marks.typing;
const COMPOSER_Y = 791; // the composer's bottom line, where the text sits (points)
const SEND = rectOf(T, at(T, 'typed'), 'send');
const CITE = rectOf(T, at(T, 'sources', 40), 'cite1');
/** what is pinged: the citation (a chip), or the video's minute (bold text
 *  in the answer: small, so it rises further and its rings reach wider) */
const MINUTE = NEEDLE.ping === 'time';
const [px, py, pw, ph] = rectOf(T, at(T, 'sources', 40), NEEDLE.ping);
// (the minute's box is its text's own: a little air around it, and the full
// stop after it inside, not cut in half)
const PING: typeof CITE = MINUTE ? [px - 2.5, py - 1, pw + 6.5, ph + 2] : [px, py, pw, ph];
const PING_R = MINUTE ? 6 : 12;

/** the take's frame for an output frame */
export const frameAt = (f: number) => {
  if (f < HITS.typing) return SETTLED;
  // the question, a character an output frame
  if (f < HITS.typing + TYPED) return at(T, 'typing', f - HITS.typing);
  if (f < HITS.answer) return at(T, 'typed', Math.min(19, (f - HITS.typing - TYPED) * 2));
  // the answer, settled, its source sliding in at the app's own speed
  return at(T, 'sources', Math.min(89, (f - HITS.answer) * 2));
};

export const appKeys: Key[] = [
  // the cut: Ask's mark exactly where the gathered one was
  { f: HITS.ask, cx: APP_MARK.cx, cy: APP_MARK.cy, z: MATCH_Z, fx: 540, fy: GATHER_Y },
  // the pull-back continues the mark's own, onto the empty Ask screen
  { f: HITS.ask + 24, cx: 196.5, cy: 352, z: 2.62, fx: 540, fy: 980, ease: EASE_MODAL },
  { f: HITS.typing - 12, z: 2.68, ease: linear },
  // down to the composer as the first letter lands
  { f: HITS.typing + 4, cx: 196.5, cy: COMPOSER_Y, z: 2.64, fx: 540, fy: 1090, ease: EASE_IN_OUT },
  { f: HITS.tap + 4, z: 2.74, ease: linear },
  { f: HITS.send - 1, z: 2.76, ease: linear },
  // (the warp in between: the field's own camera)
  // the dive out of the needle lands inside the answer, on its source…
  { f: HITS.answer, cx: 170, cy: CITE[1] + CITE[3] / 2, z: 3.9, fx: 540, fy: 1000 },
  // …and pulls back to the question, the answer and the citation
  { f: HITS.answer + 26, cx: 196.5, cy: 335, z: 2.55, fx: 540, fy: 1180, ease: EASE_MODAL },
  { f: HITS.lockup, z: 2.62, ease: linear },
];

/** the citation's ping (one source: one ping, two rings) */
const pop = (df: number) => (df <= 0 ? 0 : (df / 3) * Math.exp(1 - df / 3));

export const App: React.FC<{ f: number }> = ({ f }) => {
  const inAsk = f >= HITS.ask && f < HITS.send;
  const inAnswer = f >= HITS.answer && f < HITS.lockup;
  if (!inAsk && !inAnswer) return null;
  const i = frameAt(f);
  const cam = camAt(appKeys, f);
  const v = camVelocity(appKeys, f, 1);
  // the iris: out from Ask's mark, open as the pull-back settles
  const r = prog(f, HITS.ask, HITS.ask + 16, EASE_IN_OUT);
  const iris = inAsk && r < 0.999 ? { x: APP_MARK.cx, y: APP_MARK.cy, r: 24 + r * 900 } : null;
  // the answer gives way to the paper for the sign-off
  const gone = prog(f, HITS.lockup - 15, HITS.lockup - 3, EASE_IN_OUT);
  // the source: up as the camera settles, pinged on its beat
  const up = prog(f, HITS.ping - 6, HITS.ping + 6, EASE_MODAL);
  const p = pop(f - HITS.ping);
  return (
    <AbsoluteFill>
      <AppShot take={T} i={i} cam={cam} motion={{ x: v.x, y: v.y }} iris={iris} shadow={inAsk ? r : 1} opacity={1 - gone}>
        {inAnswer && (
          <>
            <Ping rect={PING} t={prog(f, HITS.ping, HITS.ping + 16, linear)} radius={PING_R} reach={MINUTE ? 22 : 16} width={2.2} alpha={0.55} dy={-1.5 * up} />
            <Ping rect={PING} t={prog(f, HITS.ping + 4, HITS.ping + 26, linear)} radius={PING_R} reach={MINUTE ? 44 : 28} width={1.5} alpha={0.3} dy={-1.5 * up} />
            <Lift take={T} i={i} rect={PING} radius={PING_R} lift={Math.max(up, 0.002)} rise={1.5 + 1.5 * p} grow={MINUTE ? 0.08 + 0.08 * p : 0.02 + 0.03 * p} ring={0.6 * up + 0.35 * p} />
          </>
        )}
        {/* the thumb sends it */}
        {inAsk && <Tap x={SEND[0] + SEND[2] / 2} y={SEND[1] + SEND[3] / 2} t={prog(f, HITS.tap - 4, HITS.tap + 8, linear)} size={40} tone="light" />}
      </AppShot>
    </AbsoluteFill>
  );
};
