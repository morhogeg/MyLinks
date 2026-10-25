import type React from 'react';
import { SET_BG } from '../../film/effects';
import { sans } from '../../fonts';
import { PLATFORM_INK } from '../../ui/app';
import { INK, INK_SOFT } from './Type';

/**
 * The house palette and UI type for every video made from 2026-10-25 on, in
 * one place (owner: all the product videos share one design language). A
 * video's own scene files take colours and type from here and nothing else
 * (audio/house-verify.mjs fails on a colour literal or a fontFamily there).
 *
 * Light only, ink on paper. Every value is an existing one (the film's
 * paper, the kit's inks, the app's platform hues, the shadows the kit
 * already draws); a new value is added here, for every video, or not at all.
 */
export const TOKENS = {
  /** the set: the film's paper, a shade under the app's #F9FAFB */
  paper: SET_BG,
  /** a card or screen on the paper (the app's surface) */
  card: '#FFFFFF',
  ink: INK,
  inkSoft: INK_SOFT,
  /** secondary text and glyphs on a card */
  inkFaint: 'rgba(75,85,99,0.55)',
  /** placeholder bars: content that is there but not meant to be read */
  skeleton: 'rgba(17,24,39,0.07)',
  skeletonStrong: 'rgba(17,24,39,0.12)',
  /** a card's edge */
  hairline: 'rgba(16,24,40,0.07)',
  /** the kit's card shadow (SaveChip), and a quieter one for small tiles */
  shadow: '0 1px 2px rgba(16,24,40,0.06), 0 14px 34px -12px rgba(24,32,48,0.28), 0 30px 60px -30px rgba(24,32,48,0.2)',
  shadowSoft: '0 1px 2px rgba(16,24,40,0.05), 0 8px 20px -10px rgba(24,32,48,0.22)',
  /** the app's platform hues (ui/app.tsx PLATFORM_INK) */
  platform: PLATFORM_INK,
  /**
   * Tile tints for things a viewer must not read (thumbnails stand-ins: no
   * third-party frames). Cool paper greys with the faintest warm and cool
   * shifts, all inside the light grade.
   */
  tiles: ['#E4E7EC', '#DDE1E7', '#E9E6E3', '#E2E6EB', '#D9DEE5', '#E7E3E6', '#E0E4E8', '#EBE8E4', '#D6DBE2'],
  /** the self-chat's own bubble, a paper green as light as the tiles */
  bubbleMine: '#E3EEE6',
} as const;

/** a #RRGGBB token at an alpha */
export const alpha = (hex: string, a: number) =>
  `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},${a.toFixed(3)})`;

/** UI type (what an app screen would show), in the house face */
export const uiText = (size: number, weight = 500, color: string = TOKENS.ink): React.CSSProperties => ({
  fontFamily: sans,
  fontSize: size,
  fontWeight: weight,
  letterSpacing: '-0.01em',
  lineHeight: 1.2,
  color,
});
