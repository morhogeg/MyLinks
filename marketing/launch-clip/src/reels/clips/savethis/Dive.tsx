import React from 'react';
import { AbsoluteFill } from 'remotion';
import { camAt } from '../../kit/camera';
import { EASE_IN_OUT, prog } from '../../kit/curves';
import { Paper } from '../../kit/Paper';
import { appKeys, COVER, HANDOVER } from './App';
import { GRADE } from './grade';
import { PosterArt } from './Poster';

/**
 * Into the cover, and out as frame 0.
 *
 * (round 6) The dive ends in the card this reel's citation opens. Its cover
 * is the poster whole (object-contain, 9:16), so when the dive's camera has
 * it centred and exactly the frame's width (App.tsx DIVE_CAM) it IS the
 * frame, and its pixels are frame 0's. The capture holds 4 px a point and
 * the dive ends at 4.8, so over its last frames the poster itself fades in
 * over the captured one, registered by the camera's own mapping, and the
 * reel lands on frame 0 crisp and runs on into its own hook.
 *
 * `paperDrift` is the set's drift, periodic over the reel, so this last
 * frame and frame 0 are the same picture.
 */
const FADE = 8;

export const Dive: React.FC<{ f: number; paperDrift: number }> = ({ f, paperDrift }) => {
  if (f < HANDOVER - FADE) return null;
  const cam = camAt(appKeys, f);
  // the cover's box on the frame, and the poster scaled into it
  const x = cam.fx + (COVER[0] - cam.cx) * cam.z;
  const y = cam.fy + (COVER[1] - cam.cy) * cam.z;
  const k = (COVER[2] * cam.z) / 1080;
  return (
    <AbsoluteFill style={{ opacity: prog(f, HANDOVER - FADE, HANDOVER, EASE_IN_OUT) }}>
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          width: 1080,
          height: 1920,
          overflow: 'hidden',
          transform: `scale(${k})`,
          transformOrigin: '0 0',
        }}
      >
        <Paper drift={paperDrift} tone={GRADE.tone} cool={GRADE.cool} />
        <PosterArt />
      </div>
    </AbsoluteFill>
  );
};
