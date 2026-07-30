import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Phone } from '../ui/Phone';
import { FloorGlow, Rig, Stage } from '../film/effects';
import { BASE_X, BASE_SCALE, BASE_Y, drift, prog, ramp, EASE_IN_OUT, EASE_MODAL, EASE_OUT } from '../film/anim';
import {
  AnalyzingScreen,
  ArticleScreen,
  InstagramSource,
  ShareSheet,
  YouTubeSource,
} from '../ui/screens';

/**
 * Capture, told schematically.
 *
 * The earlier cut showed ONE app (an article), one share sheet, then Machina —
 * which demonstrated that Machina can take a link, not that it can take a link
 * from anywhere. So the share sheet is now the constant: it slides up once and
 * STAYS, while the world behind it cross-cuts through an Instagram carousel, a
 * YouTube video and an article. Same gesture, three different places, no copy.
 *
 * Only then do we go inside the app, for the real five-phase pipeline and the
 * finished card. The user's job ended when they hit share; the rest is ours, and
 * showing that honestly is the whole point of the beat.
 */

const SOURCES = [
  { Screen: InstagramSource, item: { title: 'The forgetting curve, replicated', site: 'instagram.com' } },
  { Screen: YouTubeSource, item: { title: 'Retrieval practice beats re-reading', site: 'youtube.com' } },
  { Screen: ArticleScreen, item: { title: 'Sleep-dependent memory consolidation', site: 'nature.com' } },
];
const CUTS = [0, 62, 96]; // frames where the world behind the sheet swaps

export const Capture: React.FC = () => {
  const f = useCurrentFrame();

  // ── the device arrives
  const entry = prog(f, 0, 32, EASE_OUT);
  const x = ramp(f, [0, 32], [340, 0], EASE_OUT);
  const yIn = ramp(f, [0, 32], [150, 0], EASE_OUT);
  const rotZ = ramp(f, [0, 38], [6, 0], EASE_OUT);

  // ── the sheet comes up once and holds; the SOURCE behind it changes
  const sheet = prog(f, 20, 48, EASE_MODAL);
  const sourceIndex = Math.max(0, CUTS.filter((c) => f >= c).length - 1);
  const source = SOURCES[Math.min(SOURCES.length - 1, sourceIndex)];
  const Source = source.Screen;
  // a one-frame-ish dip on each swap, so it reads as a cut and not a glitch
  const cutDip = sourceIndex > 0 ? prog(f - CUTS[sourceIndex], 0, 7, EASE_OUT) : 1;
  // Machina pulses in the app row on every one of them
  const pick = Math.max(
    prog(f, 36, 50, EASE_OUT) * (1 - prog(f, 54, 62)),
    prog(f, 66, 78, EASE_OUT) * (1 - prog(f, 88, 96)),
    prog(f, 100, 116, EASE_OUT),
  );

  // ── then inside the app: the honest pipeline, ending on a finished card
  const inApp = f >= 128;
  const progress = ramp(f, [132, 196], [4, 100], EASE_IN_OUT);
  const cardEnter = prog(f, 192, 214, EASE_MODAL);

  // ── camera: angled hold on the sheet, then a pure-2D push into the app
  const shot = prog(f, 128, 146, EASE_MODAL);
  const push = prog(f, 170, 250, EASE_IN_OUT);
  const scale = BASE_SCALE * (1 + shot * 0.1) * (1 + push * 0.42);
  const rotY = ramp(f, [0, 128], [15, 12], EASE_IN_OUT) * (1 - shot);
  const rotX = ramp(f, [0, 128], [7, 5], EASE_IN_OUT) * (1 - shot);
  const camY = BASE_Y + drift(f, 6, 300) + push * 120;

  const out = 1 - prog(f, 288, 300);

  return (
    <AbsoluteFill style={{ background: '#050505', opacity: out * entry }}>
      <Stage intensity={0.62} backlight={0.44} drift={push * 0.4} />
      <Rig
        scale={scale}
        rotY={rotY}
        rotX={rotX}
        rotZ={rotZ}
        x={x + BASE_X}
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
                <div style={{ position: 'absolute', inset: 0, opacity: cutDip }}>
                  <Source />
                </div>
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `rgba(4,4,6,${sheet * 0.5})`,
                    zIndex: 70,
                  }}
                />
                <ShareSheet open={sheet} pick={pick} item={source.item} />
              </>
            )}
          </Phone>
        </div>
      </Rig>
    </AbsoluteFill>
  );
};
