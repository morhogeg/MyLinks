import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Phone } from '../ui/Phone';
import { FloorGlow, Rig, Stage } from '../film/effects';
import { BASE_X, drift, focusY, prog, ramp, EASE_IN_OUT, EASE_MODAL } from '../film/anim';
import { CollectionsScreen } from '../ui/screens';

/**
 * Collections — the half of the organising that is YOURS.
 *
 * Machina files every save on its own; a collection is the shape you impose on
 * top of that. It is a separate feature from the digest and now has its own
 * beat rather than sharing one behind a whip-cut.
 */
export const CollectionsScene: React.FC = () => {
  const f = useCurrentFrame();

  const enter = prog(f, 2, 60, EASE_MODAL);

  const push = prog(f, 20, 150, EASE_IN_OUT);
  const scale = 1.42 + push * 0.22;
  // the grid fills the frame, drifting down through the second row
  const target = ramp(f, [20, 150], [270, 350], EASE_IN_OUT);
  const y = focusY(target, scale) + drift(f, 4, 240);
  const rotY = ramp(f, [0, 150], [10, 4], EASE_IN_OUT);

  const out = 1 - prog(f, 140, 150);
  const inFade = prog(f, 0, 4);

  return (
    <AbsoluteFill style={{ background: '#050505', opacity: out * inFade }}>
      <Stage intensity={0.6} backlight={0.42} />
      <Rig scale={scale} rotY={rotY} x={BASE_X} y={y} origin="center 40%">
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
