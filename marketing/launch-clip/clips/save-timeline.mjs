/**
 * SAVE, the feature clip: its single source of time (reel-timeline.mjs is the
 * template; the picture in src/reels/clips/save/, the score in
 * audio/clips/save-score.mjs, the narrator via `audio/synth-vo.py save` and
 * `npm run verify` all read this file).
 *
 * One feature, for someone seeing it for the first time, in about 30 seconds:
 *
 *   HOOK         great finds get lost in tabs, screenshots and bookmarks; they
 *                collapse into one point, the Machina mark, and the name
 *   ANY APP      saves shared from YouTube, Instagram and Safari fly into it
 *   SCREENSHOTS  the real Add dialog: three screens of one recipe post, picked
 *                in the Image tab, saved as ONE card
 *   KEY POINTS   the feed's own "Reading 3 screenshots…" card, the card it
 *                becomes, opened: the screenshots, the gist, the Key Points
 *   TAGS & LINKS read on down: the "Do this", its tags, its Related cards
 *   CLOSE        thrown into the lockup: "Save it once. Machina does the rest."
 *
 * Everything is in OUTPUT frames at 30fps on the reel's grid (112.5 BPM, 16
 * frames a beat). The app is take "saveclip" (capture/shoot.mjs), recorded at
 * 60fps and played one captured frame per output frame: the app moves at half
 * speed, the reel's steady pace (K = 2).
 */

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const BPM = 112.5;
export const BEAT_FRAMES = 16;
export const BAR_FRAMES = 64;
export const BEAT = BEAT_FRAMES / FPS;
export const BAR = BAR_FRAMES / FPS;

/** the nearest beat */
export const onBeat = (f) => Math.round(f / BEAT_FRAMES) * BEAT_FRAMES;

/**
 * THE CUT. Taps, landings and phases on beats (a few on 8ths); every scene
 * reads these numbers, and so does the score, so picture and sound move
 * together.
 */
export const HITS = {
  // the hook (Hook.tsx): the saves collapse into one point, the brackets
  // snap around it
  collapse: 136,
  dotLands: 152,
  bracketsClose: 160,
  // any app (Shares.tsx): each share arrives, its Share button is tapped, it
  // lands in the mark
  shareStarts: [192, 224, 256],
  shareTaps: [208, 240, 272],
  shareLands: [224, 256, 288],
  // the point drops to become the + button; the app irises open around it
  part: 304,
  toApp: 336,
  plusTap: 360,
  dialog: 368,
  // screenshots (App.tsx): the Image tab, three screens picked, Save
  imageTap: 400,
  pick: 432,
  saveTap: 472,
  // key points: the feed's working card, the card it becomes, opened
  reading: 496,
  cardDone: 536,
  cardTap: 584,
  keyPoints: 672,
  // tags & links: read down to the "Do this", the tags and the Related cards
  related: [752, 768],
  // the close: thrown into the lockup; the takeaway starts as the mark strikes
  throw: 800,
  lockup: 816,
  markStrike: 856,
};

export const THROW_LEN = 30;
export const TOTAL_FRAMES = 960;
export const TOTAL_SEC = TOTAL_FRAMES / FPS;

/**
 * The app's take, frame by frame: which capture frame each stretch of the cut
 * plays (App.tsx). `n` frames from the mark, one per output frame.
 */
export const PLAY = {
  dialogOpen: { at: HITS.dialog, n: 20 },
  modeImage: { at: HITS.imageTap, n: 24 },
  picked: { at: HITS.pick, n: 24 },
  saving: { at: HITS.saveTap, n: HITS.reading - HITS.saveTap },
  reading: { at: HITS.reading, n: HITS.cardDone - HITS.reading },
  done: { at: HITS.cardDone, n: 48 },
  detail: { at: HITS.cardTap, n: 40 },
};

/** the read-down of the opened card (the app's scroll, captured in 5pt steps):
 *  to the Key Points, then on to the tags and the Related cards */
export const SCROLLS = [
  [HITS.cardTap + 40, HITS.keyPoints - 4, 'keyPoints'],
  [HITS.keyPoints + 24, HITS.related[0] - 8, 'end'],
];

/**
 * The narrator = the captions, line for line (the reel's voice: Kokoro
 * `af_heart` 0.95, "Machina" spoken "Makeena"). `at` is the frame the voice
 * starts (on a beat), `to` the frame the line leaves: 0.3–1.2s after the voice,
 * or up to 4s with `until` while the action it names still plays (verify).
 * `kicker` names the element the line is about. NO em dashes, no literal
 * "AI", no "second brain", no "library".
 */
export const CAPTIONS = [
  // the hook: the problem, over the saves where they were kept
  { at: 16, to: 152, text: 'Great finds get lost in open tabs,\nscreenshots and bookmarks.' },
  // the name, and the first thing it does
  { at: 176, to: 296, kicker: 'Any\u00a0app', text: 'Machina saves them straight from\nthe share sheet, in any app.', until: 'the third share lands in the mark' },
  { at: 384, to: 488, kicker: 'Screenshots', text: 'Screenshots too. Up to five\nbecome one card.', until: 'the screens are picked and saved' },
  { at: 496, to: 680, kicker: 'Key\u00a0points', text: 'It reads the text in them and\npulls out the key points.', until: 'the card opens on its Key Points' },
  { at: 688, to: 800, kicker: 'Tags\u00a0&\u00a0links', text: 'Then it tags it, and links it to\nwhat you already saved.', until: 'the Related cards lift' },
  // the close, on the lockup: the takeaway, and the name that ties it together
  { at: HITS.markStrike + 8, to: TOTAL_FRAMES, place: 'lockup', text: 'Save it once.\nMachina does the rest.', duck: 0.4 },
];

/** the element words above the lines: 4 frames before each, leaving with it
 *  (spaces are non-breaking: the kit's Kicker sets each letter as its own
 *  inline block, where a plain space collapses: "ANYAPP") */
const KICKER_LEAD = 4;
export const KICKERS = CAPTIONS.filter((c) => c.kicker).map((c) => ({ at: c.at - KICKER_LEAD, to: c.to, text: c.kicker }));

/**
 * THE SCORE's map (audio/clips/save-score.mjs), one chord per bar (15 bars):
 * the hook hangs on IV, the mark resolves to I, the app leans on V, home
 * under the card, and IV → I into the lockup.
 */
export const BAR_CHORDS = ['Fmaj7', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'G6', 'Cmaj7', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'G6', 'Cmaj7', 'Cmaj7'];
/** the drums: in on the downbeat after the Add dialog opens (bar 6, the
 *  screenshots line), out for the lockup */
export const DRUMS = [6 * BAR_FRAMES, HITS.lockup];
/** risers END on the reveal they lead into: the mark, the app, the strike */
export const RISERS = [
  [HITS.collapse - 32, HITS.dotLands],
  [HITS.part, HITS.toApp + 16],
  [HITS.lockup - 16, HITS.markStrike],
];
