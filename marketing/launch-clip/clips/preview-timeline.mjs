/**
 * THE APP STORE PREVIEW (2026-10-28/29, round 3): the single source of
 * truth for time. Picture (src/reels/clips/preview/), score
 * (audio/preview-score.mjs) and audio/house-verify.mjs read this file.
 *
 * Apple's rules shape it (developer.apple.com/app-store/app-previews and the
 * App Store Connect preview specifications): every frame of the app is a
 * screen recording of the REAL app (the iOS Simulator, iPhone 17 Pro Max, a
 * build of main, the review account's real saves), 15 to 30 seconds, 30fps,
 * delivered at 886 × 1920; captions and touch marks may sit over it; nothing
 * may imply a feature the app lacks; no prices. It autoplays MUTED: the
 * captions carry the story alone.
 *
 * ONE SAVE, START TO USEFUL. A Mark Manson video goes in through the + sheet
 * and the app builds its card LIVE (fetch, read, summary, connections: the
 * real phases, the waits cut out); the card opens on its timestamped key
 * moments and its Do this step; Ask answers a question from it, on one
 * screen with its source; the card's graph lights what it connects to.
 * Then the Signature (round 3, owner: no footer).
 *
 * The screen is a slab on the paper, and a CAMERA glides over it on a
 * smooth path through its keys (push-ins on whatever the caption names).
 * The pixels are never altered: the camera only frames them.
 *
 * Round 3 smoothness (owner: "jitter"): no scroll footage (the simulator's
 * web view scrolls at ~15fps), motion-blurred 60 → 30fps, crossfaded joins,
 * and a camera path with no stops or snaps (capture/preview-cut.py says how).
 * Retimes, all of real footage: the waits while the card builds and the
 * answer is written are cut; the typing's 60fps character steps are each
 * shown two frames.
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

/** 25.3s */
export const TOTAL_FRAMES = 759;
export const TOTAL_SEC = TOTAL_FRAMES / FPS;
export const SIGNATURE_AT = TOTAL_FRAMES - SIGNATURE.frames;

/** the three clips (capture/preview-cut.py, cuts.json) on the output clock */
export const CLIPS = {
  save: { at: 0, frames: 305, file: 'clips/preview/save.mp4' },
  ask: { at: 295, frames: 177, file: 'clips/preview/ask.mp4' },
  graph: { at: 462, frames: 159, file: 'clips/preview/graph.mp4' },
};
/** the dissolve between clips */
export const DISSOLVE = 10;

/** the screen (simulator points) and its slab at rest: 2.1px a point, its
 *  top under the caption band, its foot (the home bar) off the frame */
export const SCREEN = { w: 440, h: 956 };
export const SLAB = { k: 2.1, top: 440 };

/** picture events, output frames (from cuts.json's segment starts) */
export const HITS = {
  saveTap: 14,
  fetch: 35,
  feed: 54,
  landed: 118,
  cardTap: 159,
  moments: 168,
  whip: 238,
  doThis: 242,
  ask: CLIPS.ask.at,
  typeFrom: CLIPS.ask.at + 29,
  typed: CLIPS.ask.at + 55,
  send: CLIPS.ask.at + 61,
  answer: CLIPS.ask.at + 76,
  graph: CLIPS.graph.at,
  graphBuilt: CLIPS.graph.at + 81,
};

/**
 * The camera, one track per clip (a dissolve crossfades two framings, never
 * jumps one): [frame, cx, cy, z]. (cx, cy) is the screen point held at the
 * frame's focus (x 540, the slab's resting centre); z multiplies the resting
 * scale. The path runs smoothly THROUGH the keys (a monotone cubic: no
 * overshoot, no stop at a key unless the key holds). Zoom is capped by what
 * is on screen: a full-width screen's text spans 16 to 424 points, so past
 * z 1.2 (a 30px margin) the camera would crop words.
 */
export const CAMERA = {
  save: [
    [0, 220, 470, 1.2], // the sheet, whole, the link in it
    [48, 220, 470, 1.27], // a slow push through "Fetching the video..."
    [88, 220, 540, 1.22], // the sheet hands over: the new card, its progress
    [117, 220, 560, 1.25], // the card lands
    [155, 220, 560, 1.27],
    [179, 220, 410, 1.22], // open: the key moments
    [227, 220, 400, 1.26],
    [251, 220, 590, 1.2], // the whip down to Do this
    [306, 220, 612, 1.27],
  ],
  ask: [
    [296, 220, 690, 1.16],
    [351, 220, 760, 1.26], // the question typed
    [384, 220, 330, 1.22], // up with it: sent, then the answer and its source
    [473, 220, 345, 1.2],
  ],
  graph: [
    [463, 220, 420, 1.14],
    [506, 215, 380, 1.24], // the graph builds around the card
    [622, 205, 345, 1.3],
  ],
};

/** the whip that joins the key moments to Do this (frames of vertical blur, either side) */
export const WHIP = { at: HITS.whip, half: 6 };

/** taps, drawn where the take really tapped (screen points) */
export const TAPS = [
  { at: HITS.saveTap, x: 220, y: 621, tone: 'light' },
  { at: HITS.cardTap, x: 220, y: 394 },
  { at: HITS.send - 9, x: 400, y: 824, tone: 'light' },
];

/** rings off what a caption names (screen points: x, y, w, h, radius) */
export const PINGS = [
  { at: 191, rect: [19, 274, 402, 255], radius: 18 }, // the key moments
  { at: 260, rect: [12, 560, 416, 74], radius: 14 }, // Do this
  { at: HITS.answer + 26, rect: [13, 350, 374, 68], radius: 14 }, // the source: Mark Manson, the new card
];

/** the frames the score ticks a key on (each typed character lands) */
export const TYPED = Array.from({ length: 14 }, (_, k) => HITS.typeFrom + 2 * k);

/** the narrator's pace: unhurried and clear (an App Store preview, not a social ad) */
const PACE = 'Clear and unhurried, about 155 words a minute; natural, short pauses, never rushed.';

/**
 * The narration, a line for every beat, and on screen the same idea (the
 * preview autoplays muted: the captions carry it alone; the voice is for
 * whoever taps for sound). The first is the frame-0 cover, set big; the rest
 * sit in the house band, two lines at most. `say` is spoken, `text` is set;
 * `cues` are the word (in `say`) each line arrives on. Ask's caption leaves
 * before the question is sent, so the question and its answer have the band.
 * "Every answer comes straight from your saves." is the launch film's line.
 */
export const CAPTIONS = [
  { at: 6, to: 100, place: 'hook', cues: [], text: 'Save anything,\nfrom any app.', say: 'Save anything, from any app.', style: 'Bright and confident, an easy invitation; a small lift on "anything", "from any app" landing relaxed.', pace: PACE },
  { at: 118, to: 222, cues: [0, 3], text: 'Every save, analyzed\nand summarized.', say: 'Every save, analyzed and summarized.', style: 'Assured and warm, like showing a friend something that simply works; even weight on "analyzed" and "summarized".', pace: PACE },
  { at: 238, to: 330, cues: [0, 4], text: 'Jump to the moments\nthat matter.', say: 'Jump straight to the moments that matter.', style: 'Light and quick with a small smile; "the moments that matter" landing clean.', pace: PACE },
  { at: 346, to: 432, cues: [0, 4], text: 'Turn what you save\ninto what you do.', say: 'Turn what you save into what you do.', style: 'Warm, a neat turn of phrase; a gentle stress on "save" and on "do".', pace: PACE },
  { at: 448, to: 520, cues: [0, 3], text: 'Ask about anything\nyou saved.', say: 'Ask about anything you\u2019ve saved.', style: 'Curious and inviting; an easy lift on "anything".', pace: PACE },
  { at: 535, to: 624, cues: [0, 4], text: 'Answers straight\nfrom your saves.', say: 'Every answer comes straight from your saves.', style: 'Reassuring and clear; "straight from your saves" with quiet confidence.', pace: PACE },
  { at: 640, to: 728, cues: [0, 2], text: 'Every save,\nconnected.', say: 'Every save, connected.', style: 'Calm, with a little wonder, slowing slightly; "connected" landing softly, leaving space before the logo.', pace: PACE },
];

/** chords, warm, a step up at each act */
export const CHORDS = [
  [0, 'Fmaj7'],
  [beat(7), 'Cmaj7'],
  [beat(11), 'Am7'],
  [beat(19), 'Fmaj7'],
  [beat(25), 'G6'],
  [beat(30), 'Am7'],
  [beat(36), 'G6'],
  [SIGNATURE_AT, 'Cmaj7'],
];
