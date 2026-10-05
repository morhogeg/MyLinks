import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HITS } from '../../../reel-timeline.mjs';
import { AppShot, Lift, Tap } from '../kit/AppShot';
import { camAt, camVelocity, type Key } from '../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, EASE_SPRING, prog } from '../kit/curves';
import { at, center, rectOf } from '../kit/takes';

/**
 * 6.9s – 9.1s. FIND: "easy dinner, empty fridge" typed into the real search
 * field, landing on the ONE card it means (Marcella Hazan's sauce, which
 * shares no word with the query).
 *
 * While the query types, the camera racks focus onto the field: the app's
 * live literal matches flicker underneath as they really do, softened, so
 * the eye stays on the words. The result lands on the beat and gets the
 * reel's one emphasis gesture (a lift and an ink ring), not a recolour.
 * Then the camera pulls back to the whole screen and the thumb goes to the
 * Ask tab; the cut to Ask lands on the touch.
 */

const T = 'find';
const S = HITS;

/** From the new card's landing (Save hands its screen to this camera) */
export const findKeys: Key[] = [
  { f: 200, cx: 196.5, cy: 300, z: 2.3, fx: 540, fy: 1080 },
  { f: 206, cy: 298, z: 2.32, ease: (t) => t },
  // up to the search field as the thumb comes down on it
  { f: 216, cx: 196.5, cy: 144, z: 2.7, fx: 540, fy: 772, ease: EASE_IN_OUT },
  { f: 238, z: 2.78, ease: (t) => t },
  { f: 246, cx: 196.5, cy: 322, z: 2.35, fy: 1104, ease: EASE_MODAL },
  { f: 256, cy: 326, z: 2.38, ease: (t) => t },
  // back to the whole screen as the thumb goes to Ask
  { f: 270, cx: 196.5, cy: 440, z: 1.6, fx: 540, fy: 1180, ease: EASE_IN_OUT },
];

export const Find: React.FC<{ f: number }> = ({ f }) => {
  // takes the screen over from Save on the tap; hard cut to Ask on the beat
  if (f < S.searchTap || f >= S.askTap) return null;

  const i =
    f < S.typeFrom
        ? at(T, 'focus', f - S.searchTap)
        : f < S.found
          ? at(T, 'typing', f - S.typeFrom)
          : at(T, 'result', f - S.found);

  const cam = camAt(findKeys, f);
  const v = camVelocity(findKeys, f);
  const typing = prog(f, S.searchTap, S.typeFrom, EASE_MODAL) * (1 - prog(f, S.found, S.found + 6, EASE_MODAL));
  const search = rectOf(T, at(T, 'focus', 4), 'search');
  const card = rectOf(T, at(T, 'result', 2), 'card');
  // the tab bar is the same on every Home screen: the Ask tab's box is
  // measured in the ask take, which starts on Home
  const askTab = center(rectOf('ask', 0, 'askTab'));

  const land = prog(f, S.found, S.found + 6, EASE_SPRING);
  const settle = prog(f, S.found + 6, S.found + 18, EASE_MODAL);

  return (
    <AbsoluteFill>
      <AppShot
        take={T}
        i={i}
        cam={cam}
        motion={v}
        focus={typing > 0.01 ? { y0: search[1] - 8, y1: search[1] + search[3] + 8, blur: 0 } : undefined}
        blur={typing * 9}
      >
        <Tap x={center(search).x} y={center(search).y} t={prog(f, S.searchTap - 5, S.searchTap + 9, (t) => t)} />
        {f >= S.found && (
          <Lift
            take={T}
            i={i}
            rect={card}
            radius={20}
            lift={land * (1 - settle)}
            ring={0.75 * (1 - settle)}
          />
        )}
        <Tap x={askTab.x} y={askTab.y} t={prog(f, S.askTap - 5, S.askTap + 9, (t) => t)} />
      </AppShot>
    </AbsoluteFill>
  );
};
