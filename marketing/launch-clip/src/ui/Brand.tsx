import React from 'react';

/**
 * The identity, ported VERBATIM from `web/components/ui/Wordmark.tsx` — same
 * path data, same viewBoxes, same currentColor discipline. The film must not
 * contain a redrawn approximation of the mark.
 */

/** The Citation mark: two brackets and a dot. Tight viewBox (288 292 448 416). */
export const CitationGlyph: React.FC<{
  style?: React.CSSProperties;
  /** 0 → brackets fully apart & invisible, 1 → locked mark. Drives the cold open. */
  assembly?: number;
  /** 0 → no dot, 1 → dot at full size. */
  dot?: number;
}> = ({ style, assembly = 1, dot = 1 }) => {
  const spread = (1 - assembly) * 320;
  return (
    <svg viewBox="288 292 448 416" style={style} fill="currentColor">
      <g transform={`translate(${-spread} 0)`} opacity={assembly}>
        <path d="M296 300 L396 300 L396 358 L354 358 L354 642 L396 642 L396 700 L296 700 Z" />
      </g>
      <g transform={`translate(${spread} 0)`} opacity={assembly}>
        <path d="M728 300 L628 300 L628 358 L670 358 L670 642 L628 642 L628 700 L728 700 Z" />
      </g>
      <circle cx="512" cy="500" r={52 * dot} opacity={dot} />
    </svg>
  );
};

/** The drawn MACHINA wordmark (stroke 42, tracking 240). */
export const Wordmark: React.FC<{ style?: React.CSSProperties }> = ({ style }) => (
  <svg
    viewBox="0 -8 3455 438"
    style={style}
    fill="currentColor"
    stroke="currentColor"
    strokeWidth="12"
  >
    <path d="M 0.0 422.0 L 0.0 0.0 L 44.2 0.0 L 194.0 322.4 L 343.8 0.0 L 388.0 0.0 L 388.0 422.0 L 346.0 422.0 L 346.0 95.0 L 194.0 422.0 L 42.0 95.0 L 42.0 422.0 Z M 765.3 0.0 L 810.7 0.0 L 661.4 422.0 L 616.0 422.0 Z M 765.3 0.0 L 810.7 0.0 L 960.0 422.0 L 914.6 422.0 Z M 715.1 253.2 L 860.9 253.2 L 875.8 295.2 L 700.2 295.2 Z M 1482.0 385.9 A 186.0 219.0 0 1 1 1482.0 36.1 L 1458.5 70.9 A 144.0 177.0 0 1 0 1458.5 351.1 Z M 1743.0 0.0 L 1785.0 0.0 L 1785.0 422.0 L 1743.0 422.0 Z M 2001.0 0.0 L 2043.0 0.0 L 2043.0 422.0 L 2001.0 422.0 Z M 1785.0 190.0 L 2001.0 190.0 L 2001.0 232.0 L 1785.0 232.0 Z M 2283.0 0.0 L 2325.0 0.0 L 2325.0 422.0 L 2283.0 422.0 Z M 2565.0 0.0 L 2607.0 0.0 L 2607.0 422.0 L 2565.0 422.0 Z M 2841.0 0.0 L 2883.0 0.0 L 2883.0 422.0 L 2841.0 422.0 Z M 2565.0 0.0 L 2615.2 0.0 L 2883.0 422.0 L 2832.8 422.0 Z M 3260.3 0.0 L 3305.7 0.0 L 3156.4 422.0 L 3111.0 422.0 Z M 3260.3 0.0 L 3305.7 0.0 L 3455.0 422.0 L 3409.6 422.0 Z M 3210.1 253.2 L 3355.9 253.2 L 3370.8 295.2 L 3195.2 295.2 Z" />
  </svg>
);

/**
 * The app icon tile — the shipped composition from
 * `design/icon-concepts/cit_lumen_icon.svg`: radial graphite ground, aura,
 * contact glow, and the mark filled with the lit-solid ramp.
 */
export const AppIcon: React.FC<{ size: number; style?: React.CSSProperties }> = ({
  size,
  style,
}) => (
  <svg
    viewBox="0 0 1024 1024"
    width={size}
    height={size}
    style={{ borderRadius: size * 0.2237, display: 'block', ...style }}
  >
    <defs>
      <radialGradient id="icoBg" cx="50%" cy="36%" r="84%">
        <stop offset="0%" stopColor="#282833" />
        <stop offset="42%" stopColor="#16161D" />
        <stop offset="100%" stopColor="#07070A" />
      </radialGradient>
      <radialGradient id="icoAura" gradientUnits="userSpaceOnUse" cx="512" cy="500" r="400">
        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.11" />
        <stop offset="46%" stopColor="#CBD2E2" stopOpacity="0.04" />
        <stop offset="100%" stopColor="#CBD2E2" stopOpacity="0" />
      </radialGradient>
      <linearGradient id="icoBody" gradientUnits="userSpaceOnUse" x1="0" y1="254" x2="0" y2="774">
        <stop offset="0%" stopColor="#FFFFFF" />
        <stop offset="42%" stopColor="#F2F5FA" />
        <stop offset="100%" stopColor="#CBD2E0" />
      </linearGradient>
      <filter id="icoContact" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="9" />
      </filter>
    </defs>
    <rect width="1024" height="1024" fill="url(#icoBg)" />
    <circle cx="512" cy="500" r="400" fill="url(#icoAura)" />
    <g filter="url(#icoContact)" opacity="0.42" fill="#B8C0D2">
      <path d="M261.4 268.0 L377.4 268.0 L377.4 335.3 L328.7 335.3 L328.7 664.7 L377.4 664.7 L377.4 732.0 L261.4 732.0 Z" />
      <path d="M762.6 268.0 L646.6 268.0 L646.6 335.3 L695.3 335.3 L695.3 664.7 L646.6 664.7 L646.6 732.0 L762.6 732.0 Z" />
      <circle cx="512" cy="500" r="60.32" />
    </g>
    <g fill="url(#icoBody)">
      <path d="M261.4 268.0 L377.4 268.0 L377.4 335.3 L328.7 335.3 L328.7 664.7 L377.4 664.7 L377.4 732.0 L261.4 732.0 Z" />
      <path d="M762.6 268.0 L646.6 268.0 L646.6 335.3 L695.3 335.3 L695.3 664.7 L646.6 664.7 L646.6 732.0 L762.6 732.0 Z" />
      <circle cx="512" cy="500" r="60.32" />
    </g>
  </svg>
);

/* ────────────────────────────────────────────────────────────────────────────
 * The mark's ARRIVAL motion, ported verbatim from
 * `web/components/ui/CitationMark.tsx` (which itself ports
 * design/icon-concepts/motion.js — "the C1-continuous core tuned against real
 * renders. Do not re-derive the numbers.").
 *
 * This is the app's own `launch` entry: the arms draw outward from corner ticks
 * to full brackets, the brackets close in from their spread, and the point
 * strikes last. LAUNCH_MS is 1300 in the app, i.e. 39 frames at 30fps.
 * ──────────────────────────────────────────────────────────────────────────── */

const TOP = 300;
const BOT = 700;
const W = 58;
const ARM = 100;
const LX = 296;
const RX = 728;
const CX = 512;
const CY = 500;
const SPREAD = 58;
const R_HI = 52;
const ARM_H = 58;
const HALF = 200;

/** The motion's travel envelope — the tight box clips the spread brackets. */
const VIEWBOX_ROAM = '224 292 576 416';

const c01 = (x: number) => Math.min(1, Math.max(0, x));
const sstep = (a: number, b: number, x: number) => {
  const t = c01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

const bracketPaths = (spread: number): [string, string] => {
  const lx = LX - spread;
  const rx = RX + spread;
  return [
    `M${lx} ${TOP} L${lx + ARM} ${TOP} L${lx + ARM} ${TOP + W} L${lx + W} ${TOP + W} ` +
      `L${lx + W} ${BOT - W} L${lx + ARM} ${BOT - W} L${lx + ARM} ${BOT} L${lx} ${BOT} Z`,
    `M${rx} ${TOP} L${rx - ARM} ${TOP} L${rx - ARM} ${TOP + W} L${rx - W} ${TOP + W} ` +
      `L${rx - W} ${BOT - W} L${rx - ARM} ${BOT - W} L${rx - ARM} ${BOT} L${rx} ${BOT} Z`,
  ];
};

/** `launchAt` from CitationMark — an arrival that resolves to the locked mark. */
const launchAt = (u: number) => {
  const g = sstep(0, 0.46, u);
  const strike = sstep(0.44, 0.68, u);
  return {
    spread: SPREAD * (1 - sstep(0.3, 0.7, u)),
    clipH: ARM_H + (HALF - ARM_H) * g,
    dotR: R_HI * strike,
    dotOp: strike,
  };
};

/** The app's animated mark, driven by an explicit 0–1 progress.
 *  `pulse` is the app's SEARCHING state: after the launch resolves, the point
 *  keeps a slow quiet breath (opacity floored at 0.46, exactly the app's own
 *  waiting motion) — pass the current frame and the mark stays visibly alive. */
export const AnimatedMark: React.FC<{
  /** 0 → nothing drawn, 1 → the locked mark. Run it over ~39 frames for the app's pace. */
  u: number;
  /** Current frame, to drive the point's breathing once u ≥ 1. */
  pulse?: number | null;
  style?: React.CSSProperties;
  id?: string;
}> = ({ u, pulse = null, style, id = 'mk' }) => {
  const f = launchAt(c01(u));
  const [l, r] = bracketPaths(f.spread);
  const breathe =
    pulse !== null && u >= 1
      ? 0.46 + 0.54 * (0.5 + 0.5 * Math.sin((pulse / 38) * Math.PI * 2))
      : 1;
  return (
    <svg viewBox={VIEWBOX_ROAM} style={style} fill="currentColor">
      <defs>
        <clipPath id={`${id}-clip`}>
          {/* the arms are REVEALED from the corners inward — two rects that
              grow toward the middle, exactly as the app clips them */}
          <rect x="0" y={TOP} width="1024" height={f.clipH} />
          <rect x="0" y={BOT - f.clipH} width="1024" height={f.clipH} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${id}-clip)`}>
        <path d={l} />
        <path d={r} />
      </g>
      <circle cx={CX} cy={CY} r={f.dotR} opacity={f.dotOp * breathe} />
    </svg>
  );
};

/** Frames the app's launch arrival takes (LAUNCH_MS 1300 at 30fps). */
export const MARK_LAUNCH_FRAMES = 39;
