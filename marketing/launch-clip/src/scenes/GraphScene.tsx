import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Phone } from '../ui/Phone';
import { FloorGlow, Rig, Stage } from '../film/effects';
import { BASE_SCALE, BASE_Y, drift, prog, ramp, EASE_IN_OUT, EASE_MODAL, EASE_OUT } from '../film/anim';
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

  const draw = prog(f, 4, 130, EASE_IN_OUT);
  const labels = prog(f, 96, 130, EASE_MODAL);
  const backPill = prog(f, 118, 140, EASE_MODAL);

  // camera: in tight on the memory cluster, then a long pull back
  const pull = prog(f, 20, 200, EASE_IN_OUT);
  const scale = BASE_SCALE * (1.72 - pull * 0.7);
  const x = ramp(f, [20, 200], [70, 0], EASE_IN_OUT);
  const y = BASE_Y + ramp(f, [20, 200], [110, 0], EASE_IN_OUT) + drift(f, 4, 260);
  const rotY = ramp(f, [150, 225], [0, -7], EASE_IN_OUT);

  const out = 1 - prog(f, 213, 225);
  const inFade = prog(f, 0, 9);

  return (
    <AbsoluteFill style={{ background: '#050505', opacity: out * inFade }}>
      <Stage intensity={0.6} backlight={0.44} />
      <Rig scale={scale} x={x} y={y} rotY={rotY} origin="center 40%">
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
          background: `radial-gradient(40% 34% at 50% 44%, rgba(174,184,206,${
            0.1 * prog(f, 10, 90)
          }) 0%, rgba(174,184,206,0) 72%)`,
          mixBlendMode: 'screen',
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};
