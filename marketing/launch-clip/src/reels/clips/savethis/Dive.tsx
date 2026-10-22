import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HITS } from '../../../../clips/savethis-timeline.mjs';
import { EASE_IN_OUT, EASE_MODAL, mix, prog } from '../../kit/curves';
import { Paper } from '../../kit/Paper';
import { COVER, DIVE_CAM, HANDOVER } from './App';
import { GRADE } from './grade';
import { BANNER_BAND, PosterArt } from './Poster';

/**
 * Into the cover, and out as frame 0.
 *
 * The app shows a video poster as a 361 x 112 pt banner, centre-cropped, a
 * dark gradient over its lower part (Card.tsx: object-cover, `from-black/30`),
 * its top corners rounded by the card. When the dive's camera has the
 * banner centred and exactly the frame's width (App.tsx DIVE_CAM), the
 * banner's pixels ARE the poster's rows BANNER_BAND, at 1:1: so the hand-over
 * from the captured pixels to the poster itself is invisible. From there the
 * banner opens to the whole frame (its gradient and its corners let go) and
 * lands on the poster exactly as frame 0 draws it, and the reel runs on into
 * its own hook.
 *
 * `paperDrift` is the set's drift, periodic over the reel, so this last
 * frame and frame 0 are the same picture.
 */
export const Dive: React.FC<{ f: number; paperDrift: number }> = ({ f, paperDrift }) => {
  if (f < HANDOVER) return null;
  const open = prog(f, HANDOVER, HITS.poster, EASE_MODAL);
  // the band, opening to the frame
  const y0 = mix(BANNER_BAND.y0, 0, open);
  const y1 = mix(BANNER_BAND.y1, 1920, open);
  // the card's corner radius at the dive's zoom, letting go
  const radius = mix(20 * DIVE_CAM.z, 0, prog(f, HANDOVER, HANDOVER + 8, EASE_IN_OUT));
  // the app's gradient over the banner (black 30% at the bottom → clear),
  // released as it opens
  const shade = 1 - prog(f, HANDOVER, HANDOVER + 10, EASE_IN_OUT);
  void COVER;
  return (
    <AbsoluteFill
      style={{
        clipPath: `inset(${y0}px 0px ${1920 - y1}px 0px round ${radius}px ${radius}px 0px 0px)`,
      }}
    >
      <Paper drift={paperDrift} tone={GRADE.tone} cool={GRADE.cool} />
      <PosterArt />
      {shade > 0.001 && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: BANNER_BAND.y0,
            height: BANNER_BAND.y1 - BANNER_BAND.y0,
            background: `linear-gradient(to top, rgba(0,0,0,${0.3 * shade}), rgba(0,0,0,0))`,
          }}
        />
      )}
    </AbsoluteFill>
  );
};
