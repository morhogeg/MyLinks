/**
 * LATER NEVER COMES (2026-10-31): the Instagram Reel built on THE APP STORE
 * PREVIEW. The single source of truth for time: picture
 * (src/reels/clips/later/), frames (capture/take-frames.mjs later), score
 * (audio/later-score.mjs), narrator (audio/synth-vo.py later) and the gates
 * (audio/later-verify.mjs, audio/house-verify.mjs) read this file.
 *
 * The owner's brief: an organic Reel, the social team's best practice
 * applied (README "LATER NEVER COMES"): a hook on frame 0 that works muted
 * and doubles as the cover; a habit nearly everyone shares, so it gets sent
 * on; the app proving it, fast, on ONE phone under ONE spring camera, every
 * change of screen a cross-blur on that phone; the whole phone's width in
 * frame at every hold; captions that build with the voice and split where it
 * pauses; a natural, conversational narrator (~175 wpm); original music; the
 * kit's Signature. App Store preview rules do not apply: it saves from
 * another app's share sheet, moves faster and is music-led.
 *
 * SIX LINES (owner-approved wording, 2026-10-31):
 *   hook    "Saved it for later? / Later never comes."   Safari's share sheet
 *   share   "Share it to Machina, / and it reads it for you."   the tap; Machina's own card reads it
 *   todo    "It even tells you / what to do with it."     Revisit: its task tops Do this
 *   ask     "Ask about anything / you've saved."          the question types itself
 *   answer  "It answers from your own saves. / Sources included."   three sources ring
 *   graph   "And it notices / which saves belong together."   the graph, the three lit
 * then the kit's Signature, with the footer of the day (`ENDINGS`).
 *
 * NO THIRD-PARTY IMAGES (SOURCE_OF_TRUTH §8, the ads brief): the preview's
 * feed shows YouTube thumbnails (Kurzgesagt's art, a TED speaker), so this
 * reel never shows the feed: not the opening, not behind the lifted sheet,
 * not under the new card. Everything it shows draws no third-party image in
 * this build (0db534f2): Safari on a plain-text passage, the share sheet,
 * Machina's share card, Revisit's Do this rows, Ask (its source chips are
 * the app's own platform marks and names in type), the graph (plain discs).
 * Two site icons are painted out (`PATCHES`), as the preview's favicon was.
 *
 * META'S SAFE ZONES (the ads brief): nothing key in the top 14%, the bottom
 * 35%, or 65px from either side (`SAFE`); the cover's hook also sits inside
 * the profile grid's 3:4 crop (`GRID`). The house band holds the type; each
 * shot aims its subject between the band and SAFE.y1.
 *
 * Written in OUTPUT frames on a 120 BPM grid (15 frames a beat). The cut is
 * timed to the narrator's measured takes (src/reels/clips/later/later-vo.json),
 * not the reverse.
 */

import { SIGNATURE } from '../src/reels/kit/signature.mjs';
import { fadeAt as fadeIn, run, runAt as runIn, usedFrames as usedIn } from '../src/reels/kit/runs.mjs';

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export const BEAT_FRAMES = 15;
export const BPM = (60 * FPS) / BEAT_FRAMES; // 120
export const BEAT = BEAT_FRAMES / FPS; // 0.5s
export const beat = (n) => Math.round(n * BEAT_FRAMES);

/** 50 beats: 20s of the app, then the shared ending */
export const TOTAL_FRAMES = beat(50);
export const TOTAL_SEC = TOTAL_FRAMES / FPS;
export const SIGNATURE_AT = TOTAL_FRAMES - SIGNATURE.frames;

/** the footer under the Signature: today, and on launch day (a render prop) */
export const ENDINGS = {
  soon: 'Coming soon · mymachina.app',
  store: 'Now on the App Store · mymachina.app',
};

/** Meta's safe zone in this frame (px): nothing key outside it */
export const SAFE = { x0: 65, x1: WIDTH - 65, y0: Math.ceil(0.14 * HEIGHT), y1: Math.floor(0.65 * HEIGHT) };
/** the profile grid's 3:4 crop of the cover (px rows kept) */
export const GRID = { y0: (HEIGHT - (WIDTH * 4) / 3) / 2, y1: (HEIGHT + (WIDTH * 4) / 3) / 2 };

/** the screen in points (the 17 Pro Max) and the captures' pixels per point */
export const SCREEN = { w: 440, h: 956 };
export const CAPTURE = { w: 1320, h: 2868, dpr: 3 };
/** the iPhone's display corner, points */
export const SCREEN_RADIUS = 55;

/**
 * The 60fps masters (not in git). W and X are THE APP STORE PREVIEW's
 * (capture/preview-frames.mjs says how they were made); S is this reel's
 * share-sheet take, made the same way on the same simulator: Safari on the
 * Wait But Why article, scrolled to plain text, ••• → Share → Machina, its
 * card read to "Saved ✓".
 */
export const TAKES = {
  W: 'out/preview-takes/W60.mp4',
  X: 'out/preview-takes/X60.mp4',
  S: 'out/later-takes/S60.mp4',
};

/** a frame's file under public/: W and X share the preview's frame cache (the same takes) */
export const frameFile = (take, i) =>
  take === 'S' ? `clips/later/frames/S/${String(i).padStart(5, '0')}.png` : `clips/preview/frames/${take}/${String(i).padStart(5, '0')}.png`;

// ── the takes' marks (60fps frame numbers, measured) ───────────────────────

/**
 * take S: the share sheet. NOT MEASURED YET (the take is not recorded):
 * every mark is null until it is, and the gates fail while one is.
 */
export const S = {
  sheet: null, // the share sheet up and still, the frame before the finger lands
  tap: null, // the finger lands on Machina
  reading: null, // Machina's card: "Reading the page…"
  writing: null, // "Writing the summary…"
  searching: null, // "Searching connections…"
  saved: null, // "Saved ✓"
};
export const SHARE_READY = Object.values(S).every((v) => v != null);

/** take W: the save (only Revisit is used: the feed's thumbnails rule the rest out) */
const W = {
  revisit: 7700, // Revisit, settled: the article's task on top of Do this
};
/** take X: Ask */
const X = {
  ask: 9612, // Ask Machina, empty, the composer focused
  reviewing: 11187, // "Reviewing relevant cards..."
  writing: 11340, // "Writing your answer..."
  answer: 11845, // the answer, the frame it lands (buffered: all at once)
  graph: 15333, // the settled graph, held (it twitches live)
};
/** the question, typed: each of these 60fps frames shows more of it ("Brie", "Briefl", ... "addiction?") */
const TYPED_FRAMES = [9669, 9672, 9674, 9675, 9677, 9680, 9682, 9685, 9689, 9692, 9694, 9698, 9701, 9704, 9705, 9707, 9708, 9709, 9710, 9714, 9715, 9716];

// ── picture events (output frames): every move, change and sound hangs off these

export const HITS = {
  tap: beat(5), // the pad lands on Machina in the share sheet; the groove drops
  /** Machina's card works: Reading the page, Writing the summary, Searching connections */
  steps: [beat(6.6), beat(8.2), beat(9.8)],
  saved: beat(11.4), // "Saved ✓"
  revisit: beat(13), // the card cross-blurs into Revisit's Do this
  todo: beat(15), // the article's task lifts, its ring
  askTap: beat(19) - 1, // the pad lands on the Ask tab
  ask: beat(19), // Revisit softens into Ask
  typeFrom: beat(20),
  send: beat(23.5), // the pad lands on send; the chat takes over
  writing: beat(24.5),
  answer: beat(26), // the answer resolves into focus
  /** "Sources included.": each source rings, an 8th apart */
  sources: [beat(30), beat(30.5), beat(31)],
  graphTap: beat(33) - 1, // the pad lands on the Graph chip
  graph: beat(33), // the answer softens into the graph
  /** the three cited saves, lit, ring as the line names them */
  nodes: [beat(35), beat(35.5), beat(36)],
  out: beat(39), // the phone settles back under the Signature's paper
};
/** the frame the typed question is complete */
HITS.typed = HITS.typeFrom + 2 * (TYPED_FRAMES.length - 1);

/** where each beat of the story starts (output frames) */
export const BEATS = {
  hook: 0,
  share: HITS.tap,
  todo: HITS.revisit,
  ask: HITS.ask,
  answer: HITS.answer,
  graph: HITS.graph,
  signature: SIGNATURE_AT,
};

// ── the frames ───────────────────────────────────────────────────────────

/** the share sheet's runs (only once take S is measured) */
const SHARE_RUNS = SHARE_READY
  ? [
      // the cover: the share sheet up and still while the camera eases in
      run(0, 'S', S.sheet, 0),
      // the tap, then the take at real time: the sheet gives way to
      // Machina's card, which rises and starts reading (the system's and
      // the app's own motion, captured at 60fps)
      run(HITS.tap, 'S', S.tap, 2, S.reading - 1),
      // each step shown as it advances (the waits are cut, as the preview's were)
      run(HITS.steps[0], 'S', S.reading, 2, S.writing - 1),
      run(HITS.steps[1], 'S', S.writing, 2, S.searching - 1),
      run(HITS.steps[2], 'S', S.searching, 2, S.saved - 1),
      run(HITS.saved, 'S', S.saved, 2, S.saved + 40),
    ]
  : [{ at: 0, take: 'S', from: null, step: 0, to: null }];

/** the phone's screen */
export const SCREEN_RUNS = [
  ...SHARE_RUNS,
  run(HITS.revisit, 'W', W.revisit, 0),
  run(HITS.ask, 'X', X.ask, 2, X.ask + 54),
  // (when the question wraps, at its 16th step, the app grows the composer
  // and nudges the empty state above it up 12pt in one frame: the empty
  // state, which is still, is kept from the step before; the preview's fix)
  { at: HITS.typeFrom, take: 'X', frames: TYPED_FRAMES, hold: 2, blend: true, wrap: { at: 15, keep: 9705, above: 770 } },
  run(HITS.send, 'X', X.reviewing, 2, X.reviewing + 36),
  run(HITS.writing, 'X', X.writing, 2, X.writing + 30),
  run(HITS.answer, 'X', X.answer, 2, X.answer + 230),
  run(HITS.graph, 'X', X.graph, 0),
];

/** every change of screen, on the one phone (kit/runs.mjs) */
export const FADES = [
  // Machina's card: each step a crossfade (only a line changes)
  ...HITS.steps.map((at) => ({ layer: 'screen', at, len: 5, blur: 0 })),
  { layer: 'screen', at: HITS.saved, len: 5, blur: 0 },
  // new screens: a cross-blur
  { layer: 'screen', at: HITS.revisit, len: 14, blur: 12 },
  { layer: 'screen', at: HITS.ask, len: 12, blur: 10 },
  { layer: 'screen', at: HITS.send, len: 12, blur: 10 },
  { layer: 'screen', at: HITS.writing, len: 6, blur: 5 },
  { layer: 'screen', at: HITS.answer, len: 10, blur: 8 },
  { layer: 'screen', at: HITS.graph, len: 14, blur: 12, grow: 0.03 },
];

export const runAt = runIn;
export const fadeAt = (layer, f) => fadeIn(FADES, layer, f);
export const usedFrames = () => usedIn({ total: TOTAL_FRAMES, layers: { screen: { runs: SCREEN_RUNS, span: [0, SIGNATURE_AT + SIGNATURE.paperIn + 2] } }, fades: FADES });

// ── the camera ───────────────────────────────────────────────────────────
// The preview's camera (kit/phone.tsx `follow`): it puts screen point
// (cx, cy) at FOCUS at z frame px a point, FOLLOWING a target path (straight
// lines between these keys, read through an EASE_IN-frame moving average)
// with a critically damped spring: no fast starts, no whips, no dives,
// never a jolt. `w` is the spring's rate from that key on.
//
// Holds are z 2.2: the whole phone's width (440pt = 968px) in the 1080
// frame, and its text (16–424pt) 91px from either edge, clear of Meta's
// 65px (z ≤ 2.33 keeps it clear). FOCUS sits mid-way down the safe zone
// below the band, so each shot's subject lands where nothing covers it.

export const FOCUS = { x: 540, y: 900 };
export const SPRING = 0.17;
export const EASE_IN = 12;
const tg = (f, cx, cy, z, w) => ({ f, cx, cy, z, ...(w ? { w } : {}) });

export const SHOTS = [
  {
    from: 0,
    to: TOTAL_FRAMES,
    targets: [
      // the cover: the share sheet's row of apps under the hook, a slow push
      tg(0, 220, 600, 2.0),
      tg(6, 220, 600, 2.0),
      tg(HITS.tap, 220, 606, 2.2),
      // Machina's card rises: up with it
      tg(HITS.tap + 1, 220, 560, 2.2, 0.15),
      tg(HITS.revisit - 1, 220, 556, 2.22),
      // Revisit: the article's task just under the band
      tg(HITS.revisit, 220, 436, 2.2, 0.13),
      tg(HITS.todo + 20, 220, 440, 2.22),
      // easing down the list toward the tab bar as the line ends
      tg(HITS.askTap - 6, 220, 690, 2.2),
      // Ask: the composer and the typing
      tg(HITS.ask, 220, 780, 2.2),
      tg(HITS.send - 1, 220, 786, 2.22),
      // SEND: up to the question, then where the answer lands
      tg(HITS.send, 220, 300, 2.2, 0.13),
      tg(HITS.answer, 220, 420, 2.2),
      tg(HITS.sources[0] - 8, 220, 424, 2.22),
      // the sources and the Graph chip, as "Sources included." is said
      tg(HITS.sources[0] - 7, 220, 610, 2.2, 0.15),
      tg(HITS.graph - 1, 220, 612, 2.22),
      // the graph, as it blooms in
      tg(HITS.graph, 220, 628, 2.2),
      tg(HITS.out, 220, 630, 2.24),
      // settling back as the Signature's paper rises
      tg(HITS.out + 1, 220, 610, 2.05, 0.12),
    ],
  },
];

/** taps, drawn where the take really tapped (screen points); `at` is a few
 *  frames before the press, which lands at t 0.35 of the mark's 12 frames */
export const TAPS = [
  // the share sheet's Machina: MEASURED FROM TAKE S (null until then)
  { at: HITS.tap - 4, x: null, y: null, layer: 'screen' },
  { at: HITS.askTap - 4, x: 300, y: 909, layer: 'screen' },
  { at: HITS.send - 4, x: 400, y: 826, tone: 'light', layer: 'screen' },
  { at: HITS.graphTap - 4, x: 231, y: 692, layer: 'screen' },
];

/** elements lifted off the screen with an ink ring as their line names them (points) */
export const LIFTS = [
  { at: HITS.todo, until: HITS.ask, rect: [16, 331, 408, 83], radius: 12 }, // the article's task, on top of Do this
];

/** rings off what a line names (screen points: x, y, w, h, radius) */
export const PINGS = [
  { at: HITS.sources[0], rect: [12, 527, 352, 52], radius: 14 }, // Big Think
  { at: HITS.sources[1], rect: [12, 589, 374, 68], radius: 14 }, // Mark Manson
  { at: HITS.sources[2], rect: [12, 667, 170, 52], radius: 14 }, // TEDx
  { at: HITS.nodes[0], rect: [173, 521, 32, 32], radius: 16 }, // the three, lit
  { at: HITS.nodes[1], rect: [130, 605, 32, 32], radius: 16 },
  { at: HITS.nodes[2], rect: [278, 701, 34, 34], radius: 17 },
];

/**
 * Painted out of the captures, each with the screen's own colour (kit
 * TOKENS, as the capture encodes it, so no seam): iOS's keyboard accessory
 * bar in Ask (the preview's round 9); in take S, the site's icon in the share
 * sheet's header and the favicon in Machina's card (the preview's round 6
 * precedent: "this logo next to Wait But Why is ugly"). S rects are measured
 * from the take.
 */
export const SCREEN_PATCHES = [
  { take: 'X', from: X.ask, to: X.graph + 1, rect: [0, 878, 440, 78], tone: 'capturePage' },
];

/** the frames the score ticks a key on (each typed step lands) */
export const TYPED = [...Array.from({ length: TYPED_FRAMES.length - 1 }, (_, j) => HITS.typeFrom + 2 * j), HITS.typed];

// ── the narrator ─────────────────────────────────────────────────────────

/** every line's delivery: a person talking to a friend (owner: never announcer-style) */
const TALK = 'Natural and conversational, like telling a friend about an app you love: light, easy and unforced. Not an announcer, not performed, no word stressed.';
/** every line's pace (owner: about 175 words a minute) */
const PACE = 'Everyday conversational speed, about 175 words a minute; short natural pauses at the commas, never drawn out, never rushed.';

/**
 * The narration, and on screen the same words. The first is the frame-0
 * cover (the kit HookTitle, its second row arriving on its word); the rest
 * sit in the house band, two rows, each row arriving as the voice reaches
 * it (`cues`: the word in `say` each row starts on), split where the voice
 * pauses. `say` is spoken (its takes are voiced: changing `say`, `style` or
 * `pace` re-voices it).
 */
export const CAPTIONS = [
  {
    at: 4,
    to: HITS.tap - 2,
    place: 'hook',
    cues: [0, 4],
    text: 'Saved it for later?\nLater never comes.',
    say: 'Saved it for later? Later never comes.',
    // (take 2: the first take dwelt on "later?", 3.3 syllables a second;
    // the owner's preview hook was re-voiced for exactly that)
    style: 'Natural and conversational, like gently teasing a friend about a habit you both have: wry, warm and light. The question quick and easy, then "Later never comes." as a knowing little punchline, never dramatic; no word drawn out or stressed.',
    pace: 'Everyday conversational speed, about 180 words a minute; only a brief natural beat after the question.',
    maxPause: 0.3,
  },
  {
    at: HITS.tap + 5,
    to: HITS.revisit - 4,
    cues: [0, 4],
    text: 'Share it to Machina,\nand it reads it for you.',
    say: 'Share it to Machina, and it reads it for you.',
    style: `${TALK} "and it reads it for you" an easy aside.`,
    pace: PACE,
    maxPause: 0.2,
  },
  {
    at: HITS.revisit + 3,
    to: HITS.askTap - 2,
    cues: [0, 4],
    text: 'It even tells you\nwhat to do with it.',
    say: 'It even tells you what to do with it.',
    // (take 2: the first ran 8 syllables a second, rushed)
    style: 'Natural and conversational, like pointing out a nice detail to a friend: warm and easy, a little pleased on "even"; relaxed and clear, never rushed or clipped.',
    pace: 'Relaxed conversational speed, about 160 words a minute; the whole line in one easy breath, every word given its room.',
    maxPause: 0.2,
  },
  {
    at: HITS.ask + 5,
    to: HITS.send - 6,
    cues: [0, 3],
    text: 'Ask about anything\nyou’ve saved.',
    say: 'Ask about anything you’ve saved.',
    style: 'Curious and inviting, conversational; an easy lift on "anything".',
    pace: PACE,
    maxPause: 0.2,
  },
  {
    at: HITS.answer + 5,
    to: HITS.graphTap - 2,
    cues: [0, 6],
    text: 'It answers from your own saves.\nSources included.',
    say: 'It answers from your own saves. Sources included.',
    style: 'Conversational and quietly confident; then, after a short beat, "Sources included." is a light, wry aside, not a slogan.',
    pace: PACE,
    maxPause: 0.3,
  },
  {
    at: HITS.graph + 5,
    to: SIGNATURE_AT - 4,
    cues: [0, 3],
    text: 'And it notices\nwhich saves belong together.',
    say: 'And it notices which saves belong together.',
    style: 'Natural and conversational, with a little warmth and wonder, like pointing out something clever a friend did; light and unforced, no word stressed.',
    pace: 'Everyday conversational speed, about 170 words a minute; easy, never drawn out; "together" landing softly, leaving space before the logo.',
    maxPause: 0.2,
  },
];

/** chords, warm, a step at each beat of the story */
export const CHORDS = [
  [BEATS.hook, 'Fmaj7'],
  [BEATS.share, 'G6'],
  [HITS.steps[1], 'Em7'],
  [BEATS.todo, 'Am7'],
  [BEATS.ask, 'Fmaj7'],
  [HITS.send, 'G6'],
  [BEATS.answer, 'Am7'],
  [HITS.sources[0], 'Fmaj7'],
  [BEATS.graph, 'G6'],
  [SIGNATURE_AT, 'Cmaj7'],
];
