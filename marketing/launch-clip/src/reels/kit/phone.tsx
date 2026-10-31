import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import type { Cam } from './camera';
import { EASE_IN_OUT } from './curves';
import { camOn, exposureOf, follow, instant, shutterPlan, shutterWindow, toFrame, travel } from './spring.mjs';
import { TOKENS } from './tokens';

/**
 * THE ONE PHONE: real simulator frames on one phone under one camera.
 * THE APP STORE PREVIEW built it (src/reels/clips/preview/Preview.tsx,
 * rounds 7–10, owner: "smooth and effortless"); this is the same system as
 * a kit part, for every video cut from simulator takes after it (LATER NEVER
 * COMES first). The preview keeps its own original copy, untouched.
 *
 *  - The camera FOLLOWS a target path with a critically damped spring
 *    (`follow`): no fast starts, no whips, no dives, never a jolt.
 *  - Motion blur is a real 180° shutter (`shutterPlan`): where the camera
 *    moves, a frame is rendered at several instants across half a frame and
 *    a script averages them in floating point (scripts/shutter-render.mjs);
 *    a hold has one exposure and is never blurred.
 *  - Every change of screen dissolves on the one phone (`soften`): the
 *    screen going softens before the one coming is half up, and the one
 *    coming sharpens only once the other has all but gone, so the two only
 *    overlap out of focus (never text on text, never two phones).
 *  - A capture is laid out at its own pixels and brought to the camera by a
 *    transform (`PhoneCamera`), never resized: no pixel snapping, never
 *    upscaled past the capture's own resolution when z ≤ dpr.
 */

export type Box = [number, number, number, number];
/** a capture's pixels (dpr a point), its screen in points, the display's corner */
export type Phone = { capture: { w: number; h: number; dpr: number }; screen: { w: number; h: number }; radius: number };
export type Target = { f: number; cx: number; cy: number; z: number; w?: number };
export type Fade = { layer: string; at: number; len: number; blur: number; grow?: number };
export type Point = { x: number; y: number };

// ── the cross-blur ────────────────────────────────────────────────────────

/** how far a fade has come at frame f: under way on its first frame, all but done on its last */
export const along = (x: Fade, f: number) => EASE_IN_OUT((f - x.at + 1) / (x.len + 1));

/** the soft focus of a fade at `a` (0–1), for the screen going and the one coming */
export const soften = (a: number) => {
  const ramp = (x: number) => EASE_IN_OUT(Math.min(1, Math.max(0, x)));
  return { going: ramp(a / 0.6), coming: 1 - ramp((a - 0.4) / 0.6) };
};

// ── the camera and its shutter (plain math, kit/spring.mjs) ───────────

export { camOn, exposureOf, follow, instant, shutterPlan, shutterWindow, toFrame, travel };
export type Path = { from: number; to: number; cx: Float64Array; cy: Float64Array; lz: Float64Array };

// ── the phone ────────────────────────────────────────────────────────────

/** a capture laid out at its own pixels, brought to the camera by a transform (never resized: no pixel snapping) */
export const PhoneCamera: React.FC<{ cam: Cam; phone: Phone; children: React.ReactNode }> = ({ cam, phone, children }) => {
  const PX = phone.capture.dpr;
  return (
    <AbsoluteFill>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: phone.capture.w,
          height: phone.capture.h,
          transform: `translate(${cam.fx - cam.cx * PX}px, ${cam.fy - cam.cy * PX}px) scale(${cam.z / PX})`,
          transformOrigin: `${cam.cx * PX}px ${cam.cy * PX}px`,
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};

/** overlays in screen points, riding the camera */
export const Points: React.FC<{ phone: Phone; children: React.ReactNode }> = ({ phone, children }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, width: phone.screen.w, height: phone.screen.h, transform: `scale(${phone.capture.dpr})`, transformOrigin: '0 0' }}>
    {children}
  </div>
);

/** a detail painted out of a capture, in the screen's own colour (screen points) */
export type Patch = { rect: Box; tone: string; radius?: number };

/**
 * One captured frame filling the screen, with a soft focus (frame px), a
 * dim, a breath of scale about a point, its painted-out details (inside
 * the picture, so they soften and fade with it) and, optionally, another
 * frame of the take kept above a line (`top`: src and the line, points).
 */
export const Picture: React.FC<{
  src: string;
  phone: Phone;
  z: number;
  opacity?: number;
  blur?: number;
  dim?: number;
  grow?: number;
  about?: [number, number];
  top?: { src: string; above: number } | null;
  patches?: Patch[];
}> = ({ src, phone, z, opacity = 1, blur = 0, dim = 0, grow = 1, about = [phone.screen.w / 2, phone.screen.h / 2], top = null, patches = [] }) => {
  const PX = phone.capture.dpr;
  const filter = [blur > 0.05 ? `blur(${((blur * PX) / z).toFixed(3)}px)` : '', dim > 0.002 ? `brightness(${1 - dim})` : ''].filter(Boolean).join(' ');
  const style: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%' };
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        opacity,
        filter: filter || undefined,
        transform: grow !== 1 ? `scale(${grow})` : undefined,
        transformOrigin: `${about[0] * PX}px ${about[1] * PX}px`,
      }}
    >
      <Img src={src} style={style} />
      {top && <Img src={top.src} style={{ ...style, clipPath: `inset(0 0 ${phone.capture.h - top.above * PX}px 0)` }} />}
      {patches.map((p, k) => (
        <div
          key={k}
          style={{
            position: 'absolute',
            left: p.rect[0] * PX,
            top: p.rect[1] * PX,
            width: p.rect[2] * PX,
            height: p.rect[3] * PX,
            borderRadius: (p.radius ?? 0) * PX,
            background: p.tone,
          }}
        />
      ))}
    </div>
  );
};

/** a real element lifted off its own screen: the same pixels cut to its box (points), risen, with a shadow under it */
export const Lifted: React.FC<{ image: string; phone: Phone; rect: Box; radius: number; lift: number }> = ({ image, phone, rect, radius, lift }) => {
  const [x, y, w, h] = rect;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        transform: `translateY(${-4 * lift}px) scale(${1 + 0.02 * lift})`,
        transformOrigin: 'center center',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, borderRadius: radius, boxShadow: TOKENS.shadow, opacity: Math.min(1, lift * 1.4) }} />
      <div style={{ position: 'absolute', inset: 0, borderRadius: radius, overflow: 'hidden' }}>
        <Img src={image} style={{ position: 'absolute', left: -x, top: -y, width: phone.screen.w, height: phone.screen.h, maxWidth: 'none' }} />
      </div>
    </div>
  );
};

/** the phone's glass: its shadow, and the screen clipped to the display's corner */
export const Glass: React.FC<{ phone: Phone; children: React.ReactNode }> = ({ phone, children }) => {
  const r = phone.radius * phone.capture.dpr;
  return (
    <>
      <div style={{ position: 'absolute', inset: 0, borderRadius: r, boxShadow: TOKENS.shadow }} />
      <div style={{ position: 'absolute', inset: 0, borderRadius: r, overflow: 'hidden', background: TOKENS.card }}>{children}</div>
    </>
  );
};
