import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { CONSTELLATION, PANEL_OFFSET, PlatformPanel } from '../ui/platforms';
import { SET_BG, Stage } from '../film/effects';
import { useFraming } from '../film/format';
import { drift, prog, ramp, EASE_IN_OUT, EASE_OUT } from '../film/anim';

/**
 * Act one: the scatter.
 *
 * Straight from the founder letter — a post on Instagram, a thread on X, a video
 * on YouTube, an article somewhere else, links messaged to yourself. Five
 * surfaces, none of them talking to the others, everything kept exactly the way
 * it arrived.
 *
 * The scene ends by letting them go: the panels drift apart and BLEACH out one
 * by one until the frame is empty paper. That is the letter's actual complaint —
 * not "my list is messy" but "everything that interested me was quietly
 * disappearing" — and on the light grade the loss reads as things washing out
 * of view, which is exactly how a forgotten save dies: not dramatically, just
 * fading into the background.
 *
 * Deliberately un-branded surfaces: if any of this wore Machina's chrome, the
 * audience would read the failure as the product's.
 *
 * Three bars (225 frames) — two lines don't need four; the reclaimed bar went
 * to the product scenes.
 */
export const Scatter: React.FC = () => {
  const f = useCurrentFrame();
  const fr = useFraming();
  // The panels must be READABLE — at the old framing they were surfaces you
  // squinted at (owner note). Positions compress toward centre and the camera
  // holds much closer, so each surface is legible at a glance; the drift is
  // shorter for the same reason. Vertical squeezes x hard and opens y instead.
  const vx = fr.vertical ? 0.45 : 0.82;
  const vy = fr.vertical ? 1.45 : 0.85;
  const dv = 0.55; // drift travel, both axes

  // the panels arrive fast, then keep drifting apart for the whole scene
  const arrive = prog(f, 0, 36, EASE_OUT);
  const apart = ramp(f, [26, 190], [0, 1], EASE_IN_OUT);

  // camera: a slow lateral drift across the constellation, easing back so all
  // five are in frame by the time they start disappearing
  const pull = prog(f, 0, 150, EASE_IN_OUT);
  const camScale = (1.38 - pull * 0.24) * (fr.vertical ? 0.88 : 1);
  const camRotY = ramp(f, [0, 210], [9, -7], EASE_IN_OUT);
  const camX = ramp(f, [0, 210], [-70, 60], EASE_IN_OUT);
  const camY = drift(f, 8, 300) - 18;

  const out = 1 - prog(f, 214, 225);

  return (
    <AbsoluteFill style={{ background: SET_BG, opacity: out }}>
      <Stage intensity={0.62} backlight={0.25} />

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
            const inT = prog(f, i * 5, 26 + i * 5, EASE_OUT);
            // …and goes quiet one by one, in a different order than it arrived
            const gone = prog(f, 118 + ((i * 13) % 5) * 10, 152 + ((i * 13) % 5) * 10, EASE_IN_OUT);

            const x = (p.x + p.dx * apart * dv) * vx;
            const y = (p.y + p.dy * apart * dv) * vy;
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
                  // the light-grade exit: desaturate and OVER-brighten, so the
                  // panel bleaches into the paper rather than dimming to black
                  filter: `blur(${depthBlur}px) saturate(${1 - gone * 0.9}) brightness(${
                    1 + gone * 0.35
                  })`,
                }}
              >
                <PlatformPanel k={p.k} />
              </div>
            );
          })}
        </div>
      </AbsoluteFill>

      {/* the frame washing toward white as they go */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(78% 66% at 50% 48%, rgba(238,240,244,0) 42%, rgba(244,246,249,${
            0.25 + prog(f, 118, 210) * 0.5
          }) 100%)`,
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};
