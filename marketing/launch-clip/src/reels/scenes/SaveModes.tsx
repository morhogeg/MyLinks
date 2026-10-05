import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HOLDS, MODES } from '../../../reel-timeline.mjs';
import { AppShot, Lift, Tap } from '../kit/AppShot';
import { camAt, camVelocity, type Key } from '../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../kit/curves';
import { at, center, rectOf } from '../kit/takes';
import { saveBaseCam, saveDialogCam } from './Save';

const HOLD = HOLDS.find((h) => h.id === 'modes')!;

/**
 * "Save anything, from anywhere." (owner, round 7: show the Link, Image and
 * Note options, the screenshot path is a strong feature). The Add dialog,
 * lifted off its screen exactly as the Save scene shows it, walks its three
 * real tabs, each tapped on a beat: Image ("Tap to add images / Up to 5
 * screenshots become one card"), Note ("Write a thought, an idea, a
 * quote."), back to Link, and the link is pasted. The source clock holds
 * (reel-timeline.mjs `modes`) and resumes on the filled dialog, which is the
 * frame the Save scene continues from.
 *
 * `u` is OUTPUT frames into the hold. Take "save": `modeImage`, `modeNote`,
 * `modeLink` (each 24 frames at 60fps), then `filled`.
 */

const T = 'save';
const linear = (t: number) => t;

/** the taps, on beats */
const TAPS: [u: number, mark: string, tab: string][] = [
  [MODES.taps[0], 'modeImage', 'tabImage'],
  [MODES.taps[1], 'modeNote', 'tabNote'],
  [MODES.taps[2], 'modeLink', 'tabLink'],
];
const PASTE = MODES.paste;
const SAVE = MODES.save; // Save is tapped here; the Save scene resumes on the phases

const keys: Key[] = [
  // where the Save scene's lifted dialog is at this moment
  { f: 0, ...saveDialogCam(HOLD.at - 0.01) },
  // in onto the tabs and what each one takes: eased in AND out (round 13:
  // from a camera at rest, EASE_MODAL's fast start was a lunge on frame 1)
  { f: 16, cy: 452, z: 2.62, fy: 1230, ease: EASE_IN_OUT },
  { f: HOLD.len, cy: 458, z: 2.7, ease: linear },
];

export const SaveModes: React.FC<{ u: number }> = ({ u }) => {
  let i = at(T, 'modeImage') - 1; // the dialog as it opened, on Link
  for (const [t0, mark] of TAPS) if (u >= t0) i = at(T, mark, Math.min(23, u - t0));
  if (u >= PASTE) i = at(T, 'filled');

  const cam = camAt(keys, u);
  const dialog = rectOf(T, i, 'dialog');
  const save = center(rectOf(T, at(T, 'filled'), 'save'));

  return (
    <AbsoluteFill>
      {/* the screen behind, pushed back (as in the Save scene) */}
      <AppShot
        take={T}
        i={at(T, 'home')}
        // exactly where the Save scene's back-screen is at the hold's frame
        cam={saveBaseCam(HOLD.at)}
        blur={mix(0, 16, prog(HOLD.at, 136, 146, EASE_MODAL))}
        dim={0.12 * prog(HOLD.at, 136, 146)}
      />
      {/* the dialog, lifted */}
      <AppShot take={T} i={i} cam={cam} motion={camVelocity(keys, u, 1)} crop={dialog} cropRadius={24}>
        {TAPS.map(([t0, , tab]) => {
          const r = rectOf(T, at(T, 'modeImage'), tab);
          const c = center(r);
          const ring = prog(u, t0 + 1, t0 + 7, EASE_SPRING) * (1 - prog(u, t0 + 26, t0 + 38, EASE_MODAL));
          return (
            <React.Fragment key={tab}>
              <Tap x={c.x} y={c.y} t={prog(u, t0 - 5, t0 + 13, linear)} />
              {ring > 0.01 && <Lift take={T} i={i} rect={r} radius={9} lift={ring * 0.4} rise={1} grow={0.04} ring={0.5 * ring} />}
            </React.Fragment>
          );
        })}
        <Tap x={save.x} y={save.y} tone="dark" t={prog(u, SAVE - 5, SAVE + 9, linear)} />
      </AppShot>
    </AbsoluteFill>
  );
};
