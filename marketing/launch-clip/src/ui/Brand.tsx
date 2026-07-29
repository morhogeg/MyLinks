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
