/**
 * THE APP STORE PREVIEW (2026-10-28/30, round 5): the single source of
 * truth for time. Picture (src/reels/clips/preview/), score
 * (audio/preview-score.mjs), narrator (audio/synth-vo.py preview) and
 * audio/house-verify.mjs read this file.
 *
 * Apple's rules shape it (developer.apple.com/app-store/app-previews and the
 * App Store Connect preview specifications): every frame of the app is a
 * screen recording of the REAL app (the iOS Simulator, iPhone 17 Pro Max, a
 * build of main, the review account's real saves), 15 to 30 seconds, 30fps,
 * delivered at 886 × 1920; captions and touch marks may sit over it; nothing
 * may imply a feature the app lacks; no prices. It autoplays MUTED, so each
 * caption says what its narrated line says.
 *
 * SIX BEATS, ONE IDEA AND ONE NARRATED LINE EACH (round 5, owner):
 *   1 Save       the feed (Kurzgesagt, TED: the opening is not one creator),
 *                + , a Wait But Why article's link pasted, Save
 *   2 Analyzed   the analysis stepper, the five beats every save goes
 *                through, then the new card on top of the feed, summarized
 *   3 Do         Revisit's Do this list, the new save's task on top
 *   4 Ask        a question typed: procrastination and phone addiction
 *   5 Answer     the answer citing three saves from three channels (Big
 *                Think, Mark Manson, TEDx), question to sources on one screen
 *   6 Connected  its Graph chip: the three cited cards, lit and linked
 * then the kit's Signature (no footer).
 *
 * The screen is a slab on the paper under a CAMERA: restrained moves on a
 * smooth path through its keys, never cropping a word. The pixels are never
 * altered: the camera only frames them.
 *
 * Retimes, all of real footage (capture/preview-cut.py says how): the waits
 * while the card is built and the answer is written are cut (the stepper's
 * five beats each shown as it advances); the typing's 60fps steps shown two
 * frames each; "Searching your library..." is cut (brand ban); the settled
 * graph is one held frame.
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

/** 27.6s, under Apple's 30: the clips back to back, then the Signature */
export const TOTAL_FRAMES = 828;
export const TOTAL_SEC = TOTAL_FRAMES / FPS;
export const SIGNATURE_AT = TOTAL_FRAMES - SIGNATURE.frames;

/** where each beat starts (output frames) */
export const BEATS = {
  save: 0,
  summary: 82,
  todo: 252,
  ask: 344,
  answer: 460,
  graph: 576,
  signature: SIGNATURE_AT,
};

/** the clips (capture/preview-cut.py, cuts.json) on the output clock; each
 *  runs on under the next one's dissolve (the answer cuts in hard) */
export const CLIPS = {
  save: { at: 0, frames: 262, file: 'clips/preview/save.mp4' },
  revisit: { at: BEATS.todo, frames: 102, file: 'clips/preview/revisit.mp4', dissolve: true },
  askType: { at: BEATS.ask, frames: 83, file: 'clips/preview/askType.mp4', dissolve: true },
  askAnswer: { at: 427, frames: 159, file: 'clips/preview/askAnswer.mp4', dissolve: false },
  graph: { at: BEATS.graph, frames: 116, file: 'clips/preview/graph.mp4', dissolve: true },
};
/** a dissolve's length */
export const DISSOLVE = 10;

/** the screen (simulator points) and its slab at rest: 2.1px a point, its
 *  top under the caption band */
export const SCREEN = { w: 440, h: 956 };
export const SLAB = { k: 2.1, top: 440 };

/** picture events, output frames (cuts.json's segment starts + the take's own timing) */
export const HITS = {
  plusTap: 24,
  link: 50,
  saveTap: 80,
  /** the stepper's beats: Reading the page, Writing the summary, Searching connections, all done */
  steps: [122, 140, 158, 177],
  done: 177,
  sheetClose: 197,
  landed: 206,
  typeFrom: BEATS.ask + 27,
  typed: BEATS.ask + 69,
  send: 427,
  answer: 460,
  graphTap: 566,
};

/**
 * The camera, one track per clip (a dissolve crossfades two framings, never
 * jumps one): [frame, cx, cy, z]. (cx, cy) is the screen point held at the
 * frame's focus (x 540, the slab's resting centre); z multiplies the resting
 * scale. The path runs smoothly through the keys (a monotone cubic: no stop,
 * no overshoot). Zoom is capped by what is on screen: a full-width screen's
 * text spans 16 to 424 points, so past z 1.26 the camera would crop words.
 */
export const CAMERA = {
  save: [
    [0, 220, 482, 0.95], // the whole phone, + in view
    [22, 220, 482, 0.95],
    [52, 220, 487, 1.18], // the sheet rises: onto it
    [84, 220, 487, 1.2],
    [120, 220, 505, 1.22], // the stepper
    [176, 220, 520, 1.26],
    [198, 220, 520, 1.26],
    [230, 220, 349, 1.22], // the sheet closes: up to the new card
    [262, 220, 345, 1.26],
  ],
  revisit: [
    // the reminder above the list stays under the band's paper
    [BEATS.todo, 220, 672, 1.22],
    [BEATS.todo + 102, 220, 662, 1.28],
  ],
  askType: [
    [BEATS.ask, 220, 560, 1.1],
    [BEATS.ask + 27, 220, 575, 1.13],
    [BEATS.ask + 83, 220, 640, 1.22], // down to the question as it is typed
  ],
  askAnswer: [
    // question to sources in one frame, its bottom edge above the ↓ button
    [427, 220, 395, 1.24],
    [586, 220, 405, 1.3],
  ],
  graph: [
    [BEATS.graph, 220, 620, 1.2],
    [BEATS.graph + 116, 232, 640, 1.34],
  ],
};

/**
 * The ONE pixel edit (round 6, owner: "this logo next to Wait But Why in this
 * screen is ugly, remove it"): the site's favicon in the stepper's host row
 * is painted out with the sheet's own white (kit TOKENS.captureWhite, the
 * 253 the capture encodes), so "waitbutwhy.com" sits in line with the step
 * labels below it. From the stepper's first frame (the icon has not loaded
 * yet) to the last frame before the sheet closes (it vanishes in one frame,
 * at 200). Screen points.
 */
export const PATCHES = [{ from: 86, to: 199, rect: [38, 438, 31, 31] }];

/** taps, drawn where the take really tapped (screen points); `at` is a few
 *  frames before the press, which lands at t 0.35 of the mark's 12 frames */
export const TAPS = [
  { at: HITS.plusTap - 4, x: 220, y: 914, tone: 'light' },
  { at: HITS.saveTap - 4, x: 220, y: 620, tone: 'light' },
  { at: HITS.send - 6, x: 400, y: 826, tone: 'light' },
  { at: HITS.graphTap - 4, x: 231, y: 692 },
];

/** rings off what a line names (screen points: x, y, w, h, radius) */
export const PINGS = [
  { at: HITS.landed + 6, rect: [16, 114, 408, 386], radius: 18 }, // the new card
  { at: BEATS.todo + 24, rect: [16, 330, 408, 78], radius: 12 }, // its task, on top of Do this
  { at: HITS.answer + 18, rect: [12, 530, 351, 50], radius: 14 }, // Big Think
  { at: HITS.answer + 28, rect: [12, 590, 374, 65], radius: 14 }, // Mark Manson
  { at: HITS.answer + 38, rect: [12, 666, 169, 51], radius: 14 }, // TEDx
  { at: BEATS.graph + 18, rect: [173, 521, 32, 32], radius: 16 }, // the three, lit
  { at: BEATS.graph + 28, rect: [130, 605, 32, 32], radius: 16 },
  { at: BEATS.graph + 38, rect: [278, 701, 34, 34], radius: 17 },
];

/** the frames the score ticks a key on (each typed step lands) */
export const TYPED = [...Array.from({ length: 21 }, (_, k) => HITS.typeFrom + 2 * k), HITS.typed];

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
  { at: 6, to: 86, place: 'hook', cues: [], text: 'Save anything,\nfrom any app.', say: 'Save anything, from any app.', style: 'Natural and conversational, like telling a friend about an app you love: light, easy and unforced. Not an announcer, not performed, no word stressed.', pace: 'Everyday conversational speed, about 180 words a minute; the whole line in one easy breath, the comma only the briefest beat.', maxPause: 0.12 },
  { at: 92, to: BEATS.todo - 6, cues: [0, 3], text: 'Every save, analyzed\nand summarized.', say: 'Every save, analyzed and summarized.', style: 'Assured and warm, like showing a friend something that simply works; even weight on "analyzed" and "summarized".', pace: PACE },
  { at: BEATS.todo + 8, to: BEATS.ask - 6, cues: [0, 4], text: 'Turn what you save\ninto what you do.', say: 'Turn what you save into what you do.', style: 'Warm, a neat turn of phrase; a gentle stress on "save" and on "do".', pace: PACE },
  { at: BEATS.ask + 8, to: HITS.send - 9, cues: [0, 3], text: 'Ask about anything\nyou’ve saved.', say: 'Ask about anything you’ve saved.', style: 'Curious and inviting; an easy lift on "anything".', pace: PACE },
  { at: HITS.answer + 8, to: BEATS.graph - 6, cues: [0, 3], text: 'Every answer comes\nfrom your own sources.', say: 'Every answer comes from your own sources.', style: 'Reassuring and clear; "from your own sources" with quiet confidence, a small stress on "own".', pace: PACE },
  { at: BEATS.graph + 8, to: SIGNATURE_AT - 4, cues: [0, 2], text: 'Every save,\nconnected.', say: 'Every save, connected.', style: 'Calm, with a little wonder, slowing slightly; "connected" landing softly, leaving space before the logo.', pace: PACE },
];

/** chords, warm, a step at each beat */
export const CHORDS = [
  [BEATS.save, 'Fmaj7'],
  [BEATS.summary, 'Cmaj7'],
  [HITS.landed, 'Am7'],
  [BEATS.todo, 'Fmaj7'],
  [BEATS.ask, 'Am7'],
  [HITS.answer, 'Fmaj7'],
  [BEATS.graph, 'G6'],
  [SIGNATURE_AT, 'Cmaj7'],
];
