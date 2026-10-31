/**
 * THE APP STORE PREVIEW (2026-10-28/30, round 7): the single source of
 * truth for time. Picture (src/reels/clips/preview/), frames
 * (capture/preview-frames.mjs), score (audio/preview-score.mjs), narrator
 * (audio/synth-vo.py preview) and audio/house-verify.mjs read this file.
 *
 * Apple's rules shape it (developer.apple.com/app-store/app-previews and the
 * App Store Connect preview specifications): every frame of the app is a
 * screen recording of the REAL app (the iOS Simulator, iPhone 17 Pro Max, a
 * build of main, the review account's real saves), 15 to 30 seconds, 30fps,
 * delivered at 886 × 1920; captions and touch marks may sit over it; nothing
 * may imply a feature the app lacks; no prices. It autoplays MUTED, so each
 * caption says what its narrated line says.
 *
 * SIX BEATS, ONE IDEA AND ONE NARRATED LINE EACH:
 *   1 Save       the feed (Kurzgesagt, TED); a save arrives (round 10: no
 *                + and no pasted link, which said "in this app" under a
 *                line that says "from any app")
 *   2 Analyzed   the analysis stepper's beats, then the new card on the feed
 *   3 Do         Revisit's Do this list, the new save's task on top
 *   4 Ask        a question typed: procrastination and phone addiction
 *   5 Answer     the answer citing three saves from three channels
 *   6 Connected  its Graph chip: the three cited cards, lit and linked
 * then the kit's Signature (no footer).
 *
 * ROUND 7 (owner: "the transitions are jittery, low quality, dated and
 * boring"). Measured on round 6: the screen flipped to the Add dialog's
 * black backdrop in one frame and back in one frame (44% and 52% of the
 * pixels at once), and every scene change double-exposed two differently
 * framed phones (the house rule it broke: never dissolve between takes).
 * Round 7 made it ONE phone under ONE camera, with a move for every change.
 *
 * ROUND 8 (owner: "all transitions within Ask are super abrupt; the clip is
 * very jumpy; smooth everything out: effortless and natural, yet modern and
 * advanced"). Measured on round 7: the camera started and stopped 13 times,
 * peaked at 745px a frame, jolted on the send, the dive and the gather, and
 * ~15 changes of screen landed in a single frame. Now:
 *   - the camera FOLLOWS its framings with a critically damped spring (iOS's
 *     own motion): no fast starts, no whips, no dive, never a jolt;
 *   - every change of screen DISSOLVES on the one phone: the app's small
 *     changes (the paste, each step, the status line) in 5 or 6 frames, a
 *     change of screen (Ask, the chat, the answer, the graph) through a soft
 *     focus in 10 to 14; the typed question fades in character by character;
 *   - LIFT and DROP stay (the dialog off the receding feed and back), slower;
 *   - the MATCH stays as a dissolve: the card's "...into small, manageable
 *     bricks" becomes Revisit's "...into a single, manageable" (round 9: at
 *     full width, the word no longer held on one pixel).
 * ROUND 9 (owner: "some frames are too zoomed in, you are cutting off text";
 * "what is that bottom bar with the arrows and checkmark? get rid of it";
 * "a complete round of polishing"): the whole phone is in frame at every
 * hold (zoom at most 2.4px a point, centred: no word is ever cut), so the
 * match is now a full-width cross-blur (holding "manageable" on one pixel
 * needed z 2.95, which cut both screens' text); iOS's keyboard bar (∧ ∨ ✓,
 * shown while the composer has focus) is painted out of the Ask frames
 * with the page's own colour.
 * ROUND 10 (owner: "what if we just skip the frame of pasting a link? the
 * narration says from any app, and we just show the saving steps"; then,
 * agreed: a line that says how saves arrive): the + tap, the empty form,
 * the paste and the Save tap are gone; under the hook the analysis sheet
 * rises already reading the link; a new line, "Share it straight to
 * Machina. No copying, no pasting." (not "no switching apps": the sheet
 * rises over Machina's own feed, which would contradict it); the stepper's
 * beats spread over both lines; the analysis caption builds with its
 * narration ("Every save," then "analyzed and summarized."). 28.9s.
 * Motion blur is a real shutter (the camera sampled across half a frame),
 * only where the camera moves.
 *
 * Retimes, all of real footage: the waits while the card is built and the
 * answer is written are cut (the stepper's beats each shown as it advances);
 * the typing's 60fps steps shown two frames each; "Searching your
 * library..." is cut (brand ban); the settled graph is one held frame.
 *
 * Canvas: 1080 × 2340 (the kit's 1080-wide pixels at the preview's aspect),
 * scaled to 886 × 1920 at encode.
 */

import { SIGNATURE } from '../src/reels/kit/signature.mjs';

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 2340;
/** the delivered file (App Store Connect: iPhone 6.9", 6.5" and 6.1") */
export const OUT = { width: 886, height: 1920 };

export const BEAT_FRAMES = 15;
export const BPM = (60 * FPS) / BEAT_FRAMES; // 120
export const BEAT = BEAT_FRAMES / FPS; // 0.5s
export const beat = (n) => Math.round(n * BEAT_FRAMES);

/** 28.9s, under Apple's 30 */
export const TOTAL_FRAMES = 866;
export const TOTAL_SEC = TOTAL_FRAMES / FPS;
export const SIGNATURE_AT = TOTAL_FRAMES - SIGNATURE.frames;

/** the screen in points (the 17 Pro Max) and the captures' pixels per point */
export const SCREEN = { w: 440, h: 956 };
export const CAPTURE = { w: 1320, h: 2868, dpr: 3 };

/** the 60fps masters (out/preview-takes/, not in git; capture/preview-frames.mjs says how they were made) */
export const TAKES = { W: 'out/preview-takes/W60.mp4', X: 'out/preview-takes/X60.mp4' };

/** picture events, output frames: every move, change of screen and sound hangs off these */
export const HITS = {
  lift: 21, // a save arrives: the analysis sheet rises off the feed, which recedes
  /** the stepper's beats: Reading the page, Writing the summary, Searching connections, all done */
  steps: [100, 140, 180, 215],
  done: 215,
  drop: 235, // the dialog settles back into the feed
  landed: 252, // the new card, in focus, lifts
  match: 288, // the card cross-blurs into Revisit's Do this, its task on top
  todo: 338, // the task lifts
  askTap: 372, // the pad lands on the Ask tab
  ask: 373, // Revisit softens into Ask
  typeFrom: 409,
  typed: 451,
  send: 464, // the pad lands on send; the chat takes over
  writing: 484,
  answer: 498, // the answer resolves into focus
  graphTap: 598, // the pad lands on the Graph chip
  graph: 599, // the answer softens into the graph
  out: 702, // the phone settles back under the Signature's paper
};

/** where each beat starts (output frames) */
export const BEATS = {
  save: 0,
  summary: 66,
  todo: HITS.match,
  ask: HITS.ask,
  answer: HITS.answer,
  graph: HITS.graph,
  signature: SIGNATURE_AT,
};

// ── the frames ──────────────────────────────────────────────────────────
// A RUN shows a take from output frame `at`: take frame `from` advancing
// `step` a frame (2 = real time, the 60fps master shown every other frame;
// 0 = held), never past `to`; or an explicit `frames` list, each shown
// `hold` frames, the last held (`blend`: each one dissolves into the next
// across its hold, so typed characters fade in instead of popping). The
// last run that has started is on screen.

/** take W (60fps frame numbers, measured): the save */
const W = {
  feed: 800, // the feed (Kurzgesagt, TED), still
  fetching: 2839, // the stepper: Fetching the link (the take pasted the link at 1914 and tapped Save at 2835: not shown)
  reading: 3062,
  writing: 3362,
  searching: 3782,
  done: 4488, // every step checked
  closed: 4535, // the dialog gone: the feed, the new card on top
  revisit: 7700, // Revisit, settled
};
/** take X: Ask */
const X = {
  ask: 9612, // Ask Machina, empty, the composer focused
  reviewing: 11187, // "Reviewing relevant cards..."
  writing: 11340, // "Writing your answer..."
  answer: 11845, // the answer, the frame it lands (buffered: all at once)
  graph: 15333, // the settled graph, held (it twitches live: ~50/255 jumps)
};
/** the question, typed: each of these 60fps frames shows more of it ("Brie", "Briefl", ... "addiction?") */
const TYPED_FRAMES = [9669, 9672, 9674, 9675, 9677, 9680, 9682, 9685, 9689, 9692, 9694, 9698, 9701, 9704, 9705, 9707, 9708, 9709, 9710, 9714, 9715, 9716];

const run = (at, take, from, step = 2, to = Infinity) => ({ at, take, from, step, to });

/** the phone's screen */
export const SCREEN_RUNS = [
  run(0, 'W', W.feed, 0),
  // under the drop, still out of focus (FADES dissolves it in)
  run(HITS.drop + 2, 'W', W.closed + 1, 2, W.closed + 97),
  run(HITS.match, 'W', W.revisit, 0),
  run(HITS.ask, 'X', X.ask, 2, X.ask + 54),
  // (when the question wraps, at its 16th step, the app grows the composer
  // 24pt and nudges the empty state above it up 12pt in one frame: the
  // empty state, which is still, is kept from the step before, so only the
  // composer changes; and the wrap itself is not blended, which doubled the
  // whole screen)
  { at: HITS.typeFrom, take: 'X', frames: TYPED_FRAMES, hold: 2, blend: true, wrap: { at: 15, keep: 9705, above: 770 } },
  run(HITS.send, 'X', X.reviewing, 2, X.reviewing + 36),
  run(HITS.writing, 'X', X.writing, 2, X.writing + 30),
  run(HITS.answer, 'X', X.answer, 2, X.answer + 230),
  run(HITS.graph, 'X', X.graph, 0),
];

/**
 * The dialog, lifted off the screen (a crop of the same takes). `box` is
 * its outline on the capture (points: x, y, w, h; corner 24), `dy` moves it
 * so its top never moves: the app drops the dialog 66pt as the keyboard
 * hides on Save and raises it again as the stepper; lifted, it stays put
 * and only its contents change, as they do in the app. It rises already
 * reading the link (the float does the entrance).
 */
export const DIALOG_RADIUS = 24;
const STEPPER = { box: [16, 248, 408, 479], dy: -34 };
export const DIALOG_RUNS = [
  { ...run(HITS.lift, 'W', W.fetching, 2), ...STEPPER },
  { ...run(HITS.steps[0], 'W', W.reading, 2), ...STEPPER },
  { ...run(HITS.steps[1], 'W', W.writing, 2), ...STEPPER },
  { ...run(HITS.steps[2], 'W', W.searching, 2), ...STEPPER },
  // all done (the "you can close this window" line goes: 48pt shorter),
  // held on its last frame before the app closes it (4535)
  { ...run(HITS.done, 'W', W.done, 2, W.closed - 1), box: [16, 248, 408, 431], dy: -34 },
];
/** the dialog is on screen over these frames (it settles away from HITS.drop) */
export const DIALOG_SPAN = [HITS.lift, HITS.drop + 14];

/** the source frame of a run list at an output frame (with the next one and how far into it, for a blended run) */
export const runAt = (runs, f) => {
  let r = runs[0];
  for (const x of runs) if (x.at <= f) r = x;
  const k = Math.max(0, Math.floor(f) - r.at);
  const base = { take: r.take, box: r.box, dy: r.dy ?? 0, next: null, mix: 0, top: null };
  if (r.frames) {
    const hold = r.hold ?? 1;
    const j = Math.min(r.frames.length - 1, Math.floor(k / hold));
    const blend = r.blend && j + 1 < r.frames.length && !(r.wrap && j + 1 === r.wrap.at);
    const top = r.wrap && j >= r.wrap.at ? { i: r.wrap.keep, above: r.wrap.above } : null;
    return { ...base, i: r.frames[j], next: blend ? r.frames[j + 1] : null, mix: blend ? (k % hold) / hold : 0, top };
  }
  return { ...base, i: Math.min(r.to, r.from + r.step * k) };
};

/**
 * Every change of screen dissolves, on the one phone (never two phones):
 * the screen before stays under, the one after comes up over it across
 * `len` frames (eased in and out). With `blur` (frame pixels) it is a
 * cross-blur: the one going softens before the one coming is half up, and
 * the one coming sharpens only once the other has all but gone, so the two
 * never overlap in focus (round 8: a plain dissolve showed text on text).
 * `blur` 0 is a plain crossfade, for the app's small changes where only a
 * line differs; `grow`: the new one settles from that much larger, a
 * breath of depth.
 */
export const FADES = [
  // the feed updating behind the dialog (both still out of focus)
  { layer: 'screen', at: HITS.drop + 2, len: 8, blur: 0 },
  { layer: 'screen', at: HITS.match, len: 14, blur: 12 },
  { layer: 'screen', at: HITS.ask, len: 12, blur: 10 },
  { layer: 'screen', at: HITS.send, len: 12, blur: 10 },
  { layer: 'screen', at: HITS.writing, len: 6, blur: 5 },
  { layer: 'screen', at: HITS.answer, len: 10, blur: 8 },
  { layer: 'screen', at: HITS.graph, len: 14, blur: 12, grow: 0.03 },
  // the dialog's own changes: each step
  ...HITS.steps.map((at) => ({ layer: 'dialog', at, len: 5, blur: 0 })),
];
/** the fade on a layer at frame f, if one is running */
export const fadeAt = (layer, f) => FADES.find((x) => x.layer === layer && f >= x.at && f < x.at + x.len);

/** every source frame the picture uses (capture/preview-frames.mjs extracts these) */
export const usedFrames = () => {
  const out = { W: new Set(), X: new Set() };
  const add = (s) => {
    out[s.take].add(s.i);
    if (s.next) out[s.take].add(s.next);
  };
  for (let f = 0; f < TOTAL_FRAMES; f++) {
    add(runAt(SCREEN_RUNS, f));
    if (f >= DIALOG_SPAN[0] && f < DIALOG_SPAN[1]) add(runAt(DIALOG_RUNS, f));
  }
  // the frame under each fade
  for (const x of FADES) add(runAt(x.layer === 'screen' ? SCREEN_RUNS : DIALOG_RUNS, x.at - 1));
  return { W: [...out.W].sort((a, b) => a - b), X: [...out.X].sort((a, b) => a - b) };
};

/** a frame's file, under public/ (capture/preview-frames.mjs writes them) */
export const frameFile = (take, i) => `clips/preview/frames/${take}/${String(i).padStart(5, '0')}.png`;

// ── the camera ──────────────────────────────────────────────────────────
// A shot's camera puts screen point (cx, cy) at frame point FOCUS at z frame
// pixels per point. It does not jump between framings: it FOLLOWS a target
// path (straight lines between these keys, read through a 12-frame moving
// average, so a new framing arrives as a ramp, never a step) with a
// critically damped spring, iOS's own motion (round 8, owner: "smooth
// everything out, it should feel effortless and natural"): it eases out of
// rest without a kick, keeps its speed through a change of mind, and settles
// without overshoot, never moving before the thing it answers. `w` is the
// spring's rate per frame from that key on (0.17: about a 1.2s response;
// lower is slower). At rest the phone is 2.1px a point; held, it is at most
// 2.4 (the whole phone's width, 440pt, in the 1080px frame, its paper
// margins showing), so no word is ever cut; the captures hold 3px a point,
// so nothing is ever upscaled.

/** the frame point a camera holds its screen point at: x centre, the slab's resting centre */
export const FOCUS = { x: 540, y: 1444 };
export const SPRING = 0.17;
/** frames of the target path's moving average */
export const EASE_IN = 12;
const tg = (f, cx, cy, z, w) => ({ f, cx, cy, z, ...(w ? { w } : {}) });

/** the phone's screen: one shot, the whole phone's width in frame at every hold (z ≤ 2.4: no word is ever cut) */
export const SHOTS = [
  {
    from: 0,
    to: TOTAL_FRAMES,
    targets: [
      // the whole phone under the hook, a slow push
      tg(0, 220, 482, 1.98),
      tg(HITS.lift, 220, 482, 2.0),
      // LIFT: it recedes behind the dialog
      tg(HITS.lift + 1, 220, 485, 1.9),
      tg(HITS.drop, 220, 487, 1.88),
      // DROP: forward as the feed comes into focus, onto the new card as it
      // lifts (its top just under the caption band)
      tg(HITS.drop + 1, 220, 410, 2.3, 0.13),
      tg(HITS.match - 1, 220, 412, 2.32),
      // MATCH: the card cross-blurs into Revisit; down to the whole Do this
      // list (its first task under the band, the tab bar in frame for the
      // Ask tap)
      tg(HITS.match, 220, 600, 2.3, 0.12),
      tg(HITS.ask - 1, 220, 604, 2.32),
      // Ask: the whole screen, the empty state to the composer
      tg(HITS.ask, 220, 600, 2.2),
      tg(HITS.send - 1, 220, 610, 2.24),
      // SEND: up with the question to where the answer lands (question to
      // sources in one frame)
      tg(HITS.send, 220, 400, 2.3, 0.13),
      tg(HITS.answer, 220, 404, 2.3),
      tg(HITS.answer + 70, 220, 408, 2.32),
      // the sources and the Graph chip
      tg(HITS.answer + 71, 220, 470, 2.3),
      tg(HITS.graph - 1, 220, 472, 2.32),
      // the graph, as it blooms in
      tg(HITS.graph, 220, 610, 2.3),
      tg(HITS.out, 220, 614, 2.36),
      // settling back as the Signature's paper rises
      tg(HITS.out + 1, 220, 600, 2.15, 0.12),
    ],
  },
];

/** the lifted dialog's own camera: framed whole, a slow push while it works, then settling back toward the feed */
export const DIALOG_TARGETS = [
  tg(HITS.lift, 220, 452, 2.3),
  tg(HITS.steps[0], 220, 452, 2.36),
  tg(HITS.drop, 220, 454, 2.4),
  tg(HITS.drop + 1, 220, 466, 2.15),
];

/** taps, drawn where the take really tapped (screen points); `at` is a few
 *  frames before the press, which lands at t 0.35 of the mark's 12 frames */
export const TAPS = [
  { at: HITS.askTap - 4, x: 300, y: 909, layer: 'screen' },
  { at: HITS.send - 4, x: 400, y: 826, tone: 'light', layer: 'screen' },
  { at: HITS.graphTap - 4, x: 231, y: 692, layer: 'screen' },
];

/** elements lifted off the screen with an ink ring as their line names them (points) */
export const LIFTS = [
  { at: HITS.landed, until: HITS.match, rect: [16, 114, 408, 386], radius: 18 }, // the new card
  { at: HITS.todo, until: HITS.ask, rect: [16, 331, 408, 83], radius: 12 }, // its task, on top of Do this
];

/** rings off what a line names (screen points: x, y, w, h, radius) */
export const PINGS = [
  { at: HITS.answer + 20, rect: [12, 527, 352, 52], radius: 14 }, // Big Think
  { at: HITS.answer + 30, rect: [12, 589, 374, 68], radius: 14 }, // Mark Manson
  { at: HITS.answer + 40, rect: [12, 667, 170, 52], radius: 14 }, // TEDx
  { at: HITS.graph + 35, rect: [173, 521, 32, 32], radius: 16 }, // the three, lit
  { at: HITS.graph + 45, rect: [130, 605, 32, 32], radius: 16 },
  { at: HITS.graph + 55, rect: [278, 701, 34, 34], radius: 17 },
];

/**
 * The ONE pixel edit (round 6, owner: "this logo next to Wait But Why in this
 * screen is ugly, remove it"): the site's favicon in the stepper's host row
 * is painted out with the sheet's own white (kit TOKENS.captureWhite, the
 * 253 the capture encodes), so "waitbutwhy.com" sits in line with the step
 * labels below it. On every stepper frame of take W, in the capture's points.
 */
export const PATCHES = [{ take: 'W', from: W.fetching, to: W.closed, rect: [38, 438, 31, 31] }];

/**
 * Round 9 (owner: "what is that bottom bar with the arrows and checkmark?
 * get rid of it"): iOS's keyboard accessory bar (∧ ∨ ✓, which the simulator
 * shows while the composer has focus, its shadow included: 884–956pt) is
 * painted out of every Ask frame with the page's own colour (kit
 * TOKENS.capturePage, as the capture encodes it, so no seam). Screen points.
 */
export const SCREEN_PATCHES = [{ take: 'X', from: X.ask, to: X.graph, rect: [0, 878, 440, 78] }];

/** the frames the score ticks a key on (each typed step lands) */
export const TYPED = [...Array.from({ length: 21 }, (_, j) => HITS.typeFrom + 2 * j), HITS.typed];

/** the narrator's pace: unhurried and clear (an App Store preview, not a social ad) */
const PACE = 'Clear and unhurried, about 155 words a minute; natural, short pauses, never rushed.';

/**
 * The narration, a line a beat, and on screen the same words (the preview
 * autoplays muted: the captions carry it alone). The first is the frame-0
 * cover, set big; the rest sit in the house band, two lines at most. `say`
 * is spoken (its takes are voiced: changing `say`, `style` or `pace`
 * re-voices it), `text` is set; `cues` are the word (in `say`) each line
 * arrives on.
 */
export const CAPTIONS = [
  { at: 6, to: 62, place: 'hook', cues: [], text: 'Save anything,\nfrom any app.', say: 'Save anything, from any app.', style: 'Natural and conversational, like telling a friend about an app you love: light, easy and unforced. Not an announcer, not performed, no word stressed.', pace: 'Everyday conversational speed, about 180 words a minute; the whole line in one easy breath, the comma only the briefest beat.', maxPause: 0.12 },
  { at: 66, to: 166, cues: [0, 5], text: 'Share it straight to Machina.\nNo copying, no pasting.', say: 'Share it straight to Machina. No copying, no pasting.', style: 'Natural and conversational, like telling a friend about a small thing that makes life easier: light, easy and unforced. "No copying, no pasting" an easy aside, not a slogan; no word stressed.', pace: 'Everyday conversational speed, about 180 words a minute; a brief natural beat after "Machina", never drawn out.', maxPause: 0.2 },
  { at: 170, to: HITS.match - 4, cues: [0, 2], text: 'Every save,\nanalyzed and summarized.', say: 'Every save, analyzed and summarized.', style: 'Assured and warm, like showing a friend something that simply works; even weight on "analyzed" and "summarized".', pace: PACE },
  { at: 298, to: HITS.askTap - 2, cues: [0, 4], text: 'Turn what you save\ninto what you do.', say: 'Turn what you save into what you do.', style: 'Warm, a neat turn of phrase; a gentle stress on "save" and on "do".', pace: PACE },
  { at: 390, to: HITS.send - 9, cues: [0, 3], text: 'Ask about anything\nyou’ve saved.', say: 'Ask about anything you’ve saved.', style: 'Curious and inviting; an easy lift on "anything".', pace: PACE },
  { at: 506, to: HITS.graph - 2, cues: [0, 3], text: 'Every answer comes\nfrom your own sources.', say: 'Every answer comes from your own sources.', style: 'Reassuring and clear; "from your own sources" with quiet confidence, a small stress on "own".', pace: PACE },
  { at: 622, to: SIGNATURE_AT - 4, cues: [1, 3], text: 'Machina notices\nwhich saves belong together.', say: 'And Machina notices which saves belong together.', style: 'Natural and conversational, with a little warmth and wonder, like pointing out something clever a friend did; light and unforced, no word stressed.', pace: 'Everyday conversational speed, about 170 words a minute; easy, never drawn out; "together" landing softly, leaving space before the logo.', maxPause: 0.2 },
];

/** chords, warm, a step at each beat */
export const CHORDS = [
  [BEATS.save, 'Fmaj7'],
  [BEATS.summary, 'Cmaj7'],
  [HITS.landed, 'Am7'],
  [HITS.match, 'Fmaj7'],
  [HITS.ask, 'Am7'],
  [HITS.answer, 'Fmaj7'],
  [HITS.graph, 'G6'],
  [SIGNATURE_AT, 'Cmaj7'],
];
