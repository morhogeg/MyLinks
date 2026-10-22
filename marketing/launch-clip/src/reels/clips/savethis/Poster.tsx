import React from 'react';
import { sans } from '../../../fonts';
import { EASE_MODAL, EASE_SPRING, mix, prog } from '../../kit/curves';
import { INK } from '../../kit/Type';

/**
 * The poster: frame 0 of SAVE THIS, and the cover the app shows on its card.
 *
 * One frame does three jobs, so its layout is fixed here and nowhere else:
 *  - the hook, readable with the sound off on the very first frame a feed
 *    shows ("You're going to save this video.") over the save gesture every
 *    viewer's thumb knows: an empty bookmark;
 *  - the cover of the Instagram post the app later reads, files and finds
 *    again (rendered to public/clips/savethis/cover.jpg and served to the
 *    capture as the card's poster). The app shows a video poster as a wide
 *    banner, centre-cropped: on a 361 x 112 pt banner that is the band
 *    y 792..1129 of this frame, so the TYPE sits inside that band and the
 *    card reads as this video at a glance;
 *  - the loop: the dive into that banner lands on this exact frame, so the
 *    reel runs straight back into its own hook.
 *
 * Ink on paper (the house grade). The bookmark is the generic save glyph
 * (lucide's, as the film draws its save gestures), never a platform's.
 */

/** where the type and the bookmark sit, in frame px */
export const POSTER = {
  /** centre of the two-line block: the middle of the banner band */
  textY: 955,
  bookmark: { x: 540, y: 1318, size: 312 },
};

/** the banner band of the frame a 361 x 112 pt centre crop shows */
export const BANNER_BAND = { y0: 792, y1: 1129 };

const BOOKMARK_PATH = 'M19 21l-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z';

/**
 * The save glyph. `fill` 0..1 floods it with ink from the bottom (the tap),
 * `outline` is its stroke opacity (the heap's copies are filled and fade).
 */
export const Bookmark: React.FC<{
  size: number;
  fill?: number;
  color?: string;
  stroke?: number;
  shadow?: number;
  style?: React.CSSProperties;
}> = ({ size, fill = 0, color = '#14141B', stroke = 1.55, shadow = 1, style }) => {
  const id = React.useId().replace(/:/g, '');
  // the glyph spans y 3..21 of its 24-unit box: the fill rises over that
  const top = 21 - 18 * fill;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      style={{
        // a block, so no inline baseline gap moves it a few px in one layout
        // and not the other (the loop's last frame must match frame 0)
        display: 'block',
        overflow: 'visible',
        filter: shadow > 0 ? `drop-shadow(0 ${size * 0.045}px ${size * 0.08}px rgba(24,32,48,${0.2 * shadow}))` : undefined,
        ...style,
      }}
    >
      <defs>
        <clipPath id={`bm-${id}`}>
          <rect x="0" y={top} width="24" height={24 - top} />
        </clipPath>
      </defs>
      {fill > 0.001 && <path d={BOOKMARK_PATH} fill={color} clipPath={`url(#bm-${id})`} />}
      <path d={BOOKMARK_PATH} fill="none" stroke={color} strokeWidth={stroke} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
};

/**
 * The poster's type. `out` 0..1 rolls each line up out of its own mask (the
 * house headline exit); `rise` 0..1 brings them in the same way (unused on
 * frame 0, where the type is already set: the poster).
 */
export const PosterType: React.FC<{ out?: number; y?: number }> = ({ out = 0, y = POSTER.textY }) => {
  const lines: [string, number, number, string][] = [
    ['You’re going to', 74, 560, '-0.03em'],
    ['save this video.', 116, 720, '-0.045em'],
  ];
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: y,
        transform: 'translateY(-50%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 0,
      }}
    >
      {lines.map(([text, size, weight, tracking], i) => {
        // the second line leaves a frame after the first
        const t = Math.min(1, Math.max(0, out * 1.25 - i * 0.25));
        const eased = t * t * t;
        return (
          <div key={i} style={{ overflow: 'hidden', padding: '0.04em 0.12em 0.16em', margin: '-0.04em 0 -0.16em' }}>
            <div
              style={{
                transform: `translateY(${Math.round(-eased * 112)}%)`,
                fontFamily: sans,
                fontSize: size,
                fontWeight: weight,
                letterSpacing: tracking,
                lineHeight: 1.08,
                color: INK,
                whiteSpace: 'nowrap',
              }}
            >
              {text}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * The whole poster at a moment of the hook: the type, the bookmark and the
 * thumb's fill. Frame 0 (and the dive's last frame) is `PosterArt` with
 * every prop at its default.
 */
export const PosterArt: React.FC<{
  /** frames since the tap landed (negative: not yet) */
  sinceTap?: number;
  typeOut?: number;
  /** the bookmark drawn elsewhere (once it falls, the opening owns it) */
  hideBookmark?: boolean;
}> = ({ sinceTap = -1, typeOut = 0, hideBookmark = false }) => {
  const fill = sinceTap < 0 ? 0 : prog(sinceTap, 0, 6, EASE_MODAL);
  const pop = sinceTap < 0 ? 0 : prog(sinceTap, 0, 12, EASE_SPRING) * (1 - prog(sinceTap, 6, 20, EASE_MODAL));
  const { x, y, size } = POSTER.bookmark;
  return (
    <>
      <PosterType out={typeOut} />
      {!hideBookmark && (
        <div
          style={{
            position: 'absolute',
            left: x - size / 2,
            top: y - size / 2,
            width: size,
            height: size,
            transform: `scale(${mix(1, 1.12, pop)})`,
          }}
        >
          <Bookmark size={size} fill={fill} />
        </div>
      )}
    </>
  );
};
