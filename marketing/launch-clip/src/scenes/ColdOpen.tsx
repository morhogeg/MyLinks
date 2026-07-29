import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { CitationGlyph } from '../ui/Brand';
import { Stage } from '../film/effects';
import { drift, prog, ramp, EASE_OUT, EASE_SPRING } from '../film/anim';

/**
 * Cold open — the mark assembles.
 *
 * The identity IS a citation: two brackets and the thing they hold. So the film
 * opens by performing it. The brackets travel in from off-frame and decelerate
 * hard; the dot lands between them on the score's first impact (bar 0.75). No
 * words yet — the first thing the audience learns is the shape.
 */
export const ColdOpen: React.FC = () => {
  const f = useCurrentFrame();

  // brackets close in and settle — one hard deceleration, no bounce
  const assembly = prog(f, 4, 26, EASE_OUT);
  // the dot arrives on the impact, with a tiny overshoot
  const IMPACT = 22;
  const dot = ramp(f, [IMPACT, IMPACT + 13], [0, 1], EASE_SPRING);

  // the whole mark breathes back from a hair too large, then floats
  const scale = ramp(f, [4, 40], [1.075, 1], EASE_OUT) * ramp(f, [110, 150], [1, 1.035], EASE_OUT);
  const y = drift(f, 5, 260) - ramp(f, [60, 150], [0, 8], EASE_OUT);

  // impact bloom
  const bloom = Math.max(0, 1 - Math.max(0, f - IMPACT) / 26);
  const stageUp = prog(f, IMPACT - 6, 70);

  // the frame lets go at the end so the cut into the next scene isn't a jolt
  const out = 1 - prog(f, 138, 150);

  return (
    <AbsoluteFill style={{ background: '#050505', opacity: out }}>
      <Stage intensity={stageUp * 0.55} />

      {/* the bloom the dot makes when it lands */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(38% 34% at 50% 47%, rgba(242,245,250,${
            0.4 * bloom * bloom
          }) 0%, rgba(203,210,226,0) 70%)`,
        }}
      />

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            transform: `translateY(${y}px) scale(${scale})`,
            color: '#F2F5FA',
            width: 330,
            height: 306,
            filter: `drop-shadow(0 0 ${26 + bloom * 70}px rgba(203,210,226,${0.3 + bloom * 0.45}))`,
          }}
        >
          <CitationGlyph
            style={{ width: '100%', height: '100%' }}
            assembly={assembly}
            dot={dot}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
