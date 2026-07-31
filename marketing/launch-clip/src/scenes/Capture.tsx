import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Phone } from '../ui/Phone';
import { useFraming } from '../film/format';
import { FloorGlow, Rig, SET_BG, Stage } from '../film/effects';
import { drift, prog, ramp, EASE_IN_OUT, EASE_MODAL, EASE_OUT, EASE_SPRING } from '../film/anim';
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
  { Screen: InstagramSource, item: { title: 'Hidden coves of Sardinia', site: 'instagram.com' } },
  { Screen: YouTubeSource, item: { title: 'Can a machine ever understand?', site: 'youtube.com' } },
  { Screen: ArticleScreen, item: { title: 'The jobs AI actually changes', site: 'theatlantic.com' } },
];
const CUTS = [0, 56, 88]; // frames where the world behind the sheet swaps

export const Capture: React.FC = () => {
  const f = useCurrentFrame();
  const fr = useFraming();

  // ── the device arrives
  const entry = prog(f, 0, 30, EASE_OUT);
  const x = ramp(f, [0, 30], [340, 0], EASE_OUT);
  const yIn = ramp(f, [0, 30], [150, 0], EASE_OUT);
  const rotZ = ramp(f, [0, 36], [6, 0], EASE_OUT);

  // ── the sheet comes up once and holds; the SOURCE behind it changes
  const sheet = prog(f, 18, 44, EASE_MODAL);
  const sourceIndex = Math.max(0, CUTS.filter((c) => f >= c).length - 1);
  const source = SOURCES[Math.min(SOURCES.length - 1, sourceIndex)];
  const Source = source.Screen;
  // a short dip on each swap, so it reads as a cut and not a glitch
  const cutDip = sourceIndex > 0 ? prog(f - CUTS[sourceIndex], 0, 7, EASE_OUT) : 1;
  // Machina pulses in the app row on every one of them
  const pick = Math.max(
    prog(f, 32, 46, EASE_OUT) * (1 - prog(f, 48, 55)),
    prog(f, 58, 70, EASE_OUT) * (1 - prog(f, 80, 88)),
    prog(f, 92, 106, EASE_OUT),
  );
  // …and a FINGER lands on it each time, just ahead of the pulse — the pulses
  // read as consequences of a tap instead of the UI acting on its own
  const taps = [
    prog(f, 26, 46, EASE_IN_OUT),
    prog(f, 52, 72, EASE_IN_OUT),
    prog(f, 86, 106, EASE_IN_OUT),
  ];
  const tap = taps.find((t) => t > 0 && t < 1) ?? 0;

  // ── inside the app. THE PIPELINE IS THE PRODUCT, so it gets the time and the
  // size: ~5.5 seconds under a hard push-in, roughly a second per phase, which
  // is what it takes to actually read "Reading the page" → "Writing the
  // summary" → "Searching connections" and understand what was bought by
  // pressing share.
  const inApp = f >= 118;
  const progress = ramp(f, [126, 292], [3, 100], EASE_IN_OUT);
  // the finished card SETTLES with a spring overshoot (round 13 energy pass) —
  // the one moment in the beat that deserves a physical landing
  const cardEnter = prog(f, 288, 314, EASE_SPRING);
  // the app's animated mark launches as the analyzing sheet arrives
  const markU = prog(f, 120, 159, EASE_OUT);

  // ── camera: angled hold on the sheet, then a straight 2D push onto the
  // checklist (2D so the small type stays sharp), easing back out as the
  // finished card lands.
  const shot = prog(f, 118, 136, EASE_MODAL);
  const push = prog(f, 132, 250, EASE_IN_OUT);
  const settle = prog(f, 288, 360, EASE_IN_OUT);
  // Two framings in one scene: the sheet (which needs the source above it in
  // shot, so it stays a touch wider) and then the checklist, which is the thing
  // the film is actually here to show and gets a hard read at ~1.95×.
  const scale = ramp(f, [0, 30], [1.24, 1.3], EASE_OUT) + push * 0.65 - settle * 0.14;
  const rotY = ramp(f, [0, 118], [13, 10], EASE_IN_OUT) * (1 - shot);
  const rotX = ramp(f, [0, 118], [6, 4], EASE_IN_OUT) * (1 - shot);
  const target = inApp
    ? ramp(f, [128, 300], [300, 250], EASE_IN_OUT)
    : ramp(f, [0, 60], [480, 560], EASE_IN_OUT);
  // Vertical re-aim, per phase (the phase switch is a hard cut, so the jump is
  // invisible): the share-sheet shot drops the device so its top clears the
  // caption band; the pipeline shot lifts it to close the dead gap under it.
  const vNudge = fr.vertical ? (inApp ? -230 : 300) : 0;
  const camY = fr.focusY(target, scale * fr.scaleMul) + drift(f, 5, 320) + vNudge;

  const out = 1 - prog(f, 363, 375);

  return (
    <AbsoluteFill style={{ background: SET_BG, opacity: out * entry }}>
      <Stage intensity={0.66} backlight={0.4} drift={push * 0.4} />
      <Rig
        scale={scale * fr.scaleMul}
        rotY={rotY}
        rotX={rotX}
        rotZ={rotZ}
        x={x + fr.baseX}
        y={yIn + camY}
        origin="center 16%"
      >
        <div style={{ position: 'relative' }}>
          <FloorGlow y={890} w={720} opacity={0.5} />
          <Phone sweep={f < 38 ? f / 38 : null}>
            {inApp ? (
              <AnalyzingScreen progress={progress} cardEnter={cardEnter} markU={markU} markPulse={f} />
            ) : (
              <>
                <div style={{ position: 'absolute', inset: 0, opacity: cutDip }}>
                  <Source />
                </div>
                {/* iOS dims the page behind a sheet with dark glass in light
                    mode too — just far less of it than the dark grade used */}
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `rgba(10,12,18,${sheet * 0.26})`,
                    zIndex: 70,
                  }}
                />
                <ShareSheet open={sheet} pick={pick} tap={tap} item={source.item} />
              </>
            )}
          </Phone>
        </div>
      </Rig>
    </AbsoluteFill>
  );
};
