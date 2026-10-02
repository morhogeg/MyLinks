import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HITS, PLAY, TAKE, THROW_LEN } from '../../../../clips/ad-todo-timeline.mjs';
import { AppShot, Lift, Tap } from '../../kit/AppShot';
import { camAt, camVelocity, type Key } from '../../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../../kit/curves';
import { at, center, rectOf, type Rect } from '../../kit/takes';
import { useShape } from './frame';

/**
 * The real app (take `adTodo`, capture/shoot.mjs), from the iris after the
 * hook to the throw into the lockup. OUTPUT frames. The take's rolls were
 * recorded at 60fps; round 3 plays the app at its REAL speed (two captured
 * frames per output frame) so it feels as quick as it is, and slows down for
 * one moment only: the tick.
 *
 *  2 SAVE      Home opens round the point that landed on the + (the iris); +
 *              is tapped; Add to Machina, LIFTED off its screen (the app
 *              darkens the screen behind it; the grade never flips): Image,
 *              the three slides picked, Save; the dialog drops away.
 *  3 READ      the feed's own working card, "Reading 3 screenshots…",
 *              becomes the card; tapped open; read down (the capture's 4pt
 *              scroll steps, the camera taking up each step's rounding) to
 *              the Key Points, which lift.
 *  4 STANDOUT  on down to the card's own "Do this", which lifts; then a MATCH
 *              CUT: the lifted step and Revisit's first to-do sit on the same
 *              frame position at the same zoom, so the words hold still and
 *              the screen around them becomes the to-do list.
 *  5 TICK      half speed: the ring fills, the task strikes, holds, the row
 *              folds; "Marked as done" is lifted off the bottom of the screen
 *              into the frame (the kit's floated toast).
 *  6           thrown out of frame into the lockup (End.tsx).
 *
 * Every pixel of the app is the capture; the added things are the camera,
 * the taps and the lifts (the reel kit).
 */

const T = TAKE;
const linear = (t: number) => t;
type Seg = keyof typeof PLAY;
/** the capture frame a stretch shows at output frame f, at its rate */
const seg = (mark: Seg, f: number, offset = 0) => {
  const p = PLAY[mark];
  return at(T, mark, Math.min(p.n - 1, Math.max(0, Math.floor((f - p.at) * p.rate) + offset)));
};

// ── the read-down: the capture scrolls the open card in 4pt steps; step 0 is
// the opened view. Each step's MEASURED position (the Key Points list) is
// what the camera corrects against (a capture's steps are not even).
const STEPS = at(T, 'revisit') - at(T, 'detailScroll');
const stepFrame = (k: number) => (k <= 0 ? at(T, 'detail', PLAY.detail.n - 1) : at(T, 'detailScroll', k - 1));
const refY = (k: number) => rectOf(T, stepFrame(k), 'points')[1];
/** the step that puts the Key Points heading at 403pt */
const KP_STEP = (() => {
  let best = 0;
  for (let k = 0; k <= STEPS; k++) if (Math.abs(rectOf(T, stepFrame(k), 'keyPoints')[1] - 403) < Math.abs(rectOf(T, stepFrame(best), 'keyPoints')[1] - 403)) best = k;
  return best;
})();
/** while the Key Points are read the page creeps on a few steps (a hold is
 *  never dead still), then glides on to the card's "Do this" */
const KP_CREEP = 3;
const [S0, S1] = HITS.scroll;
const [S2, S3] = HITS.scroll2;
const scrollAt = (f: number) =>
  KP_STEP * prog(f, S0, S1, EASE_IN_OUT) +
  KP_CREEP * ((1 - Math.cos(Math.PI * prog(f, S1, S2, linear))) / 2) +
  (STEPS - KP_STEP - KP_CREEP) * prog(f, S2, S3, EASE_IN_OUT);
const wantY = (s: number) => {
  const k = Math.min(STEPS - 1, Math.floor(s));
  return mix(refY(k), refY(k + 1), s - k);
};

/** the capture frame the screen shows */
const screenFrame = (f: number) => {
  if (f < PLAY.saving.at) return at(T, 'home');
  if (f < PLAY.reading.at) return seg('saving', f);
  if (f < PLAY.done.at) return seg('reading', f);
  if (f < PLAY.detail.at) return seg('done', f);
  if (f < S0) return seg('detail', f);
  if (f < HITS.revisit) return stepFrame(Math.round(scrollAt(f)));
  // the match cut lands on Revisit, settled: its first row is the step
  if (f < HITS.tick) return at(T, 'todo');
  // the tick (+1: the capture's first frame after a click is unchanged; the
  // tap lands on the first frame the app answers)
  return seg('tick', f, 1);
};
/** the capture frame the lifted dialog shows */
const dialogFrame = (f: number) => (f < PLAY.modeImage.at ? seg('dialogOpen', f) : f < PLAY.picked.at ? seg('modeImage', f) : seg('picked', f));

/** Home, framed so the + button sits at y 1180 in the tall frame (inside
 *  Meta's safe area; the reel's opening camera put it at 1595) */
const OPEN_CAM = { cx: 196.5, cy: 520, z: 1.5, fx: 540, fy: 1180 - (811 - 520) * 1.5 };

// ── THE MATCH CUT. The card's "Do this", lifted (its label 22pt above the
// task), on the read-down's last step; and Revisit's first to-do. The camera
// before the cut is the read-down's last key; the one after puts the row's
// centre on the same frame point at the same zoom.
const lastStep = stepFrame(STEPS);
const stepBox = (() => {
  const r = rectOf(T, lastStep, 'takeaway');
  return [r[0] - 4, r[1] - 22, r[2] + 8, r[3] + 26] as Rect;
})();
const ROW = rectOf(T, at(T, 'todo'), 'row1');
// (framed 100px higher than the read-down's other keys: on the far side of
// the cut, Revisit's status bar then sits under the band's paper)
const CUT_FROM = { cx: 196.5, cy: 601, z: 2.07, fy: 860 };
const cutY = CUT_FROM.fy + (stepBox[1] + stepBox[3] / 2 - CUT_FROM.cy) * CUT_FROM.z;
const CUT_TO = { cx: 196.5, cy: ROW[1] + ROW[3] / 2, z: CUT_FROM.z, fy: cutY };

const keysFor = (dy: number): Key[] =>
  [
    { f: HITS.iris[0], ...OPEN_CAM },
    { f: HITS.plusTap, z: 1.52, ease: linear },
    // pushed back behind the lifted dialog, answering the + tap
    { f: HITS.dialog + 6, cy: 470, z: 1.38, fy: 900, ease: EASE_IN_OUT },
    { f: HITS.saveTap + 2, z: 1.41, ease: linear },
    // the feed's working card, once the dialog has gone
    { f: HITS.saveTap + 16, cy: 300, z: 2.2, fy: 980, ease: EASE_IN_OUT },
    { f: HITS.cardDone, cy: 302, z: 2.23, ease: linear },
    // …the card it becomes: its title and gist
    { f: HITS.cardDone + 12, cy: 350, z: 2.0, fy: 960, ease: EASE_MODAL },
    { f: HITS.cardTap, cy: 351, z: 2.01, ease: linear },
    // opened: the screenshots and the title
    { f: S0, cy: 400, z: 1.55, fy: 960, ease: EASE_MODAL },
    // down to the Key Points, with the scroll
    { f: S1, cy: 540, z: 1.9, fy: 940, ease: EASE_IN_OUT },
    { f: S2, cy: 541, z: 1.92, ease: linear },
    // on down to the card's own "Do this", a little closer
    { f: S3, cy: 600, z: 2.05, fy: 860, ease: EASE_IN_OUT },
    { f: HITS.revisit - 1, ...CUT_FROM, ease: linear },
    // THE MATCH CUT: the same words, the same place; then the list settles
    { f: HITS.revisit, ...CUT_TO },
    { f: HITS.revisit + 24, cy: 280, z: 2.2, fy: 980, ease: EASE_IN_OUT },
    { f: HITS.tick, cy: 282, z: 2.23, ease: linear },
    // the fold: the list settles, room under it for the toast
    { f: HITS.toToast[1], cy: 290, z: 2.2, fy: 950, ease: EASE_IN_OUT },
    { f: HITS.out, cy: 291, z: 2.21, ease: linear },
    // thrown out of frame, into the lockup
    { f: HITS.out + THROW_LEN, fx: -760, z: 2.4, ease: EASE_IN_OUT },
  ].map((k) => (k.fy !== undefined ? { ...k, fy: k.fy + dy } : k));

// ── the lifted dialog's camera: framed whole, then onto the slides picked,
// then dropped away into the feed as Save is answered
const dKeysFor = (dy: number): Key[] =>
  [
    { f: HITS.dialog, cx: 196.5, cy: 426, z: 1.5, fx: 540, fy: 1040 },
    { f: HITS.dialog + 8, z: 1.6, fy: 930, ease: EASE_MODAL },
    { f: HITS.imageTap + 6, cy: 427, z: 1.62, ease: linear },
    // onto the drop zone BEFORE the pick, so the slides land on a still frame
    { f: HITS.pick - 2, cy: 474, z: 2.0, fy: 940, ease: EASE_IN_OUT },
    { f: HITS.saveTap + 1, cy: 476, z: 2.03, ease: linear },
    { f: HITS.saveTap + 8, z: 1.94, fy: 1000, ease: EASE_IN_OUT },
  ].map((k) => (k.fy !== undefined ? { ...k, fy: k.fy + dy } : k));

/** "Marked as done": lifted off the bottom of the screen into the frame, just
 *  under the list (over the "Done 1" toggle, as the app's toast covers what
 *  is under it) */
const TOAST_AT = HITS.tick + 60;

export const App: React.FC<{ f: number }> = ({ f }) => {
  const { dy } = useShape();
  if (f < HITS.iris[0] || f > HITS.out + THROW_LEN) return null;
  const keys = keysFor(dy);
  const dKeys = dKeysFor(dy);

  const i = screenFrame(f);
  const s = scrollAt(f);
  const scrolling = f >= S0 && f < HITS.revisit;
  const cam = camAt(keys, f);
  const step = Math.round(s);
  // the step on screen vs where the scroll curve wants it (points)
  const view = scrolling ? { ...cam, cy: cam.cy + (refY(step) - wantY(s)) } : cam;
  const camV = camVelocity(keys, f, 1);
  const motion = scrolling ? { x: camV.x, y: camV.y + (wantY(s) - wantY(scrollAt(f - 1))) * cam.z } : camV;

  // the iris: Home opens round the point that landed on the +
  const opened = prog(f, HITS.iris[0], HITS.iris[1], EASE_IN_OUT);
  const iris = opened < 1 ? { x: 196.5, y: 811, r: mix(20, 980, opened) } : null;

  // behind the dialog: out of focus, racking into focus as it drops away
  const behind = prog(f, HITS.plusTap + 1, HITS.dialog + 4, EASE_IN_OUT) * (1 - prog(f, HITS.saveTap + 6, HITS.saveTap + 16, EASE_IN_OUT));

  // the dialog, lifted
  const di = dialogFrame(f);
  const dRect = rectOf(T, di, 'dialog');
  const dIn = prog(f, HITS.dialog, HITS.dialog + 4, EASE_IN_OUT);
  const dOut = prog(f, HITS.saveTap + 2, HITS.saveTap + 8, EASE_IN_OUT);

  const plus = center(rectOf(T, at(T, 'home'), 'plus'));
  const tabImage = rectOf(T, at(T, 'modeImage', 23), 'tabImage');
  const dropzone = center(rectOf(T, at(T, 'modeImage', 23), 'dropzone'));
  const strip = rectOf(T, at(T, 'picked', 23), 'strip');
  const save = center(rectOf(T, at(T, 'picked', 23), 'save'));
  const card = rectOf(T, at(T, 'landed'), 'firstCard');
  const check1 = center(rectOf(T, at(T, 'todo'), 'check1'));

  // lifts, each on its beat, each gone before its screen moves fast
  const tabRing = prog(f, HITS.imageTap + 1, HITS.imageTap + 6, EASE_SPRING) * (1 - prog(f, HITS.imageTap + 7, HITS.imageTap + 14, EASE_IN_OUT));
  const stripIn = prog(f, HITS.pick + 6, HITS.pick + 16, EASE_SPRING);
  const stripOut = prog(f, HITS.saveTap - 8, HITS.saveTap - 2, EASE_IN_OUT);
  const kpIn = prog(f, HITS.keyPoints, HITS.keyPoints + 12, EASE_SPRING);
  const kpOut = prog(f, S2 - 8, S2, EASE_IN_OUT);
  const doIn = prog(f, HITS.cardTodo, HITS.cardTodo + 12, EASE_SPRING);
  // the row is lifted from the cut (the step's lift carries straight through
  // it), and settles before the tick
  const rowUp = 1 - prog(f, HITS.todoDrop, HITS.todoDrop + 12, EASE_MODAL);

  // the toast: lifted off the bottom of the screen as it arrives
  const tIn = prog(f, TOAST_AT, TOAST_AT + 10, EASE_SPRING);
  const toastI = seg('tick', Math.max(f, TOAST_AT + 4), 1);
  // the pill only: the measured box runs on over the tab bar under it (the
  // pill's own edge is 50pt down, measured on the capture's pixels)
  const measured = rectOf(T, at(T, 'tick', 131), 'toast');
  const toastRect: Rect = [measured[0], measured[1], measured[2], 50];
  const toastCam = { cx: 196.5, cy: toastRect[1] + toastRect[3] / 2, z: 1.95, fx: 540, fy: 1172 + dy + Math.round((1 - tIn) * 40), rx: 0, ry: 0, rz: 0 };
  const thrown = camAt(keys, f).fx - camAt(keys, HITS.out).fx;

  return (
    <AbsoluteFill>
      {/* the screen. From the cut to Revisit it is cropped: below, above the
          app's own toast (lifted into the frame instead; that edge is below the
          frame); above, the capture's 54pt status bar (round 3: the match cut
          frames the list high, and in the 4:5 cut "9:41" showed under the
          shallower band; that edge sits under the band's paper) */}
      <AppShot
        take={T}
        i={i}
        cam={view}
        blur={16 * behind}
        dim={0.12 * behind}
        motion={motion}
        iris={iris}
        crop={f >= HITS.revisit ? [0, 54, 393, 697] : undefined}
        cropRadius={0}
      >
        <Tap x={plus.x} y={plus.y} t={prog(f, HITS.plusTap - 7, HITS.plusTap + 13, linear)} />
        <Tap x={card[0] + 120} y={card[1] + 40} t={prog(f, HITS.cardTap - 7, HITS.cardTap + 13, linear)} />
        {scrolling && kpIn > 0.01 && kpOut < 1 && (() => {
          const kp = rectOf(T, i, 'keyPoints');
          const pts = rectOf(T, i, 'points');
          return (
            <Lift take={T} i={i} rect={[kp[0] - 4, kp[1] - 6, kp[2] + 8, pts[1] + pts[3] - kp[1] + 12]} radius={14} lift={kpIn * 0.35} rise={2} grow={0.01} ring={0.55 * kpIn} opacity={1 - kpOut} />
          );
        })()}
        {scrolling && f >= HITS.cardTodo && doIn > 0.01 && (() => {
          // the card's own step: its "DO THIS" label and the task
          const r = rectOf(T, i, 'takeaway');
          return <Lift take={T} i={i} rect={[r[0] - 4, r[1] - 22, r[2] + 8, r[3] + 26]} radius={14} lift={doIn * 0.7} rise={3} grow={0.02} ring={0.6 * doIn} />;
        })()}
        {f >= HITS.revisit && f < HITS.tick && rowUp > 0.01 && (
          <Lift take={T} i={i} rect={ROW} radius={14} lift={rowUp * 0.7} rise={3} grow={0.02} ring={0.6 * rowUp} />
        )}
        {/* the ring: "Mark as done" */}
        <Tap x={check1.x} y={check1.y} t={prog(f, HITS.tick - 7, HITS.tick + 13, linear)} />
      </AppShot>

      {/* the dialog, lifted off its screen */}
      {f >= HITS.dialog && dOut < 1 && (
        <AppShot take={T} i={di} cam={camAt(dKeys, f)} motion={camVelocity(dKeys, f, 1)} crop={dRect} cropRadius={24} opacity={dIn * (1 - dOut)}>
          <Tap x={center(tabImage).x} y={center(tabImage).y} t={prog(f, HITS.imageTap - 7, HITS.imageTap + 13, linear)} />
          {tabRing > 0.01 && <Lift take={T} i={di} rect={tabImage} radius={9} lift={tabRing * 0.4} rise={1} grow={0.04} ring={0.5 * tabRing} />}
          <Tap x={dropzone.x} y={dropzone.y} t={prog(f, HITS.pick - 7, HITS.pick + 13, linear)} />
          {f >= HITS.pick && stripIn > 0.01 && stripOut < 1 && (
            <Lift take={T} i={di} rect={[strip[0] - 4, strip[1] - 4, strip[2] + 8, strip[3] + 8]} radius={14} lift={stripIn * 0.35} rise={2} grow={0.015} ring={0.5 * stripIn} opacity={1 - stripOut} />
          )}
          <Tap x={save.x} y={save.y} tone="light" t={prog(f, HITS.saveTap - 7, HITS.saveTap + 13, linear)} />
        </AppShot>
      )}

      {/* "Marked as done", lifted into the frame */}
      {f >= TOAST_AT && (
        <AppShot
          take={T}
          i={toastI}
          cam={{ ...toastCam, fx: toastCam.fx + thrown }}
          motion={camVelocity(keys, f, 1)}
          crop={toastRect}
          cropRadius={14}
          opacity={Math.min(1, tIn * 1.4)}
        />
      )}
    </AbsoluteFill>
  );
};
