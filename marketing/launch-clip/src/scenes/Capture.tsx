import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Phone } from '../ui/Phone';
import { FloorGlow, Rig, Stage } from '../film/effects';
import { BASE_X, BASE_SCALE, BASE_Y, drift, prog, ramp, EASE_IN_OUT, EASE_MODAL, EASE_OUT } from '../film/anim';
import { AnalyzingScreen, ArticleScreen, ShareSheet } from '../ui/screens';

/**
 * Capture — the widest surface in the category, shown end to end in one shot.
 *
 * Article → iOS share sheet → Machina → the real five-phase pipeline → a
 * finished card. The scene deliberately does not cut away during processing: the
 * point being made is that the user's job ended at "share", and the sheet's
 * honest 15 seconds of work is the product's, not theirs.
 */
export const Capture: React.FC = () => {
  const f = useCurrentFrame();

  // ── the device arrives: a fast in, decelerating into an off-axis hold
  const entry = prog(f, 0, 34, EASE_OUT);
  const x = ramp(f, [0, 34], [420, 0], EASE_OUT);
  const yIn = ramp(f, [0, 34], [180, 0], EASE_OUT);
  const rotZ = ramp(f, [0, 40], [7, 0], EASE_OUT);

  // ── share sheet (bar 7.9 ⇒ frame ~67) and the pick glow
  const sheet = prog(f, 28, 60, EASE_MODAL);
  const pick = prog(f, 68, 86, EASE_OUT);

  // ── hand-off to the app: the sheet commits, we're inside Machina
  const inApp = f >= 96;
  // the pipeline's honest ramp — five phases, ending on the card
  const progress = ramp(f, [100, 178], [4, 100], EASE_IN_OUT);
  const cardEnter = prog(f, 174, 198, EASE_MODAL);

  // ── camera: wide angled hold on the article, then a pure-2D push into the
  // sheet as the card resolves (2D so the small UI text stays sharp)
  const shot = prog(f, 96, 114, EASE_MODAL); // the cut's re-frame
  const push = prog(f, 150, 240, EASE_IN_OUT);
  const scale = BASE_SCALE * (1 + shot * 0.1) * (1 + push * 0.46);
  const rotY = ramp(f, [0, 96], [16, 13], EASE_IN_OUT) * (1 - shot);
  const rotX = ramp(f, [0, 96], [8, 6], EASE_IN_OUT) * (1 - shot);
  // push toward the TOP of the screen — that is where the sheet and the new card
  // live, and the earlier centre-weighted push walked the card out of frame
  const camY = BASE_Y + drift(f, 6, 300) + push * 128;
  const camX = shot * -8;

  const out = 1 - prog(f, 288, 300);

  return (
    <AbsoluteFill style={{ background: '#050505', opacity: out * entry }}>
      <Stage intensity={0.62} backlight={0.44} drift={push * 0.4} />
      <Rig
        scale={scale}
        rotY={rotY}
        rotX={rotX}
        rotZ={rotZ}
        x={x + camX + BASE_X}
        y={yIn + camY}
        origin="center 24%"
      >
        <div style={{ position: 'relative' }}>
          <FloorGlow y={890} w={720} opacity={0.5} />
          <Phone sweep={f < 40 ? f / 40 : null}>
            {inApp ? (
              <AnalyzingScreen progress={progress} cardEnter={cardEnter} />
            ) : (
              <>
                <ArticleScreen dim={sheet * 0.55} />
                <ShareSheet open={sheet} pick={pick} />
              </>
            )}
          </Phone>
        </div>
      </Rig>
    </AbsoluteFill>
  );
};
