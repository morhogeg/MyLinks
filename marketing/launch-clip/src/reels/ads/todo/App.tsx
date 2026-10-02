import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HITS, PLAY, TAKE, THROW_LEN } from '../../../../clips/ad-todo-timeline.mjs';
import { AppShot, Lift, Tap } from '../../kit/AppShot';
import { camAt, camVelocity, type Key } from '../../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../../kit/curves';
import { at, center, rectOf, takeOf, type Rect } from '../../kit/takes';
import { useShape } from './frame';

/**
 * The real app (take `adTodo`, capture/shoot.mjs), from the iris after the
 * hook to the throw into the lockup. OUTPUT frames; the take's rolls were
 * recorded at 60fps and play one captured frame per output frame.
 *
 *  2 SAVE     Home opens round the point (the iris, on the + button); + is
 *             tapped; Add to Machina, LIFTED off its screen (the app darkens
 *             the screen behind it; the grade never flips): the Image tab,
 *             the three slides picked ("Screens of one post, read in this
 *             order."), Save; the dialog drops away into the feed.
 *  3 READ     the feed's own working card, "Reading 3 screenshots…", becomes
 *             the card; tapped open: the screenshots, the title and the gist;
 *             read down (the capture's 4pt scroll steps, the camera taking up
 *             each step's rounding) to the Key Points, which lift.
 *  4 DO THIS  a cut on the beat to Revisit as its rows arrive (the app's own
 *             staggered entrance): the new task leads "Do this"; it lifts on
 *             "to-do".
 *  5 TICK     the ring, tapped: it fills with the accent and a check, the task
 *             strikes, holds, the row folds (the app's own motion, frame for
 *             frame); "Marked as done" is lifted off the bottom of the screen
 *             into the frame (the kit's floated toast), over "Done 1".
 *  6          thrown out of frame into the lockup (End.tsx).
 *
 * Every pixel of the app is the capture; the added things are the camera,
 * the taps and the lifts (the reel kit).
 */

const T = TAKE;
const linear = (t: number) => t;
type Seg = keyof typeof PLAY;
const seg = (mark: Seg, f: number, offset = 0) =>
  at(T, mark, Math.min(PLAY[mark].n - 1, Math.max(0, f - PLAY[mark].at + offset)));

// ── the read-down: the capture scrolls the open card in 4pt steps; step 0 is
// the opened view. Each step's MEASURED position (the Key Points list) is
// what the camera corrects against (a capture's steps are not even).
const STEPS = at(T, 'revisit') - at(T, 'detailScroll');
const stepFrame = (k: number) => (k <= 0 ? at(T, 'detail', PLAY.detail.n - 1) : at(T, 'detailScroll', k - 1));
const refY = (k: number) => rectOf(T, stepFrame(k), 'points')[1];
const [S0, S1] = HITS.scroll;
const scrollAt = (f: number) => STEPS * prog(f, S0, S1, EASE_IN_OUT);
const wantY = (s: number) => {
  const k = Math.min(STEPS - 1, Math.floor(s));
  return mix(refY(k), refY(k + 1), s - k);
};

/** the capture frame the screen shows */
const screenFrame = (f: number) => {
  if (f < PLAY.saving.at) return at(T, 'home');
  if (f < PLAY.done.at) return seg('saving', f);
  if (f < PLAY.detail.at) return seg('done', f);
  if (f < S0) return seg('detail', f);
  if (f < HITS.revisit) return stepFrame(Math.round(scrollAt(f)));
  // Revisit: cut in as its rows arrive (the app's staggered entrance)
  if (f < HITS.tick) return f - HITS.revisit < 16 ? seg('revisit', f, 8) : at(T, 'todo');
  // the tick (+1: the capture's first frame after a click is unchanged; the
  // tap lands on the first frame the app answers)
  return seg('tick', f, 1);
};
/** the capture frame the lifted dialog shows */
const dialogFrame = (f: number) =>
  f < PLAY.modeImage.at ? at(T, 'dialogOpen', PLAY.dialogOpen.n - 1) : f < PLAY.picked.at ? seg('modeImage', f) : seg('picked', f);

/** Home, framed so the + button sits at y 1180 in the tall frame (inside
 *  Meta's safe area; the reel's opening camera put it at 1595) */
const OPEN_CAM = { cx: 196.5, cy: 520, z: 1.5, fx: 540, fy: 1180 - (811 - 520) * 1.5 };

const keysFor = (dy: number): Key[] =>
  [
    { f: HITS.iris[0], ...OPEN_CAM },
    { f: HITS.plusTap, z: 1.52, ease: linear },
    // pushed back behind the lifted dialog, answering the + tap
    { f: HITS.dialog + 8, cy: 470, z: 1.38, fy: 900, ease: EASE_IN_OUT },
    { f: HITS.saveTap + 4, z: 1.42, ease: linear },
    // the feed's working card, once the dialog has gone
    { f: HITS.saveTap + 22, cy: 300, z: 2.2, fy: 980, ease: EASE_IN_OUT },
    { f: HITS.cardDone, cy: 302, z: 2.24, ease: linear },
    // …the card it becomes: its title and gist
    { f: HITS.cardDone + 20, cy: 350, z: 2.0, fy: 960, ease: EASE_MODAL },
    { f: HITS.cardTap, cy: 352, z: 2.02, ease: linear },
    // opened: the screenshots and the title
    { f: HITS.cardTap + 28, cy: 400, z: 1.55, fy: 960, ease: EASE_MODAL },
    { f: S0, cy: 402, z: 1.57, ease: linear },
    // down to the Key Points, with the scroll
    { f: S1, cy: 540, z: 1.9, fy: 940, ease: EASE_IN_OUT },
    { f: HITS.revisit - 1, cy: 542, z: 1.93, ease: linear },
    // cut on the beat to Revisit: "Do this"
    { f: HITS.revisit, cy: 280, z: 2.2, fy: 980 },
    { f: HITS.tick, cy: 283, z: 2.25, ease: linear },
    // the fold: the list settles, room under it for the toast
    { f: HITS.toToast[1], cy: 290, z: 2.2, fy: 950, ease: EASE_IN_OUT },
    { f: HITS.out, cy: 292, z: 2.23, ease: linear },
    // thrown out of frame, into the lockup
    { f: HITS.out + THROW_LEN, fx: -760, z: 2.4, ease: EASE_IN_OUT },
  ].map((k) => (k.fy !== undefined ? { ...k, fy: k.fy + dy } : k));

// ── the lifted dialog's camera: framed whole, then onto the slides picked,
// then dropped away into the feed as Save is answered
const dKeysFor = (dy: number): Key[] =>
  [
    { f: HITS.dialog, cx: 196.5, cy: 426, z: 1.5, fx: 540, fy: 1040 },
    { f: HITS.dialog + 14, z: 1.6, fy: 930, ease: EASE_MODAL },
    { f: HITS.imageTap + 12, cy: 427, z: 1.62, ease: linear },
    // onto the drop zone BEFORE the pick, so the slides land on a still frame
    { f: HITS.pick - 4, cy: 474, z: 2.0, fy: 940, ease: EASE_IN_OUT },
    { f: HITS.saveTap + 2, cy: 476, z: 2.03, ease: linear },
    { f: HITS.saveTap + 10, z: 1.94, fy: 1000, ease: EASE_IN_OUT },
  ].map((k) => (k.fy !== undefined ? { ...k, fy: k.fy + dy } : k));

/** the toast's own camera: lifted off the bottom of the screen into the
 *  frame, just under the list (it covers the "Done 1" toggle, as the app's
 *  toast covers what is under it) */
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
  const behind = prog(f, HITS.plusTap + 1, HITS.dialog + 4, EASE_IN_OUT) * (1 - prog(f, HITS.saveTap + 8, HITS.saveTap + 20, EASE_IN_OUT));

  // the dialog, lifted
  const di = dialogFrame(f);
  const dRect = rectOf(T, di, 'dialog');
  const dIn = prog(f, HITS.dialog, HITS.dialog + 6, EASE_IN_OUT);
  const dOut = prog(f, HITS.saveTap + 2, HITS.saveTap + 9, EASE_IN_OUT);

  const plus = center(rectOf(T, at(T, 'home'), 'plus'));
  const tabImage = rectOf(T, at(T, 'modeImage', 23), 'tabImage');
  const dropzone = center(rectOf(T, at(T, 'modeImage', 23), 'dropzone'));
  const strip = rectOf(T, at(T, 'picked', 23), 'strip');
  const save = center(rectOf(T, at(T, 'picked', 23), 'save'));
  const card = rectOf(T, at(T, 'landed'), 'firstCard');
  const TODO = at(T, 'todo');
  const row1 = rectOf(T, TODO, 'row1');
  const check1 = center(rectOf(T, TODO, 'check1'));

  // lifts, each on its beat, each gone before its screen moves fast
  const tabRing = prog(f, HITS.imageTap + 1, HITS.imageTap + 7, EASE_SPRING) * (1 - prog(f, HITS.imageTap + 8, HITS.imageTap + 16, EASE_IN_OUT));
  const stripIn = prog(f, HITS.pick + 8, HITS.pick + 20, EASE_SPRING);
  const stripOut = prog(f, HITS.saveTap - 14, HITS.saveTap - 4, EASE_IN_OUT);
  const landIn = prog(f, HITS.cardDone + 8, HITS.cardDone + 20, EASE_SPRING);
  const landOut = prog(f, HITS.cardTap - 14, HITS.cardTap - 4, EASE_IN_OUT);
  const kpIn = prog(f, HITS.keyPoints, HITS.keyPoints + 12, EASE_SPRING);
  const kpOut = prog(f, HITS.revisit - 8, HITS.revisit - 1, EASE_IN_OUT);
  const todo = prog(f, HITS.todoLift, HITS.todoLift + 8, EASE_SPRING) * (1 - prog(f, HITS.todoDrop, HITS.todoDrop + 12, EASE_MODAL));

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
      {/* the screen (from the cut to Revisit, cropped above the app's own toast,
          which is lifted into the frame instead; the crop's edge is below the frame) */}
      <AppShot
        take={T}
        i={i}
        cam={view}
        blur={16 * behind}
        dim={0.12 * behind}
        motion={motion}
        iris={iris}
        crop={f >= HITS.revisit ? [0, 0, 393, 751] : undefined}
        cropRadius={0}
      >
        <Tap x={plus.x} y={plus.y} t={prog(f, HITS.plusTap - 5, HITS.plusTap + 9, linear)} />
        <Tap x={card[0] + 120} y={card[1] + 40} t={prog(f, HITS.cardTap - 7, HITS.cardTap + 13, linear)} />
        {landIn > 0.01 && landOut < 1 && f < HITS.cardTap && (
          <Lift take={T} i={i} rect={card} radius={20} lift={landIn * 0.5} rise={3} grow={0.01} ring={0.55 * landIn} opacity={1 - landOut} />
        )}
        {scrolling && kpIn > 0.01 && kpOut < 1 && (() => {
          const kp = rectOf(T, i, 'keyPoints');
          const pts = rectOf(T, i, 'points');
          return (
            <Lift take={T} i={i} rect={[kp[0] - 4, kp[1] - 6, kp[2] + 8, pts[1] + pts[3] - kp[1] + 12]} radius={14} lift={kpIn * 0.35} rise={2} grow={0.01} ring={0.55 * kpIn} opacity={1 - kpOut} />
          );
        })()}
        {f >= HITS.revisit && f < HITS.tick && todo > 0.01 && (
          <Lift take={T} i={i} rect={row1} radius={14} lift={todo * 0.7} rise={3} grow={0.02} ring={0.55 * todo} />
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
