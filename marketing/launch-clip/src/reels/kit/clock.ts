/**
 * The beat clock. Every Machina reel declares its grid in a timeline file
 * (reel-timeline.mjs for the pilot: 112.5 BPM, 16 frames a beat); scenes and
 * the score read the same numbers, so placing something "on the beat" is
 * arithmetic, not taste.
 *
 * Pacing rules this helps enforce (see README "Motion language"):
 *  - cuts and taps land ON a beat line (a multiple of BEAT_FRAMES);
 *  - secondary events (a phase ticking, a chip lifting) land on 8ths;
 *  - nothing important lands on a 16th except typing.
 */
export type Grid = { FPS: number; BEAT_FRAMES: number };

export const makeClock = ({ FPS, BEAT_FRAMES }: Grid) => ({
  /** beat n (fractional ok) → frame */
  beat: (n: number) => Math.round(n * BEAT_FRAMES),
  /** bar n → frame */
  bar: (n: number) => Math.round(n * BEAT_FRAMES * 4),
  /** seconds → frame */
  sec: (s: number) => Math.round(s * FPS),
  /** 1 → 0 decay after each beat: a pulse for things that breathe with the kick */
  kick: (frame: number, depth = 1, decayFrames = 7) => {
    const into = ((frame % BEAT_FRAMES) + BEAT_FRAMES) % BEAT_FRAMES;
    return depth * Math.max(0, 1 - into / decayFrames) ** 2;
  },
  onGrid: (frame: number, division = 1) => frame % Math.round(BEAT_FRAMES / division) === 0,
});
