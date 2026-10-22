import React from 'react';
import { AbsoluteFill, Easing, Img } from 'remotion';
import { CAPTIONS, CITE_PINGS, FPS, HITS } from '../../../../clips/savethis-timeline.mjs';
import { AppShot, Lift, Ping, Tap } from '../../kit/AppShot';
import { camAt, camVelocity, type Cam, type Key } from '../../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, prog } from '../../kit/curves';
import { SCREEN, addTakes, at, center, frameSrc, rectOf, takeOf } from '../../kit/takes';
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
 *  graph   (round 4) CUT to the app's graph: (owner, round 14: the cut from
 *          the whole map to the three was too much) the new save's dot,
 *          tapped (the take taps it), its ties to two older saves lit and
 *          titled, the rest receded, as the app's camera glides in on them
 *  knows   (rounds 10–12) "Now every save is one question away": CUT
 *          to Ask opening, its own words ("What do you want to recall?
 *          Answers come only from your 23 saves, with sources you can
 *          open.") over the questions it suggests about the saves: (owner,
 *          rounds 14 and 15) the screen settled, its whole mark (not the
 *          brackets alone) and its own header, held still under a slow push
 *  ask     (round 9) "So, ask it anything": (owner, round 14: no cut to the
 *          composer and back) one shot: on "ask" the question is sent and
 *          the chat takes the opening's place, a real question (round 12:
 *          about the three saves the graph just tied together); "and get
 *          the answer": the answer streams from them; "with the proof": the
 *          three land under it, cited, and (round 13) each is pinged in
 *          turn: it pops forward under a sonar ring, on a ping in the score
 *  out     (round 12) on the sign-off the app dissolves into the paper and
 *          the brand card takes the frame (EndCard.tsx)
 *
 * App motion plays at its real speed (two 60fps captures an output frame)
 * except where it must read (the result, one a frame).
 */

addTakes(TAKES);

export const T = 'clips/savethis/app';
const S = HITS;
const linear = (t: number) => t;

/** the take's runs, from its marks: (round 6) the Ask screen's opening and
 *  the question typed under it, the answer's streamed chunks (60fps
 *  captures, one a chunk). (owner, round 15: Ask opening's logo and header
 *  "jittery and clunky") The opening's first frames cross-fade Home's
 *  header into Ask's and launch the mark mid-way, and while the question is
 *  typed the empty screen steps 12pt down and back with the composer: the
 *  reel holds the last of them, the screen settled, its mark whole */
const ASK_OPEN = takeOf(T).marks.answer - takeOf(T).marks.ask;
const ASK_HELD = at(T, 'ask', ASK_OPEN - 1);
const STREAM = takeOf(T).marks.sources - takeOf(T).marks.answer;
/** (owner, round 17: the hard cut did not show how you get to the graph)
 *  the card's own way in: the take presses its ⋯ and its actions sheet
 *  rises, held to "See in graph"; the app's graph then opens focused on it,
 *  its ties lit, and the reel joins that opening once the three are drawn */
const SHEET_RUN = takeOf(T).marks.graphPick - takeOf(T).marks.moreTap;
const SHEET_HELD = at(T, 'moreTap', SHEET_RUN - 1);
const GRAPH_RUN = takeOf(T).marks.scroll - takeOf(T).marks.graph;
const GRAPH_JOIN = 6;
/** the card as it was before its sheet rose (it lifts off the feed), its ⋯,
 *  and the sheet's "See in graph" */
const CARD_AT = at(T, 'moreTap') - 1;
const CARD = rectOf(T, CARD_AT, 'card');
const MORE = rectOf(T, CARD_AT, 'more');
const SEE = rectOf(T, at(T, 'graphPick') - 1, 'seeInGraph');
/** the thumb on its label, not the row's middle */
const SEE_AT = { x: SEE[0] + 75, y: SEE[1] + SEE[3] / 2 };
/** frames the card takes to shrink into its dot */
const MORPH = 16;
/** the dot's own orange (the app's Productivity), sampled off the take */
const DOT = 'rgb(249,115,22)';
/** the card's dive: a beat to lift off, quick, then a long soft landing (the
 *  scale is logarithmic, so the tail is the dot settling onto its own) */
const DIVE = Easing.bezier(0.45, 0, 0.2, 1);

/** the take's frame for an output frame */
export const frameAt = (f: number) => {
  // the card arrived and settled before the iris: open on it in place
  if (f < S.phase0) return at(T, 'phase0');
  // five phases, a beat each, at real speed
  if (f < S.done) return at(T, 'phase0', (f - S.phase0) * 2);
  // read, and "Saved to Machina", held…
  if (f < S.moreTap) return at(T, 'done', Math.min(39, (f - S.done) * 2));
  // (round 17) …the thumb on its ⋯: its actions sheet rises at real speed,
  // held to "See in graph"…
  if (f < S.graph) return at(T, 'moreTap', Math.min(SHEET_RUN - 1, (f - S.moreTap) * 2));
  // …and the app's graph opens on it, its ties lit, at half speed (one
  // 60fps capture an output frame), as the card shrinks into its dot
  if (f < S.knows) return at(T, 'graph', Math.min(GRAPH_RUN - 1, GRAPH_JOIN + (f - S.graph)));
  // (round 10) CUT to Ask opening, settled (round 15), held…
  if (f < S.asked) return ASK_HELD;
  // …(round 14) sent on "ask", the answer streaming, a chunk every 2 frames…
  if (f < S.proof) return at(T, 'answer', Math.min(STREAM - 1, Math.floor((f - S.asked) / 2)));
  // …and the saves it came from, cited: held into the sign-off
  return at(T, 'sources', Math.min(47, f - S.proof));
};

/** where things sit on the captured screen (points) */
const MARK = rectOf(T, at(T, 'phase0'), 'mark');
const PILL = rectOf(T, at(T, 'phase0'), 'pill');
/** (round 6) Ask: the answer and the three citations once they are all there */
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
 * save (node0) and the two saves it connects to (node1, node2). (round 14)
 * Only the three and their titles, from just after the tap, as the app's
 * own camera glides in on them (its push is the move; the reel only keeps
 * them framed).
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
 *  (and of the feed's buttons down the right); never closer than 4x */
const GRAPH = { z: 4.0, fy: 1130, margin: 60 };
export const graphCam = (f: number): Cam => {
  const ties = tiesAt(frameAt(f));
  // as wide as the titles need, a slow push over the shot (to 30px of the
  // frame's sides at most)
  const z = Math.min(GRAPH.z, (1080 - 2 * GRAPH.margin) / ties.w) * (1 + 0.06 * prog(f, S.graph, S.knows, linear));
  // none of the titles leaves the frame
  const half = (540 - 30) / z;
  const cx = Math.min(Math.max(ties.x, ties.x1 - half), ties.x0 + half);
  return { cx, cy: ties.y, z, fx: 540, fy: GRAPH.fy, rx: 0, ry: 0, rz: 0 };
};

/**
 * (round 6) The Ask beat's framings, in screen points. (owner, round 14: no
 * cut to the composer and back) One framing for Ask opening and its chat:
 * the opening's mark, "What do you want to recall?" and its suggestions
 * mid-frame, and, once the question is sent, the question's bubble in the
 * same place, clear under the band, the answer streaming below it. On the
 * proof the camera goes down onto the answer and its citations, and the
 * paper (SaveThis.tsx PROOF_SCRIM) rises over the bubble.
 */
const ASK_CAM: Record<'chat' | 'proof', Cam> = {
  chat: { cx: 196.5, cy: BUBBLE[1] + 140, z: 2.5, fx: 540, fy: 720 + 140 * 2.5, rx: 0, ry: 0, rz: 0 },
  proof: { cx: 196.5, cy: PROOF.cy, z: PROOF.z, fx: 540, fy: PROOF.fy, rx: 0, ry: 0, rz: 0 },
};


/** the camera when the app opens: the processing card, its mark in frame */
const OPEN_CAM: Cam = { cx: 196.5, cy: 330, z: 2.3, fx: 540, fy: 1150, rx: 0, ry: 0, rz: 0 };

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
  { f: S.knows - 1, ...ASK_CAM.chat, z: ASK_CAM.chat.z * 0.98 },
  // (rounds 10–15) CUT to Ask opening on "Now every save", one slow push
  // (the status bar stays under the band; most of it over the opening,
  // where the screen is still) through the question sent on "ask" and the
  // answer streaming in…
  { f: S.knows, ...ASK_CAM.chat, z: ASK_CAM.chat.z * 0.98 },
  { f: S.asked, z: ASK_CAM.chat.z * 1.035, ease: linear },
  { f: S.proof - 1, z: ASK_CAM.chat.z * 1.05, ease: linear },
  // the proof: down onto the three citations as they land
  { f: S.proof + 14, ...ASK_CAM.proof, ease: EASE_IN_OUT },
  // held, a slow push, into the sign-off (round 12: the app gives way to
  // the brand card there)
  { f: S.tagline + 4, z: ASK_CAM.proof.z * 1.02, ease: linear },
];

/**
 * (owner, round 17: "keep a version without the fade, it looks more like
 * the real app") MachinaSaveThisNoFade has no paper over the screens' edges.
 * Wherever a screen's top is in frame it hangs just under the band (TOP, px;
 * under the proof's three lines, a little lower), its status bar in view:
 * the same story on framings pinned to that edge, wider where the faded cut
 * goes in close (the card, the graph, the proof: the screen whole across the
 * frame, as on a phone). The pill alone is still framed close, the screen's
 * top far above the frame: there the captions take a paper plate
 * (SaveThis.tsx, on screenTopAt).
 */
const TOP = { band: 500, proof: 560 };
/** a framing that puts screen point `cy` where its top edge at `top` puts it */
const pin = (cy: number, z: number, top: number) => ({ cx: 196.5, cy, z, fx: 540, fy: top + cy * z });
const FLAT_Z = { feed: 2.15, graph: 2.2, proof: 1.85 };
const OPEN_FLAT: Cam = { ...pin(OPEN_CAM.cy, OPEN_CAM.z, TOP.band), rx: 0, ry: 0, rz: 0 };
const flatKeys: Key[] = [
  { f: S.iris, ...OPEN_FLAT },
  { f: S.iris + 14, ...pin(OPEN_CAM.cy, OPEN_CAM.z * 1.02, TOP.band), ease: linear },
  // down to the pill, as close as faded
  { f: S.phase0 + 16, cx: 196.5, cy: center(PILL).y, z: 2.85, fx: 540, fy: 1190, ease: EASE_IN_OUT },
  { f: S.done - 4, z: 3.0, ease: linear },
  // up to the card, the screen whole across the frame, a slow push into the
  // graph, which opens in the same screen (flatGraphCam)
  { f: S.done + 16, ...pin(352, FLAT_Z.feed, TOP.band), ease: EASE_IN_OUT },
  { f: S.graph - 1, ...pin(352, FLAT_Z.graph, TOP.band), ease: linear },
  { f: S.knows - 1, ...pin(ASK_CAM.chat.cy, ASK_CAM.chat.z * 0.98, TOP.band) },
  // Ask opening, the question sent, the answer streaming…
  { f: S.knows, ...pin(ASK_CAM.chat.cy, ASK_CAM.chat.z * 0.98, TOP.band) },
  { f: S.asked, ...pin(ASK_CAM.chat.cy, ASK_CAM.chat.z * 1.035, TOP.band), ease: linear },
  { f: S.proof - 28, ...pin(ASK_CAM.chat.cy, ASK_CAM.chat.z * 1.04, TOP.band), ease: linear },
  // …and out to the whole answer, settled for its three sources to land in
  // (clear of the band's third line, "with the proof.", as it comes up)
  { f: S.proof - 10, ...pin(PROOF.cy, FLAT_Z.proof, TOP.proof), ease: EASE_IN_OUT },
  { f: S.tagline + 4, ...pin(PROOF.cy, FLAT_Z.proof * 1.01, TOP.proof), ease: linear },
];
const flatGraphCam = (f: number): Cam => ({ ...pin(352, FLAT_Z.graph * (1 + 0.02 * prog(f, S.graph, S.knows, linear)), TOP.band), rx: 0, ry: 0, rz: 0 });

/** the faded cut's framings (paper over the band lets the camera go in
 *  close) or the flat one's (MachinaSaveThisNoFade) */
type Rig = { keys: Key[]; graph: (f: number) => Cam };
const FADED: Rig = { keys: appKeys, graph: graphCam };
const FLAT: Rig = { keys: flatKeys, graph: flatGraphCam };

/** the camera on an output frame */
const camOf = (R: Rig, f: number) => (f >= S.graph && f < S.knows ? R.graph(f) : camAt(R.keys, f));
/** where the screen's top edge is in frame (px): above the band, the app is
 *  under the type */
export const screenTopAt = (f: number, fades = true) => {
  const cam = camOf(fades ? FADED : FLAT, f);
  return cam.fy - cam.cy * cam.z;
};

/** where the card's mark is in frame on the iris (Opening.tsx lands on it) */
export const markToFor = (fades = true) => {
  const c = fades ? OPEN_CAM : OPEN_FLAT;
  return { x: c.fx + (center(MARK).x - c.cx) * c.z, y: c.fy + (center(MARK).y - c.cy) * c.z, size: MARK[2] * c.z };
};

/** a rect in screen points, where a camera puts it in the frame (px) */
const toFrame = (cam: Cam, r: number[]) => ({ x: cam.fx + (r[0] - cam.cx) * cam.z, y: cam.fy + (r[1] - cam.cy) * cam.z, w: r[2] * cam.z, h: r[3] * cam.z });

/**
 * (owner, round 17: "the card shrinking into its node") On "See in graph"
 * the card lifts off the feed and shrinks into its own dot as the graph
 * opens on it: its real pixels (the frame before its sheet rose), from where
 * the feed framed it to where the graph frames its dot, rounding into the
 * dot as it lands, and giving way to the app's own.
 */
const Morph: React.FC<{ f: number; rig: Rig }> = ({ f, rig }) => {
  const end = S.graph + MORPH;
  if (f < S.graph || f >= end) return null;
  const t = DIVE(prog(f, S.graph, end, linear));
  const a = toFrame(camAt(rig.keys, S.graph - 1), CARD);
  // the dot where the graph has it on this frame (the app's camera is still
  // gliding in on it): the card lands on the dot, not where the dot will be
  const b = toFrame(rig.graph(f), rectOf(T, frameAt(f), 'node0'));
  // even in scale (a shrink, not a slide), the centre on its way to the dot's
  const w = a.w * Math.exp(Math.log(b.w / a.w) * t);
  const h = Math.max(w, a.h * (w / a.w) * (1 - t));
  const x = a.x + a.w / 2 + (b.x + b.w / 2 - a.x - a.w / 2) * t - w / 2;
  const y = a.y + a.h / 2 + (b.y + b.h / 2 - a.y - a.h / 2) * t - h / 2;
  const s = w / CARD[2];
  // the last of the way it takes on the dot's colour: it becomes the dot
  const tint = prog(t, 0.5, 0.92, EASE_IN_OUT);
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        borderRadius: Math.min(w, h) / 2 * t + 12 * s * (1 - t),
        overflow: 'hidden',
        opacity: 1 - prog(f, end - 4, end, EASE_IN_OUT),
        // lifted off the feed: its shadow rises, then settles as it lands
        boxShadow: `0 ${Math.round(22 * Math.sin(Math.PI * t))}px ${Math.round(48 * Math.sin(Math.PI * t))}px rgba(24,32,48,${(0.3 * Math.sin(Math.PI * t)).toFixed(3)})`,
        background: '#FFFFFF',
      }}
    >
      <Img src={frameSrc(T, CARD_AT)} style={{ position: 'absolute', left: -CARD[0] * s, top: -CARD[1] * s, width: SCREEN.w * s, height: SCREEN.h * s, maxWidth: 'none' }} />
      <div style={{ position: 'absolute', inset: 0, background: DOT, opacity: tint }} />
    </div>
  );
};

/** a citation's pop on its ping, by frames since it: up in 3, gone by ~18 */
const pop = (df: number) => (df <= 0 ? 0 : (df / 3) * Math.exp(1 - df / 3));

/** the reel's emphasis on the next beat after an arrival, eased away */
const lift = (f: number, landed: number, len = 64) =>
  prog(f, landed, landed + 12, EASE_MODAL) * (1 - prog(f, landed + len - 24, landed + len, EASE_IN_OUT));

export const App: React.FC<{ f: number; fades?: boolean }> = ({ f, fades = true }) => {
  if (f < S.iris - 1 || f >= S.tagline + 4) return null;
  const R = fades ? FADED : FLAT;
  const i = frameAt(f);
  // the graph's camera rides the app's, so what it shows stays put: no
  // smear from its own travel
  const inGraph = f >= S.graph && f < S.knows;
  const cam = camOf(R, f);
  const v = inGraph ? { x: 0, y: 0 } : camVelocity(R.keys, f, 1);
  // the iris: a circle from the card's mark, open by the time it lands
  const r = prog(f, S.iris - 1, S.iris + 18, EASE_IN_OUT);
  const iris = r < 0.999 ? { x: center(MARK).x, y: center(MARK).y, r: 6 + r * 790 } : null;
  // (round 6) the proof: each citation lifts as it lands, one by one, and
  // stays up into the sign-off; (owner, round 13) on its ping it pops
  // forward, its ring flaring, and settles (CITE_PINGS, an 8th apart)
  const citeLift = (k: number) => {
    const up = prog(f, CITE_PINGS[k] - 1, CITE_PINGS[k] + 11, EASE_MODAL);
    const p = pop(f - CITE_PINGS[k]);
    return { lift: Math.max(up, 0.002), rise: 1.5 + 1.5 * p, grow: 0.02 + 0.03 * p, ring: 0.6 * up + 0.35 * p };
  };
  // (round 12) the app dissolves into the paper just ahead of the sign-off,
  // gone as the mark starts to draw
  const gone = prog(f, S.tagline - 14, S.tagline - 6, EASE_IN_OUT);
  // the read's parts, each on the word that names it: the summary hands over
  // to the topic, which stays up into the cut to the topics' map
  const upSum = f >= SUMS_AT - 2 && f < S.moreTap ? lift(f, SUMS_AT - 2, S.moreTap - SUMS_AT + 2) : 0;
  // (round 17) down again before the card's sheet rises over it
  const upTopic = f >= FILES_AT - 2 && f < S.moreTap ? prog(f, FILES_AT - 2, FILES_AT + 10, EASE_MODAL) * (1 - prog(f, S.moreTap - 6, S.moreTap, EASE_IN_OUT)) : 0;
  // (round 17) the card's way into the graph: its ⋯, then "See in graph",
  // the row picked out as it is pressed (drawn on the sheet's frames, and on
  // the last of them as it gives way)
  const upSee = prog(f, S.graphPick - 9, S.graphPick - 1, EASE_MODAL);
  const onSheet = (
    <>
      {f >= S.moreTap - 7 && f < S.moreTap + 13 && (
        // its ring goes under the sheet as the sheet rises over it
        <div style={{ position: 'absolute', inset: 0, opacity: 1 - prog(f, S.moreTap + 1, S.moreTap + 5, EASE_IN_OUT) }}>
          <Tap x={center(MORE).x} y={center(MORE).y} t={prog(f, S.moreTap - 7, S.moreTap + 13, linear)} />
        </div>
      )}
      {f >= S.graphPick - 9 && <Lift take={T} i={f < S.graph ? i : SHEET_HELD} rect={SEE} radius={10} lift={Math.max(upSee, 0.002)} rise={1} grow={0.02} ring={0.6 * upSee} />}
      {f >= S.graphPick - 7 && f < S.graphPick + 13 && <Tap x={SEE_AT.x} y={SEE_AT.y} t={prog(f, S.graphPick - 7, S.graphPick + 13, linear)} />}
    </>
  );

  return (
    <AbsoluteFill>
      <AppShot take={T} i={i} cam={cam} motion={{ x: v.x, y: v.y }} iris={iris} shadow={r} opacity={1 - gone}>
        {/* (round 3) "sums it up": its summary; "files it by topic": its topic */}
        {f >= SUMS_AT - 4 && f < S.moreTap && (
          <Lift take={T} i={i} rect={SUMMARY} radius={10} lift={Math.max(upSum, 0.002)} rise={1.5} grow={0.012} ring={0.6 * upSum} />
        )}
        {f >= FILES_AT - 4 && f < S.moreTap && (
          <Lift take={T} i={i} rect={TOPIC} radius={8} lift={Math.max(upTopic, 0.002)} rise={1.5} grow={0.05} ring={0.7 * upTopic} />
        )}
        {f >= S.moreTap - 7 && f < S.graph && onSheet}
        {/* (round 17) the card lands: its dot pings once */}
        {f >= S.graph + MORPH - 3 && f < S.graph + MORPH + 18 && (() => {
          const d = rectOf(T, i, 'node0');
          return <Ping rect={d} radius={d[2] / 2} t={prog(f, S.graph + MORPH - 3, S.graph + MORPH + 18, linear)} reach={9} width={1.4} alpha={0.45} />;
        })()}
        {/* (round 13) the pings: two rings off each citation, behind the three */}
        {f >= S.proof &&
          CITE_PINGS.map((p, k) => {
            const c = citeLift(k);
            const on = { rect: CITES[k], radius: 12, dy: -c.lift * c.rise, scale: 1 + c.lift * c.grow };
            return (
              <React.Fragment key={k}>
                <Ping {...on} t={prog(f, p, p + 16, linear)} reach={16} width={2.2} alpha={0.55} />
                <Ping {...on} t={prog(f, p + 4, p + 26, linear)} reach={28} width={1.5} alpha={0.3} />
              </React.Fragment>
            );
          })}
        {/* the proof: the citations, lifted one by one (kept mounted: their own raster) */}
        {f >= S.proof && CITES.map((r, k) => <Lift key={k} take={T} i={i} rect={r} radius={12} {...citeLift(k)} />)}
      </AppShot>
      {/* (round 17) "See in graph" pressed: the sheet goes at once, as in the
          app (it has no exit), and the card it was for lifts off the feed,
          which gives way to the graph opening under it (its slot left empty),
          and shrinks into its dot */}
      {f >= S.graph && f < S.graph + 6 && (
        <AppShot take={T} i={CARD_AT} cam={camAt(R.keys, S.graph - 1)} shadow={0} edge={0} opacity={1 - prog(f, S.graph, S.graph + 6, EASE_IN_OUT)}>
          <div style={{ position: 'absolute', left: CARD[0], top: CARD[1], width: CARD[2], height: CARD[3], borderRadius: 12, background: '#F9FAFB' }} />
        </AppShot>
      )}
      <Morph f={f} rig={R} />
      {/* (round 14) the question sent: Ask opening gives way to its chat in
          place, over three frames */}
      {f >= S.asked && f < S.asked + 3 && (
        <AppShot take={T} i={ASK_HELD} cam={cam} shadow={0} edge={0} opacity={1 - prog(f, S.asked - 1, S.asked + 3, linear)} />
      )}
    </AbsoluteFill>
  );
};
