/**
 * Meta ad 1, "What one save becomes": its single source of time (the SAVE
 * clip's clips/save-timeline.mjs is the template; the picture in
 * src/reels/ads/card/, the score in audio/ads/card-score.mjs, the narrator via
 * `audio/synth-vo.py adcard`, the gates in audio/ads/card-verify.mjs all read
 * this file).
 *
 * Round 5 (owner, 2026-10-03): about SAVES, not videos, and voiced like one
 * person talking to a friend. The script, as approved:
 *
 *   HOOK    four apps' save lists: "How many things did you save this month…
 *           and never open again? The article you promised yourself you'd
 *           read… the thread you bookmarked at 1 a.m… the screenshot you swore
 *           you'd remember."
 *   NAME    the lists gather into the mark: "That's exactly why we made Machina."
 *   SHARE   the article, the thread and the screenshot shared into the mark:
 *           "From any app, just share it to Machina."
 *   CARD    the article's card, opened, its Key Points lifted: "It reads what
 *           you save and pulls out the key points… so you'll always remember
 *           why you kept it."
 *   LINKS   its Related cards, then the graph: "It links each save to what
 *           you saved before… so you see how your ideas connect."
 *   REMIND  the bell, "Remind me", Save; tomorrow, the "Reminders due" strip:
 *           "Then pick a time, and Machina brings it back… so you actually get
 *           back to it."
 *   CLOSE   "Machina. Everything you save, finally useful."
 *
 * OUTPUT frames at 30fps on the reel's grid (112.5 BPM, 16 frames a beat):
 * taps, cuts and lifts land on 8ths; narrator lines start a breath (0.3s)
 * after the line before, so the voice runs like speech. The app is take
 * "adcard" (capture/shoot.mjs, capture/ad-card.mjs), its rolls captured at
 * 60fps and played one per output frame (the reel's half speed).
 */

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const BPM = 112.5;
export const BEAT_FRAMES = 16;
export const BAR_FRAMES = 64;
export const BEAT = BEAT_FRAMES / FPS;
export const BAR = BAR_FRAMES / FPS;

/** THE CUT: every scene reads these, and so does the score */
export const HITS = {
  // the hook: four save lists; on "never open again" each greys out; then the
  // camera visits the article, the thread, the screenshot (which slides in)
  lost: 80,
  article: 120,
  thread: 192,
  screenshot: 264,
  // "That's exactly why we made Machina.": the lists gather into one point,
  // the brackets snap, the name wipes in as it is said
  collapse: 328,
  dotLands: 344,
  bracketsClose: 352,
  // "From any app, just share it to Machina.": three shares, from three
  // places on the screen, each held a moment before its tap (round 7: slower)
  shareStarts: [400, 424, 448],
  shareTaps: [424, 448, 472],
  shareLands: [440, 464, 488],
  // the point drops to become the + button; the app irises open around it
  part: 496,
  toApp: 520,
  // the article lands at the top of the feed and is tapped open
  cardTap: 560,
  // one scroll down: its Key Points, lifted
  keyPoints: 632,
  // on down: its three Related cards, lifted as one block; then the graph
  related: 704,
  graphTap: 752,
  // a cut back to the card: its bell, "Remind me" (Smart review ringed and
  // held a second), down to Save; the app's confirmation, held
  back: 808,
  bellTap: 824,
  smart: 840,
  saveTap: 912,
  reminderSet: 920,
  // tomorrow, 9:00 AM: the feed's "Reminders due" strip
  due: 952,
  dueLift: 976,
  // the close
  throw: 1024,
  lockup: 1040,
  markStrike: 1064,
};

/**
 * The share-sheet slot: the span a real iPhone screen recording of the share
 * (Share → Machina) could replace one day. Today it is the kit's brand share
 * gesture (Share.tsx), never rebuilt iOS UI.
 */
export const SHARE_SLOT = [HITS.shareStarts[0], HITS.shareLands[2]];

/**
 * The push slot: the reminder arriving as a lock-screen push ("Time to
 * revisit") is native iOS and cannot be captured from the web build; the ad
 * shows the in-app delivery (the feed's "Reminders due" strip).
 */
export const PUSH_SLOT = [HITS.due, HITS.throw];

/** the card's read-down (the app's scroll, captured in 3pt steps): [from, to, target] */
export const SCROLLS = [
  [592, 632, 'keyPoints'],
  [664, 704, 'related'],
];

export const THROW_LEN = 30;
export const TOTAL_FRAMES = 1198; // the tagline holds 1.6s after the voice ends
export const TOTAL_SEC = TOTAL_FRAMES / FPS;

/**
 * The narrator = the captions. Each entry is ONE spoken line (one take of the
 * voice); `|` splits it into the on-screen chunks (at most 8 words each,
 * a kicker included), each shown from its first spoken word until the next
 * chunk begins; `\n` breaks a chunk's rows. `say` respells for the voice only
 * (same words). `at` is the frame the voice starts, `to` the frame the last
 * chunk leaves (0.3–1.2s after the voice; up to 4s with `until`). `poster`:
 * the first chunk is already set on frame 0. `place: 'voice'`: said, never
 * drawn (round 7). NO em dashes, no literal "AI",
 * no "second brain", no "library", no "talk".
 */
const LINES = [
  { at: 8, to: 116, text: 'How many things did you\nsave this month | and never open again?', say: 'How many things did you save this month… and never open again?', poster: true },
  { at: 116, to: 192, text: "The article you promised\nyourself you'd read", say: "The article you promised yourself you'd read…" },
  { at: 192, to: 264, text: 'the thread you\nbookmarked at midnight', say: 'the thread you bookmarked at midnight…' },
  { at: 264, to: 332, text: "the screenshot you\nswore you'd remember." },
  // (round 7, owner: said, not shown; the drawn MACHINA is the name on screen)
  { at: 332, to: 401, text: "That's exactly why\nwe made Machina.", place: 'voice' },
  { at: 401, to: 504, text: 'From any app, just\nshare it to Machina.', until: 'the last share lands in the mark' },
  { at: 504, to: 672, text: "It reads what you save | and pulls out\nthe key points | so you'll always remember\nwhy you kept it.", say: "It reads what you save and pulls out the key points… so you'll always remember why you kept it.", until: 'the Key Points lift', duck: 0.45 },
  { at: 672, to: 816, text: 'It links each save | to what you saved before | so you see how\nyour ideas connect.', say: 'It links each save to what you saved before… so you see how your ideas connect.', until: 'the graph opens on its ties', duck: 0.45 },
  { at: 816, to: 948, text: 'Then pick a time, | and Machina brings it back', say: 'Then pick a time, and Machina brings it back…', until: 'the reminder is set and confirmed' },
  { at: 960, to: 1024, text: 'so you actually\nget back to it.', kicker: 'Tomorrow', kickerChunk: 0, until: 'the Reminders due strip lifts' },
  // the close, on the lockup: the name (the drawn wordmark wipes in as it is
  // said), then the tagline, exactly as written (owner call 2026-09-28)
  { at: HITS.markStrike, to: TOTAL_FRAMES, place: 'lockup', text: 'Machina.\nEverything you save, finally useful.', duck: 0.4 },
];
const plain = (t) => t.replace(/\s*\|\s*/g, ' ').split(/\s+/).filter(Boolean).join(' ');
// (round 6, owner: no ellipsis on screen; the narrator keeps its pauses in `say`)
export const CAPTIONS = LINES.map((c) => ({ ...c, say: plain(c.say ?? c.text) }));

/**
 * THE SCORE's map (audio/ads/card-score.mjs), one chord per bar (19 bars):
 * the hook hangs on IV and leans on V, the name resolves to I, the card walks
 * I V IV I, the reminder home, and the lockup on I.
 */
export const BAR_CHORDS = [
  'Fmaj7', 'Fmaj7', 'G6', 'Fmaj7', 'G6', 'Cmaj7',
  'G6', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'G6',
  'Fmaj7', 'G6', 'Cmaj7', 'Cmaj7', 'Cmaj7', 'Cmaj7', 'Cmaj7',
];
/** the drums: in with the app, out for the lockup */
export const DRUMS = [8 * BAR_FRAMES, HITS.lockup];
/** risers END on the reveal they lead into: the mark, the app, the strike */
export const RISERS = [
  [HITS.dotLands - 32, HITS.dotLands],
  [HITS.part, HITS.toApp + 8],
  [HITS.lockup - 8, HITS.markStrike],
];
