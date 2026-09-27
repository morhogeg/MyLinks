import React, { useMemo } from 'react';
import { AbsoluteFill, Img } from 'remotion';
import type { Cam } from './camera';
import { SCREEN, frameSrc, type Rect } from './takes';

/**
 * A captured frame of the REAL app, shown as a floating iPhone screen.
 *
 * No device mockup, no rebuilt UI: the pixels are a screenshot of the shipped
 * app (capture/), framed as a glass slab with the iPhone's display corner
 * radius, a hairline edge and a soft studio shadow. The camera (camera.ts)
 * decides which part of the screen fills the frame.
 *
 * Children are overlays in SCREEN POINTS (393 × 852): taps, lifts, highlights.
 * They ride the same camera, so a tap drawn at the Save button's box stays on
 * the Save button through any move.
 */

/** iPhone 15/16 Pro display corner radius, in points. */
export const SCREEN_RADIUS = 55;

let uid = 0;

export const AppShot: React.FC<{
  take: string;
  i: number;
  cam: Cam;
  children?: React.ReactNode;
  opacity?: number;
  /** 0–1 how far the studio shadow reaches (depth off the paper). */
  shadow?: number;
  /** screen-space gaussian blur, px (depth of field for a screen pushed back). */
  blur?: number;
  /** 0–1 darken (a screen pushed behind something). */
  dim?: number;
  /** a sharp band (y0–y1, points) with everything else blurred: a rack focus. */
  focus?: { y0: number; y1: number; blur: number };
  /** camera velocity in px/frame → directional motion blur. */
  motion?: { x: number; y: number };
  /** circular reveal, in points (the iris transition). */
  iris?: { x: number; y: number; r: number } | null;
  /** show only this box of the screen (points): an element lifted whole. */
  crop?: Rect;
  /** corner radius of the cropped box, points (the element's own radius) */
  cropRadius?: number;
  /** 0–1 a slow glass sheen across the slab. */
  sheen?: number;
}> = ({
  take,
  i,
  cam,
  children,
  opacity = 1,
  shadow = 1,
  blur = 0,
  dim = 0,
  focus,
  motion,
  iris,
  crop,
  cropRadius = 24,
  sheen = 0,
}) => {
  const id = useMemo(() => `ms${uid++}`, []);
  const { cx, cy, z, fx, fy, rx, ry, rz } = cam;
  const W = SCREEN.w * z;
  const H = SCREEN.h * z;
  const left = fx - cx * z;
  const top = fy - cy * z;
  const src = frameSrc(take, i);

  // motion blur: what a 180° shutter would smear (half the travel, as a
  // gaussian: ≈ 0.14 × px per frame), capped so a fast move stays a move and
  // never a smudge, and only when it is real motion
  const mb = motion ? { x: Math.min(10, Math.abs(motion.x) * 0.14), y: Math.min(10, Math.abs(motion.y) * 0.14) } : null;
  const useMb = !!mb && (mb.x > 1 || mb.y > 1);

  // what shows: the whole slab, an iris circle, or a cropped element box
  const box = crop
    ? { x: crop[0] * z, y: crop[1] * z, w: crop[2] * z, h: crop[3] * z, r: cropRadius * z }
    : { x: 0, y: 0, w: W, h: H, r: SCREEN_RADIUS * z };
  const clip = iris
    ? `circle(${iris.r * z}px at ${iris.x * z}px ${iris.y * z}px)`
    : crop
      ? `inset(${box.y}px ${W - box.x - box.w}px ${H - box.y - box.h}px ${box.x}px round ${box.r}px)`
      : undefined;

  const filters = [
    blur > 0.05 ? `blur(${blur}px)` : '',
    useMb ? `url(#${id})` : '',
    dim > 0 ? `brightness(${1 - dim * 0.5})` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const is3d = rx !== 0 || ry !== 0;

  return (
    <AbsoluteFill style={{ perspective: is3d ? 2400 : undefined, pointerEvents: 'none' }}>
      {useMb && (
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <filter id={id} x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation={`${mb!.x.toFixed(2)} ${mb!.y.toFixed(2)}`} />
          </filter>
        </svg>
      )}
      <div
        style={{
          position: 'absolute',
          left,
          top,
          width: W,
          height: H,
          opacity,
          transform:
            [rz ? `rotateZ(${rz}deg)` : '', is3d ? `rotateX(${rx}deg) rotateY(${ry}deg)` : '']
              .filter(Boolean)
              .join(' ') || undefined,
          transformOrigin: `${cx * z}px ${cy * z}px`,
        }}
      >
        {/* the studio shadow, on the visible box (an iris has none: it is a
            window being cut, not an object) */}
        {!iris && shadow > 0 && (
          <div
            style={{
              position: 'absolute',
              left: box.x,
              top: box.y,
              width: box.w,
              height: box.h,
              borderRadius: box.r,
              boxShadow: [
                `0 ${1.5 * z}px ${3 * z}px rgba(16,24,40,${0.08 * shadow})`,
                `0 ${22 * z}px ${60 * z}px -${14 * z}px rgba(24,32,48,${0.34 * shadow})`,
                `0 ${60 * z}px ${120 * z}px -${40 * z}px rgba(24,32,48,${0.22 * shadow})`,
              ].join(', '),
            }}
          />
        )}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: crop ? undefined : SCREEN_RADIUS * z,
            overflow: 'hidden',
            clipPath: clip,
            background: crop ? undefined : '#F9FAFB',
          }}
        >
          <Img src={src} style={{ width: '100%', height: '100%', display: 'block', filter: filters || undefined }} />
          {focus && (
            // the rack focus: a sharp band over the blurred whole (it keeps the
            // motion blur, not the depth blur)
            <Img
              src={src}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                clipPath: `inset(${focus.y0 * z}px 0 ${H - focus.y1 * z}px 0)`,
                filter: useMb ? `url(#${id})` : undefined,
              }}
            />
          )}
          {sheen > 0 && (
            <div
              style={{
                position: 'absolute',
                inset: '-20%',
                background:
                  'linear-gradient(115deg, rgba(255,255,255,0) 38%, rgba(255,255,255,0.16) 48%, rgba(255,255,255,0) 58%)',
                // 0 and 1 are both fully off the slab, so a sheen can start
                // or end without a pop
                transform: `translateX(${(sheen - 0.5) * 120}%)`,
                mixBlendMode: 'screen',
              }}
            />
          )}
        </div>
        {/* the glass edge */}
        {!iris && (
          <div
            style={{
              position: 'absolute',
              left: box.x,
              top: box.y,
              width: box.w,
              height: box.h,
              borderRadius: box.r,
              boxShadow: `inset 0 0 0 ${Math.max(1, 0.6 * z)}px rgba(16,24,40,0.10)`,
            }}
          />
        )}
        {/* overlays, in screen points */}
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: SCREEN.w,
            height: SCREEN.h,
            transform: `scale(${z})`,
            transformOrigin: '0 0',
          }}
        >
          {children}
        </div>
      </div>
    </AbsoluteFill>
  );
};

/**
 * A real element lifted off the screen: the same capture pixels, cut to the
 * element's box and given its own depth (a chip rising on its beat, the Add
 * dialog floating off a pushed-back screen). Use inside an AppShot; at
 * lift 0 it sits exactly on its own pixels.
 */
export const Lift: React.FC<{
  take: string;
  i: number;
  rect: Rect;
  radius?: number;
  /** 0–1: rise + scale + shadow. */
  lift?: number;
  /** points it rises at lift 1 */
  rise?: number;
  /** extra scale at lift 1 */
  grow?: number;
  opacity?: number;
  /** a soft ink ring, 0–1 (emphasis without recolouring the app) */
  ring?: number;
  dx?: number;
  dy?: number;
  scale?: number;
}> = ({ take, i, rect, radius = 12, lift = 0, rise = 6, grow = 0.045, opacity = 1, ring = 0, dx = 0, dy = 0, scale = 1 }) => {
  const [x, y, w, h] = rect;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: radius,
        overflow: 'hidden',
        opacity,
        transform: `translate(${dx}px, ${dy - lift * rise}px) scale(${scale * (1 + lift * grow)})`,
        transformOrigin: 'center center',
        boxShadow: [
          `0 ${1 + lift * 3}px ${2 + lift * 6}px rgba(16,24,40,${0.06 + lift * 0.08})`,
          `0 ${lift * 18}px ${lift * 40}px -${lift * 8}px rgba(24,32,48,${lift * 0.32})`,
          ring > 0 ? `0 0 0 ${1.2 + ring * 1.2}px rgba(20,20,27,${ring * 0.55})` : '',
        ]
          .filter(Boolean)
          .join(', '),
      }}
    >
      <Img
        src={frameSrc(take, i)}
        style={{ position: 'absolute', left: -x, top: -y, width: SCREEN.w, height: SCREEN.h, maxWidth: 'none' }}
      />
    </div>
  );
};

/**
 * A fingertip, drawn where the capture script actually tapped (a box from the
 * take). `t` runs 0–1 over the gesture: the pad lands (~0.35) and lifts into a
 * ripple. iOS draws no touches, so this is the reel's one piece of added UI,
 * kept deliberately neutral: ink at low alpha, the app's own tap shape.
 */
export const Tap: React.FC<{ x: number; y: number; t: number; size?: number }> = ({ x, y, t, size = 34 }) => {
  if (t <= 0 || t >= 1) return null;
  const down = Math.min(1, t / 0.35);
  const up = Math.max(0, (t - 0.35) / 0.65);
  const ease = (v: number) => 1 - (1 - v) ** 3;
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: x - size / 2,
          top: y - size / 2,
          width: size,
          height: size,
          borderRadius: size,
          background: `rgba(20,20,27,${0.13 * down * (1 - up)})`,
          transform: `scale(${0.72 + ease(down) * 0.28 - up * 0.1})`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: x - size / 2,
          top: y - size / 2,
          width: size,
          height: size,
          borderRadius: size,
          border: `1.25px solid rgba(20,20,27,${0.24 * (1 - up)})`,
          transform: `scale(${1 + ease(up) * 0.9})`,
          opacity: up > 0 ? 1 : 0,
        }}
      />
    </>
  );
};
