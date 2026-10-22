import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CAPTIONS, FPS, HITS, TYPE_FRAMES } from '../../../../clips/savethis-timeline.mjs';
import { AppShot, Lift, Tap } from '../../kit/AppShot';
import { camAt, camVelocity, type Cam, type Key } from '../../kit/camera';
import { EASE_GATHER, EASE_IN_OUT, EASE_MODAL, mix, prog } from '../../kit/curves';
import { addTakes, at, center, rectOf, takeOf } from '../../kit/takes';
import TAKES from './takes.json';
import VO from './savethis-vo.json';

/**
 * The app side of SAVE THIS: one continuous use of Home, the real app
 * (take `clips/savethis/app`, capture/shoot.mjs `savethisClip`).
 *
 *  open    the app irises open around the mark, which lands on the
 *          processing card's own mark: a share of this very reel arriving
 *  read    down to the pill, which narrates the real phases a beat apart,
 *          to "Saved to Machina"; up to the card: its cover is this reel's
 *          first frame, its summary what the reel says
 *  graph   (round 4) CUT to the app's graph, the saves mapped by topic, the
 *          new one already among them, its layout settling; the thumb taps
 *          its dot and its ties to two older saves light up on "what you've
 *          saved before", as the app's camera glides in on them
 *  skip    three weeks later: the card's date goes back, and the saves made
 *          since land on top of it, one an 8th
 *  search  Search your saves, tapped on "type"; "never watch it again"
 *          types, and the feed narrows to the one card left
 *  found   the card lifts on its beat; the tagline sits above it
 *  tap     the thumb taps its cover and the camera dives at it (Dive.tsx
 *          takes over once the cover fills the frame's width)
 *
 * App motion plays at its real speed (two 60fps captures an output frame)
 * except where it must read (the result, one a frame).
 */

addTakes(TAKES);

export const T = 'clips/savethis/app';
const S = HITS;
const linear = (t: number) => t;

/** the take's 8th-note runs, from its marks */
const BURY = takeOf(T).marks.buried - takeOf(T).marks.bury0; // 7 saves x 14
const CHARS = takeOf(T).marks.result - takeOf(T).marks.typing;
/** (round 4) the take opens the graph this many 60fps frames before the
 *  thumb taps the new save's dot; the reel joins it so the tap lands on its
 *  beat, the whole graph played at half speed (one 60fps capture an output
 *  frame): its layout settling, then the app's camera gliding in */
const GRAPH_TAP = takeOf(T).marks.graphTap - takeOf(T).marks.graph;
const GRAPH_JOIN = GRAPH_TAP - (S.connect - S.graph);

/** the saves since land one an 8th, the first just before "buried" */
export const BURY_FROM = S.bury - 7;
/** the eighth character ("never wa") is where the feed is down to one */
export const NARROWED = S.type + 7 * TYPE_FRAMES;
/** the typing's last character */
export const TYPED = S.type + (CHARS - 1) * TYPE_FRAMES;

/** the take's frame for an output frame */
export const frameAt = (f: number) => {
  // the card arrived and settled before the iris: open on it in place
  if (f < S.phase0) return at(T, 'phase0');
  // five phases, a beat each, at real speed
  if (f < S.done) return at(T, 'phase0', (f - S.phase0) * 2);
  // read, and "Saved to Machina", held to the cut
  if (f < S.graph) return at(T, 'done', Math.min(39, (f - S.done) * 2));
  // (round 4) CUT to the graph as its layout settles…
  if (f < S.connect) return at(T, 'graph', GRAPH_JOIN + (f - S.graph));
  // …the tap: its ties light and the app's camera glides in on them, until
  // three weeks later
  if (f < S.skip) return at(T, 'graphTap', Math.min(119, f - S.connect));
  // three weeks later: the date goes back (the take's skip, eased over)
  if (f < BURY_FROM) return at(T, 'skip', ((f - S.skip) * 14) / (BURY_FROM - S.skip));
  // the saves since, one an 8th (14 captured frames each, at real speed)
  if (f < S.fieldTap) return at(T, 'bury0', Math.min(BURY + 16, (f - BURY_FROM) * 2));
  // the field tapped: its focus at real speed
  if (f < S.type) return at(T, 'focus', (f - S.fieldTap) * 2);
  // typed a character every TYPE_FRAMES
  if (f <= TYPED) return at(T, 'typing', (f - S.type) / TYPE_FRAMES);
  // the result settling, slowed so it reads, then held
  return at(T, 'result', Math.min(59, f - TYPED - 1));
};

/** where things sit on the captured screen (points) */
const MARK = rectOf(T, at(T, 'phase0'), 'mark');
const PILL = rectOf(T, at(T, 'phase0'), 'pill');
const FIELD = rectOf(T, at(T, 'home'), 'search');
export const CARD = rectOf(T, at(T, 'result', 59), 'card');
export const COVER = rectOf(T, at(T, 'result', 59), 'cover');
/** (round 3) the parts of the read the narrator names: its summary, its topic */
const union = (a: number[], b: number[]): [number, number, number, number] => {
  const x = Math.min(a[0], b[0]);
  const y = Math.min(a[1], b[1]);
  return [x, y, Math.max(a[0] + a[2], b[0] + b[2]) - x, Math.max(a[1] + a[3], b[1] + b[3]) - y];
};
const pad = (r: number[], p: number): [number, number, number, number] => [r[0] - p, r[1] - p, r[2] + 2 * p, r[3] + 2 * p];
const SUMMARY = pad(union(rectOf(T, at(T, 'done', 39), 'summary1'), rectOf(T, at(T, 'done', 39), 'summary2')), 6);
const TOPIC = pad(rectOf(T, at(T, 'done', 39), 'category'), 2);
/** the frames the narrator says "sums it up" and "files it by topic" */
const LIST = CAPTIONS.find((c) => c.text.startsWith('understands'))!;
const LIST_T = VO.find((v) => v.frame === LIST.at);
const wordAt = (k: number) => LIST.at + Math.round((LIST_T?.words[k] ?? 0) * FPS);
export const SUMS_AT = wordAt(2); // "sums"
export const FILES_AT = wordAt(5); // "files"

/**
 * (round 4) The graph's camera. The app draws its graph to one canvas, so the
 * capture measures its dots off the app's own model, every frame: the new
 * save (node0), the two saves it connects to (node1, node2) and the island
 * they belong to. Before the tap the reel holds the island still as the
 * layout settles; after it, the three and their titles, as the app's own
 * camera glides in on them (its push is the move; the reel only keeps them
 * framed).
 */
/** half the width of each lit dot's title, in points (11px type the app
 *  sets in screen space, so a constant at any zoom; measured on the take) */
const TITLE_HALF = [80.5, 109.5, 58];
/** the three and their titles hanging under them, as a box in points */
const tiesAt = (i: number) => {
  const c = ['node0', 'node1', 'node2'].map((k) => center(rectOf(T, i, k)));
  const x0 = Math.min(...c.map((p, k) => p.x - TITLE_HALF[k]));
  const x1 = Math.max(...c.map((p, k) => p.x + TITLE_HALF[k]));
  const y0 = Math.min(...c.map((p) => p.y)) - 6;
  const y1 = Math.max(...c.map((p) => p.y)) + 26;
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, w: x1 - x0, x0, x1 };
};
/** low enough that the tab bar stays under the frame's edge and the focus
 *  panel the app slides up stays below it; the titles clear of the sides
 *  (and of the feed's buttons down the right) */
const GRAPH = { zIsland: [3.8, 4.0], fyIsland: 1110, fyTies: 1130, margin: 60 };
export const graphCam = (f: number): Cam => {
  const i = frameAt(f);
  const isl = center(rectOf(T, i, 'island'));
  const ties = tiesAt(i);
  const w = prog(f, S.connect, S.connect + 22, EASE_IN_OUT);
  // a breath wider on the cut (the settling layout's last titles), then in
  const zIsland = mix(GRAPH.zIsland[0], GRAPH.zIsland[1], prog(f, S.graph, S.connect, EASE_IN_OUT));
  // as wide as the titles need, never closer than the island's framing
  const zTies = Math.min(zIsland, (1080 - 2 * GRAPH.margin) / ties.w);
  const z = mix(zIsland, zTies, w) * (1 + 0.04 * prog(f, S.graph, S.skip, linear));
  // the titles are up from the frame after the tap: none of them leaves the
  // frame while the camera travels to them
  let cx = mix(isl.x - 4, ties.x, w);
  if (f > S.connect) {
    const half = (540 - 30) / z;
    cx = Math.min(Math.max(cx, ties.x1 - half), ties.x0 + half);
  }
  return {
    cx,
    cy: mix(isl.y, ties.y, w),
    z,
    fx: 540,
    fy: mix(GRAPH.fyIsland, GRAPH.fyTies, w),
    rx: 0,
    ry: 0,
    rz: 0,
  };
};
/** where the thumb comes down: the new save's dot (its ring rides the dot
 *  as the app glides it up, clear of the panel sliding in below) */
const dotAt = (i: number) => center(rectOf(T, i, 'node0'));

/** the camera when the app opens: the processing card, its mark in frame */
const OPEN_CAM: Cam = { cx: 196.5, cy: 330, z: 2.3, fx: 540, fy: 1150, rx: 0, ry: 0, rz: 0 };
/** where the card's mark is in frame on the iris (Opening.tsx lands on it) */
export const MARK_TO = {
  x: OPEN_CAM.fx + (center(MARK).x - OPEN_CAM.cx) * OPEN_CAM.z,
  y: OPEN_CAM.fy + (center(MARK).y - OPEN_CAM.cy) * OPEN_CAM.z,
  size: MARK[2] * OPEN_CAM.z,
};

/** the dive's end: the cover centred and exactly the frame's width, where
 *  its pixels ARE the poster's rows (see Dive.tsx) */
export const DIVE_CAM = { cx: center(COVER).x, cy: center(COVER).y, z: 1080 / COVER[2], fx: 540, fy: 960 };
/** the frame the camera reaches it: the hand-over to the poster */
export const HANDOVER = S.cardTap + 14;

export const appKeys: Key[] = [
  { f: S.iris, ...OPEN_CAM },
  // held while the mark lands on the card's own mark…
  { f: S.iris + 14, ...OPEN_CAM, z: OPEN_CAM.z * 1.02, ease: linear },
  // …then down to the pill, as the narrator starts on the reading
  { f: S.phase0 + 16, cx: 196.5, cy: center(PILL).y, z: 2.85, fx: 540, fy: 1190, ease: EASE_IN_OUT },
  { f: S.done - 4, z: 3.0, ease: linear },
  // "Saved to Machina", and up to the card as it is understood: its summary
  // and its topic are named and lifted (round 3)
  { f: S.done + 16, cx: 196.5, cy: 352, z: 2.4, fx: 540, fy: 1190, ease: EASE_IN_OUT },
  // a slow push on the topic, into the cut
  { f: S.graph - 1, z: 2.5, ease: linear },
  // (round 4) S.graph to S.skip: the graph, on its own camera (graphCam)
  { f: S.skip - 1, cx: 196.5, cy: 330, z: 2.3, fx: 540, fy: 1180, ease: linear },
  // CUT, three weeks later: the card back in the feed, then back to the
  // whole feed, so the saves since are seen landing on it and pushing it under
  { f: S.skip, cx: 196.5, cy: 330, z: 2.3, fx: 540, fy: 1180, ease: linear },
  { f: S.skip + 18, cx: 196.5, cy: 430, z: 1.32, fx: 540, fy: 1210, ease: EASE_IN_OUT },
  { f: S.fieldTap - 1, z: 1.26, ease: linear },
  // the field, big, as it is tapped; the feed narrowing below it
  { f: S.fieldTap + 10, cx: 196.5, cy: FIELD[1] + FIELD[3] / 2, z: 2.7, fx: 540, fy: 800, ease: EASE_MODAL },
  { f: TYPED, z: 2.74, ease: linear },
  // the one card left, whole
  { f: TYPED + 14, cx: 196.5, cy: CARD[1] + CARD[3] / 2 - 20, z: 2.15, fx: 540, fy: 1180, ease: EASE_IN_OUT },
  { f: S.cardTap - 8, z: 2.22, ease: linear },
  // a breath back as the thumb comes down on the cover…
  { f: S.cardTap, z: 2.12, ease: EASE_IN_OUT },
  // …and the dive: the cover centred, exactly the frame's width (the hand-over)
  { f: HANDOVER, ...DIVE_CAM, ease: EASE_GATHER },
  // the app rushes on past the frame as the cover opens over it
  { f: S.poster, ...DIVE_CAM, z: DIVE_CAM.z * 1.9, ease: EASE_MODAL },
];

/** the reel's emphasis on the next beat after an arrival, eased away */
const lift = (f: number, landed: number, len = 64) =>
  prog(f, landed, landed + 12, EASE_MODAL) * (1 - prog(f, landed + len - 24, landed + len, EASE_IN_OUT));

export const App: React.FC<{ f: number }> = ({ f }) => {
  if (f < S.iris - 1 || f >= S.poster) return null;
  const i = frameAt(f);
  // the graph's camera rides the app's, so what it shows stays put: no
  // smear from its own travel
  const inGraph = f >= S.graph && f < S.skip;
  const cam = inGraph ? graphCam(f) : camAt(appKeys, f);
  const v = inGraph ? { x: 0, y: 0 } : camVelocity(appKeys, f, 1);
  // the iris: a circle from the card's mark, open by the time it lands
  const r = prog(f, S.iris - 1, S.iris + 18, EASE_IN_OUT);
  const iris = r < 0.999 ? { x: center(MARK).x, y: center(MARK).y, r: 6 + r * 790 } : null;
  const up = f >= S.found ? lift(f, S.found, S.cardTap - S.found) : 0;
  // the read's parts, each on the word that names it: the summary hands over
  // to the topic, which stays up into the cut to the topics' map
  const upSum = f >= SUMS_AT - 2 && f < S.graph ? lift(f, SUMS_AT - 2, S.graph - SUMS_AT + 2) : 0;
  const upTopic = f >= FILES_AT - 2 && f < S.graph ? prog(f, FILES_AT - 2, FILES_AT + 10, EASE_MODAL) : 0;
  const tapCover = { x: center(COVER).x, y: center(COVER).y };
  return (
    <AbsoluteFill>
      <AppShot take={T} i={i} cam={cam} motion={{ x: v.x, y: v.y }} iris={iris} shadow={r}>
        {/* (round 3) "sums it up": its summary; "files it by topic": its topic */}
        {f >= SUMS_AT - 4 && f < S.graph && (
          <Lift take={T} i={i} rect={SUMMARY} radius={10} lift={Math.max(upSum, 0.002)} rise={1.5} grow={0.012} ring={0.6 * upSum} />
        )}
        {f >= FILES_AT - 4 && f < S.graph && (
          <Lift take={T} i={i} rect={TOPIC} radius={8} lift={Math.max(upTopic, 0.002)} rise={1.5} grow={0.05} ring={0.7 * upTopic} />
        )}
        {/* (round 4) the thumb on the new save's dot */}
        {f >= S.connect - 9 && f < S.connect + 12 && (
          <Tap x={dotAt(i).x} y={dotAt(i).y} t={prog(f, S.connect - 9, S.connect + 12, linear)} />
        )}
        {/* the field, tapped on "type" (the pad lands on the frame the app focuses) */}
        <Tap x={center(FIELD).x - 60} y={center(FIELD).y} t={prog(f, S.fieldTap - 10, S.fieldTap + 18, linear)} />
        {/* the one card, lifted on its beat (kept mounted at rest: its own raster) */}
        {f >= S.found - 2 && (
          <Lift take={T} i={i} rect={CARD} radius={20} lift={Math.max(up, 0.002)} rise={2} grow={0.014} ring={0.7 * up} />
        )}
        {/* the cover, tapped */}
        <Tap x={tapCover.x} y={tapCover.y} t={prog(f, S.cardTap - 10, S.cardTap + 18, linear)} size={40} />
      </AppShot>
    </AbsoluteFill>
  );
};
