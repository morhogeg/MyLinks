/**
 * SAVE, the feature clip: its single source of time (reel-timeline.mjs is the
 * template; the picture in src/reels/clips/save/, the score in
 * audio/clips/save-score.mjs, the narrator via `audio/synth-vo.py save` and
 * `npm run verify` all read this file).
 *
 * One feature, for someone seeing it for the first time, in about a minute
 * (owner, 2026-09-29: saving is a CORE feature, show what every kind of save
 * becomes; the clip may run longer):
 *
 *   HOOK         your saves, in every app's own save list (Watch later, Saved,
 *                Bookmarks, Reading List, Screenshots), never found again;
 *                they collapse into one point, the Machina mark, and the name
 *   ANY APP      shares from YouTube, Instagram, X, Facebook and Safari fly into it
 *   YOUTUBE      a video's card opens on its Key moments, with timestamps
 *   X            a long-form X Article, back as its Key Points
 *   INSTAGRAM    a photo post, read from its caption AND its photo
 *   ARTICLES     an essay's Key Points and its "Do this"
 *   NOTES        a typed note kept verbatim, summarized on request
 *   SCREENSHOTS  the real Add dialog: three screens of one recipe post, picked
 *                in the Image tab, saved as ONE card
 *   KEY POINTS   the feed's own "Reading 3 screenshots…" card, the card it
 *                becomes, opened: the screenshots, the gist, the Key Points
 *   TAGS & LINKS read on down: the "Do this", its tags, its Related cards
 *   CLOSE        thrown into the lockup: "Machina. Everything you save, finally useful."
 *
 * Everything is in OUTPUT frames at 30fps on the reel's grid (112.5 BPM, 16
 * frames a beat). The app is takes "sources" and "saveclip" (capture/shoot.mjs), recorded at
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
  // any app (Shares.tsx): five shares, a beat apart, each tapped and pulled
  // into the mark
  shareStarts: [192, 208, 224, 240, 256],
  shareTaps: [208, 224, 240, 256, 272],
  shareLands: [224, 240, 256, 272, 288],
  // the point drops to become the + button; the app irises open around it
  part: 304,
  toApp: 336,
  // the source tour (Sources.tsx, take "sources"): each save lands at the top
  // of the feed and is tapped open (SOURCES below has the beats)
  srcTaps: [392, 552, 712, 872, 1032],
  moments: [440, 448, 456, 464], // the YouTube card's Key moments, one by one
  xPoints: 608, // the X Article's Key Points
  photo: 760, // the Instagram post's photo
  articleDo: 968, // the article's "Do this"
  summarizeTap: 1088, // the note: "Summarize with Machina"
  noteRead: 1120, // …and Machina's read opens under the untouched note
  // screenshots (App.tsx, take "saveclip"): cut to the feed, + tapped
  shots: 1232,
  plusTap: 1256,
  dialog: 1264,
  imageTap: 1296,
  pick: 1328,
  saveTap: 1368,
  // key points: the feed's working card, the card it becomes, opened
  reading: 1392,
  cardDone: 1432,
  cardTap: 1480,
  keyPoints: 1568,
  // tags & links: read down to the "Do this"; as the scroll settles the tags
  // lift, then the Related cards
  tags: 1640,
  related: [1648, 1664],
  // the close: thrown into the lockup; the tagline starts as the mark strikes
  throw: 1696,
  lockup: 1712,
  markStrike: 1752,
};

/**
 * The source tour, beat by beat (Sources.tsx): the card lands (r 0–35), is
 * tapped open (touch at r 40, the app's own open), then read (see Sources.tsx
 * for each card's read-down and lift). The tour cuts on the beat from each
 * card's detail to the next landing.
 */
export const SOURCES = [
  { key: 'youtube', at: 352, len: 160 },
  { key: 'x', at: 512, len: 160 },
  { key: 'instagram', at: 672, len: 160 },
  { key: 'article', at: 832, len: 160 },
  { key: 'note', at: 992, len: 240 },
];

export const THROW_LEN = 30;
export const TOTAL_FRAMES = 1880; // the tagline holds 1.2s after its last word
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
  [HITS.keyPoints + 24, HITS.tags, 'end'],
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
  // the hook: the problem, over each app's own save list (owner, 2026-09-30:
  // the opening must say it plainly, saves scattered across apps, lost)
  { at: 16, to: 152, text: 'Your saves are scattered across\ncountless apps, and impossible to find.', sizes: [54, 54] },
  // the name, and the first thing it does
  { at: 176, to: 296, kicker: 'Any app', text: 'Machina saves from any app.\nNo copying, no pasting.', until: 'the fifth share lands in the mark' },
  // the source tour (owner, 2026-09-29: show what each kind of save becomes)
  { at: 368, to: 504, kicker: 'YouTube', text: 'Share a YouTube video. Get its\nkey moments, with timestamps.', until: 'the four Key moments lift' },
  { at: 528, to: 664, kicker: 'X', text: 'A long read on X, boiled down\nto the points that matter.', until: 'its Key Points lift' },
  { at: 688, to: 824, kicker: 'Instagram & Facebook', text: 'Instagram and Facebook posts,\nsaved and summarized too.', until: 'the post lifts over its summary' },
  { at: 848, to: 984, kicker: 'Articles', text: 'An article becomes\na summary you can act on.', until: 'its "Do this" lifts' },
  { at: 1008, to: 1224, kicker: 'Notes', text: 'Your notes stay as you wrote them.\nSummarize them when you want.', until: "Machina's read opens under the note" },
  // screenshots, then the card they become, read down
  { at: 1264, to: 1400, kicker: 'Screenshots', text: 'Even screenshots get analyzed.\nUp to five become one card.', until: 'the screens are picked and saved' },
  { at: 1408, to: 1576, kicker: 'Key points', text: 'It reads the text in them and\npulls out the key points.', until: 'the card opens on its Key Points' },
  { at: 1584, to: 1696, kicker: 'Tags & links', text: 'Then it tags it, and links it to\nwhat you already saved.', until: 'the Related cards lift' },
  // the close, on the lockup: the name (the drawn wordmark wipes in as it is
  // said), then the tagline, exactly as written (owner call 2026-09-28: every
  // launch film ends on it; it appears nowhere earlier in this clip)
  { at: HITS.markStrike + 8, to: TOTAL_FRAMES, place: 'lockup', text: 'Machina.\nEverything you save,\nfinally useful.', duck: 0.4 },
];

/** the element words above the lines: 4 frames before each, leaving with it
 *  (spaces are non-breaking: the kit's Kicker sets each letter as its own
 *  inline block, where a plain space collapses: "ANYAPP") */
const KICKER_LEAD = 4;
export const KICKERS = CAPTIONS.filter((c) => c.kicker).map((c) => ({ at: c.at - KICKER_LEAD, to: c.to, text: c.kicker }));

/**
 * THE SCORE's map (audio/clips/save-score.mjs), one chord per bar (30 bars):
 * the hook hangs on IV, the mark resolves to I, the source tour turns
 * I V IV I under each pair of cards, the screenshots lean on V, home under
 * the card, and IV → I into the lockup.
 */
export const BAR_CHORDS = [
  'Fmaj7', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7',
  // the source tour (bars 5–18)
  'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'Fmaj7', 'G6',
  // screenshots → the card → the lockup (bars 19–29)
  'Cmaj7', 'G6', 'Cmaj7', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'G6', 'Cmaj7', 'Cmaj7', 'Cmaj7',
];
/** the drums: in with the source tour (bar 6), out for the lockup */
export const DRUMS = [6 * BAR_FRAMES, HITS.lockup];
/** risers END on the reveal they lead into: the mark, the app, the strike */
export const RISERS = [
  [HITS.collapse - 32, HITS.dotLands],
  [HITS.part, HITS.toApp + 16],
  [HITS.lockup - 16, HITS.markStrike],
];
