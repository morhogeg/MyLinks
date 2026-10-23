import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HITS } from '../../../../clips/revisit-timeline.mjs';
import { AppShot, Tap } from '../../kit/AppShot';
import { camAt, camVelocity, type Cam, type Key } from '../../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, prog } from '../../kit/curves';
import { addTakes, rectOf, takeOf, type Rect } from '../../kit/takes';
import TAKES from './takes.json';

/**
 * The real app in TICK IT OFF (take `clips/revisit/app`, capture/shoot.mjs
 * `revisitClip`, today's web/ on main), one continuous use of it:
 *
 *  card    under the torn-off sheet: Home, the video's card on top of the
 *          feed, summed up by the app ("Machina watched it.")
 *  recap   up to this week's synthesis, tapped open in place; its first
 *          paragraph names the video and "the smallest step you can take
 *          today", which is underlined in ink
 *  list    (under the landing sheet) the Revisit tab, scrolled to "Do this":
 *          five lines, five saves; the pull-out lands the ink rows on them
 *          and each line is written in (Revisit.tsx `PullOut`)
 *  tick    the video's line ticked, the rest an 8th apart; the camera keeps
 *          "Do this" still while the page settles under it; the rows fold
 *          away to "All done. New tasks arrive with your saves."
 *  wide    back out to the tab's top: the review row, the reminder that came
 *          due, "All done.", this week's synthesis (the frame after the Undo
 *          toasts timed out)
 */

addTakes(TAKES);

export const T = 'clips/revisit/app';
const M = takeOf(T).marks as Record<string, number>;
const linear = (t: number) => t;

/** the take's frame for an output frame */
export const frameAt = (f: number) => {
  if (f < HITS.tapRecap) return M.home;
  // the synthesis unfolding: the 60fps roll at the app's own speed
  if (f < HITS.tapRecap + 20) return M.expand + Math.min(39, Math.round((f - HITS.tapRecap) * 2));
  if (f < HITS.land + 12) return M.read;
  if (f < HITS.tick) return M.list;
  // the ticks: the 60fps roll, played at the app's speed
  if (f < HITS.tick + 75) return M.tick + Math.min(149, Math.round((f - HITS.tick) * 2));
  // (the clean frame cross-dissolves in over CLEAN_AT − 3 … + 5: App)
  if (f < CLEAN_AT + 6) return M.after;
  return M.clean;
};
/** where the wide shot swaps to the tab after the toasts timed out */
export const CLEAN_AT = HITS.wide + 8;

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

/**
 * "Do this" held still while the page settles under it: as the rows fold,
 * the page's scroll clamps and the whole tab slides down; the camera follows
 * the section header (averaged over five take frames), so the list closes
 * up toward a header that does not move.
 */
const headY = (i: number) => {
  let s = 0;
  let n = 0;
  for (let j = i - 2; j <= i + 2; j++) {
    if (j < M.tick || j > M.after) continue;
    try {
      s += rectOf(T, j, 'doHead')[1];
      n++;
    } catch {
      /* not on screen */
    }
  }
  return n ? s / n : LIST.doHead[1];
};
const trackDy = (f: number) => (f < HITS.tick ? 0 : headY(Math.min(frameAt(f), M.after)) - LIST.doHead[1]);

const CARD_CY = CARD[1] + CARD[3] / 2;
/** the card's title, in frame px, when the sheet tears off (list.ts STOP_Y) */
export const CARD_TITLE_Y = 783;

export const appKeys: Key[] = [
  // the tear reveals the video's card, its title where the ink one was
  { f: HITS.tear, cx: 196.5, cy: CARD_CY, z: 2.6, fx: 540, fy: 1050 },
  // a slow push while "Machina watched it."
  { f: HITS.glide, cy: CARD_CY - 8, z: 2.7, ease: linear },
  // up to this week's synthesis, waiting above the card, on "Sunday"
  { f: HITS.tapRecap - 1, cx: 196.5, cy: BANNER[1] + 60, z: 2.78, fx: 540, fy: 960, ease: EASE_IN_OUT },
  // the page unfolds; follow it into the first paragraph
  { f: HITS.read + 6, cy: PARA[1] + PARA[3] / 2 - 18, z: 3.0, fy: 1000, ease: EASE_MODAL },
  { f: HITS.land + 12, z: 3.08, ease: linear },
  // (under the landed sheet) the cut to Revisit: "Do this", the whole list
  { f: HITS.land + 13, cx: 196.5, cy: 368, z: 2.0, fx: 540, fy: 1050 },
  { f: HITS.push2, z: 2.02, ease: linear },
  // in to the video's line
  { f: HITS.push2 + 34, cx: 196.5, cy: LIST.rows[0].row[1] + 70, z: 2.9, fy: 1000, ease: EASE_MODAL },
  { f: HITS.tick, z: 2.96, ease: linear },
  // the ripple: back out over the list as it ticks off (header-tracked)
  { f: HITS.tick + 34, cy: LIST.doHead[1] + 150, z: 2.45, fy: 1000, ease: EASE_IN_OUT },
  { f: HITS.allDone + 4, cy: LIST.doHead[1] + 70, z: 2.8, fy: 980, ease: EASE_IN_OUT },
];

/** the wide: the tab's top, after the toasts (absolute points, no tracking) */
const WIDE: Partial<Cam> = { cx: 196.5, cy: 362, z: 2.2, fx: 540, fy: 1050 };

export const camFor = (f: number): Cam => {
  const c = camAt(appKeys, f);
  const dy = trackDy(f);
  if (f < HITS.wide) return { ...c, cy: c.cy + dy };
  // the pull-back from the tracked close-up to the wide
  const t = prog(f, HITS.wide, HITS.lockup - 4, EASE_IN_OUT);
  const from = { ...camAt(appKeys, HITS.wide), cy: camAt(appKeys, HITS.wide).cy + trackDy(HITS.wide) };
  const z = Math.exp(Math.log(from.z) + (Math.log(WIDE.z!) - Math.log(from.z)) * t);
  return { ...from, cx: from.cx + (WIDE.cx! - from.cx) * t, cy: from.cy + (WIDE.cy! - from.cy) * t, z, fx: 540, fy: from.fy + (WIDE.fy! - from.fy) * t };
};

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

export const App: React.FC<{ f: number }> = ({ f }) => {
  if (f < HITS.tear || f >= HITS.lockup) return null;
  const i = frameAt(f);
  const cam = camFor(f);
  const v = f >= HITS.tear + 1 ? camVelocity(appKeys, f, 1) : { x: 0, y: 0 };
  const inHome = f < HITS.land + 13;
  const inList = f >= HITS.land + 13 && f < HITS.tick;
  // the underline under "the smallest step you can take today"
  const ul = prog(f, HITS.underline, HITS.underline + 14, EASE_IN_OUT);
  const total = PHRASE.reduce((s, r) => s + r[2], 0);
  // the dissolve to the sign-off's paper
  const gone = prog(f, HITS.lockup - 12, HITS.lockup - 1, EASE_IN_OUT);
  // the swap to the tab after the toasts timed out: a short cross-dissolve
  const clean = prog(f, CLEAN_AT - 3, CLEAN_AT + 5, EASE_IN_OUT);
  return (
    <AbsoluteFill>
      <AppShot take={T} i={i} cam={cam} motion={{ x: v.x, y: v.y }} opacity={1 - gone}>
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
        {f >= HITS.tick - 4 && f < HITS.tick + 40 &&
          [0, 1, 2, 3, 4].map((r) => {
            const tk = rectOf(T, M.tick + r * 15, `tick${r}`);
            const t0 = HITS.tick + r * 7.5;
            return <Tap key={r} x={tk[0] + tk[2] / 2} y={tk[1] + tk[3] / 2} t={prog(f, t0 - 4, t0 + 8, linear)} size={34} />;
          })}
      </AppShot>
      {clean > 0 && clean < 1 && (
        <AbsoluteFill style={{ opacity: clean }}>
          <AppShot take={T} i={M.clean} cam={cam} opacity={1 - gone} />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
