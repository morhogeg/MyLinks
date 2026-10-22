import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CAPTIONS, FPS, HITS, TYPE_FRAMES } from '../../../../clips/savethis-timeline.mjs';
import { AppShot, Lift, Tap } from '../../kit/AppShot';
import { camAt, camVelocity, type Cam, type Key } from '../../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, mix, prog } from '../../kit/curves';
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
 *  knows   (round 10) "Now it knows your saves better than you do": CUT
 *          to Ask opening, its own words ("What do you want to recall?
 *          Answers come only from your 23 saves, with sources you can
 *          open.") over the questions it suggests about the saves
 *  ask     (round 9) "So ask it anything": CUT to Ask's composer, a real
 *          question bursting in; "and get the answer":
 *          sent, the answer streams from the saves; "with the proof": the
 *          three it came from land under it, cited, lifting one by one; the
 *          tagline sits above them
 *  tap     the thumb opens this reel's citation: its card, its cover the
 *          poster whole, and the camera dives into it until it IS the frame
 *          (Dive.tsx hands over to the poster itself)
 *
 * App motion plays at its real speed (two 60fps captures an output frame)
 * except where it must read (the result, one a frame).
 */

addTakes(TAKES);

export const T = 'clips/savethis/app';
const S = HITS;
const linear = (t: number) => t;

/** the take's runs, from its marks: (round 6) the Ask screen's opening,
 *  the question's characters, the answer's streamed chunks (60fps
 *  captures, one a chunk) */
const ASK_OPEN = takeOf(T).marks.asking - takeOf(T).marks.ask;
/** the cut lands on the Ask screen most of the way faded in, not on the
 *  blank frame its opening starts from */
const ASK_JOIN = 8;
const CHARS = takeOf(T).marks.answer - takeOf(T).marks.asking;
const STREAM = takeOf(T).marks.sources - takeOf(T).marks.answer;
/** (round 4) the take opens the graph this many 60fps frames before the
 *  thumb taps the new save's dot; the reel joins it so the tap lands on its
 *  beat, the whole graph played at half speed (one 60fps capture an output
 *  frame): its layout settling, then the app's camera gliding in */
const GRAPH_TAP = takeOf(T).marks.graphTap - takeOf(T).marks.graph;
const GRAPH_JOIN = GRAPH_TAP - (S.connect - S.graph);

/** the question's last character */
export const ASKED = S.asking + (CHARS - 1) * TYPE_FRAMES;

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
  // …the tap: its ties light and the app's camera glides in on them
  if (f < S.knows) return at(T, 'graphTap', Math.min(119, f - S.connect));
  // (round 10) CUT to Ask, its screen opening at real speed, then held…
  if (f < S.askTap) return at(T, 'ask', Math.min(ASK_OPEN - 1, ASK_JOIN + (f - S.knows) * 2));
  // (round 9) …CUT to its composer; on "ask" the question bursts in, a
  // character every TYPE_FRAMES…
  if (f < S.send) return at(T, 'asking', Math.min(CHARS - 1, Math.max(0, f - S.asking) / TYPE_FRAMES));
  // …sent: the answer streams, a chunk a frame…
  if (f < S.proof) return at(T, 'answer', Math.min(STREAM - 1, f - S.send));
  // …and the saves it came from, cited: held to the tap
  if (f < S.citeTap) return at(T, 'sources', Math.min(47, f - S.proof));
  // this reel's citation opens its card, at real speed
  return at(T, 'open', Math.min(59, (f - S.citeTap) * 2));
};

/** where things sit on the captured screen (points) */
const MARK = rectOf(T, at(T, 'phase0'), 'mark');
const PILL = rectOf(T, at(T, 'phase0'), 'pill');
/** (round 6) Ask: the composer as the question is typed, the answer and
 *  the three citations once they are all there */
const COMPOSER = rectOf(T, at(T, 'asking', CHARS - 1), 'composer');
const SEND = rectOf(T, at(T, 'asking', CHARS - 1), 'send');
const CITES = [1, 2, 3].map((k) => rectOf(T, at(T, 'sources', 47), `cite${k}`));
const ANSWER = rectOf(T, at(T, 'sources', 47), 'answer');
const BUBBLE = rectOf(T, at(T, 'sources', 47), 'bubble');
/** the proof's framing: the answer and its three citations, the answer's
 *  first line just under PROOF_LINE (where the paper over the question
 *  bubble clears), and the bubble's last pixel above it */
export const PROOF_LINE = 680;
const PROOF = (() => {
  const z = 2.4;
  const cy = (ANSWER[1] + CITES[2][1] + CITES[2][3]) / 2;
  return { z, cy, fy: PROOF_LINE + 10 + (cy - ANSWER[1]) * z };
})();
/** (round 11) the three citations as one column (left-aligned on the
 *  screen, so centred on themselves, not on it) */
const CITED = (() => {
  const x0 = Math.min(...CITES.map((r) => r[0]));
  const x1 = Math.max(...CITES.map((r) => r[0] + r[2]));
  return { cx: (x0 + x1) / 2, cy: (CITES[0][1] + CITES[2][1] + CITES[2][3]) / 2 };
})();
/** the opened card's cover: the poster, whole (object-contain, measured) */
export const COVER = rectOf(T, at(T, 'open', 59), 'poster');
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
/** (round 10) the first question Ask suggests is about this very reel
 *  ("What's the gist of "You're going to save this video"?"): it lifts on
 *  "saves" (its box measured on the take's held frame, 4px a point) */
const SUGGESTION: [number, number, number, number] = [29, 374, 335, 56];
const BRIDGE = CAPTIONS.find((c) => c.text.startsWith('Now it knows'))!;
const BRIDGE_T = VO.find((v) => v.frame === BRIDGE.at);
const SAVES_AT = BRIDGE.at + Math.round((BRIDGE_T?.words[4] ?? 0) * FPS); // "saves"

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
  const z = mix(zIsland, zTies, w) * (1 + 0.04 * prog(f, S.graph, S.knows, linear));
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

/**
 * (round 6) The Ask beat's framings, in screen points. The question bubble
 * sits clear under the band while the answer streams below it; on the proof
 * the camera goes down onto the answer and its citations, and the paper
 * (SaveThis.tsx PROOF_SCRIM) rises over the bubble.
 */
const ASK_CAM: Record<'screen' | 'typing' | 'answer' | 'proof' | 'cited' | 'card', Cam> = {
  // (round 10) Ask opening: its mark, "What do you want to recall?", its
  // promise and the questions it suggests about the saves (y 210 to 570 on
  // the take), clear under the band; at least the frame's width (393pt at
  // 2.75), so the screen's edges never show
  screen: { cx: 196.5, cy: 395, z: 2.8, fx: 540, fy: 1090, rx: 0, ry: 0, rz: 0 },
  // the composer the width of the frame: the question, big, on clean paper
  typing: { cx: 196.5, cy: center(COMPOSER).y, z: 3.0, fx: 540, fy: 1150, rx: 0, ry: 0, rz: 0 },
  answer: { cx: 196.5, cy: BUBBLE[1] + 140, z: 2.5, fx: 540, fy: 720 + 140 * 2.5, rx: 0, ry: 0, rz: 0 },
  proof: { cx: 196.5, cy: PROOF.cy, z: PROOF.z, fx: 540, fy: PROOF.fy, rx: 0, ry: 0, rz: 0 },
  // (round 11) the three up close, the frame's middle: the answer and its
  // Copy/Save/Share row (to y 355 on the take) all under the paper
  cited: { cx: CITED.cx, cy: CITED.cy, z: 3.0, fx: 540, fy: 985, rx: 0, ry: 0, rz: 0 },
  card: { cx: center(COVER).x, cy: center(COVER).y + 40, z: 2.75, fx: 540, fy: 1060, rx: 0, ry: 0, rz: 0 },
};

/** the camera when the app opens: the processing card, its mark in frame */
const OPEN_CAM: Cam = { cx: 196.5, cy: 330, z: 2.3, fx: 540, fy: 1150, rx: 0, ry: 0, rz: 0 };
/** where the card's mark is in frame on the iris (Opening.tsx lands on it) */
export const MARK_TO = {
  x: OPEN_CAM.fx + (center(MARK).x - OPEN_CAM.cx) * OPEN_CAM.z,
  y: OPEN_CAM.fy + (center(MARK).y - OPEN_CAM.cy) * OPEN_CAM.z,
  size: MARK[2] * OPEN_CAM.z,
};

/** the dive's end: the cover centred and exactly the frame's width; the
 *  cover is the poster whole (9:16), so it is then exactly the frame, and
 *  its pixels ARE frame 0 (see Dive.tsx) */
export const DIVE_CAM = { cx: center(COVER).x, cy: center(COVER).y, z: 1080 / COVER[2], fx: 540, fy: 960 };
/** the dive lands on the poster: the hand-over IS the poster frame */
export const HANDOVER = S.poster;

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
  // (round 4) S.graph to S.knows: the graph, on its own camera (graphCam)
  { f: S.knows - 1, ...ASK_CAM.screen },
  // (round 10) CUT to Ask opening on "Now it knows your saves", a slow push…
  { f: S.knows, ...ASK_CAM.screen },
  { f: S.askTap - 1, z: ASK_CAM.screen.z * 1.04, ease: linear },
  // (round 9) …CUT to its composer on "So ask it anything": the question
  // bursts in
  { f: S.askTap, ...ASK_CAM.typing },
  { f: S.send - 1, z: ASK_CAM.typing.z * 1.03, ease: linear },
  // CUT on the send: the question up top, the answer streaming under it
  { f: S.send, ...ASK_CAM.answer },
  { f: S.proof - 1, z: ASK_CAM.answer.z * 1.02, ease: linear },
  // the proof: down onto the three citations as they land
  { f: S.proof + 14, ...ASK_CAM.proof, ease: EASE_IN_OUT },
  // (owner, round 11: under the tagline the chat sat still, "stuck") a slow
  // glide in on the three, this reel's last, into the thumb opening it
  { f: S.citeTap - 2, ...ASK_CAM.cited, ease: EASE_IN_OUT },
  { f: S.citeTap, z: ASK_CAM.cited.z * 1.004, ease: linear },
  // the thumb opens this reel's citation; its card rises, and the dive
  // into its cover lands on the poster
  { f: S.citeTap + 6, ...ASK_CAM.card, ease: EASE_MODAL },
  { f: HANDOVER, ...DIVE_CAM, ease: EASE_IN_OUT },
];

/** the reel's emphasis on the next beat after an arrival, eased away */
const lift = (f: number, landed: number, len = 64) =>
  prog(f, landed, landed + 12, EASE_MODAL) * (1 - prog(f, landed + len - 24, landed + len, EASE_IN_OUT));

export const App: React.FC<{ f: number }> = ({ f }) => {
  if (f < S.iris - 1 || f >= S.poster) return null;
  const i = frameAt(f);
  // the graph's camera rides the app's, so what it shows stays put: no
  // smear from its own travel
  const inGraph = f >= S.graph && f < S.knows;
  const cam = inGraph ? graphCam(f) : camAt(appKeys, f);
  const v = inGraph ? { x: 0, y: 0 } : camVelocity(appKeys, f, 1);
  // the iris: a circle from the card's mark, open by the time it lands
  const r = prog(f, S.iris - 1, S.iris + 18, EASE_IN_OUT);
  const iris = r < 0.999 ? { x: center(MARK).x, y: center(MARK).y, r: 6 + r * 790 } : null;
  // (round 6) the proof: each citation lifts as it lands, one by one, and
  // lets go before the thumb opens this reel's
  const upCite = (k: number) => (f >= S.proof ? lift(f, S.proof + 2 + 4 * k, S.citeTap - 8 - (S.proof + 2 + 4 * k)) : 0);
  // the read's parts, each on the word that names it: the summary hands over
  // to the topic, which stays up into the cut to the topics' map
  const upSum = f >= SUMS_AT - 2 && f < S.graph ? lift(f, SUMS_AT - 2, S.graph - SUMS_AT + 2) : 0;
  const upTopic = f >= FILES_AT - 2 && f < S.graph ? prog(f, FILES_AT - 2, FILES_AT + 10, EASE_MODAL) : 0;
  // (round 10) the suggestion about this reel, up on "saves" into the cut
  const upAsk = f >= SAVES_AT - 2 && f < S.askTap ? prog(f, SAVES_AT - 2, SAVES_AT + 10, EASE_MODAL) : 0;
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
        {/* (round 10) "your saves": the suggestion about this very reel */}
        {f >= SAVES_AT - 4 && f < S.askTap && (
          <Lift take={T} i={i} rect={SUGGESTION} radius={14} lift={Math.max(upAsk, 0.002)} rise={1.5} grow={0.02} ring={0.6 * upAsk} />
        )}
        {/* (round 4) the thumb on the new save's dot */}
        {f >= S.connect - 9 && f < S.connect + 12 && (
          <Tap x={dotAt(i).x} y={dotAt(i).y} t={prog(f, S.connect - 9, S.connect + 12, linear)} />
        )}
        {/* (round 6) the question, sent */}
        {f >= S.send - 9 && f < S.send + 6 && <Tap x={center(SEND).x} y={center(SEND).y} t={prog(f, S.send - 9, S.send + 6, linear)} />}
        {/* the proof: the citations, lifted one by one (kept mounted: their own raster) */}
        {f >= S.proof && f < S.citeTap &&
          CITES.map((r, k) => (
            <Lift key={k} take={T} i={i} rect={r} radius={12} lift={Math.max(upCite(k), 0.002)} rise={1.5} grow={0.02} ring={0.6 * upCite(k)} />
          ))}
        {/* this reel's citation, opened */}
        {f >= S.citeTap - 9 && f < S.citeTap + 4 && (
          <Tap x={center(CITES[2]).x} y={center(CITES[2]).y} t={prog(f, S.citeTap - 9, S.citeTap + 4, linear)} />
        )}
      </AppShot>
    </AbsoluteFill>
  );
};
