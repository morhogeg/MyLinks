import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Phone } from '../ui/Phone';
import { useFraming } from '../film/format';
import { FloorGlow, Rig, SET_BG, Stage } from '../film/effects';
import { drift, prog, ramp, EASE_IN_OUT, EASE_MODAL } from '../film/anim';
import { DigestScreen } from '../ui/screens';

/**
 * The digest — what Machina brings back without being asked.
 *
 * Three bars now (was two). The scene has two ideas — the weekly write-up and
 * the resurfaced save — and at two bars the second one landed as the shot was
 * already leaving. The camera now reads the synthesis first, then travels down
 * to the "never revisited" card as its own beat.
 */
export const DigestScene: React.FC = () => {
  const f = useCurrentFrame();
  const fr = useFraming();

  const digEnter = prog(f, 4, 32, EASE_MODAL);
  const revEnter = prog(f, 66, 96, EASE_MODAL);

  const push = prog(f, 40, 200, EASE_IN_OUT);
  const scale = 1.46 + push * 0.24;
  // From the synthesis card down to the resurfaced save under it. Vertical
  // shortens the travel and adds a downward bias — the full journey lifted the
  // device's top edge INTO the caption block (owner screenshot, round 10).
  const target = ramp(f, [56, 190], [280, fr.vertical ? 340 : 405], EASE_IN_OUT);
  const y = fr.focusY(target, scale * fr.scaleMul) + drift(f, 4, 220) + (fr.vertical ? 120 : 0);
  const rotY = 0; // zero 3D — crispness over drama (round 13f)

  const out = 1 - prog(f, 213, 225);
  const inFade = prog(f, 0, 4);

  return (
    <AbsoluteFill style={{ background: SET_BG, opacity: out * inFade }}>
      <Stage intensity={0.64} backlight={0.36} />
      <Rig scale={scale * fr.scaleMul} rotY={rotY} x={fr.baseX} y={y} origin="center 40%">
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
