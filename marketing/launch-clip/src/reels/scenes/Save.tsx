import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HITS } from '../../../reel-timeline.mjs';
import { AppShot, Lift, Tap } from '../kit/AppShot';
import { camAt, camVelocity, type Key } from '../kit/camera';
import { EASE_FLING, EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../kit/curves';
import { at, center, rectOf } from '../kit/takes';
import { HANDOFF, SAVE_OPEN_CAM } from './handoff';

/**
 * 6.9s – 15.5s. SAVE: the + button, Add to Machina, the five real phases
 * (web/lib/scanPhases.ts, as the app shows them, one per beat), the card
 * landing in the feed, and then the point of it all: the card is opened, and
 * it holds the gist, the Key Points and the one thing it asks you to do.
 *
 * Every pixel of UI is the app (take "save"). Two liberties, both camera:
 * the dialog is LIFTED off its screen (the real app dims the screen behind
 * it to near-black, which would flip the reel's light grade), and the phases
 * are timed to the score's beats (the capture holds each phase; the reel
 * shows each one on its beat).
 */

const T = 'save';
const S = HITS;
const linear = (t: number) => t;

/** frame of the take for this reel frame, walking `mark` from `from` */
const walk = (f: number, from: number, mark: string, len = 9) => at(T, mark, Math.min(len, Math.max(0, f - from)));

/** the dialog drops away into the feed */
const DROP = S.saved + 4;
/** the detail view opens (the app's own transition, a few frames) */
const OPEN = S.cardTap + 4;

// the establishing camera (the + button, from the match cut) → pushed back
// behind the dialog → forward onto the feed as the card lands → reading the
// card → the card's own detail view, then its Key Points
const baseKeys: Key[] = [
  { f: HANDOFF.iris, ...SAVE_OPEN_CAM, rx: 9 },
  { f: HANDOFF.end - 2, z: 1.56, rx: 0, ease: EASE_MODAL },
  { f: S.dialog + 6, cx: 196.5, cy: 430, z: 1.38, fx: 540, fy: 1190, ease: EASE_IN_OUT },
  { f: S.saved, z: 1.44, ease: linear },
  { f: S.cardLands, cx: 196.5, cy: 300, z: 2.3, fx: 540, fy: 1080, ease: EASE_IN_OUT },
  // reading the new card, top to bottom
  { f: S.cardTap - 4, cy: 318, z: 2.42, ease: linear },
  // the detail view: title, the gist, the Key Points and "Do this" in one frame
  { f: OPEN + 14, cx: 196.5, cy: 255, z: 2.4, fx: 540, fy: 1180, ease: EASE_MODAL },
  { f: S.keyPoints, cy: 258, z: 2.42, ease: linear },
  // in onto the Key Points as the view scrolls them up
  // (down to its one "Do this" line, which the title makes room for)
  { f: S.keyPoints + 20, cy: 384, z: 2.4, fy: 1150, ease: EASE_IN_OUT },
  { f: 463, cy: 388, z: 2.44, ease: linear },
];

export const Save: React.FC<{ f: number }> = ({ f }) => {
  if (f < HANDOFF.iris || f >= 464) return null;

  // ── which real frame is on the dialog
  const phase = S.phases.findIndex((p, k) => f >= p && (k === S.phases.length - 1 || f < S.phases[k + 1]));
  const dialogFrame =
    f < S.phases[0]
      ? at(T, 'filled')
      : f < S.saved
        ? walk(f, S.phases[phase], `phase${phase}`, 9)
        : walk(f, S.saved, 'done', 20);
  const dialogRect = rectOf(T, dialogFrame, 'dialog');

  // ── the screen behind: Home, then the feed with the new card, then the
  // card itself (the detail view, and its scroll down to the Key Points)
  const scrollSteps = 10;
  const baseFrame =
    f < DROP + 2
      ? at(T, 'home')
      : f < OPEN
        ? at(T, 'landed')
        : f < S.keyPoints + 4
          ? at(T, 'detail', Math.min(17, f - OPEN + 1))
          : at(T, 'detailScroll', Math.round(prog(f, S.keyPoints + 4, S.keyPoints + 22, EASE_IN_OUT) * scrollSteps));

  const base = camAt(baseKeys, f);
  const backBlur = mix(0, 16, prog(f, S.dialog, S.dialog + 10, EASE_MODAL)) * (1 - prog(f, S.saved + 2, S.cardLands - 2, EASE_MODAL));
  const backDim = 0.12 * prog(f, S.dialog, S.dialog + 10) * (1 - prog(f, S.saved + 2, S.cardLands - 2));

  // the dialog, lifted: aimed at the filled dialog's box, pushing in onto the
  // checklist as it works, then dropping away into the feed
  const dKeys: Key[] = [
    { f: S.dialog, cx: 196.5, cy: 426, z: 2.22, fx: 540, fy: 1236 },
    { f: S.saveTap + 2, z: 2.3, ease: linear },
    { f: S.phases[0] + 6, cy: 500, z: 2.7, fy: 1160, ease: EASE_MODAL },
    { f: S.saved, cy: 510, z: 2.85, ease: linear },
    { f: DROP + 1, cy: 520, z: 2.3, fy: 1130, ease: EASE_MODAL },
    { f: DROP + 6, cy: 330, z: 1.1, fy: 1000, ease: EASE_FLING },
  ];
  const dCam = camAt(dKeys, f);
  const dialogIn = prog(f, S.dialog, S.dialog + 5, EASE_MODAL);
  const dialogOut = prog(f, DROP, DROP + 5, EASE_MODAL);

  // the toast: the app's own "Saved to Machina", floated under the dialog
  // (the pill inside the toast's container, measured off the capture)
  const toastPill: [number, number, number, number] = [16, 755, 361, 48];
  const tKeys: Key[] = [
    { f: S.saved, cx: 196.5, cy: 779, z: 2.1, fx: 540, fy: 1720 },
    { f: S.saved + 6, fy: 1640 },
    { f: S.cardLands, cx: 196.5, cy: 779, z: 2.3, fx: 540, fy: 1080 + (779 - 300) * 2.3, ease: EASE_IN_OUT },
  ];
  const tCam = camAt(tKeys, f);
  const toastIn = prog(f, S.saved, S.saved + 6, EASE_MODAL);

  // ── the iris: the + button opens into the screen
  const iris =
    f < HANDOFF.end ? { x: 196.5, y: 811, r: mix(20, 980, prog(f, HANDOFF.iris, HANDOFF.end, EASE_IN_OUT)) } : null;

  const plus = center(rectOf(T, 0, 'plus'));
  const save = center(rectOf(T, at(T, 'filled'), 'save'));
  const card = rectOf(T, at(T, 'landed'), 'firstCard');
  const cardAt = { x: card[0] + 120, y: card[1] + 40 }; // where the capture tapped it
  const landT = prog(f, S.cardLands - 1, S.cardLands + 5, EASE_SPRING);
  const settle = prog(f, S.cardLands + 5, S.cardLands + 20, EASE_MODAL);
  // the Key Points, marked as they arrive (a lift and an ink ring, never a recolour)
  const kp = f >= S.keyPoints + 4 ? rectOf(T, baseFrame, 'points') : null;
  const kpIn = prog(f, S.keyPoints + 20, S.keyPoints + 28, EASE_SPRING) * (1 - prog(f, 448, 460, EASE_MODAL));

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
        motion={f >= S.cardLands ? camVelocity(baseKeys, f) : undefined}
        sheen={f < 230 ? prog(f, 204, 230, EASE_MODAL) : 0}
      >
        <Tap x={plus.x} y={plus.y} t={prog(f, S.plusTap - 5, S.plusTap + 9, linear)} />
        <Tap x={cardAt.x} y={cardAt.y} t={prog(f, S.cardTap - 5, S.cardTap + 9, linear)} />
        {f >= DROP + 2 && f < OPEN && (
          <Lift
            take={T}
            i={baseFrame}
            rect={card}
            radius={20}
            lift={landT * (1 - settle)}
            ring={0.8 * (1 - settle) * prog(f, S.cardLands - 1, S.cardLands + 1)}
          />
        )}
        {kp && kpIn > 0.01 && <Lift take={T} i={baseFrame} rect={[kp[0] - 6, kp[1] - 6, kp[2] + 12, kp[3] + 12]} radius={12} lift={kpIn * 0.35} rise={2} grow={0.01} ring={0.55 * kpIn} />}
      </AppShot>

      {/* the dialog, lifted off the screen */}
      {f >= S.dialog && dialogOut < 1 && (
        <AppShot take={T} i={dialogFrame} cam={dCam} crop={dialogRect} cropRadius={24} opacity={dialogIn * (1 - dialogOut)}>
          <Tap x={save.x} y={save.y} t={prog(f, S.saveTap - 5, S.saveTap + 9, linear)} />
        </AppShot>
      )}

      {/* the toast */}
      {f >= S.saved && f < S.cardLands + 4 && (
        <AppShot
          take={T}
          i={walk(f, S.saved, 'done', 20)}
          cam={tCam}
          crop={toastPill}
          cropRadius={12}
          opacity={toastIn * (1 - prog(f, S.cardLands - 4, S.cardLands + 4, EASE_MODAL))}
          shadow={0.7}
        />
      )}
    </AbsoluteFill>
  );
};
