import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Grain, SET_BG, Vignette } from '../../film/effects';

/**
 * The set every Machina reel is shot on: the film's paper (SET_BG, a shade
 * under the app's #F9FAFB so a white screen still separates), lit for a tall
 * frame. A daylight pool high in frame where the type lives, a lift of light
 * behind the product, two slow cool pools so a hold never reads as a flat
 * fill. `drift` moves the pools (pass a slow function of the frame).
 *
 * Grade rules: light only (ink on paper, never a dark flip), no colour casts,
 * no gradients that band; grain and a whisper of vignette are the lens.
 */
export const Paper: React.FC<{ drift?: number; lift?: number; children?: React.ReactNode }> = ({
  drift = 0,
  lift = 1,
  children,
}) => (
  <AbsoluteFill style={{ background: SET_BG, overflow: 'hidden' }}>
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(90% 42% at 50% 22%, rgba(255,255,255,0.95) 0%, rgba(250,251,253,0.5) 46%, rgba(238,240,244,0) 100%)',
        transform: `translateY(${drift * 40}px)`,
      }}
    />
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '56%',
        width: 1500,
        height: 1500,
        transform: 'translate(-50%, -50%)',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.3) 38%, rgba(255,255,255,0) 70%)',
        filter: 'blur(40px)',
        opacity: lift,
      }}
    />
    <div
      style={{
        position: 'absolute',
        width: 1300,
        height: 1300,
        left: -520 + drift * 70,
        top: 980,
        background: 'radial-gradient(circle, rgba(52,64,84,0.06) 0%, rgba(52,64,84,0) 62%)',
        filter: 'blur(30px)',
      }}
    />
    <div
      style={{
        position: 'absolute',
        width: 1100,
        height: 1100,
        right: -460 - drift * 60,
        top: -260,
        background: 'radial-gradient(circle, rgba(52,64,84,0.05) 0%, rgba(52,64,84,0) 64%)',
        filter: 'blur(36px)',
      }}
    />
    {/* on the paper only: the app's screens and the type sit on top of it */}
    <Dither />
    {children}
  </AbsoluteFill>
);

/**
 * Dither (round 13). The set is a few very soft gradients on a light ground,
 * and Chromium draws gradients in 8 bits: the pools and the vignette stepped
 * into faint concentric rings, one code value apart, visible at 1:1 on a
 * phone and made blocky by every re-encode. The grain cannot help (an overlay
 * barely touches light tones). This is a fixed, fine noise of about one code
 * value either way: a white speck lifts, a black speck lowers, from the SAME
 * noise so a pixel only ever moves one way, so the steps dissolve without
 * greying or flattening the grade. It does not move: it costs the encoder
 * nothing from frame to frame. It lives in the Paper, UNDER the app and the
 * type: a white speck's lift grows with how dark the tone is, so on ink it
 * would sparkle.
 */
const DITHER_TILE = (() => {
  // alpha = a × (2·noise − 1) for the white specks, a × (1 − 2·noise) for the
  // black ones (clamped at 0, so each pixel gets one or the other). Strengths
  // sized for the set's tones (about 0.9–0.99): ~1 code value on average
  const tile = (rgb: number, a: number) =>
    `url("data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><filter id='d' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='7' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 ${rgb}  0 0 0 0 ${rgb}  0 0 0 0 ${rgb}  ${2 * a} 0 0 0 ${-a}'/></filter><rect width='256' height='256' filter='url(#d)'/></svg>`,
    )}")`;
  const b = 0.023;
  return `${tile(1, 0.43)}, ${tile(0, -b)}`;
})();

export const Dither: React.FC = () => (
  <AbsoluteFill style={{ backgroundImage: DITHER_TILE, pointerEvents: 'none' }} />
);

/** The lens over everything: grain + the lightest vignette. */
export const Lens: React.FC = () => (
  <>
    <Vignette strength={0.8} />
    <Grain opacity={0.045} />
  </>
);
