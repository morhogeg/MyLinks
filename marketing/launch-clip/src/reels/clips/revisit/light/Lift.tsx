import React from 'react';
import { Img } from 'remotion';
import { SCREEN, frameSrc, type Rect } from '../../../kit/takes';

/**
 * (REVISIT's light look: the kit's Lift as it was on the light grade, a soft
 * studio shadow and an INK ring, since the kit's ring of light vanishes on
 * the app's light theme.)
 *
 * A real element lifted off the screen: the same capture pixels, cut to the
 * element's box and given its own depth. Use inside an AppShot; at lift 0 it
 * sits exactly on its own pixels.
 */
export const Lift: React.FC<{
  take: string;
  i: number;
  rect: Rect;
  radius?: number;
  /** 0–1: rise + scale + shadow. */
  lift?: number;
  /** points it rises at lift 1 */
  rise?: number;
  /** extra scale at lift 1 */
  grow?: number;
  /** a soft ink ring, 0–1 (emphasis without recolouring the app) */
  ring?: number;
}> = ({ take, i, rect, radius = 12, lift = 0, rise = 6, grow = 0.045, ring = 0 }) => {
  const [x, y, w, h] = rect;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: radius,
        overflow: 'hidden',
        transform: `translateY(${-lift * rise}px) scale(${1 + lift * grow})`,
        transformOrigin: 'center center',
        boxShadow: [
          `0 ${1 + lift * 3}px ${2 + lift * 6}px rgba(16,24,40,${0.06 + lift * 0.08})`,
          `0 ${lift * 18}px ${lift * 40}px -${lift * 8}px rgba(24,32,48,${lift * 0.32})`,
          ring > 0 ? `0 0 0 ${1.2 + ring * 1.2}px rgba(20,20,27,${ring * 0.55})` : '',
        ]
          .filter(Boolean)
          .join(', '),
      }}
    >
      <Img
        src={frameSrc(take, i)}
        style={{ position: 'absolute', left: -x, top: -y, width: SCREEN.w, height: SCREEN.h, maxWidth: 'none' }}
      />
    </div>
  );
};
