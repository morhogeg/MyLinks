import { useVideoConfig } from 'remotion';
import { BASE_X, SCREEN_MID } from './anim';

/**
 * One film, two frames. The 1920×1080 master holds the device right of centre
 * with an editorial left caption column; the 1080×1920 vertical edition (for
 * iPhone / Reels / Shorts) centres the device lower in frame and moves the
 * captions to a centred block at the top.
 *
 * Every scene reads its framing through this hook instead of hardcoding the
 * landscape constants, so both compositions render from the same scene code —
 * a second layout, not a second film.
 */
export const useFraming = () => {
  const { width, height } = useVideoConfig();
  const vertical = height > width;
  return {
    vertical,
    /** Horizontal device offset — centred in vertical. */
    baseX: vertical ? 0 : BASE_X,
    /** Product-shot magnification bump — the device should fill a phone screen. */
    scaleMul: vertical ? 1.3 : 1,
    /**
     * Vertical offset that puts a given point of the SCREEN at the frame's
     * focus line (520px in the landscape master; 52% down in vertical, which
     * leaves the top band to the captions without opening a dead gap between
     * them and the device).
     */
    focusY: (screenY: number, scale: number) =>
      (vertical ? height * 0.52 : 520) - height / 2 - (screenY - SCREEN_MID) * scale,
  };
};
