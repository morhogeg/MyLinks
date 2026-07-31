import React from 'react';
import { AbsoluteFill, useCurrentFrame, random } from 'remotion';

/**
 * The camera rig. Everything the "camera" does — push in, drift, tilt off-axis,
 * rack focus — is one transform on one node, so a scene describes its shot
 * instead of animating a dozen elements independently.
 *
 * Note on sharpness: 3D rotation makes Chromium snapshot the layer and scale the
 * bitmap, which softens small UI text. So wide/angled shots use `rotY`/`rotX`,
 * and close-ups use `scale` alone (a pure 2D transform re-rasterizes text at the
 * composited scale and stays razor sharp).
 */
export const Rig: React.FC<{
  children: React.ReactNode;
  x?: number;
  y?: number;
  scale?: number;
  rotX?: number;
  rotY?: number;
  rotZ?: number;
  blur?: number;
  origin?: string;
  opacity?: number;
  style?: React.CSSProperties;
}> = ({
  children,
  x = 0,
  y = 0,
  scale = 1,
  rotX = 0,
  rotY = 0,
  rotZ = 0,
  blur = 0,
  origin = 'center center',
  opacity = 1,
  style,
}) => {
  const is3d = rotX !== 0 || rotY !== 0;
  return (
    <AbsoluteFill
      style={{
        perspective: is3d ? 1800 : undefined,
        perspectiveOrigin: '50% 45%',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      <div
        style={{
          transform: [
            `translate3d(${x}px, ${y}px, 0)`,
            rotZ ? `rotateZ(${rotZ}deg)` : '',
            is3d ? `rotateX(${rotX}deg) rotateY(${rotY}deg)` : '',
            `scale(${scale})`,
          ]
            .filter(Boolean)
            .join(' '),
          transformOrigin: origin,
          transformStyle: is3d ? 'preserve-3d' : undefined,
          filter: blur > 0.05 ? `blur(${blur}px)` : undefined,
          opacity,
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};

/**
 * Film grain. The turbulence tile is a CONSTANT data URI so Chromium rasterizes
 * it exactly once; only `background-position` moves per frame. A per-frame
 * feTurbulence would re-run the filter over 2M pixels every frame and dominate
 * the render.
 */
const GRAIN_TILE =
  "url(\"data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='220' height='220'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.82' numOctaves='3' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='220' height='220' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")";

export const Grain: React.FC<{ opacity?: number }> = ({ opacity = 0.055 }) => {
  const frame = useCurrentFrame();
  const ox = Math.floor(random(`gx${frame}`) * 220);
  const oy = Math.floor(random(`gy${frame}`) * 220);
  return (
    <AbsoluteFill
      style={{
        backgroundImage: GRAIN_TILE,
        backgroundPosition: `${ox}px ${oy}px`,
        opacity,
        mixBlendMode: 'overlay',
        pointerEvents: 'none',
      }}
    />
  );
};

/** Vignette + a faint top-light, so the frame has a lens rather than flat black. */
export const Vignette: React.FC<{ strength?: number }> = ({ strength = 1 }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    <AbsoluteFill
      style={{
        background: `radial-gradient(128% 108% at 50% 42%, rgba(0,0,0,0) 52%, rgba(0,0,0,${
          0.42 * strength
        }) 100%)`,
      }}
    />
  </AbsoluteFill>
);

/**
 * A scrim under the captions. Without it, a caption crossing the device's tab bar
 * or a bright card loses its edge; with it, the type always has something to sit
 * on without a subtitle BOX, which is the thing that reads as cheap.
 */
export const CaptionScrim: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => (
  <AbsoluteFill
    style={{
      background:
        'linear-gradient(180deg, rgba(4,4,6,0) 62%, rgba(4,4,6,0.55) 84%, rgba(4,4,6,0.86) 100%)',
      opacity,
      pointerEvents: 'none',
    }}
  />
);

/**
 * The set. A graphite radial wash lifted from the app icon's ground, plus two
 * slow-drifting light pools so cuts never land on dead black.
 */
export const Stage: React.FC<{
  intensity?: number;
  drift?: number;
  /**
   * A bright elliptical pool behind the device. A near-black app on a near-black
   * set has no silhouette — this is the backlight that separates the two, and
   * the reason the product scenes stopped looking muddy.
   */
  backlight?: number;
}> = ({ intensity = 1, drift = 0, backlight = 0 }) => (
  <AbsoluteFill style={{ background: '#050505', overflow: 'hidden' }}>
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(70% 58% at 50% 36%, rgba(52,52,66,0.98) 0%, rgba(28,28,37,0.72) 44%, rgba(7,7,10,0) 100%)',
        opacity: intensity,
        transform: `translateY(${drift * 30}px)`,
      }}
    />
    {backlight > 0 && (
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '44%',
          transform: 'translate(-50%, -50%)',
          width: 1180,
          height: 1180,
          borderRadius: '50%',
          background:
            'radial-gradient(circle, rgba(186,196,218,0.30) 0%, rgba(150,160,186,0.13) 34%, rgba(120,130,160,0.04) 58%, rgba(0,0,0,0) 74%)',
          filter: 'blur(40px)',
          opacity: backlight,
        }}
      />
    )}
    <div
      style={{
        position: 'absolute',
        width: 1400,
        height: 900,
        left: -260 + drift * 60,
        top: -220,
        background:
          'radial-gradient(circle, rgba(203,210,226,0.10) 0%, rgba(203,210,226,0) 62%)',
        filter: 'blur(30px)',
        opacity: intensity,
      }}
    />
    <div
      style={{
        position: 'absolute',
        width: 1100,
        height: 800,
        right: -220 - drift * 40,
        bottom: -260,
        background:
          'radial-gradient(circle, rgba(120,130,160,0.10) 0%, rgba(120,130,160,0) 64%)',
        filter: 'blur(36px)',
        opacity: intensity,
      }}
    />
  </AbsoluteFill>
);

/** A soft floor reflection under a device — cheap contact shadow that sells weight. */
export const FloorGlow: React.FC<{ y?: number; w?: number; opacity?: number }> = ({
  y = 880,
  w = 780,
  opacity = 0.5,
}) => (
  <div
    style={{
      position: 'absolute',
      left: '50%',
      top: y,
      transform: 'translateX(-50%)',
      width: w,
      height: 120,
      background:
        'radial-gradient(50% 50% at 50% 50%, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0) 72%)',
      opacity,
      filter: 'blur(18px)',
    }}
  />
);
