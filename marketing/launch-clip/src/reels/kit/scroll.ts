import { at, rectOf } from './takes';

/**
 * Reading a STEPPED SCROLL (README "Motion language", Camera: a stepped
 * capture never hops). capture/shoot.mjs records a scroll as one frame per
 * step from a mark; the frame before the mark (`base`) is step 0. A scene
 * eases its read in page POINTS and asks for the scroll at any fraction of a
 * point; it gets the captured frame nearest to it plus the correction the
 * camera takes up, so the page sits exactly where the read wants it and a
 * slow read glides instead of hopping a step at a time.
 *
 * Every step's position is MEASURED (a rect that scrolls with the page, on
 * that step's frame), never assumed from the step size: the browser snaps a
 * scroll to whole points, so an even 2.99pt step lands as 3pt with an
 * occasional 2pt one (the Revisit take has two in 281; the reel's recall
 * take five 5pt steps among its 6pt ones). A correction that assumes even
 * steps hops by that point at each of them (measured: a 2.3px hitch), and a
 * read eased in STEPS rather than points slows by it: so reads are in points.
 *
 * The correction moves the WHOLE captured screen, the app's fixed chrome
 * included: frame a stepped read with the header under the band's solid
 * paper and the tab bar below the frame, or they hop by up to half a step
 * (the Revisit clip's reading window, src/reels/clips/revisit/Revisit.tsx).
 */
export const steppedScroll = ({
  take,
  mark,
  steps,
  key,
  base = at(take, mark) - 1,
}: {
  take: string;
  /** the take's mark on the scroll's first step */
  mark: string;
  /** how many steps (frames) the scroll recorded */
  steps: number;
  /** a rect that scrolls with the page (measured on every step) */
  key: string;
  /** the frame the scroll starts from (step 0); default: the one before `mark` */
  base?: number;
}) => {
  const first = at(take, mark);
  const frame = (k: number) => (k <= 0 ? base : first + Math.min(steps, k) - 1);
  const y0 = rectOf(take, base, key)[1];
  /** points the page has scrolled at each step, as captured */
  const measured = Array.from({ length: steps + 1 }, (_, k) => y0 - rectOf(take, frame(k), key)[1]);
  const end = measured[steps];
  return {
    /** points the page can scroll in this take */
    end,
    frame,
    /** for a scroll of `points` (fractional, eased by the scene): the
     *  captured frame nearest to it, and `dy`, how many points further that
     *  frame is scrolled than wanted (the camera looks `dy` higher: cy − dy) */
    view: (points: number) => {
      const p = Math.max(0, Math.min(end, points));
      let k = 0;
      while (k < steps && Math.abs(measured[k + 1] - p) <= Math.abs(measured[k] - p)) k++;
      return { i: frame(k), dy: measured[k] - p };
    },
  };
};
