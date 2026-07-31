import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Phone } from '../ui/Phone';
import { FloorGlow, Rig, Stage } from '../film/effects';
import { BASE_X, drift, focusY, prog, ramp, EASE_IN_OUT, EASE_MODAL } from '../film/anim';
import { DigestScreen } from '../ui/screens';

/**
 * The digest — what Machina brings back without being asked.
 *
 * It used to share two bars with Collections behind a whip-cut, which read as
 * one beat rather than two features. They are separate things and each now gets
 * its own scene, its own framing and its own line.
 */
export const DigestScene: React.FC = () => {
  const f = useCurrentFrame();

  const digEnter = prog(f, 4, 30, EASE_MODAL);
  const revEnter = prog(f, 26, 54, EASE_MODAL);

  const push = prog(f, 30, 150, EASE_IN_OUT);
  const scale = 1.46 + push * 0.24;
  // from the synthesis card down to the resurfaced save under it
  const target = ramp(f, [40, 140], [280, 400], EASE_IN_OUT);
  const y = focusY(target, scale) + drift(f, 4, 220);
  const rotY = ramp(f, [0, 150], [-8, -3], EASE_IN_OUT);

  const out = 1 - prog(f, 140, 150);
  const inFade = prog(f, 0, 4);

  return (
    <AbsoluteFill style={{ background: '#050505', opacity: out * inFade }}>
      <Stage intensity={0.6} backlight={0.42} />
      <Rig scale={scale} rotY={rotY} x={BASE_X} y={y} origin="center 40%">
        <div style={{ position: 'relative' }}>
          <FloorGlow y={890} w={700} opacity={0.45} />
          <Phone>
            <DigestScreen enter={digEnter} reviewEnter={revEnter} />
          </Phone>
        </div>
      </Rig>
    </AbsoluteFill>
  );
};
