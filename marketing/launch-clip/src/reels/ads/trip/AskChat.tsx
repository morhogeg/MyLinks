import React from 'react';
import { AbsoluteFill } from 'remotion';
import { FEED_STEPS, HITS, K, TAKE, TYPE_STEP } from '../../../../ads/trip-timeline.mjs';
import { AppShot, Lift, Tap } from '../../kit/AppShot';
import { camAt, camVelocity, type Key } from '../../kit/camera';
import { EASE_GATHER, EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../../kit/curves';
import { at, center, rectOf, takeOf, type Rect } from '../../kit/takes';
import { useAdFrame, type AdFrame } from './format';

/**
 * The chat, from ONE take of the real app (`adask`), in four shots:
 *
 *  ask      a fresh chat, close on the composer: "What did that TED talk say
 *           about procrastination?" types itself (the promise line above it,
 *           "your 29 saves", stays out of shot under "hundreds of saves").
 *  answer   Send; the cut lands on the touch. A short answer from one save
 *           streams in, its source under it.
 *  feed     CUT to the Home feed rushing past (EASE_GATHER, the one move that
 *           ends at speed): "Even across hundreds of saves,".
 *  big      CUT to a new chat, "What do my saves say about time?" typed;
 *           Send; one answer streams, woven from three saves on three
 *           platforms. Its first line, the theme it found, lifts; then the
 *           three saves it connected lift as the voice says "you never
 *           noticed"; the camera eases down onto the questions the app
 *           suggests next and comes to rest as the finger lands on the
 *           answer's Graph chip.
 *  graph    CUT on the touch into the real graph: those three saves, lit and
 *           linked among the rest (round 5, owner). Thrown out into the lockup.
 *
 * The app's thinking line is not in the take at all. Captured scrolls (the
 * feed) are stepped: the camera takes up each step's rounding.
 */

const T = TAKE;
const S = HITS;
const linear = (t: number) => t;
const ACCEL = (t: number) => t * t;
const ARRIVE_DRIFTING = (t: number) => 0.75 * EASE_MODAL(t) + 0.25 * t;

const take = takeOf(T);
const span = (from: string, to: string | null) => (to ? take.marks[to] : take.count) - take.marks[from];
// (12pt steps; the rush stops short of the feed's first recipe card)
const FEED = Math.min(FEED_STEPS, span('feed', 'typing1'));
const TYPED1 = span('typing1', 'stream1');
const STREAMED1 = span('stream1', 'sources1');
const SOURCED1 = span('sources1', 'typing2');
const TYPED2 = span('typing2', 'stream2');
const STREAMED2 = span('stream2', 'sources2');
const SOURCED2 = span('sources2', 'graphChip');
const GRAPH = span('graph', null);
/**
 * The graph (round 6, owner: the cut into it was jittery). Measured on the
 * take: its layout moves hard for its first ~30 captured frames, then keeps
 * jiggling a pixel or two either way. So the cut joins it once it has formed
 * and calmed (GRAPH_JOIN; at 24 the blend still ghosted the labels), it plays slower than captured (GRAPH_RATE captured frames per
 * output frame), and each output frame blends the two captured frames around
 * its fractional position, so the nodes glide instead of stepping or
 * shivering. Adjacent frames of one screen, so the blend never double-exposes.
 */
const GRAPH_JOIN = 45;
const GRAPH_RATE = 0.75;
const graphPos = (f: number) => Math.min(GRAPH - 1, GRAPH_JOIN + (f - S.graphTap) * GRAPH_RATE);

/** where the feed's stepped scroll is (fractional steps) */
const feedAt = (f: number) => prog(f, S.feed, S.ask2, EASE_GATHER) * (FEED - 1);

/** output frame → the take's frame */
export const frameAt = (f: number) => {
  if (f < S.send) return at(T, 'typing1', Math.min(TYPED1 - 1, Math.max(0, Math.floor((f - S.open) / TYPE_STEP))));
  if (f < S.feed) {
    const n = Math.floor((f - S.send) / K);
    return n < STREAMED1 ? at(T, 'stream1', n) : at(T, 'sources1', Math.min(SOURCED1 - 1, n - STREAMED1));
  }
  if (f < S.ask2) return at(T, 'feed', Math.round(feedAt(f)));
  if (f < S.send2) return at(T, 'typing2', TYPED2 - 1);
  if (f < S.graphTap) {
    const n = Math.floor((f - S.send2) / K);
    return n < STREAMED2 ? at(T, 'stream2', n) : at(T, 'sources2', Math.min(SOURCED2 - 1, n - STREAMED2));
  }
  return at(T, 'graph', Math.floor(graphPos(f)));
};

/** a Lift's box on whole points (the Ask clip's lesson: a half-point box hops) */
const wholePoints = ([x, y, w, h]: Rect): Rect => {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  return [x0, y0, Math.ceil(x + w) - x0, Math.ceil(y + h) - y0];
};

const CHIPS = ['chip1', 'chip2', 'chip3'] as const;

export const chatKeys = (L: AdFrame): Key[] => {
  const y = (v: number) => v + L.dy;
  return [
    // the simple question, close on the composer (the promise stays above the frame)
    // (framed so the empty chat's "More ideas" sits under the paper band: round 6, owner)
    { f: S.open, cx: 196.5, cy: 768, z: 2.5, fx: 540, fy: y(940) },
    { f: S.send - 1, cy: 764, z: 2.56, ease: linear },
    // CUT on the Send touch: its answer and its source
    { f: S.send, cx: 196.5, cy: 300, z: 2.3, fy: y(990) },
    { f: S.source - 12, cy: 306, z: 2.38, ease: ARRIVE_DRIFTING },
    // down onto its source as the line names it (the chip clear of the bottom band)
    { f: S.source + 4, cy: 376, z: 2.4, ease: EASE_IN_OUT },
    { f: S.feed - 1, cy: 380, z: 2.42, ease: linear },
    // CUT to the feed rushing past, the camera pushing with it, at speed into the cut
    { f: S.feed, cx: 196.5, cy: 400, z: 2.0, fy: y(1000) },
    { f: S.ask2 - 1, cy: 410, z: 2.3, ease: EASE_GATHER },
    // CUT to a new chat: the big question, typed, Send in reach
    { f: S.ask2, cx: 196.5, cy: 768, z: 2.5, fy: y(900) }, // (a new chat's "More ideas" sits lower)
    { f: S.send2 - 1, cy: 766, z: 2.53, ease: linear },
    // CUT on the Send touch: the answer arrives (the empty chat between, and
    // its "29 saves" promise, never cross the frame)
    { f: S.send2, cx: 196.5, cy: 290, z: 2.3, fy: y(980) },
    { f: S.lead - 1, cy: 296, z: 2.34, ease: linear },
    // the theme lifts; then down onto the three saves it connected, at rest as they lift
    { f: S.chips[0] - 6, cx: 196.5, cy: 492, z: 2.4, fy: y(980), ease: EASE_IN_OUT },
    { f: S.chips[2] + 8, cy: 496, z: 2.42, ease: linear },
    // on down to its Graph chip and the questions the app suggests next, at
    // rest as the finger lands on Graph
    { f: S.graphTap - 1, cy: 600, z: 2.2, fy: y(980), ease: EASE_IN_OUT },
    // CUT on the touch into the graph: the three saves it connected, lit and
    // linked among the rest (framed below the graph's legend)
    // (it arrives a touch close and settles back, then drifts: no hard stop)
    { f: S.graphTap, cx: 196.5, cy: 612, z: 2.62, fy: y(1000) },
    { f: S.graphTap + 36, cy: 608, z: 2.5, ease: (t: number) => 0.85 * EASE_MODAL(t) + 0.15 * t },
    { f: S.lockup - 1, cy: 606, z: 2.54, ease: linear },
    // thrown out of frame, into the lockup
    { f: S.lockup + 14, fx: -760, z: 2.64, ease: EASE_IN_OUT },
  ];
};

/**
 * Into the graph (2026-10-04, owner: the cut from the chat was abrupt). No
 * cut: as the finger lands on the Graph chip, the chat pushes in on the chip
 * (it holds its place on screen and grows) and fades, while the graph grows
 * out of that same point (0.8 → 1, from the chip) and fades up, over INTO
 * frames. The graph's own camera settles under it as before.
 */
const INTO = 18;

const tapAt = (f: number, hit: number) => prog(f, hit - 10, hit + 18, linear);

export const AskChat: React.FC<{ f: number }> = ({ f }) => {
  const L = useAdFrame();
  if (f < S.open || f > S.lockup + 15) return null;
  const i = frameAt(f);
  const keys = chatKeys(L);
  const cam = camAt(keys, f);
  const camV = camVelocity(keys, f, 1);

  // the feed's stepped scroll: the camera takes up each step's rounding, and
  // motion blur follows what moves on screen (camera + scroll)
  let view = cam;
  let motion = camV;
  if (f >= S.feed && f < S.ask2) {
    const e = feedAt(f);
    view = { ...cam, cy: cam.cy - (Math.round(e) - e) * 12 };
    motion = { ...camV, y: camV.y - 12 * cam.z * (e - feedAt(f - 1)) };
  }

  const send1 = center(rectOf(T, at(T, 'typing1', TYPED1 - 1), 'send'));
  const send2 = center(rectOf(T, at(T, 'typing2', TYPED2 - 1), 'send'));
  const graph = center(rectOf(T, at(T, 'graphChip'), 'graph2'));

  // the first answer's source lifts on the line that names it ("which save(s)
  // it…"), and settles as the next question arrives
  const source = f >= S.send && f < S.feed ? prog(f, S.source - 2, S.source + 10, EASE_SPRING) * (1 - prog(f, S.feed - 12, S.feed - 2, EASE_IN_OUT)) : 0;

  // the theme (the answer's first line) lifts with the line that names it,
  // and settles as the camera moves on
  const theme =
    f >= S.sources2 ? prog(f, S.lead - 2, S.lead + 12, EASE_SPRING) * (1 - prog(f, S.chips[0] - 20, S.chips[0] - 4, EASE_IN_OUT)) : 0;

  // the move into the graph: the chat, held on its last frame, pushes in on
  // the Graph chip (which keeps its place on screen) as the graph grows out of it
  const into = f >= S.graphTap && f < S.graphTap + INTO;
  const e = EASE_IN_OUT(prog(f, S.graphTap, S.graphTap + INTO, linear));
  const base = camAt(keys, S.graphTap - 1);
  const p = { x: base.fx + (graph.x - base.cx) * base.z, y: base.fy + (graph.y - base.cy) * base.z };
  const push = { ...base, cx: graph.x, cy: graph.y, fx: p.x, fy: p.y, z: base.z * mix(1, 1.6, prog(f, S.graphTap, S.graphTap + INTO, ACCEL)) };
  const grow = into ? { opacity: e, transform: `scale(${mix(0.8, 1, e)})`, transformOrigin: `${p.x}px ${p.y}px` } : undefined;

  return (
    <AbsoluteFill>
      {into && (
        <AbsoluteFill style={{ opacity: 1 - e }}>
          <AppShot take={T} i={at(T, 'graphChip')} cam={push}>
            <Tap x={graph.x} y={graph.y} t={tapAt(f, S.graphTap)} />
          </AppShot>
        </AbsoluteFill>
      )}
      <AbsoluteFill style={grow}>
      <AppShot take={T} i={i} cam={view} motion={motion}>
        {/* Send: a light tap on the dark button; the cut lands on the touch */}
        <Tap x={send1.x} y={send1.y} tone="dark" t={tapAt(f, S.send)} />
        <Tap x={send2.x} y={send2.y} tone="dark" t={f >= S.ask2 ? tapAt(f, S.send2) : 0} />
        {source > 0.01 && (
          <Lift take={T} i={i} rect={wholePoints(rectOf(T, i, 'chip'))} radius={12} lift={source} rise={5} grow={0.04} ring={0.7 * source} />
        )}
        {theme > 0.01 && (
          <Lift take={T} i={i} rect={wholePoints(rectOf(T, i, 'lead'))} radius={10} lift={theme * 0.45} rise={2} grow={0.012} ring={0.5 * theme} />
        )}
        {f >= S.sources2 &&
          f < S.graphTap &&
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
                lift={up * mix(1, 0.28, down)}
                rise={5}
                grow={0.05}
                ring={0.7 * up * (1 - down)}
              />
            );
          })}
        {/* the finger leaves on the cut: its ripple would sit on the graph */}
        <Tap x={graph.x} y={graph.y} t={f < S.graphTap ? tapAt(f, S.graphTap) : 0} />
      </AppShot>
      {/* the graph's in-between: the next captured frame, laid over at the
          fraction the output frame sits past this one */}
      {f >= S.graphTap && graphPos(f) % 1 > 0.01 && Math.floor(graphPos(f)) < GRAPH - 1 && (
        <AppShot take={T} i={i + 1} cam={view} motion={motion} opacity={graphPos(f) % 1} shadow={0} />
      )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
