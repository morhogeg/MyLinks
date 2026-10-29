/**
 * THE APP STORE PREVIEW (2026-10-28/29, round 4): the single source of
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
 * caption says what its narrated line says, word for word.
 *
 * SEVEN BEATS, ONE IDEA EACH (round 4, owner: "the pacing is off"), each
 * 3 to 4 seconds on the 120 BPM grid, each with one narrated line:
 *   1 Save        a Mark Manson video pasted into Add to Machina, Save
 *   2 Summary     the card built LIVE (the real phases, the waits cut out)
 *   3 Moments     the card opened on its five timestamped key moments
 *   4 Do          Revisit's Do this list: saves turned into tasks
 *   5 Ask         a question typed
 *   6 Answer      the answer and the save it came from, on one screen
 *   7 Connected   the new card's graph, settled, lit to what it relates to
 * then the kit's Signature (no footer: owner, round 3).
 *
 * The screen is a slab on the paper under a CAMERA: one slow move per beat,
 * on a smooth path through its keys (push-ins on whatever the line names).
 * The pixels are never altered: the camera only frames them.
 *
 * Retimes, all of real footage (capture/preview-cut.py): the waits while the
 * card builds and the answer is written are cut; the typing's 60fps
 * character steps are each shown two frames; "Searching your library..." is
 * cut (brand ban).
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

/** 57 beats: 28.5s, under Apple's 30 */
export const TOTAL_FRAMES = beat(57);
export const TOTAL_SEC = TOTAL_FRAMES / FPS;
export const SIGNATURE_AT = TOTAL_FRAMES - SIGNATURE.frames;

/** where each beat starts (output frames, on the beat) */
export const BEATS = {
  save: 0,
  summary: beat(7),
  moments: beat(15),
  todo: beat(21),
  ask: beat(27),
  answer: beat(32),
  graph: beat(39),
  signature: SIGNATURE_AT,
};

/** the clips (capture/preview-cut.py, cuts.json) on the output clock; each
 *  runs on under the next one's dissolve */
export const CLIPS = {
  save: { at: BEATS.save, frames: 326, file: 'clips/preview/save.mp4' },
  revisit: { at: BEATS.todo, frames: 100, file: 'clips/preview/revisit.mp4', dissolve: true },
  askType: { at: BEATS.ask, frames: 75, file: 'clips/preview/askType.mp4', dissolve: true },
  askAnswer: { at: BEATS.answer, frames: 115, file: 'clips/preview/askAnswer.mp4', dissolve: false },
  graph: { at: BEATS.graph, frames: 132, file: 'clips/preview/graph.mp4', dissolve: true },
};
/** a dissolve's length */
export const DISSOLVE = 10;

/** the screen (simulator points) and its slab at rest: 2.1px a point, its
 *  top under the caption band */
export const SCREEN = { w: 440, h: 956 };
export const SLAB = { k: 2.1, top: 440 };

/** picture events, output frames (from cuts.json's segment starts) */
export const HITS = {
  plusTap: 25,
  sheetUp: 30,
  link: 54,
  saveTap: 91,
  sheetClose: 144,
  landed: 192,
  cardTap: 240,
  opened: 256,
  typeFrom: BEATS.ask + 30,
  typed: BEATS.ask + 56,
  send: BEATS.ask + 67,
  answer: BEATS.answer + 20,
};

/**
 * The camera, one track per clip (a dissolve crossfades two framings, never
 * jumps one): [frame, cx, cy, z]. (cx, cy) is the screen point held at the
 * frame's focus (x 540, the slab's resting centre); z multiplies the resting
 * scale. The path runs smoothly through the keys (a monotone cubic: no stop,
 * no overshoot), one slow move a beat. Zoom is capped by what is on screen:
 * a full-width screen's text spans 16 to 424 points, so past z 1.2 the
 * camera would crop words; the graph, narrower, can take more.
 */
export const CAMERA = {
  save: [
    [0, 220, 478, 0.95], // the whole screen, + in view
    [24, 220, 478, 0.95],
    [56, 220, 455, 1.02], // the sheet rises: onto it
    [104, 220, 452, 1.08],
    [150, 220, 440, 1.0], // it hands over to the feed: the new card and its progress
    [200, 220, 400, 1.08], // the card lands
    [238, 220, 382, 1.1],
    [262, 220, 400, 1.17], // opened: its key moments
    [326, 220, 400, 1.2],
  ],
  revisit: [
    // the reminder above the list stays under the band's solid paper
    [BEATS.todo, 220, 712, 1.15],
    [BEATS.todo + 100, 220, 700, 1.2],
  ],
  askType: [
    [BEATS.ask, 220, 560, 1.08],
    [BEATS.ask + 30, 220, 600, 1.12],
    [BEATS.ask + 75, 220, 660, 1.2],
  ],
  askAnswer: [
    [BEATS.answer, 220, 330, 1.16],
    [BEATS.answer + 115, 220, 345, 1.2],
  ],
  graph: [
    // centred, so nothing below the graph is cropped at the sides; the
    // stats and cluster chips above it stay under the band's paper
    [BEATS.graph, 220, 620, 1.3],
    [BEATS.graph + 132, 220, 585, 1.45],
  ],
};

/** taps, drawn where the take really tapped (screen points) */
export const TAPS = [
  { at: HITS.plusTap, x: 220, y: 914, tone: 'light' },
  { at: HITS.saveTap, x: 220, y: 621, tone: 'light' },
  { at: HITS.cardTap, x: 200, y: 232 },
  { at: HITS.send, x: 400, y: 827, tone: 'light' },
];

/** rings off what a line names (screen points: x, y, w, h, radius) */
export const PINGS = [
  { at: HITS.opened + 6, rect: [16, 276, 408, 246], radius: 16 }, // the key moments
  { at: BEATS.todo + 22, rect: [16, 333, 408, 80], radius: 12 }, // Do this, one
  { at: BEATS.todo + 32, rect: [16, 418, 408, 78], radius: 12 }, // two
  { at: BEATS.todo + 42, rect: [16, 503, 408, 78], radius: 12 }, // three
  { at: HITS.answer + 16, rect: [12, 348, 374, 68], radius: 12 }, // the source: Mark Manson
  { at: BEATS.graph + 14, rect: [160, 396, 24, 24], radius: 12 }, // the new card, its links lit
];

/** the frames the score ticks a key on (each typed character lands) */
export const TYPED = [...Array.from({ length: 13 }, (_, k) => HITS.typeFrom + 2 * k), HITS.typed];

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
  { at: 8, to: 100, place: 'hook', cues: [], text: 'Save anything,\nfrom any app.', say: 'Save anything, from any app.', style: 'Bright and confident, an easy invitation; a small lift on "anything", "from any app" landing relaxed.', pace: PACE },
  { at: BEATS.summary + 7, to: BEATS.moments - 5, cues: [0, 3], text: 'Every save, analyzed\nand summarized.', say: 'Every save, analyzed and summarized.', style: 'Assured and warm, like showing a friend something that simply works; even weight on "analyzed" and "summarized".', pace: PACE },
  { at: BEATS.moments + 7, to: BEATS.todo - 5, cues: [0, 4], text: 'Jump straight to the\nmoments that matter.', say: 'Jump straight to the moments that matter.', style: 'Light and quick with a small smile; "the moments that matter" landing clean.', pace: PACE },
  { at: BEATS.todo + 7, to: BEATS.ask - 5, cues: [0, 4], text: 'Turn what you save\ninto what you do.', say: 'Turn what you save into what you do.', style: 'Warm, a neat turn of phrase; a gentle stress on "save" and on "do".', pace: PACE },
  { at: BEATS.ask + 7, to: BEATS.answer - 6, cues: [0, 3], text: 'Ask about anything\nyou’ve saved.', say: 'Ask about anything you’ve saved.', style: 'Curious and inviting; an easy lift on "anything".', pace: PACE },
  { at: BEATS.answer + 8, to: BEATS.graph - 5, cues: [0, 3], text: 'Every answer comes\nfrom your own sources.', say: 'Every answer comes from your own sources.', style: 'Reassuring and clear; "from your own sources" with quiet confidence, a small stress on "own".', pace: PACE },
  { at: BEATS.graph + 8, to: SIGNATURE_AT - 4, cues: [0, 2], text: 'Every save,\nconnected.', say: 'Every save, connected.', style: 'Calm, with a little wonder, slowing slightly; "connected" landing softly, leaving space before the logo.', pace: PACE },
];

/** chords, warm, a step at each beat */
export const CHORDS = [
  [BEATS.save, 'Fmaj7'],
  [BEATS.summary, 'Cmaj7'],
  [BEATS.moments, 'Am7'],
  [BEATS.todo, 'Fmaj7'],
  [BEATS.ask, 'Am7'],
  [BEATS.answer, 'Fmaj7'],
  [BEATS.graph, 'G6'],
  [SIGNATURE_AT, 'Cmaj7'],
];
