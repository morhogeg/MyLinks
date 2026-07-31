import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { CONSTELLATION, PANEL_OFFSET, PlatformPanel } from '../ui/platforms';
import { Stage } from '../film/effects';
import { drift, prog, ramp, EASE_IN_OUT, EASE_OUT } from '../film/anim';

/**
 * Act one: the scatter.
 *
 * Straight from the founder letter — a post on Instagram, a thread on X, a video
 * on YouTube, an article somewhere else, links messaged to yourself. Five
 * surfaces, none of them talking to the others, everything kept exactly the way
 * it arrived.
 *
 * The scene ends by letting them go: the panels drift apart and fade out one by
 * one until the frame is empty. That is the letter's actual complaint — not
 * "my list is messy" but "everything that interested me was quietly
 * disappearing" — and an empty frame says it without a word of copy.
 *
 * Deliberately un-branded surfaces: if any of this wore Machina's chrome, the
 * audience would read the failure as the product's.
 */
export const Scatter: React.FC = () => {
  const f = useCurrentFrame();

  // the panels arrive fast, then keep drifting apart for the whole scene
  const arrive = prog(f, 0, 40, EASE_OUT);
  const apart = ramp(f, [30, 225], [0, 1], EASE_IN_OUT);

  // camera: a slow lateral drift across the constellation, easing back so all
  // five are in frame by the time they start disappearing
  const pull = prog(f, 0, 170, EASE_IN_OUT);
  const camScale = 1.14 - pull * 0.2;
  const camRotY = ramp(f, [0, 225], [9, -7], EASE_IN_OUT);
  const camX = ramp(f, [0, 225], [-70, 60], EASE_IN_OUT);
  const camY = drift(f, 8, 300) - 18;

  const out = 1 - prog(f, 214, 225);

  return (
    <AbsoluteFill style={{ background: '#050505', opacity: out }}>
      <Stage intensity={0.58} backlight={0.32} />

      <AbsoluteFill
        style={{
          perspective: 1700,
          perspectiveOrigin: '50% 48%',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: 1,
            height: 1,
            transformStyle: 'preserve-3d',
            transform: `translate3d(${camX}px, ${camY}px, 0) rotateY(${camRotY}deg) scale(${camScale})`,
          }}
        >
          {CONSTELLATION.map((p, i) => {
            // each panel arrives on its own beat and leaves on its own beat
            const inT = prog(f, i * 6, 30 + i * 6, EASE_OUT);
            // …and goes quiet one by one, in a different order than it arrived
            const gone = prog(f, 150 + ((i * 13) % 5) * 11, 186 + ((i * 13) % 5) * 11, EASE_IN_OUT);

            const x = p.x + p.dx * apart;
            const y = p.y + p.dy * apart;
            const z = p.z - inT * 0 - (1 - inT) * 260;
            const depthBlur = Math.abs(p.z) / 165 + gone * 5;

            return (
              <div
                key={p.k}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  // centred in LAYOUT — see PANEL_OFFSET's note
                  marginLeft: PANEL_OFFSET.x,
                  marginTop: PANEL_OFFSET.y,
                  transform: [
                    `translate3d(${x}px, ${y}px, ${z}px)`,
                    `rotateY(${p.rotY}deg) rotateX(${p.rotX}deg)`,
                  ].join(' '),
                  opacity: inT * (1 - gone) * arrive,
                  filter: `blur(${depthBlur}px) saturate(${1 - gone * 0.9}) brightness(${
                    1 - gone * 0.4
                  })`,
                }}
              >
                <PlatformPanel k={p.k} />
              </div>
            );
          })}
        </div>
      </AbsoluteFill>

      {/* the frame closing in as they go */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(78% 66% at 50% 48%, rgba(5,5,5,0) 42%, rgba(5,5,5,${
            0.3 + prog(f, 150, 225) * 0.5
          }) 100%)`,
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};
