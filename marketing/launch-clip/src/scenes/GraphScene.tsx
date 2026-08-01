import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Phone } from '../ui/Phone';
import { useFraming } from '../film/format';
import { FloorGlow, Rig, SET_BG, Stage } from '../film/effects';
import { drift, prog, ramp, EASE_IN_OUT, EASE_MODAL, EASE_OUT } from '../film/anim';
import { GraphScreen } from '../ui/screens';

/**
 * The graph — the one beat a competitor cannot copy, so it gets its own scene.
 *
 * Edges draw in staggered rather than all at once: the shot is about connections
 * being FOUND, computed on every save, not about a finished diagram being
 * revealed. The camera starts tight inside the cluster and pulls back to show
 * that it was a whole library all along.
 */
export const GraphScene: React.FC = () => {
  const f = useCurrentFrame();
  const fr = useFraming();

  const draw = prog(f, 2, 108, EASE_IN_OUT);
  const labels = prog(f, 96, 130, EASE_MODAL);
  // The header stack (Back to Ask / stats / legend) is there from the first
  // frame — the previous scene ended on the finger tapping the Graph chip, so
  // this screen ARRIVES as a navigation, not as a reveal.
  const backPill = prog(f, 0, 10, EASE_MODAL);

  // camera: lands slightly deep (the tap's momentum), settles, then a long
  // pull back as the whole graph reveals
  const pull = prog(f, 20, 200, EASE_IN_OUT);
  const scale = ramp(f, [0, 16], [1.86, 1.72], EASE_OUT) - pull * 0.2;
  const x = ramp(f, [20, 200], [30, 0], EASE_IN_OUT);
  // vertical: the graph screen's tall header stack pushes the canvas down the
  // device, so the device itself drops to keep clear air under the caption
  const y = fr.focusY(ramp(f, [20, 200], [430, 470], EASE_IN_OUT), scale * fr.scaleMul) + drift(f, 3, 260) + (fr.vertical ? 230 : 0);
  // A slow orbit THROUGH square-on rather than a static angle: the graph is the
  // only scene whose subject is spatial, so the camera is the thing that says so.
  const rotY = ramp(f, [0, 225], [9, -8], EASE_IN_OUT);

  const out = 1 - prog(f, 213, 225);
  const inFade = prog(f, 0, 4);

  return (
    <AbsoluteFill style={{ background: SET_BG, opacity: out * inFade }}>
      <Stage intensity={0.64} backlight={0.38} />
      <Rig scale={scale * fr.scaleMul} x={x + fr.baseX} y={y} rotY={rotY} origin="center 40%">
        <div style={{ position: 'relative' }}>
          <FloorGlow y={890} w={700} opacity={0.45} />
          <Phone>
            <GraphScreen draw={draw} labels={labels} backPill={backPill} />
          </Phone>
        </div>
      </Rig>
      {/* a breath of light from the graph itself */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(40% 34% at 50% 44%, rgba(255,255,255,${
            0.22 * prog(f, 10, 90)
          }) 0%, rgba(255,255,255,0) 72%)`,
          mixBlendMode: 'screen',
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};
