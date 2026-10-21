import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Grain } from '../../../../film/effects';

/**
 * REVISIT's LIGHT LOOK (owner, 2026-10-21: "make this in light mode"). The
 * other films are on the night set (src/look.ts, the shared kit); this clip
 * alone is shot in daylight, on the paper the films had until 2026-10-05
 * (the kit's Paper before the night look), with the app captured in its
 * LIGHT theme (CAPTURE_THEME=light). These files are the kit's light-grade
 * pieces, kept here so the shared kit and every other video stay untouched.
 *
 * Grade rules: light only (ink on paper), no colour casts, nothing that
 * bands (the gradients are dithered); grain and a whisper of vignette are the
 * lens.
 */
export const DAY = {
  /** the set: a shade under the app's #F9FAFB, so a white screen separates */
  set: '#EEF0F4',
  setRgb: '238,240,244',
  /** type: the line the narrator says */
  ink: 'rgba(17,24,39,0.96)',
  /** the kicker, secondary type */
  inkSoft: 'rgba(75,85,99,0.82)',
  /** the mark and the wordmark */
  mark: '#14141B',
} as const;

/** The set's light, without the ground: a daylight pool high in frame where
 *  the type lives, a lift of light behind the product, two slow cool pools so
 *  a hold never reads as a flat fill. Shared by Paper and BandScrim, so the
 *  band over the app is the same paper and its seam cannot show. */
const SetLight: React.FC<{ drift: number; lift?: number }> = ({ drift, lift = 1 }) => (
  <>
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
  </>
);

export const Paper: React.FC<{ drift?: number; lift?: number; children?: React.ReactNode }> = ({ drift = 0, lift = 1, children }) => (
  <AbsoluteFill style={{ background: DAY.set, overflow: 'hidden' }}>
    <SetLight drift={drift} lift={lift} />
    {/* on the paper only: the app's screens and the type sit on top of it */}
    <Dither />
    {children}
  </AbsoluteFill>
);

/**
 * The band the type lives in is the paper itself: app screens that rise into
 * it fade out under the same set (opaque to `band.solid`, clear by
 * `band.clear`), so the camera can frame the app big without type ever
 * sitting on UI.
 */
export const BandScrim: React.FC<{ drift: number; opacity?: number; band: { solid: number; clear: number } }> = ({ drift, opacity = 1, band }) => {
  const mask = `linear-gradient(180deg, #000 0px, #000 ${band.solid}px, rgba(0,0,0,0) ${band.clear}px)`;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity, WebkitMaskImage: mask, maskImage: mask, overflow: 'hidden' }}>
      <AbsoluteFill style={{ background: DAY.set }} />
      <SetLight drift={drift} />
      <Dither />
    </AbsoluteFill>
  );
};

/**
 * Dither: Chromium draws gradients in 8 bits, so the set's soft pools step
 * into faint rings. A fixed, fine noise of about one code value either way
 * (a white speck lifts, a black speck lowers, from the same noise) dissolves
 * the steps; it does not move, so it costs the encoder nothing.
 */
const DITHER_TILE = (() => {
  const tile = (rgb: number, a: number) =>
    `url("data:image/svg+xml;utf8,${encodeURIComponent(
      `<svg xmlns='http://www.w3.org/2000/svg' width='256' height='256'><filter id='d' x='0' y='0' width='100%' height='100%' color-interpolation-filters='sRGB'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' seed='7' stitchTiles='stitch'/><feColorMatrix type='matrix' values='0 0 0 0 ${rgb}  0 0 0 0 ${rgb}  0 0 0 0 ${rgb}  ${2 * a} 0 0 0 ${-a}'/></filter><rect width='256' height='256' filter='url(#d)'/></svg>`,
    )}")`;
  return `${tile(1, 0.43)}, ${tile(0, -0.023)}`;
})();

const Dither: React.FC = () => <AbsoluteFill style={{ backgroundImage: DITHER_TILE, pointerEvents: 'none' }} />;

/** The lens over everything: grain and the lightest vignette (a cool slate
 *  darkening at the very edge; a heavy one reads as smoke on paper). */
export const Lens: React.FC = () => (
  <>
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        background: 'radial-gradient(128% 108% at 50% 42%, rgba(30,38,54,0) 58%, rgba(30,38,54,0.112) 100%)',
      }}
    />
    <Grain opacity={0.045} />
  </>
);
