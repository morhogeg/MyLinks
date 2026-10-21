import React from 'react';
import type { Rect } from '../../kit/takes';

/**
 * (light revisit, 2026-10-21; owner: "the taps on screen are far from good
 * enough") This clip's own touch and spotlight, drawn in SCREEN POINTS inside
 * an AppShot (they ride its camera). The kit's Tap (a faint ink ripple, 13%
 * at its darkest) stays as the reel uses it.
 *
 * A TOUCH is a fingertip you can follow: it arrives on the control a beat
 * early (so the eye is already there), presses down on the frame the app
 * answers, and lifts off in a ring. A SPOTLIGHT washes the rest of the
 * screen back toward the paper so the one thing a line is about reads first.
 */

const INK = '20,20,27';
const PAPER = '243,244,246';
const ease = (v: number) => 1 - (1 - Math.max(0, Math.min(1, v))) ** 3;

/** `hit` is the frame the app answers; the pad is down from hit−3 to hit+3 */
export const Touch: React.FC<{ x: number; y: number; f: number; hit: number; size?: number }> = ({ x, y, f, hit, size = 30 }) => {
  const t = f - hit;
  if (t < -12 || t > 18) return null;
  const arrive = ease((t + 12) / 9); // −12…−3: settles onto the control
  const press = t < -3 ? 0 : t < 0 ? ease((t + 3) / 3) : t < 3 ? 1 : 1 - ease((t - 3) / 5);
  const leave = t <= 3 ? 0 : ease((t - 3) / 11);
  const scale = (1.35 - 0.35 * arrive) * (1 - 0.16 * press);
  const ring = t < 0 ? 0 : ease(t / 15);
  return (
    <>
      {/* the lift-off ring */}
      {t >= 0 && (
        <div
          style={{
            position: 'absolute',
            left: x - size / 2,
            top: y - size / 2,
            width: size,
            height: size,
            borderRadius: size,
            border: `2px solid rgba(${INK},${0.42 * (1 - ring)})`,
            transform: `scale(${1 + ring * 1.3})`,
          }}
        />
      )}
      {/* the fingertip */}
      <div
        style={{
          position: 'absolute',
          left: x - size / 2,
          top: y - size / 2,
          width: size,
          height: size,
          borderRadius: size,
          background: `rgba(${INK},${0.26 + 0.16 * press})`,
          border: '2px solid rgba(255,255,255,0.95)',
          boxShadow: `0 ${2 - press}px ${8 - 4 * press}px rgba(${INK},0.28)`,
          transform: `scale(${scale})`,
          opacity: arrive * (1 - leave),
        }}
      />
    </>
  );
};

/** the rest of the screen, washed back toward the paper, around `rect`
 *  (0–1 `on`); `ring` draws the subject's edge */
export const Spotlight: React.FC<{ rect: Rect; on: number; radius?: number; pad?: number }> = ({ rect, on, radius = 16, pad = 4 }) => {
  if (on <= 0.005) return null;
  const [x0, y0, w0, h0] = rect;
  const x = x0 - pad;
  const y = y0 - pad;
  const w = w0 + pad * 2;
  const h = h0 + pad * 2;
  const r = radius + pad;
  // a rounded-rect hole in a full-screen wash (even-odd)
  const hole = `M${x + r},${y} H${x + w - r} A${r},${r} 0 0 1 ${x + w},${y + r} V${y + h - r} A${r},${r} 0 0 1 ${x + w - r},${y + h} H${x + r} A${r},${r} 0 0 1 ${x},${y + h - r} V${y + r} A${r},${r} 0 0 1 ${x + r},${y} Z`;
  return (
    <svg width={393} height={852} viewBox="0 0 393 852" style={{ position: 'absolute', left: 0, top: 0, overflow: 'visible' }}>
      <path d={`M-400,-400 H793 V1252 H-400 Z ${hole}`} fillRule="evenodd" fill={`rgba(${PAPER},${0.62 * on})`} />
      <path d={hole} fill="none" stroke={`rgba(${INK},${0.5 * on})`} strokeWidth={1.4} />
    </svg>
  );
};

/** a rect eased from `a` to `b` (0–1) */
export const mixRect = (a: Rect, b: Rect, t: number): Rect => [0, 1, 2, 3].map((k) => a[k] + (b[k] - a[k]) * t) as Rect;
