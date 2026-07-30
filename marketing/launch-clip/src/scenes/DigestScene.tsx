import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Phone } from '../ui/Phone';
import { FloorGlow, Rig, Stage } from '../film/effects';
import { BASE_X, BASE_SCALE, BASE_Y, drift, prog, ramp, EASE_IN_OUT, EASE_MODAL, EASE_OUT } from '../film/anim';
import { CollectionsScreen, DigestScreen } from '../ui/screens';

/**
 * Two fast beats to close the loop: collections (what you shaped by hand) and
 * the weekly synthesis + resurface nudge (what Machina brings back without being
 * asked). Whip-cut between them — this is the exhale before the endcard, so it
 * moves quickly and does not stop to explain itself.
 */
const CUT = 56;

export const DigestScene: React.FC = () => {
  const f = useCurrentFrame();
  const second = f >= CUT;

  // the whip: a short directional smear either side of the cut
  const whip = Math.max(0, 1 - Math.abs(f - CUT) / 7);
  const whipX = second ? whip * 190 : -whip * 190;
  const whipBlur = whip * 14;

  // beat 1 — collections
  const colEnter = prog(f, 4, 46, EASE_MODAL);
  // beat 2 — the digest
  const digEnter = prog(f, CUT + 4, CUT + 26, EASE_MODAL);
  const revEnter = prog(f, CUT + 24, CUT + 48, EASE_MODAL);

  const scale =
    BASE_SCALE *
    (second ? ramp(f, [CUT, 150], [1.12, 1.3], EASE_IN_OUT) : ramp(f, [0, CUT], [1.18, 1.12], EASE_OUT));
  const rotY = second ? ramp(f, [CUT, 150], [-9, -3], EASE_IN_OUT) : ramp(f, [0, CUT], [12, 8], EASE_IN_OUT);
  const y = BASE_Y + drift(f, 5, 200) + (second ? -24 : -8);

  const out = 1 - prog(f, 140, 150);
  const inFade = prog(f, 0, 4);

  return (
    <AbsoluteFill style={{ background: '#050505', opacity: out * inFade }}>
      <Stage intensity={0.6} backlight={0.42} />
      <Rig scale={scale} rotY={rotY} x={whipX + BASE_X} y={y} blur={whipBlur} origin="center 40%">
        <div style={{ position: 'relative' }}>
          <FloorGlow y={890} w={700} opacity={0.45} />
          <Phone>
            {second ? (
              <DigestScreen enter={digEnter} reviewEnter={revEnter} />
            ) : (
              <CollectionsScreen enter={colEnter} />
            )}
          </Phone>
        </div>
      </Rig>
    </AbsoluteFill>
  );
};
