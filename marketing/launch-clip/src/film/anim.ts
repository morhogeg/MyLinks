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
  if (t <= 0) return 0;
  if (t >= 1) return len;
  // Each character gets its own dwell, and the count is "how many dwells have
  // elapsed" — so the cadence is human but the count is MONOTONIC by
  // construction. The previous version added a sine wobble to the count, which
  // could go backwards between frames: the question bubble grew and shrank a
  // character at a time, which is the jitter in the Ask mockup.
  let total = 0;
  let n = 0;
  for (let i = 0; i < len; i++) total += 0.6 + 0.8 * ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) / 2;
  let acc = 0;
  for (let i = 0; i < len; i++) {
    acc += 0.6 + 0.8 * ((Math.sin(i * 12.9898) * 43758.5453) % 1 + 1) / 2;
    if (acc / total <= t) n = i + 1;
    else break;
  }
  return n;
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

/**
 * Product shots hold the device RIGHT of centre, which opens the left column the
 * captions live in (see `film/Subtitles.tsx`). Type under the device sat in its
 * shadow and made the film look subtitled; beside it, the two read as one
 * composition.
 */
export const BASE_X = 268;
