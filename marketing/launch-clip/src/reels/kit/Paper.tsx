import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Grain, Vignette } from '../../film/effects';
import { HAZE_TILE, NIGHT, stageLight } from '../../look';

/**
 * The set every Machina reel is shot on: the NIGHT set (src/look.ts). Near
 * black, lit like a product stage: a soft top light where the type lives, a
 * cool key light behind the product (`lift` scales it), a violet and a teal
 * pool at the edges for depth, and a slow haze so a hold is never a flat fill.
 * `drift` moves the light (pass a slow function of the frame; by default it
 * wanders on its own).
 *
 * (The name is the light grade's, kept so every scene picks the night set up
 * unchanged: the films were "ink on paper" until 2026-10-05.)
 *
 * Grade rules: the light is the subject. No pure-black crush on the product,
 * no colour casts on the app's pixels, nothing that bands: the gradients are
 * dithered and the lens adds grain.
 */
export const Paper: React.FC<{ drift?: number; lift?: number; children?: React.ReactNode }> = ({ drift, lift = 1, children }) => {
  const frame = useCurrentFrame();
  const d = drift ?? Math.sin(frame / 180) * 0.5;
  return (
    <AbsoluteFill style={{ background: NIGHT.set, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: stageLight(d, { key: lift }) }} />
      <Haze frame={frame} />
      {/* on the set only: the app's screens and the type sit on top of it */}
      <Dither />
      {children}
    </AbsoluteFill>
  );
};

/** the haze: soft noise clouds, screened, sliding a pixel every few frames */
export const Haze: React.FC<{ frame: number; opacity?: number }> = ({ frame, opacity = 0.045 }) => (
  <AbsoluteFill
    style={{
      backgroundImage: HAZE_TILE,
      backgroundSize: '1920px 1920px',
      backgroundPosition: `${Math.round(frame * -0.35)}px ${Math.round(frame * 0.12)}px`,
      mixBlendMode: 'screen',
      opacity,
      pointerEvents: 'none',
    }}
  />
);

/**
 * Dither. The set is a few very soft gradients on near black, and Chromium
 * draws gradients in 8 bits: on a dark ground one code value is a visible
 * step, so the pools would ring. This is a fixed, fine noise of about one
 * code value UP (a white speck's lift on a tone v is a × (1 − v) × 255; on
 * the set's tones, about 0.004 of alpha is one code value), so the steps
 * dissolve. It does not move, so it costs the encoder nothing frame to frame,
 * and it lives UNDER the app and the type.
 */
const DITHER_TILE = `url("data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><filter id='d' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='7' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0.016 0 0 0 -0.004'/></filter><rect width='256' height='256' filter='url(#d)'/></svg>`,
)}")`;

export const Dither: React.FC = () => <AbsoluteFill style={{ backgroundImage: DITHER_TILE, pointerEvents: 'none' }} />;

/** The lens over everything: grain and a deep, soft vignette. */
export const Lens: React.FC = () => (
  <>
    <Vignette strength={1} />
    <Grain opacity={0.06} />
  </>
);
