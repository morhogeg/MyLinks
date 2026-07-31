/**
 * The app's design tokens, ported verbatim from `web/app/globals.css`.
 *
 * The film recreates Machina's UI rather than screen-recording it (no signed-in
 * device in CI), so the ONLY way it reads as the real product is for every
 * surface, hairline and radius here to be the same value the app ships. If a
 * token changes in globals.css, change it here too — a drifted film is worse
 * than no film.
 */

export const dark = {
  background: '#050505',
  card: '#121212',
  cardHover: '#1a1a1a',
  text: '#E5E5E5',
  textSecondary: '#A0A0A0',
  textMuted: '#666666',
  border: 'rgba(255, 255, 255, 0.05)',
  borderStrong: 'rgba(255, 255, 255, 0.10)',
  fillSubtle: 'rgba(255, 255, 255, 0.05)',
  fillStrong: 'rgba(255, 255, 255, 0.10)',
  surfaceInset: 'rgba(0, 0, 0, 0.20)',
  accent: '#E9E9F2',
  accentInk: '#101016',
  accent2: '#CBD2E0',
  accent3: '#F2F5FA',
  accentRing: 'rgba(174, 184, 206, 0.34)',
  accentGradient: 'linear-gradient(135deg, #FFFFFF, #CBD2E0)',
  tabbarInactive: '#666666',
  shadowCard: [
    'inset 0 1px 0 rgba(255, 255, 255, 0.07)',
    '0 0 0 1px rgba(255, 255, 255, 0.03)',
    '0 2px 4px rgba(0, 0, 0, 0.5)',
    '0 8px 20px rgba(0, 0, 0, 0.45)',
  ].join(', '),
  surfaceSheen:
    'linear-gradient(180deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0) 45%)',
} as const;

export const light = {
  ...dark,
  background: '#F9FAFB',
  card: '#ffffff',
  cardHover: '#F3F4F6',
  text: '#111827',
  textSecondary: '#4B5563',
  textMuted: '#9CA3AF',
  border: 'rgba(0, 0, 0, 0.05)',
  borderStrong: 'rgba(0, 0, 0, 0.10)',
  fillSubtle: 'rgba(0, 0, 0, 0.05)',
  fillStrong: 'rgba(0, 0, 0, 0.08)',
  surfaceInset: 'rgba(0, 0, 0, 0.04)',
  accent: '#22222A',
  accentInk: '#F7F7F9',
  accent2: '#14141B',
  accent3: '#55555F',
  accentGradient: 'linear-gradient(135deg, #34343F, #14141B)',
  shadowCard: [
    '0 0 0 0.5px rgba(16, 24, 40, 0.05)',
    '0 1px 2px -1px rgba(16, 24, 40, 0.05)',
    '0 8px 20px -12px rgba(16, 24, 40, 0.14)',
  ].join(', '),
} as const;

export type Theme = typeof dark;

/**
 * The film is graded LIGHT (owner call, 2026-07-31) — the product's daytime
 * face. The one deliberate exception is the cold open: the shipped BootScreen
 * is fixed graphite regardless of theme, so the boot stays dark and its
 * push-through exit is the moment the film blooms into the light.
 */
export const T = light;

/** `getCategoryColorStyle` from `web/lib/colors.ts`, same hash, same palette. */
const categoryColorStyles = [
  { key: 'purple', bg: 'rgba(100, 116, 139, 0.12)', fg: 'rgb(100, 116, 139)' },
  { key: 'blue', bg: 'rgba(59, 130, 246, 0.1)', fg: 'rgb(59, 130, 246)' },
  { key: 'green', bg: 'rgba(34, 197, 94, 0.1)', fg: 'rgb(34, 197, 94)' },
  { key: 'yellow', bg: 'rgba(234, 179, 8, 0.1)', fg: 'rgb(234, 179, 8)' },
  { key: 'red', bg: 'rgba(239, 68, 68, 0.1)', fg: 'rgb(239, 68, 68)' },
  { key: 'pink', bg: 'rgba(236, 72, 153, 0.1)', fg: 'rgb(236, 72, 153)' },
  { key: 'indigo', bg: 'rgba(99, 102, 241, 0.1)', fg: 'rgb(99, 102, 241)' },
  { key: 'teal', bg: 'rgba(20, 184, 166, 0.1)', fg: 'rgb(20, 184, 166)' },
  { key: 'orange', bg: 'rgba(249, 115, 22, 0.1)', fg: 'rgb(249, 115, 22)' },
  { key: 'cyan', bg: 'rgba(6, 182, 212, 0.1)', fg: 'rgb(6, 182, 212)' },
];

export const categoryColor = (category: string) => {
  let hash = 0;
  for (let i = 0; i < category.length; i++) {
    hash = category.charCodeAt(i) + ((hash << 5) - hash);
  }
  return categoryColorStyles[Math.abs(hash) % categoryColorStyles.length];
};
