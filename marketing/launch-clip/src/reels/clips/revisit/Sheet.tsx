import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE_IN_OUT, EASE_MODAL, prog } from '../../kit/curves';
import { Dither } from '../../kit/Paper';
import { SHEET_BG } from './Ink';

/**
 * The pad the list is written on. A sheet is the whole frame; it leaves by
 * TEARING OFF (its top edge rips along the binding, then it is yanked down
 * and away, turning, its shadow on whatever is under it) and a new one
 * arrives by LANDING (dropped onto the pad from above, settling flat).
 *
 * `tearAt(f, from)` and `landAt(f, from, len)` give the sheet's transform for
 * a frame; `Sheet` draws it (paper, the torn edge once ripped, the shadow it
 * casts) around its children.
 */

export type SheetPose = {
  x: number;
  y: number;
  rot: number;
  lift: number;
  torn: number;
  gone: boolean;
  /** (round 4) the landing comes down onto the pad toward the camera */
  scale?: number;
  alpha?: number;
};

const REST: SheetPose = { x: 0, y: 0, rot: 0, lift: 0, torn: 0, gone: false };

/**
 * The tear (round 4): 6 frames of rip along the binding, the sheet sagging
 * off its last corner as it goes, then 13 of being pulled down and away,
 * picking up speed from rest the whole way (it used to be thrown at full
 * speed in its first frame and was gone in five).
 */
export const tearAt = (f: number, from: number): SheetPose => {
  if (f < from) return REST;
  const rip = prog(f, from, from + 6, EASE_IN_OUT);
  const u = Math.min(1, Math.max(0, (f - from - 4) / 13));
  return {
    x: -14 * rip - 300 * Math.pow(u, 2.2),
    y: 10 * rip + 2250 * u * u,
    rot: -1.6 * rip - 17 * Math.pow(u, 1.6),
    lift: Math.min(1, rip * 1.3),
    torn: rip,
    gone: f >= from + 17,
  };
};

/**
 * The landing (round 4): a sheet dropped onto the pad from above, toward the
 * camera: it comes in a little large and out of the dark of its own shadow,
 * and settles flat (it used to slam down from above the frame, 2000px in
 * four frames).
 */
export const landAt = (f: number, from: number, len = 14): SheetPose => {
  if (f < from) return { ...REST, gone: true };
  const t = prog(f, from, from + len, EASE_MODAL);
  return {
    x: 0,
    y: -70 * (1 - t),
    rot: -2.2 * (1 - t),
    lift: 1 - prog(f, from + len - 6, from + len + 4, EASE_IN_OUT),
    torn: 0,
    gone: false,
    scale: 1 + 0.1 * (1 - t),
    // in over six frames, eased both ends: quicker read as a pop (60% in
    // its first frame), slower as two pages stacked
    alpha: prog(f, from, from + 6, EASE_IN_OUT),
  };
};

/** a torn edge: a ragged line across the sheet's top, a few px deep */
const TORN = (() => {
  const pts: string[] = [];
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let x = 0; x <= 1080; x += 18) pts.push(`${x}px ${(4 + rnd() * 9).toFixed(1)}px`);
  return `polygon(${pts.join(', ')}, 1080px 1920px, 0px 1920px)`;
})();

export const Sheet: React.FC<{ pose: SheetPose; children?: React.ReactNode; background?: string }> = ({ pose, children, background = SHEET_BG }) => {
  if (pose.gone) return null;
  const { x, y, rot, lift, torn, scale = 1, alpha = 1 } = pose;
  return (
    <AbsoluteFill
      style={{
        // (a landing sheet scales about the frame's middle; the tear turns on
        // the binding's corner)
        transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${rot.toFixed(3)}deg)${scale !== 1 ? ` scale(${scale.toFixed(5)})` : ''}`,
        transformOrigin: scale !== 1 ? '540px 960px' : '1080px 0px',
        opacity: alpha < 1 ? alpha : undefined,
      }}
    >
      {/* the shadow it casts on what is under it */}
      {lift > 0.002 && (
        <AbsoluteFill
          style={{
            boxShadow: `0 ${18 + 40 * lift}px ${60 + 90 * lift}px rgba(24,32,48,${(0.28 * lift).toFixed(3)}), 0 2px 6px rgba(24,32,48,${(0.12 * lift).toFixed(3)})`,
            borderRadius: 2,
          }}
        />
      )}
      <AbsoluteFill style={{ background, overflow: 'hidden', clipPath: torn > 0 ? TORN : undefined }}>
        {/* (the kit's dither: Chromium draws the paper's gradient in 8 bits) */}
        <Dither />
        {children}
        {/* the rip catches the light: a faint fibrous edge along the top */}
        {torn > 0 && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 0,
              height: 16,
              background: 'linear-gradient(180deg, rgba(255,255,255,0.9), rgba(255,255,255,0))',
              opacity: torn,
            }}
          />
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
