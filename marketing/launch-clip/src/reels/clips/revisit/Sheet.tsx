import React from 'react';
import { AbsoluteFill } from 'remotion';
import { EASE_FLING, EASE_IN_OUT, EASE_MODAL, prog } from '../../kit/curves';
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

export type SheetPose = { x: number; y: number; rot: number; lift: number; torn: number; gone: boolean };

const REST: SheetPose = { x: 0, y: 0, rot: 0, lift: 0, torn: 0, gone: false };

/** the tear: 4 frames of lift and rip, then 14 of being thrown down-left */
export const tearAt = (f: number, from: number): SheetPose => {
  if (f < from) return REST;
  const rip = prog(f, from, from + 5, EASE_IN_OUT);
  const t = prog(f, from + 3, from + 17, EASE_FLING);
  return {
    x: -260 * t - 30 * rip,
    y: 2300 * t * t + 40 * t + 18 * rip,
    rot: -4 * rip - 18 * t,
    lift: Math.min(1, rip * 1.2),
    torn: rip,
    gone: f >= from + 17,
  };
};

/** the landing: from above the frame to flat, a little turn settling out */
export const landAt = (f: number, from: number, len = 12): SheetPose => {
  if (f < from) return { ...REST, y: -2100, gone: true };
  const t = prog(f, from, from + len, EASE_MODAL);
  return { x: 0, y: -2050 * (1 - t), rot: -3.5 * (1 - t), lift: 1 - prog(f, from + len - 4, from + len + 6, EASE_IN_OUT), torn: 0, gone: false };
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
  const { x, y, rot, lift, torn } = pose;
  return (
    <AbsoluteFill
      style={{
        transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px) rotate(${rot.toFixed(3)}deg)`,
        transformOrigin: '1080px 0px',
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
