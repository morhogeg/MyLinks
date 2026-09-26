import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HITS } from '../../../reel-timeline.mjs';
import { AppShot, Lift, Tap } from '../kit/AppShot';
import { camAt, camVelocity, type Key } from '../kit/camera';
import { EASE_FLING, EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../kit/curves';
import { at, center, rectOf } from '../kit/takes';
import { findKeys } from './Find';
import { HANDOFF, SAVE_OPEN_CAM } from './handoff';

/**
 * 4.3s – 6.9s. SAVE: the + button, Add to Machina, the five real phases
 * (web/lib/scanPhases.ts, as the app shows them), and the card landing.
 *
 * Every pixel of UI is the app (take "save"). Two liberties, both camera:
 * the dialog is LIFTED off its screen (the real app dims the screen behind
 * it to near-black, which would flip the reel's light grade for two
 * seconds), and the phases are timed to the score's 8th notes (the capture
 * holds each phase; the reel shows each one on its beat).
 */

const T = 'save';
const S = HITS;

/** frame of the take for this reel frame, walking `mark` from `from` */
const walk = (f: number, from: number, mark: string, len = 9) => at(T, mark, Math.min(len, Math.max(0, f - from)));

export const Save: React.FC<{ f: number }> = ({ f }) => {
  if (f < HANDOFF.iris || f >= S.searchTap) return null;

  // ── which real frame is on the dialog
  const phase = S.phases.findIndex((p, k) => f >= p && (k === S.phases.length - 1 || f < S.phases[k + 1]));
  const dialogFrame =
    f < S.phases[0]
      ? at(T, 'filled')
      : f < S.saved
        ? walk(f, S.phases[phase], `phase${phase}`, 7)
        : walk(f, S.saved, 'done', 20);
  const dialogRect = rectOf(T, dialogFrame, 'dialog');

  // ── the screen behind: Home, then the feed with the new card
  const landed = f >= 190;
  const baseFrame = landed ? at(T, 'landed') : at(T, 'home');

  // the establishing camera (the + button, from the match cut) → pushed back
  // behind the dialog → forward onto the feed as the card lands. From the
  // landing on, the screen rides FIND's camera: the two takes show the same
  // feed pixel for pixel, so Find takes the screen over on the search tap
  // with no seam (no dissolve, no double image).
  const baseKeys: Key[] = [
    { f: HANDOFF.iris, ...SAVE_OPEN_CAM, rx: 9 },
    { f: 134, z: 1.56, rx: 0, ease: EASE_MODAL },
    { f: 140, cx: 196.5, cy: 430, z: 1.38, fx: 540, fy: 1190, ease: EASE_IN_OUT },
    { f: 184, z: 1.42, ease: (t) => t },
    { ...findKeys[0], ease: EASE_IN_OUT },
  ];
  const onFind = f >= findKeys[0].f;
  const base = onFind ? camAt(findKeys, f) : camAt(baseKeys, f);
  const backBlur = mix(0, 16, prog(f, 136, 146, EASE_MODAL)) * (1 - prog(f, 186, 198, EASE_MODAL));
  const backDim = 0.12 * prog(f, 136, 146) * (1 - prog(f, 186, 198));

  // the dialog, lifted: aimed at the filled dialog's box, pushing in slowly,
  // then dropping away into the feed
  const dKeys: Key[] = [
    { f: 136, cx: 196.5, cy: 426, z: 2.22, fx: 540, fy: 1236 },
    { f: 150, z: 2.3, ease: (t) => t },
    { f: 160, cy: 500, z: 2.7, fy: 1160, ease: EASE_MODAL },
    { f: 184, cy: 510, z: 2.85, ease: (t) => t },
    { f: 189, cy: 520, z: 2.3, fy: 1130, ease: EASE_MODAL },
    { f: 194, cy: 330, z: 1.1, fy: 1000, ease: EASE_FLING },
  ];
  const dCam = camAt(dKeys, f);
  const dialogIn = prog(f, 136, 141, EASE_MODAL);
  const dialogOut = prog(f, 188, 193, EASE_MODAL);

  // the toast: the app's own "Saved to Machina", floated under the dialog
  // the pill inside the toast's container (measured off the capture)
  const toastPill: [number, number, number, number] = [16, 755, 361, 48];
  const tKeys: Key[] = [
    { f: 184, cx: 196.5, cy: 779, z: 2.1, fx: 540, fy: 1720 },
    { f: 190, fy: 1640 },
    { f: 200, cx: 196.5, cy: 779, z: 2.3, fx: 540, fy: 1080 + (779 - 300) * 2.3, ease: EASE_IN_OUT },
  ];
  const tCam = camAt(tKeys, f);
  const toastIn = prog(f, S.saved, S.saved + 6, EASE_MODAL);

  // ── the iris: the + button opens into the screen
  const iris =
    f < HANDOFF.end ? { x: 196.5, y: 811, r: mix(20, 980, prog(f, HANDOFF.iris, HANDOFF.end, EASE_IN_OUT)) } : null;

  const plus = center(rectOf(T, 0, 'plus'));
  // the search field (Find's box: same pixels) for the tap that hands over
  const search = center(rectOf('find', at('find', 'focus', 4), 'search'));
  const save = center(rectOf(T, at(T, 'filled'), 'save'));
  const card = rectOf(T, at(T, 'landed'), 'firstCard');
  const landT = prog(f, S.cardLands - 1, S.cardLands + 5, EASE_SPRING);
  // settled before the hand-over to Find
  const settle = prog(f, S.cardLands + 4, S.searchTap - 1, EASE_MODAL);

  return (
    <AbsoluteFill>
      {/* the screen */}
      <AppShot
        take={T}
        i={baseFrame}
        cam={base}
        iris={iris}
        blur={backBlur}
        dim={backDim}
        shadow={f < HANDOFF.end ? 0 : 1}
        motion={onFind ? camVelocity(findKeys, f) : undefined}
        sheen={f < 150 ? prog(f, 124, 150, EASE_MODAL) : f >= 194 ? prog(f, 194, S.searchTap - 1, EASE_MODAL) : 0}
      >
        <Tap x={plus.x} y={plus.y} t={prog(f, S.plusTap - 5, S.plusTap + 9, (t) => t)} />
        <Tap x={search.x} y={search.y} t={prog(f, S.searchTap - 5, S.searchTap + 9, (t) => t)} />
        {landed && (
          <Lift
            take={T}
            i={baseFrame}
            rect={card}
            radius={20}
            lift={landT * (1 - settle)}
            ring={0.8 * (1 - settle) * prog(f, S.cardLands - 1, S.cardLands + 1)}
          />
        )}
      </AppShot>

      {/* the dialog, lifted off the screen */}
      {f >= 136 && dialogOut < 1 && (
        <AppShot
          take={T}
          i={dialogFrame}
          cam={dCam}
          crop={dialogRect}
          cropRadius={24}
          opacity={dialogIn * (1 - dialogOut)}
        >
          <Tap x={save.x} y={save.y} t={prog(f, S.saveTap - 5, S.saveTap + 9, (t) => t)} />
        </AppShot>
      )}

      {/* the toast */}
      {f >= S.saved && f < 204 && (
        <AppShot
          take={T}
          i={walk(f, S.saved, 'done', 20)}
          cam={tCam}
          crop={toastPill}
          cropRadius={12}
          opacity={toastIn * (1 - prog(f, 196, 204, EASE_MODAL))}
          shadow={0.7}
        />
      )}
    </AbsoluteFill>
  );
};
