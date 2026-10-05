import React from 'react';
import { AbsoluteFill, useCurrentFrame, random } from 'remotion';
import { NIGHT, stageLight } from '../look';

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
    <>
      <AbsoluteFill
        style={{
          backgroundImage: GRAIN_TILE,
          backgroundPosition: `${ox}px ${oy}px`,
          opacity,
          mixBlendMode: 'overlay',
          pointerEvents: 'none',
        }}
      />
      {/* on the night set an overlay barely touches the blacks, so the
          shadows get their own, finer pass: screened, a third as strong */}
      <AbsoluteFill
        style={{
          backgroundImage: GRAIN_TILE,
          backgroundPosition: `${(ox + 97) % 220}px ${(oy + 53) % 220}px`,
          opacity: opacity * 0.34,
          mixBlendMode: 'screen',
          pointerEvents: 'none',
        }}
      />
    </>
  );
};

/** The set's base tone: the NIGHT set (src/look.ts), a hair under the app's
 *  #050505 so a screen's own black still reads as a lit panel. Every scene
 *  and the Film root share this one constant. (It was the light grade's
 *  #EEF0F4 until 2026-10-05.) */
export const SET_BG = NIGHT.set;

/**
 * Vignette: on the night set the frame's edges fall away to black, the way
 * a lit stage does; it frames the light without crushing the product.
 */
export const Vignette: React.FC<{ strength?: number }> = ({ strength = 1 }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    <AbsoluteFill
      style={{
        background: `radial-gradient(76% 60% at 50% 50%, rgba(0,0,0,0) 38%, rgba(0,0,0,${(0.5 * strength).toFixed(3)}) 78%, rgba(0,0,0,${(0.72 * strength).toFixed(3)}) 100%)`,
      }}
    />
  </AbsoluteFill>
);

/**
 * A scrim under the captions: the night itself rising to meet the type, so a
 * white line keeps its edge over a busy screen without a subtitle BOX.
 */
export const CaptionScrim: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => (
  <AbsoluteFill
    style={{
      background: 'linear-gradient(180deg, rgba(2,2,3,0) 58%, rgba(2,2,3,0.6) 82%, rgba(2,2,3,0.9) 100%)',
      opacity,
      pointerEvents: 'none',
    }}
  />
);

/**
 * The set: the NIGHT stage (src/look.ts). A soft top light, the cool key
 * light behind the product, two coloured pools for depth. `intensity` scales
 * the key, `backlight` adds a tighter, brighter pool right behind the device
 * so its silhouette separates from the dark.
 */
export const Stage: React.FC<{
  intensity?: number;
  drift?: number;
  backlight?: number;
}> = ({ intensity = 1, drift = 0, backlight = 0 }) => (
  <AbsoluteFill style={{ background: SET_BG, overflow: 'hidden' }}>
    <AbsoluteFill style={{ background: stageLight(drift, { key: 0.6 + 0.6 * intensity }) }} />
    {backlight > 0 && (
      <div
        style={{
          position: 'absolute',
          left: '50%',
          top: '46%',
          transform: 'translate(-50%, -50%)',
          width: 1180,
          height: 1180,
          borderRadius: '50%',
          background: `radial-gradient(circle, rgba(${NIGHT.key},0.34) 0%, rgba(${NIGHT.key},0.14) 36%, rgba(${NIGHT.key},0.04) 58%, rgba(${NIGHT.key},0) 74%)`,
          filter: 'blur(40px)',
          opacity: backlight,
        }}
      />
    )}
  </AbsoluteFill>
);

/** Under the device, light: a cool pool on the floor (the night grade's
 *  separation), with a tight dark core where the device sits, for weight. */
export const FloorGlow: React.FC<{ y?: number; w?: number; opacity?: number }> = ({ y = 880, w = 780, opacity = 0.5 }) => (
  <div
    style={{
      position: 'absolute',
      left: '50%',
      top: y,
      transform: 'translateX(-50%)',
      width: w * 1.3,
      height: 150,
      background: `radial-gradient(50% 50% at 50% 50%, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0) 30%), radial-gradient(50% 50% at 50% 50%, rgba(${NIGHT.key},0.3) 0%, rgba(${NIGHT.key},0) 72%)`,
      opacity,
      filter: 'blur(18px)',
    }}
  />
);
