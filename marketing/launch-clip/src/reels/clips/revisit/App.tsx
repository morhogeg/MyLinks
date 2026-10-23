import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { HITS } from '../../../../clips/revisit-timeline.mjs';
import { AppShot, SCREEN_RADIUS, Tap } from '../../kit/AppShot';
import type { Cam } from '../../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, prog } from '../../kit/curves';
import { addTakes, frameSrc, rectOf, takeOf, type Rect } from '../../kit/takes';
import { camShift, smoothCam, type SKey } from './smooth';
import TAKES from './takes.json';

/**
 * The real app in TICK IT OFF (take `clips/revisit/app`, capture/shoot.mjs
 * `revisitClip`, today's web/ on main), one continuous use of it:
 *
 *  card    under the torn-off sheet: Home, the video's card on top of the
 *          feed, summed up by the app ("Machina watched it.")
 *  recap   up to this week's synthesis, tapped open in place (the app opens
 *          it in one frame; the reel unrolls the open page down over the
 *          closed one from the tap, round 4); its first paragraph names the
 *          video and "the smallest step you can take today", which is
 *          underlined in ink
 *  list    (under the landing sheet) the Revisit tab, scrolled to "Do this":
 *          five lines, five saves; the pull-out lands the ink rows on them
 *          and each line is written in (Revisit.tsx `PullOut`)
 *  tick    the video's line ticked, the rest an 8th apart, at HALF SPEED
 *          (round 4: rolled at 120fps; at the app's speed each row's 280ms
 *          fold was two frames and the list snapped up five times); the rows
 *          fold away to "All done. New tasks arrive with your saves."
 *  wide    back out to the tab's top: the review row, the reminder that came
 *          due, "All done.", this week's synthesis (the frame after the Undo
 *          toasts timed out)
 */

addTakes(TAKES);

export const T = 'clips/revisit/app';
const M = takeOf(T).marks as Record<string, number>;
const linear = (t: number) => t;

/** the open page unrolls over the closed one this long after the tap, at
 *  once and slowing (about 8 frames to the frame's foot) */
const REVEAL = 16;
const UNROLL = (t: number) => 1 - Math.pow(1 - t, 2.2);

/** the take's frame for an output frame */
export const frameAt = (f: number) => {
  // (the open page is drawn over the closed one while it unrolls: `Reveal`)
  if (f < HITS.tapRecap + REVEAL) return M.home;
  if (f < HITS.land + 12) return M.read;
  if (f < HITS.tick) return M.list;
  // the ticks at half speed: the 120fps roll, two of its frames an output
  // frame (the page does not move under them: round 3's Brews below "Do
  // this" keep it from clamping)
  if (f < REST_AT) return Math.min(M.after - 1, M.tick + Math.round((f - HITS.tick) * 2));
  if (f < UP_AT) return M.rest;
  return Math.floor(upPos(f));
};
/**
 * (round 3) The wide: the same tab, at the same scroll, once the Undo toasts
 * have timed out (`rest`, cross-dissolved in over REST_AT − 5 … REST_AT,
 * while the toasts are still off the bottom of the frame), then scrolled
 * back to its top by the app itself (the take's `up` roll, 2pt a frame, eased
 * here) as the camera pulls back.
 */
const REST_AT = HITS.wide + 4;
const UP_AT = HITS.wide + 9;
const UP_END = HITS.lockup - 6;
/** where the scroll-up is, in take frames, fractional: the frame after is
 *  laid over by the fraction (round 4: whole frames stepped the slow ends) */
export const upPos = (f: number) => M.up + prog(f, UP_AT, UP_END, EASE_IN_OUT) * (M.clean - M.up);

/** the list frame's anchors (points) */
const R = (k: string, i = M.list) => rectOf(T, i, k);
export const LIST = {
  doHead: R('doHead'),
  rows: [0, 1, 2, 3, 4].map((k) => ({ row: R(`row${k}`), task: R(`task${k}`), card: R(`card${k}`), tick: R(`tick${k}`) })),
};
const CARD = rectOf(T, M.home, 'videoCard');
const BANNER = rectOf(T, M.home, 'banner');
const PARA = rectOf(T, M.read, 'para1');
const PHRASE: Rect[] = [0, 1, 2].map((k) => {
  try {
    return rectOf(T, M.read, `phrase#${k}`);
  } catch {
    return null;
  }
}).filter(Boolean) as Rect[];

const CARD_CY = CARD[1] + CARD[3] / 2;
/** the card's title, in frame px, when the sheet tears off (list.ts STOP_Y) */
export const CARD_TITLE_Y = 783;

/**
 * (round 4) One smooth camera (smooth.ts): every move eases out of the one
 * before it and into the next, the zoom never stops between the moves it
 * links, and nothing starts with a jolt (the kit's per-segment EASE_MODAL left
 * at 2.25 times its average speed: the push in to the video's line jumped 2.5%
 * of zoom in its first frame, and the camera stopped dead at the synthesis
 * before tearing off again).
 */
export const appKeys: SKey[] = [
  // the tear reveals the video's card, its title where the ink one was; a slow push
  { f: HITS.tear, cx: 196.5, cy: CARD_CY, z: 2.6, fx: 540, fy: 1050 },
  { f: HITS.glide, cy: CARD_CY - 8, z: 2.7 },
  // up to this week's synthesis, on "Sunday", framed with the room under it
  // where its page will open (the banner clear of the caption's band); the
  // tap; on in to the paragraph as the page unrolls. One way all along: the
  // camera used to rise to the banner and come back down, stopping dead on
  // the tap to turn round
  { f: HITS.tapRecap - 1, cy: PARA[1] + PARA[3] / 2 - 8.5, z: 2.78, fy: 1010 },
  { f: HITS.read + 6, cy: PARA[1] + PARA[3] / 2 - 18, z: 3.0, fy: 1000 },
  { f: HITS.land + 12, z: 3.08 },
  // (under the landed sheet) the cut to Revisit: "Do this", the whole list
  { f: HITS.land + 13, cx: 196.5, cy: 368, z: 2.0, fx: 540, fy: 1050 },
  { f: HITS.push2, z: 2.02 },
  // in to the video's line
  { f: HITS.push2 + 34, cy: LIST.rows[0].row[1] + 70, z: 2.9, fy: 1000 },
  { f: HITS.tick, z: 2.96 },
  // over the list as it ticks off and folds toward its header, onto "All done."
  { f: HITS.allDone + 4, cy: LIST.doHead[1] + 70, z: 2.8, fy: 980 },
  // back out to the tab's top (the review row, the reminder, "All done.",
  // this week's synthesis), and on out through the dissolve
  { f: HITS.lockup - 4, cy: 362, z: 2.2, fy: 1050 },
  { f: HITS.lockup + 4, z: 2.12 },
];
const CUTS = [HITS.land + 13];

export const camFor = smoothCam(appKeys);

/** a screen point → frame px, through the camera at f */
export const toFrame = (f: number, sx: number, sy: number) => {
  const c = camFor(f);
  return { x: c.fx + (sx - c.cx) * c.z, y: c.fy + (sy - c.cy) * c.z, z: c.z };
};

/** the row's own white, measured off the capture (masks match it exactly) */
const ROW_BG = '#FFFFFF';

/** a line of the real task text, hidden until it is written (0) or shown (1) */
const Wipe: React.FC<{ rect: Rect; t: number }> = ({ rect, t }) => {
  if (t >= 1) return null;
  const [x, y, w, h] = rect;
  // the cover's left edge runs right: the line appears left to right
  const x0 = x - 2 + (w + 6) * t;
  return <div style={{ position: 'absolute', left: x0, top: y - 1, width: x + w + 4 - x0, height: h + 2, background: ROW_BG }} />;
};

/** the rewrite's clock for row r (Revisit.tsx PullOut draws the ink side) */
export const rowAt = (r: number) => HITS.rewrite + 6 * r;

/**
 * The synthesis, opening (round 4): the app opens it in a single frame (the
 * card under it gone, an empty page, the text fading in), which read as a
 * cut. The open page (`read`) is unrolled down over the closed one instead,
 * from the banner's top edge, a soft edge leading; above the edge the two
 * frames are the same pixels.
 */
const Reveal: React.FC<{ t: number; cam: Cam; motion: { x: number; y: number } }> = ({ t, cam, motion }) => {
  if (t <= 0) return null;
  const SOFT = 46;
  const edge = BANNER[1] + t * (852 + SOFT - BANNER[1]);
  const mask = `linear-gradient(180deg, #000 0px, #000 ${(edge - SOFT).toFixed(2)}px, transparent ${edge.toFixed(2)}px)`;
  // the same shutter as the frame under it (AppShot: 0.14 × px a frame,
  // capped at 10), here in points
  const mb = { x: Math.min(10, Math.abs(motion.x) * 0.14) / cam.z, y: Math.min(10, Math.abs(motion.y) * 0.14) / cam.z };
  const blur = mb.x * cam.z > 1 || mb.y * cam.z > 1;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: 393,
        height: 852,
        borderRadius: SCREEN_RADIUS,
        overflow: 'hidden',
        maskImage: mask,
        WebkitMaskImage: mask,
      }}
    >
      {blur && (
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <filter id="revisit-reveal-mb" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation={`${mb.x.toFixed(3)} ${mb.y.toFixed(3)}`} />
          </filter>
        </svg>
      )}
      <Img src={frameSrc(T, M.read)} style={{ width: '100%', height: '100%', display: 'block', filter: blur ? 'url(#revisit-reveal-mb)' : undefined }} />
    </div>
  );
};

export const App: React.FC<{ f: number }> = ({ f }) => {
  if (f < HITS.tear || f >= HITS.lockup + 2) return null;
  const i = frameAt(f);
  const cam = camFor(f);
  const v = f >= HITS.tear + 1 ? camShift(camFor, f, CUTS) : { x: 0, y: 0 };
  const inHome = f < HITS.land + 13;
  const inList = f >= HITS.land + 13 && f < HITS.tick;
  // the underline under "the smallest step you can take today"
  const ul = prog(f, HITS.underline, HITS.underline + 14, EASE_IN_OUT);
  const total = PHRASE.reduce((s, r) => s + r[2], 0);
  // the dissolve into the sign-off: the tab goes out of focus as it recedes,
  // under the paper (Brand.tsx signOffPaper), while the mark draws in over it
  const gone = prog(f, HITS.lockup - 14, HITS.lockup + 1, EASE_IN_OUT);
  // the swap to the tab after the toasts timed out: a short cross-dissolve
  const clean = prog(f, REST_AT - 6, REST_AT, EASE_IN_OUT);
  // the scroll back up: the frame after laid over by the fraction
  const up = f >= UP_AT ? upPos(f) - i : 0;
  return (
    <AbsoluteFill>
      <AppShot take={T} i={i} cam={cam} motion={{ x: v.x, y: v.y }} blur={6 * gone}>
        {/* the synthesis unrolling open from the tap */}
        {inHome && f < HITS.tapRecap + REVEAL && <Reveal t={prog(f, HITS.tapRecap, HITS.tapRecap + REVEAL, UNROLL)} cam={cam} motion={v} />}
        {/* the thumb opens this week's synthesis */}
        {inHome && <Tap x={BANNER[0] + BANNER[2] / 2} y={BANNER[1] + BANNER[3] / 2} t={prog(f, HITS.tapRecap - 4, HITS.tapRecap + 8, linear)} size={40} />}
        {inHome && ul > 0 && (
          <>
            {PHRASE.map((r, k) => {
              const before = PHRASE.slice(0, k).reduce((s, q) => s + q[2], 0);
              const t = Math.max(0, Math.min(1, (ul * total - before) / r[2]));
              if (t <= 0) return null;
              return (
                <div
                  key={k}
                  style={{
                    position: 'absolute',
                    left: r[0] - 1,
                    top: r[1] + r[3] - 1.2,
                    width: (r[2] + 2) * t,
                    height: 2.1,
                    borderRadius: 1.2,
                    background: 'rgba(17,24,39,0.92)',
                  }}
                />
              );
            })}
          </>
        )}
        {/* the list, before each line is written: the real rows with their
            task, title and circle covered in the row's own white */}
        {inList &&
          LIST.rows.map(({ task, card, tick }, r) => {
            const R0 = rowAt(r);
            const lines = Math.max(1, Math.round(task[3] / 19.9));
            const lh = task[3] / lines;
            return (
              <React.Fragment key={r}>
                {Array.from({ length: lines }, (_, j) => (
                  <Wipe key={j} rect={[task[0], task[1] + j * lh, task[2], lh]} t={prog(f, R0 + 6 + 3 * j, R0 + 11 + 3 * j, EASE_IN_OUT)} />
                ))}
                <div
                  style={{
                    position: 'absolute',
                    left: card[0] - 2,
                    top: card[1] - 1,
                    width: card[2] + 4,
                    height: card[3] + 2,
                    background: ROW_BG,
                    opacity: 1 - prog(f, R0 + 8, R0 + 12, EASE_IN_OUT),
                  }}
                />
                <div
                  style={{
                    position: 'absolute',
                    left: tick[0] + tick[2] / 2 - 13,
                    top: tick[1] + tick[3] / 2 - 13,
                    width: 26,
                    height: 26,
                    borderRadius: 13,
                    background: ROW_BG,
                    opacity: 1 - prog(f, R0, R0 + 4, EASE_IN_OUT),
                  }}
                />
              </React.Fragment>
            );
          })}
        {/* the thumb on the video's circle (the rest tick on the beat after) */}
        {/* the beat before the tick: an ink ring closes in on the video's
            circle as the voice reaches "one" */}
        {f >= HITS.tick - 20 && f < HITS.tick + 3 && (() => {
          const [x, y, w, h] = LIST.rows[0].tick;
          const t = prog(f, HITS.tick - 20, HITS.tick, EASE_IN_OUT);
          const r = 11 + 30 * (1 - t);
          const a = 0.5 * prog(f, HITS.tick - 20, HITS.tick - 12, EASE_IN_OUT) * (1 - prog(f, HITS.tick - 1, HITS.tick + 3, linear));
          return (
            <div
              style={{
                position: 'absolute',
                left: x + w / 2 - r,
                top: y + h / 2 - r,
                width: 2 * r,
                height: 2 * r,
                borderRadius: r,
                boxShadow: `0 0 0 ${(1.1 + 0.9 * t).toFixed(2)}px rgba(20,20,27,${a.toFixed(3)})`,
              }}
            />
          );
        })()}
        {f >= HITS.tick - 4 && f < HITS.tick + 40 &&
          [0, 1, 2, 3, 4].map((r) => {
            const tk = rectOf(T, M.tick + r * 15, `tick${r}`);
            const t0 = HITS.tick + r * 7.5;
            return <Tap key={r} x={tk[0] + tk[2] / 2} y={tk[1] + tk[3] / 2} t={prog(f, t0 - 4, t0 + 8, linear)} size={34} />;
          })}
      </AppShot>
      {clean > 0 && f < REST_AT && (
        <AbsoluteFill style={{ opacity: clean }}>
          <AppShot take={T} i={M.rest} cam={cam} motion={{ x: v.x, y: v.y }} />
        </AbsoluteFill>
      )}
      {up > 0.01 && i < M.clean && (
        <AbsoluteFill style={{ opacity: up }}>
          <AppShot take={T} i={i + 1} cam={cam} motion={{ x: v.x, y: v.y }} blur={6 * gone} shadow={0} edge={0} />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
