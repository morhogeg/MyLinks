import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Phone } from '../ui/Phone';
import { useFraming } from '../film/format';
import { FloorGlow, Rig, SET_BG, Stage } from '../film/effects';
import { drift, prog, ramp, EASE_IN_OUT, EASE_MODAL } from '../film/anim';
import { CollectionsScreen } from '../ui/screens';

/**
 * Collections — the half of the organising that is YOURS.
 *
 * Machina files every save on its own; a collection is the shape you impose on
 * top of that. Three bars now (was two): enough to watch the grid land, read a
 * topic or two, and take in the line — the whip-cut pace was why the beat
 * never registered as its own feature.
 */
export const CollectionsScene: React.FC = () => {
  const f = useCurrentFrame();
  const fr = useFraming();

  const enter = prog(f, 2, 74, EASE_MODAL);

  const push = prog(f, 26, 200, EASE_IN_OUT);
  const scale = 1.42 + push * 0.22;
  // the grid fills the frame, drifting down through the second row — vertical
  // shortens the travel so the device top never rides into the caption block
  const target = ramp(f, [26, 200], [270, fr.vertical ? 315 : 355], EASE_IN_OUT);
  const y = fr.focusY(target, scale * fr.scaleMul) + drift(f, 4, 240) + (fr.vertical ? 90 : 0);
  const rotY = ramp(f, [0, 210], [10, 4], EASE_IN_OUT);

  const out = 1 - prog(f, 213, 225);
  const inFade = prog(f, 0, 4);

  return (
    <AbsoluteFill style={{ background: SET_BG, opacity: out * inFade }}>
      <Stage intensity={0.64} backlight={0.36} />
      <Rig scale={scale * fr.scaleMul} rotY={rotY} x={fr.baseX} y={y} origin="center 40%">
        <div style={{ position: 'relative' }}>
          <FloorGlow y={890} w={700} opacity={0.45} />
          <Phone>
            <CollectionsScreen enter={enter} />
          </Phone>
        </div>
      </Rig>
    </AbsoluteFill>
  );
};
