import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HITS, THROW_LEN } from '../../../../ads/card-timeline.mjs';
import { AppShot, Lift, Tap } from '../../kit/AppShot';
import { camAt, camVelocity, type Key } from '../../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, EASE_SPRING, prog } from '../../kit/curves';
import { at, center, rectOf } from '../../kit/takes';
import { useAdFrame } from './format';

/**
 * "Pick a time. Machina brings it back." / "Ready when you are." The answer
 * to the hook's "Later never comes.", in the real app (take "adcard"):
 *
 *  REMIND  a cut back to the card; its bell is tapped and the app's own
 *          "Remind me" sheet rises, lifted off its screen (the app darkens
 *          the screen behind it; the reel's grade never flips): Smart review,
 *          preselected ("Tomorrow 9:00 AM · then 1 week & 1 month"), ringed;
 *          Save tapped; the sheet drops and the app's "Reminder set for …"
 *          is lifted
 *  DUE     a cut to tomorrow, 9:00 AM: the feed's own "Reminders due" strip,
 *          the video in it, lifted; then thrown out into the lockup
 *
 * The reminder's lock-screen push is native iOS and cannot be captured from
 * the web build: DUE is the in-app delivery (PUSH_SLOT in the timeline marks
 * where a real iPhone recording could go). OUTPUT frames; rolls were
 * captured at 60fps and play one frame per output frame.
 */

const T = 'adcard';
const linear = (t: number) => t;
const HERO = 930;

/** the settled sheet (its own arrival is the ad's, see the kit's "lift a settled frame") */
const SHEET_I = at(T, 'remind', 39);
const SET_N = 60;
/** the toast's visible pill, measured from its pixels (the capture's box
 *  is sonner's taller list item) */
const TOAST_H = 46;

const screenFrame = (f: number) => {
  if (f >= HITS.due) return at(T, 'dueHeld');
  if (f >= HITS.saveTap) return at(T, 'set', Math.min(SET_N - 1, f - HITS.saveTap));
  return at(T, 'back');
};

// the screen: the card's header and its bell; under the sheet (out of
// focus) on down to where the app confirms; a cut to tomorrow's feed
const keysFor = (dy: number): Key[] =>
  [
    { f: HITS.back, cx: 196.5, cy: 160, z: 2.3, fx: 540, fy: HERO, rx: 0, ry: 0, rz: 0 },
    { f: HITS.bellTap, cy: 162, z: 2.33, ease: linear },
    { f: HITS.saveTap - 4, cy: 782, z: 2.65, ease: EASE_IN_OUT },
    { f: HITS.due - 1, cy: 784, z: 2.7, ease: linear },
    // a cut on the beat (two keys a frame apart): tomorrow, 9:00 AM
    { f: HITS.due, cy: 300, z: 2.3 },
    { f: HITS.throw, cy: 292, z: 2.4, ease: linear },
    // thrown out of frame, into the lockup
    { f: HITS.throw + THROW_LEN, fx: -760, z: 2.5, ease: EASE_IN_OUT },
  ].map((k) => (k.fy !== undefined ? { ...k, fy: k.fy + dy } : k)) as Key[];

// the lifted sheet: it rises into place, Smart review framed; then on down to Save
const dKeysFor = (dy: number): Key[] =>
  [
    { f: HITS.bellTap, cx: 196.5, cy: 520, z: 2.4, fx: 540, fy: 1150 },
    { f: HITS.bellTap + 12, fy: 1000, ease: EASE_MODAL },
    { f: HITS.smart + 40, cy: 522, z: 2.42, ease: linear },
    { f: HITS.saveTap - 8, cy: 660, fy: HERO, z: 2.4, ease: EASE_IN_OUT },
    { f: HITS.saveTap + 10, z: 2.3, fy: HERO + 60, ease: EASE_IN_OUT },
  ].map((k) => (k.fy !== undefined ? { ...k, fy: k.fy + dy } : k)) as Key[];

export const Remind: React.FC<{ f: number }> = ({ f }) => {
  const { dy } = useAdFrame();
  if (f < HITS.back - 2 || f > HITS.throw + THROW_LEN) return null;
  const keys = keysFor(dy);
  const dKeys = dKeysFor(dy);
  const i = screenFrame(f);

  // behind the sheet: out of focus, racking back into focus as it drops away
  // (it racks out ahead of the sheet, so the sheet never fades in over sharp type)
  // (round 8) it stays soft after the sheet drops, so the lifted "Reminder
  // set" reads on its own instead of sitting on a card, and racks back into
  // focus only after the cut to tomorrow (the cut itself happens under blur)
  const behind = prog(f, HITS.bellTap + 1, HITS.bellTap + 8, EASE_IN_OUT) * (1 - prog(f, HITS.due + 2, HITS.due + 18, EASE_IN_OUT));
  // the arrival from the graph: it fades in soft and pulls into focus
  const arrive = 1 - prog(f, HITS.back + 2, HITS.back + 18, EASE_IN_OUT);
  const fadeIn = prog(f, HITS.back - 2, HITS.back + 10, EASE_IN_OUT);
  const dIn = prog(f, HITS.bellTap + 1, HITS.bellTap + 7, EASE_IN_OUT);
  const dOut = prog(f, HITS.saveTap + 2, HITS.saveTap + 9, EASE_IN_OUT);

  const bell = center(rectOf(T, at(T, 'back'), 'bell'));
  const sheet = rectOf(T, SHEET_I, 'sheet');
  const smart = rectOf(T, SHEET_I, 'smart');
  const save = center(rectOf(T, SHEET_I, 'save'));
  const toast = rectOf(T, at(T, 'set', SET_N - 1), 'toast');
  const strip = rectOf(T, at(T, 'dueHeld'), 'strip');

  // lifts, each on its beat, each gone before its screen moves
  const smartIn = prog(f, HITS.smart, HITS.smart + 14, EASE_SPRING);
  const smartOut = prog(f, HITS.smart + 30, HITS.smart + 40, EASE_IN_OUT);
  const setIn = prog(f, HITS.reminderSet, HITS.reminderSet + 14, EASE_SPRING);
  const setOut = prog(f, HITS.due - 8, HITS.due - 1, EASE_IN_OUT);
  const dueIn = prog(f, HITS.dueLift, HITS.dueLift + 16, EASE_SPRING);
  const dueOut = prog(f, HITS.throw - 10, HITS.throw, EASE_IN_OUT);

  return (
    <AbsoluteFill>
      {/* the screen */}
      <AppShot take={T} i={i} cam={camAt(keys, f)} blur={16 * Math.max(behind, arrive)} dim={0.16 * behind} opacity={fadeIn} motion={camVelocity(keys, f, 1)}>
        <Tap x={bell.x} y={bell.y} t={prog(f, HITS.bellTap - 7, HITS.bellTap + 12, linear)} />
        {f >= HITS.reminderSet && f < HITS.due && setIn > 0.01 && setOut < 1 && (
          <Lift take={T} i={i} rect={[toast[0], toast[1], toast[2], TOAST_H]} radius={16} lift={setIn * 0.35} rise={2} grow={0.012} ring={0.5 * setIn} opacity={1 - setOut} />
        )}
        {f >= HITS.dueLift && dueIn > 0.01 && dueOut < 1 && (
          <Lift take={T} i={i} rect={[strip[0] - 2, strip[1] - 2, strip[2] + 4, strip[3] + 4]} radius={18} lift={dueIn * 0.35} rise={2} grow={0.01} ring={0.55 * dueIn} opacity={1 - dueOut} />
        )}
      </AppShot>

      {/* the "Remind me" sheet, lifted off its screen */}
      {f >= HITS.bellTap && dOut < 1 && (
        <AppShot take={T} i={SHEET_I} cam={camAt(dKeys, f)} motion={camVelocity(dKeys, f, 1)} crop={sheet} cropRadius={24} opacity={dIn * (1 - dOut)}>
          {smartIn > 0.01 && smartOut < 1 && (
            <Lift take={T} i={SHEET_I} rect={[smart[0] - 2, smart[1] - 2, smart[2] + 4, smart[3] + 4]} radius={12} lift={smartIn * 0.35} rise={2} grow={0.012} ring={0.5 * smartIn} opacity={1 - smartOut} />
          )}
          <Tap x={save.x} y={save.y} tone="light" t={prog(f, HITS.saveTap - 7, HITS.saveTap + 12, linear)} />
        </AppShot>
      )}
    </AbsoluteFill>
  );
};
