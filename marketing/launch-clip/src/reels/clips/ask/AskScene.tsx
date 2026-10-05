import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HITS, K, TAKE } from '../../../../clips/ask-timeline.mjs';
import { AppShot, Lift, Tap } from '../../kit/AppShot';
import { camAt, camVelocity, type Key } from '../../kit/camera';
import { EASE_GATHER, EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../../kit/curves';
import { at, center, rectOf, takeOf, type Rect } from '../../kit/takes';

/**
 * ASK, the whole clip's picture, from ONE take of the real app (`askfull`):
 *
 *  hook      the Home feed, scrolling ever faster (EASE_GATHER, the one move
 *            that ends at speed): saves piling up, the one you need in there
 *            somewhere. CUT at speed, on the beat, to…
 *  1 open    Ask opening: the empty screen and its promise ("Answers come only
 *            from your 24 saves, with sources you can open."), its mark
 *            playing the app's own launch; the point strikes on a beat.
 *  2 typing  CUT to the composer: "What do my saves say about time?" types.
 *  3 answer  Send; the cut to the answer lands on the touch. It streams in.
 *            The app's thinking line is not in the take at all.
 *  4 sources the three sources lift on their beats; a pull-back comes to rest
 *            as the finger lands on the first; its card opens in that still
 *            frame, and the passage the answer drew on lifts.
 *  5 more    the card is closed; the answer's own suggested follow-up ("What
 *            else did I save on time?") is tapped; the second answer arrives
 *            and its sources scroll into view.
 *  6 graph   its Graph chip: the two cited saves lit among the rest. Thrown out
 *            of frame into the lockup (End.tsx).
 *
 * Output frames throughout (clips/ask-timeline.mjs). The reel's steady pace:
 * a frame the capture took at 30fps lasts K frames, one taken at 60fps lasts
 * one. Captured scrolls (the feed, the second answer) are stepped: the camera
 * takes up each step's rounding (README "A stepped capture never hops").
 */

const T = TAKE;
const S = HITS;
const linear = (t: number) => t;
/** an arrival (EASE_MODAL) that keeps a slow drift to the end of its shot: a
 *  quarter of the move is linear, so the shot never comes to a dead stop */
const ARRIVE_DRIFTING = (t: number) => 0.75 * EASE_MODAL(t) + 0.25 * t;

const take = takeOf(T);
const span = (from: string, to: string | null) => (to ? take.marks[to] : take.count) - take.marks[from];
const HOOK = span('hook', 'open'); // feed scroll steps, 12pt each
const TYPED = span('typing', 'stream');
const STREAMED = span('stream', 'sources');
const SOURCED = span('sources', 'card');
const CARD = span('card', 'close');
const CLOSED = span('close', 'stream2');
const STREAMED2 = span('stream2', 'sources2');
const SCROLL2 = span('scroll2', 'graph'); // 4pt steps
const GRAPH = span('graph', null);

/** the Ask screen opens this far into its roll: the screen has faded in whole
 *  and its mark's point strikes 32 frames later, on HITS.appMark (take frame
 *  open + 48, measured) */
export const OPEN_FROM = 16;
const GRAPH_JOIN = 8;

/** where the stepped scrolls are (fractional steps), by the curve they play on */
const hookAt = (f: number) => prog(f, S.hook, S.open, EASE_GATHER) * (HOOK - 1);
const SCROLL2_END = S.scroll2 + 48;
// (step 0 is the settled frame before the scroll, whose first recorded frame
// is already one 4pt step in)
const scroll2At = (f: number) => prog(f, S.scroll2, SCROLL2_END, EASE_IN_OUT) * SCROLL2;

/** output frame → the take's frame. Each tap lands on the frame the app
 *  answers it (measured: the card's first changed frame is card + 1; the
 *  close, the follow-up and the graph answer on their first frame). */
export const frameAt = (f: number) => {
  if (f < S.open) return at(T, 'hook', Math.round(hookAt(f)));
  if (f < S.typeFrom) return at(T, 'open', OPEN_FROM + f - S.open);
  if (f < S.send) return at(T, 'typing', Math.min(TYPED - 1, Math.floor((f - S.typeFrom) / K)));
  if (f < S.sources) return at(T, 'stream', Math.min(STREAMED - 1, Math.floor((f - S.send) / K)));
  if (f < S.citeTap) return at(T, 'sources', Math.min(SOURCED - 1, Math.floor((f - S.sources) / K)));
  if (f < S.closeTap) return at(T, 'card', Math.min(CARD - 1, f - S.citeTap + 1));
  if (f < S.followTap) return at(T, 'close', Math.min(CLOSED - 1, f - S.closeTap));
  if (f < S.scroll2) return f - S.followTap < STREAMED2 * K
    ? at(T, 'stream2', Math.floor((f - S.followTap) / K))
    : at(T, 'sources2', 0);
  if (f < S.graphTap) return at(T, 'scroll2', Math.round(scroll2At(f)) - 1);
  // (the graph view draws its nodes over its first ~6 frames, measured: the
  // cut joins it 8 in, while the layout is still blooming, as the reel does)
  return at(T, 'graph', Math.min(GRAPH - 1, GRAPH_JOIN + f - S.graphTap));
};

const CHIPS = ['chip1', 'chip2', 'chip3'] as const;

/**
 * The second answer streams with the conversation pinned to its bottom (the
 * app's own auto-scroll, done per captured frame), so each new line of text
 * lifted everything by a line at once: three measured 24pt jumps. The camera
 * takes each jump up and gives it back over RELEASE frames, so the text rises
 * smoothly: `pinned(f)` is how far the capture has scrolled, `eased(f)` the
 * scroll the viewer sees (its moving average).
 */
const RELEASE = 8;
const pinned = (f: number) =>
  f < S.followTap ? 0 : rectOf(T, frameAt(Math.min(f, S.scroll2 - 1)), 'lead2')[1] - rectOf(T, at(T, 'stream2'), 'lead2')[1];
const eased = (f: number) => {
  let sum = 0;
  for (let g = f - RELEASE + 1; g <= f; g++) sum += pinned(g);
  return sum / RELEASE;
};

/**
 * A Lift's box on whole points. The capture measures boxes to half a point;
 * Chromium snaps the lifted box and the image inside it to whole pixels
 * separately, so a half-point box drew the lifted copy up to a point off the
 * screen under it: a measured 2.5px hop as the lift appeared and as it left.
 */
const wholePoints = ([x, y, w, h]: Rect): Rect => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  return [x0, y0, Math.ceil(x + w) - x0, Math.ceil(y + h) - y0];
};

/** the follow-up's framing: the chip in reach, the conversation above it */
const MORE = { cx: 196.5, cy: 560, z: 2.4, fx: 540, fy: 1000 };
/** close on the continuations the app suggests under the answer ("Compare the
 *  Time saves", "More on 'The Tail End'", "What else did I save on time?") */
const SUGGEST = { cx: 196.5, cy: 672, z: 2.9, fx: 540, fy: 1180 };

export const askKeys: Key[] = [
  // the hook: the feed, the camera pushing with the scroll, at speed into the cut
  { f: S.hook, cx: 196.5, cy: 380, z: 2.2, fx: 540, fy: 1150 },
  { f: S.open - 1, cy: 392, z: 2.4, ease: EASE_GATHER },
  // CUT to Ask opening: its mark, its question and its promise, one 2D move
  { f: S.open, cx: 196.5, cy: 392, z: 2.16, fx: 540, fy: 1190 },
  { f: S.typeFrom - 1, cy: 396, z: 2.3, ease: ARRIVE_DRIFTING },
  // CUT (on the beat) to the composer as the question types
  { f: S.typeFrom, cx: 196.5, cy: 680, z: 2.3, fx: 540, fy: 1100 },
  { f: S.send - 1, cy: 684, z: 2.38, ease: linear },
  // CUT on the Send touch to the answer arriving
  { f: S.send, cx: 196.5, cy: 250, z: 2.6, fx: 540, fy: 1130 },
  { f: S.sources, cy: 262, z: 2.66, ease: linear },
  // down onto the three sources (hold to hold), arriving as the first lifts
  { f: S.chips[0], cx: 175, cy: 492, z: 2.85, fy: 1160, ease: EASE_IN_OUT },
  { f: S.chips[2] + 8, cy: 496, z: 2.92, ease: linear },
  // back up onto the first source AND the space its card opens into, at rest
  // as the finger lands: the card opens where the eye already is
  { f: S.citeTap, cx: 196.5, cy: 320, z: 2.55, fx: 540, fy: 1080, ease: EASE_IN_OUT },
  { f: S.summary + 16, cy: 316, z: 2.58, ease: linear },
  // out to the card's top, its close button in reach as the finger lands
  { f: S.closeTap, cx: 196.5, cy: 330, z: 2.2, fx: 540, fy: 1440, ease: EASE_IN_OUT },
  // down to the answer's suggested follow-ups, at rest for the tap
  // in close on the suggested continuations, at rest as the finger lands
  { f: S.followTap - 24, ...SUGGEST, ease: EASE_IN_OUT },
  { f: S.followTap - 1, cy: 674, z: 2.96, ease: linear },
  // CUT on the touch: the second answer arrives
  { f: S.followTap, ...MORE },
  // the second answer arrives in the same frame; the camera rides its scroll
  { f: S.scroll2, cy: 562, ease: linear },
  { f: SCROLL2_END, cy: 540, fy: 1060, ease: EASE_IN_OUT },
  { f: S.graphTap - 1, cy: 538, z: 2.44, ease: linear },
  // CUT on the Graph touch to the graph: the two cited saves, lit
  { f: S.graphTap, cx: 200, cy: 630, z: 2.6, fx: 540, fy: 1150 },
  { f: S.lockup - 16, cy: 634, z: 2.72, ease: linear },
  // thrown out of frame, into the lockup
  { f: S.lockup + 14, fx: -760, z: 2.78, ease: EASE_IN_OUT },
];

const tapAt = (f: number, hit: number) => prog(f, hit - 10, hit + 18, linear);
const tapCenter = (mark: string, offset: number, key: string) => center(rectOf(T, at(T, mark, offset), key));

export const AskScene: React.FC<{ f: number }> = ({ f }) => {
  if (f > S.lockup + 15) return null;
  const i = frameAt(f);
  const cam = camAt(askKeys, f);
  const camV = camVelocity(askKeys, f, 1);

  // the stepped scrolls: the camera takes up each step's rounding, and motion
  // blur follows what moves on screen (camera + scroll)
  let view = cam;
  let motion = camV;
  if (f < S.open) {
    const e = hookAt(f);
    view = { ...cam, cy: cam.cy - (Math.round(e) - e) * 12 };
    motion = { ...camV, y: camV.y - 12 * cam.z * (e - hookAt(f - 1)) };
  } else if (f >= S.followTap && f < S.scroll2) {
    view = { ...cam, cy: cam.cy + (pinned(f) - eased(f)) };
    motion = { ...camV, y: camV.y + cam.z * (eased(f) - eased(f - 1)) };
  } else if (f >= S.scroll2 && f < S.graphTap) {
    const e = scroll2At(f);
    view = { ...cam, cy: cam.cy - (Math.round(e) - e) * 4 };
    motion = { ...camV, y: camV.y - 4 * cam.z * (e - scroll2At(f - 1)) };
  }

  const send = tapCenter('typing', 4, 'send');
  const chip1 = tapCenter('sources', 0, 'chip1');
  const close = tapCenter('card', CARD - 1, 'close');
  const follow = tapCenter('close', 2, 'followUp');
  const graph = tapCenter('graph', -1, 'graph2');
  const summary = f >= S.citeTap && f < S.closeTap ? rectOf(T, i, 'summary') : null;

  // each source lifts on its beat and settles half-raised (the reel's
  // gesture); all settle flat just before the tap, so nothing is lifted off
  // the screen when the card opens over it
  const flat = 1 - prog(f, S.citeTap - 10, S.citeTap - 1, EASE_IN_OUT);
  // the summary the answer drew on lifts once the card has opened, and is
  // flat again before the card closes
  const proof = prog(f, S.summary - 4, S.summary + 12, EASE_SPRING) * (1 - prog(f, S.closeTap - 26, S.closeTap - 10, EASE_MODAL));
  // the chosen continuation lifts, with its ring, just before it is tapped
  const offer = f < S.followTap ? prog(f, S.followTap - 22, S.followTap - 10, EASE_SPRING) * (1 - prog(f, S.followTap - 6, S.followTap - 1, EASE_MODAL)) : 0;

  return (
    <AbsoluteFill>
      <AppShot take={T} i={i} cam={view} motion={motion}>
        {/* Send: a light tap on the dark button; the cut lands on the touch */}
        <Tap x={send.x} y={send.y} tone="dark" t={tapAt(f, S.send)} />
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
        <Tap x={chip1.x} y={chip1.y} t={tapAt(f, S.citeTap)} />
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
        {/* the finger leaves with the card (its ripple used to linger on the
            chat's "+ New", which read as starting a new chat) */}
        <Tap x={close.x} y={close.y} t={f <= S.closeTap + 1 ? tapAt(f, S.closeTap) : 0} />
        {offer > 0.01 && (
          <Lift take={T} i={i} rect={wholePoints(rectOf(T, i, 'followUp'))} radius={16} lift={offer * 0.6} rise={2} grow={0.03} ring={0.6 * offer} />
        )}
        <Tap x={follow.x} y={follow.y} t={tapAt(f, S.followTap)} />
        <Tap x={graph.x} y={graph.y} t={tapAt(f, S.graphTap)} />
      </AppShot>
    </AbsoluteFill>
  );
};
