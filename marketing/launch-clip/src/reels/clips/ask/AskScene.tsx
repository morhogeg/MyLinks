import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HITS, K, TAKE } from '../../../../clips/ask-timeline.mjs';
import { AppShot, Lift, Tap } from '../../kit/AppShot';
import { camAt, camVelocity, type Key } from '../../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../../kit/curves';
import { at, center, rectOf, takeOf, type Rect } from '../../kit/takes';

/**
 * ASK, the whole clip's picture, from ONE take of the real app (`askcite`):
 *
 *  1. Ask opens: the empty screen ("What do you want to recall?", and the
 *     app's own promise under it: "Answers come only from your 24 saves,
 *     with sources you can open.") comes into focus while its mark plays the
 *     app's own launch; the point strikes on beat 2.
 *  2. CUT on the beat to the composer: "What do my saves say about time?"
 *     types (the reel's framing: the last suggestions above it); Send is
 *     tapped on the bar.
 *  3. CUT on the 8th after it to the first words of the answer. The app's
 *     thinking line ("Searching your …", banned wording for reels) is not in
 *     the take at all: the first words were on screen before its first frame.
 *  4. The sources arrive under the finished answer; the camera travels down
 *     onto them and each lifts on its own beat (the reel's gesture).
 *  5. The camera pulls back onto the first source and the space its card
 *     will open into, at rest as the finger lands; the card it cites opens
 *     (the app's own transition, the same view a card opens into from the
 *     feed) in that still frame: The Tail End, whose summary is the passage
 *     the answer drew on. It lifts.
 *  6. Thrown out of frame into the lockup (End.tsx).
 *
 * Output frames throughout (clips/ask-timeline.mjs). The reel's steady pace:
 * a frame the capture took at 30fps (typing, the stream, the sources) lasts
 * K frames; one taken at 60fps (the opening, the card) lasts one.
 */

const T = TAKE;
const S = HITS;
const linear = (t: number) => t;
/** an arrival (EASE_MODAL) that keeps a slow drift to the end of its shot: a
 *  quarter of the move is linear, so the shot never comes to a dead stop */
const ARRIVE_DRIFTING = (t: number) => 0.75 * EASE_MODAL(t) + 0.25 * t;

const take = takeOf(T);
const span = (from: string, to: string | null) => (to ? take.marks[to] : take.count) - take.marks[from];
const TYPED = span('typing', 'stream');
const STREAMED = span('stream', 'sources');
const SOURCED = span('sources', 'card');
const CARD = span('card', null);

/** the clip opens this far into the Ask screen's opening: the screen has
 *  faded in whole (frame 0 is the poster) and the mark is mid-launch, so its
 *  point strikes on beat 2 (take frame 49, measured) */
export const OPEN_FROM = 16;

/** output frame → the take's frame */
export const frameAt = (f: number) => {
  if (f < S.typeFrom) return at(T, 'open', OPEN_FROM + f);
  if (f < S.answerFrom) return at(T, 'typing', Math.min(TYPED - 1, Math.floor((f - S.typeFrom) / K)));
  if (f < S.sources) return at(T, 'stream', Math.min(STREAMED - 1, Math.floor((f - S.answerFrom) / K)));
  if (f < S.citeTap) return at(T, 'sources', Math.min(SOURCED - 1, Math.floor((f - S.sources) / K)));
  // the app answers ON the touch: the roll's first frame is the moment of
  // the click (identical to the last sources frame), its second the first
  // frame of the card opening
  return at(T, 'card', Math.min(CARD - 1, f - S.citeTap + 1));
};

const CHIPS = ['chip1', 'chip2', 'chip3'] as const;

/**
 * A Lift's box on whole points. The capture measures boxes to half a point
 * (the summary sits at y 229.5); Chromium snaps the lifted box and the image
 * inside it to whole pixels separately, so a half-point box drew the lifted
 * copy up to a point off the screen under it: a measured 2.5px hop as the
 * lift appeared and again as it left.
 */
const wholePoints = ([x, y, w, h]: Rect): Rect => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  return [x0, y0, Math.ceil(x + w) - x0, Math.ceil(y + h) - y0];
};

export const askKeys: Key[] = [
  // Ask, opening: its mark, its question and its promise, coming into focus
  // in ONE 2D move into the cut (a settle then a separate drift measured as
  // a stop and a start; the settle alone left the last frames before the cut
  // dead still). No tilt: its text is read from the first half second, and
  // the frame a tilt reaches 0 the slab re-rasters from 3D to 2D, a measured
  // pop of every line of text at once
  { f: 0, cx: 196.5, cy: 392, z: 2.16, fx: 540, fy: 1190 },
  { f: S.typeFrom - 1, cy: 396, z: 2.3, ease: ARRIVE_DRIFTING },
  // CUT (on the beat) to the composer as the question types: the last
  // suggestions above it, the question itself clear of the feeds' bottom
  // chrome, the screen's own rounded foot below
  { f: S.typeFrom, cx: 196.5, cy: 680, z: 2.3, fx: 540, fy: 1100, rx: 0, ease: linear },
  { f: S.answerFrom - 1, cy: 684, z: 2.38, ease: linear },
  // CUT (the 8th after Send) to the answer arriving: the question, and the
  // words as they come
  { f: S.answerFrom, cx: 196.5, cy: 250, z: 2.6, fx: 540, fy: 1130, ease: linear },
  { f: S.sources, cy: 262, z: 2.66, ease: linear },
  // down onto the three sources (hold to hold), arriving as the first lifts
  { f: S.chips[0], cx: 175, cy: 492, z: 2.85, fy: 1160, ease: EASE_IN_OUT },
  { f: S.chips[2] + 8, cy: 496, z: 2.92, ease: linear },
  // back up onto the first source AND the space its card opens into, in one
  // move that comes to rest as the finger lands: the card then opens where
  // the eye already is, in a still frame (a camera move over the app's own
  // crossfade smeared both)
  { f: S.citeTap, cx: 196.5, cy: 320, z: 2.55, fx: 540, fy: 1080, ease: EASE_IN_OUT },
  // the card, read: a slow drift onto its title and summary
  { f: S.lockup - 16, cy: 296, z: 2.62, ease: linear },
  // thrown out of frame, into the lockup
  { f: S.lockup + 14, fx: -760, z: 2.68, ease: EASE_IN_OUT },
];

export const AskScene: React.FC<{ f: number }> = ({ f }) => {
  if (f > S.lockup + 15) return null;
  const i = frameAt(f);
  const cam = camAt(askKeys, f);
  const v = camVelocity(askKeys, f, 1);

  // the opening comes into focus (frame 0 is already the picture)
  const opening = 1 - prog(f, 0, 18, EASE_MODAL);
  const send = center(rectOf(T, at(T, 'typing', 4), 'send'));
  const chip1 = center(rectOf(T, at(T, 'sources'), 'chip1'));
  const summary = f >= S.citeTap ? rectOf(T, i, 'summary') : null;

  // each source lifts on its beat and settles half-raised (the reel's
  // gesture); all settle flat just before the tap, so nothing is lifted off
  // the screen when the card opens over it
  const flat = 1 - prog(f, S.citeTap - 10, S.citeTap - 1, EASE_IN_OUT);
  // the summary the answer drew on lifts once the card has opened
  const proof = prog(f, S.summary - 4, S.summary + 12, EASE_SPRING) * (1 - prog(f, S.lockup - 40, S.lockup - 18, EASE_MODAL));

  return (
    <AbsoluteFill>
      <AppShot
        take={T}
        i={i}
        cam={cam}
        motion={v}
        // (4px: frame 0 is the poster a feed shows, and its question stays
        // nearly legible while it still visibly comes into focus)
        blur={opening * 4}
      >
        {/* Send: a light tap on the dark button, landing as the bar turns */}
        <Tap x={send.x} y={send.y} tone="light" t={prog(f, S.send - 10, S.send + 18, linear)} />
        {f >= S.sources &&
          f < S.citeTap &&
          CHIPS.map((key, k) => {
            const hit = S.chips[k];
            const up = prog(f, hit - 2, hit + 10, EASE_SPRING);
            const down = prog(f, hit + 14, hit + 36, EASE_MODAL);
            return (
              <Lift
                key={key}
                take={T}
                i={i}
                rect={wholePoints(rectOf(T, i, key))}
                radius={12}
                lift={up * mix(1, 0.28, down) * flat}
                rise={5}
                grow={0.05}
                ring={0.7 * up * (1 - down)}
              />
            );
          })}
        <Tap x={chip1.x} y={chip1.y} t={prog(f, S.citeTap - 10, S.citeTap + 18, linear)} />
        {summary && proof > 0.01 && (
          <Lift
            take={T}
            i={i}
            rect={wholePoints([summary[0] - 6, summary[1] - 6, summary[2] + 12, summary[3] + 12])}
            radius={12}
            lift={proof * 0.35}
            rise={2}
            grow={0.01}
            ring={0.55 * proof}
          />
        )}
      </AppShot>
    </AbsoluteFill>
  );
};
