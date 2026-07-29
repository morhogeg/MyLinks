import { Easing, interpolate } from 'remotion';

/**
 * Motion vocabulary. The app has exactly one modal-entrance curve
 * (`--ease-modal: cubic-bezier(0.32, 0.72, 0, 1)`) and one spring
 * (`--ease-spring`), and the film reuses them so its motion personality is the
 * product's, not a stock template's.
 */
export const EASE_MODAL = Easing.bezier(0.32, 0.72, 0, 1);
export const EASE_SPRING = Easing.bezier(0.34, 1.56, 0.64, 1);
export const EASE_OUT = Easing.bezier(0.22, 1, 0.36, 1);
export const EASE_IN_OUT = Easing.bezier(0.65, 0, 0.35, 1);

type Range = readonly [number, number];

/** Eased interpolate, clamped at both ends — the workhorse of every scene. */
export const ramp = (
  frame: number,
  [f0, f1]: Range,
  [v0, v1]: Range,
  easing = EASE_MODAL,
) =>
  interpolate(frame, [f0, f1], [v0, v1], {
    easing,
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

/** 0→1 progress over a frame window. */
export const prog = (frame: number, f0: number, f1: number, easing = EASE_MODAL) =>
  ramp(frame, [f0, f1], [0, 1], easing);

/** Fade up then down — for beats that appear and leave inside one scene. */
export const pulse = (frame: number, f0: number, hold: number, fade = 10) =>
  Math.min(prog(frame, f0, f0 + fade), 1 - prog(frame, f0 + fade + hold, f0 + fade + hold + fade));

/**
 * A typing cadence that isn't a metronome: characters land on an eased ramp
 * with a small deterministic jitter, so it reads as a person at a keyboard.
 */
export const typed = (frame: number, f0: number, f1: number, len: number) => {
  const t = prog(frame, f0, f1, Easing.bezier(0.35, 0.6, 0.4, 1));
  const jitter = Math.sin(frame * 1.7) * 0.6 + Math.sin(frame * 0.53) * 0.5;
  return Math.max(0, Math.min(len, Math.round(t * len + (t > 0 && t < 1 ? jitter : 0))));
};

/** Slow continuous drift — keeps a held shot alive without drawing attention. */
export const drift = (frame: number, amp = 6, period = 210, phase = 0) =>
  Math.sin((frame / period) * Math.PI * 2 + phase) * amp;

/**
 * Framing constants shared by every product shot.
 *
 * The device is deliberately NOT centred at 1:1. At full scale an 878px-tall
 * phone runs from y=101 to y=979 in a 1080 frame, which puts its tab bar exactly
 * where the captions live. Sitting it slightly small and slightly high keeps the
 * lower sixth of the frame clean for type — and gives every close-up somewhere
 * to push in FROM.
 */
export const BASE_SCALE = 0.86;
export const BASE_Y = -52;
