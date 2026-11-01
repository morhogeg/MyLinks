/**
 * SAME SCREENSHOTS (F04, "before and after: your screenshots", 2026-11-01):
 * the single source of truth for time. Picture (src/reels/clips/shots/),
 * score (audio/shots-score.mjs), narrator (audio/synth-vo.py shots) and the
 * gates (audio/shots-verify.mjs, audio/house-verify.mjs) read this file.
 *
 * ONE IDEA: the same three screenshots, in two places. In the camera roll
 * they are a pile you scroll past and open with no idea why you took them;
 * shared to Machina, each one becomes a card that says what it is, and you
 * can find it again in your own words.
 *
 *   0:00  the hook (also the cover): two screens side by side, the camera
 *         roll whipping past on the left, Machina's three cards still on the
 *         right. "Same screenshots. Two very different places."
 *   0:02  BEFORE: the camera roll fills the frame and is flicked from top to
 *         bottom; three screenshots are opened, each with no context.
 *   0:07  AFTER: each of the three is shared, one share each (sharing
 *         several screenshots at once makes ONE card: G3, build 1325, so
 *         three cards honestly take three shares), pulled into the mark.
 *   0:10  the mark opens into the real app: the three cards, each with its
 *         summary.
 *   0:13  Find: "quote about overthinking", typed; the one card it means
 *         lands, though it shares no word with it.
 *   0:15  the kit's Signature (house rule), footer `ENDINGS`.
 *
 * The camera roll and the opened screenshots are schematic (type, line icons,
 * paper tints: house rule "never a blank placeholder"); the three screenshots
 * are rendered ONCE (`MachinaShotsStill`) and the same PNGs are both the
 * camera roll's tiles and the images the app's cards show. Every pixel of
 * Machina is the shipped app, captured (capture/shoot.mjs `shotsClip`).
 * No recipe or cooking content (owner, 2026-10-02): the brief's recipe is a
 * Lisbon viewpoint here.
 *
 * Written in OUTPUT frames on a 120 BPM grid (15 frames a beat). The cut is
 * timed to the narrator's measured takes (src/reels/clips/shots/shots-vo.json).
 */

import { SIGNATURE } from '../src/reels/kit/signature.mjs';

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export const BEAT_FRAMES = 15;
export const BPM = (60 * FPS) / BEAT_FRAMES; // 120
export const BAR_FRAMES = BEAT_FRAMES * 4;
export const BEAT = BEAT_FRAMES / FPS;

/** Beat (quarter note, may be fractional) → frame. */
export const beat = (n) => Math.round(n * BEAT_FRAMES);

/** 43 beats, 21.5s: 33 beats of story, then the shared ending. (Round 2:
 *  the voice is no longer sped up in assembly, the owner heard the stretch
 *  as metallic; its natural takes need 14.6s, a second more than round 1's) */
export const TOTAL_FRAMES = beat(43);
export const TOTAL_SEC = TOTAL_FRAMES / FPS;
/** the kit's Signature is the last SIGNATURE.frames frames (house rule) */
export const SIGNATURE_AT = TOTAL_FRAMES - SIGNATURE.frames;

/**
 * Round 2: a second direction for each re-voiced line, voiced in the same
 * run (synth-vo.py `shots-alt`), so the line can be cast from two natural
 * takes by its measured pace instead of being sped up in assembly (round 1's
 * Rubber Band stretch read as metallic). The chosen one's style and pace
 * move into CAPTIONS (the take key is text + style + pace).
 */
export const CAPTIONS_ALT = [
  {
    at: 3,
    to: 91,
    text: 'Same screenshots.\nTwo very different places.',
    style: 'Casual and quick, like a friend nudging you to look: "Same screenshots." light and matter-of-fact, then straight on into "Two very different places." with a small smile. No dramatic pause.',
    pace: 'Quick, about 195 words a minute, almost no gap between the two sentences.',
  },
  {
    at: 253,
    to: 328,
    text: 'After: share each screenshot\nto Machina.',
    style: 'Bright and easy, like the good news after owning up to something: one flowing line, a natural lift on "each screenshot", "to Machina" landing warmly.',
    pace: 'Brisk everyday conversational speed, about 185 words a minute.',
  },
  {
    at: 342,
    to: 443,
    text: 'Analyzed, categorized,\nsummarized and tagged.',
    say: 'Each one is analyzed, categorized, summarized and tagged.',
    style: 'Warm and a little impressed, like telling a friend what the app just did for you: "Each one is" easy and quick, then the four words with a gentle, satisfying rhythm, a small smile on "and tagged". Conversational, never a sales pitch.',
    pace: 'Brisk everyday conversational speed, about 185 words a minute; only the briefest beats at the commas.',
  },
];

/**
 * Picture events, in output frames. Each one is a named frame the score also
 * keys to (audio/shots-score.mjs), so picture and sound move together. The
 * voice lines sit between them (CAPTIONS `at`).
 */
export const HITS = {
  hook: 0, // two screens: the roll on the left scrolling, Machina still on the right
  grow: 95, // the roll's screen takes the frame; Machina's slides away; the flick begins
  land: 165, // the flick comes to rest on the last row: the three, and "2,847 Screenshots"
  tap: 196, // the first of them tapped open (no idea why)
  swipe1: 220, // swiped to the next
  swipe2: 243, // and the next
  row: 264, // the three line up; the mark assembles under them
  share1: 277, // each one's Share tapped…
  share2: 292,
  share3: 307,
  land1: 289, // …and pulled into the mark (8th notes; the last on "Machina")
  land2: 304,
  land3: 319,
  iris: 323, // the mark's point opens into the app: the three cards
  card2: 368, // the feed reads down to the next card…
  card3: 404, // …and the next
  find: 442, // CUT: Find: the field focuses (8 frames), the query typed under a rack focus
  result: 462, // the one card it means (the app's own card-enter)
  ring: 474, // its ink ring, once it has settled
  signature: SIGNATURE_AT,
};

/**
 * The roll's scroll, as a fraction of the way to its last row at frame f:
 * a steady, readable scroll under the hook (`hookPt` points a frame), then
 * from `grow` one long flick that lands at `land`: the steady speed eases
 * out while a smooth hump of speed carries it the rest of the way. Picture
 * (Roll.tsx's scroll) and score (the flick's ratchet) read the same curve.
 */
export const ROLL = { hookPt: 14 };
const rollTable = (maxY) => {
  const pos = new Float64Array(TOTAL_FRAMES + 2);
  const n = HITS.land - HITS.grow;
  const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const base = (f) => (f < HITS.grow ? ROLL.hookPt : f < HITS.land ? ROLL.hookPt * (1 - ease((f - HITS.grow) / n)) : 0);
  const hump = (f) => (f < HITS.grow || f >= HITS.land ? 0 : Math.sin((Math.PI * (f - HITS.grow)) / n) ** 2);
  let b = 0;
  let h = 0;
  for (let f = 0; f < HITS.land; f++) {
    b += base(f);
    h += hump(f);
  }
  const k = (maxY - b) / h;
  for (let f = 1; f < pos.length; f++) pos[f] = Math.min(maxY, pos[f - 1] + base(f - 1) + k * hump(f - 1));
  return pos;
};
const ROLL_CACHE = new Map();
/** the roll's scroll in points at frame f (fractional frames interpolate) */
export const rollAt = (f, maxY) => {
  if (!ROLL_CACHE.has(maxY)) ROLL_CACHE.set(maxY, rollTable(maxY));
  const pos = ROLL_CACHE.get(maxY);
  if (f <= 0) return 0;
  if (f >= pos.length - 1) return maxY;
  const i = Math.floor(f);
  return pos[i] + (pos[i + 1] - pos[i]) * (f - i);
};

/** the footer under the signature: today, and on launch day (a render prop) */
export const ENDINGS = {
  soon: 'Coming soon · mymachina.app',
  store: 'Now on the App Store · mymachina.app',
};

/** how many screenshots the camera roll holds (the brief's "[fill]"; POV's
 *  wall says the same number, so the two reels agree) */
export const ROLL_COUNT = '2,847';

/** the three screenshots (src/reels/clips/shots/Screens.tsx draws them; the
 *  app's cards are capture/library.mjs `SHOTS`) */
export const HEROES = ['camera', 'seneca', 'viewpoint'];

/** the search that finds one of them again: shares no word with its card */
export const QUERY = 'quote about overthinking';

/**
 * THE VOICE: Gemini TTS (gemini-3.8-flash-tts), Sulafat, the house voice,
 * every line directed as a person talking to a friend (LATER NEVER COMES'
 * approved direction). `text` is the screen, `say` the voice where they
 * differ; `cues` picks the spoken word each screen row arrives on. The take's
 * key is text + style + pace, so changing any of them re-voices the line.
 * The tagline is NOT here: the Signature says it, in its one shared take.
 * NO em dashes, no literal "AI", no "second brain", no "library" (verify).
 */
const TALK = 'Natural and conversational, like telling a friend about an app you love: light, easy and unforced. Not an announcer, not performed, no word stressed.';
const PACE = 'Everyday conversational speed, about 175 words a minute; short natural pauses at the commas, never drawn out, never rushed.';

export const CAPTIONS = [
  {
    at: 3,
    to: 95,
    place: 'hook',
    cues: [0, 2],
    text: 'Same screenshots.\nTwo very different places.',
    style: 'Natural and conversational, like showing a friend something on your phone: easy, light, a little intrigued. Both sentences in one easy breath, only the shortest natural beat after "screenshots"; nothing drawn out, no word stressed.',
    pace: 'Brisk everyday conversational speed, about 190 words a minute.',
    maxPause: 0.2,
    // the take dwelt (3.2 syllables a second): eased in assembly (Rubber Band,
    // formants preserved), LATER NEVER COMES' to-do line precedent
  },
  {
    at: 99,
    to: 193,
    cues: [0],
    text: 'Before: 2,847 screenshots.',
    style: 'Natural and conversational, wry and light, like owning up to a habit everyone has: "Before:" a light set-up, then the number read out plainly and a little ruefully, "screenshots" landing softly. Never dramatic.',
    pace: 'Quick everyday conversational speed, about 185 words a minute; the number in one easy run, no pauses inside it.',
    maxPause: 0.22,
  },
  {
    at: 197,
    to: 262,
    cues: [0, 3],
    text: 'No idea why\nI took most of them.',
    style: 'Natural and conversational, amused at yourself, a small self-aware laugh in the voice without actually laughing; easy and light, no word stressed.',
    pace: PACE,
    maxPause: 0.2,
  },
  {
    at: 266,
    to: 338,
    // round 2 (owner): "from any app" is off-topic in a reel about
    // screenshots. "each", not "all": sharing several at once makes ONE card
    // (G3), and the picture shows one share per screenshot
    cues: [0, 5],
    text: 'After: share each screenshot\nto Machina.',
    style: `${TALK} "After:" a light, natural turn, brighter than the line before; "each screenshot" easy and clear; "to Machina" warm.`,
    pace: PACE,
    maxPause: 0.25,
  },
  {
    at: 342,
    to: 443,
    // round 3 (owner): say what Machina does to each one, not just "a card
    // that says what it is". The app's own steps for a screenshot are
    // Scanning image / Reading text / Understanding content / Organizing &
    // tagging (web/lib/scanPhases.ts). The verbs run top to bottom as their
    // parts sit on the card, and each one rings its part as it is said: the
    // screenshot, the category, the summary, the tags. The screen drops
    // "Each one is" (the picture carries it); rows arrive on "analyzed"
    // and "summarized"
    cues: [3, 5],
    text: 'Analyzed, categorized,\nsummarized and tagged.',
    say: 'Each one is analyzed, categorized, summarized and tagged.',
    style: 'Natural and conversational, quietly pleased, like showing a friend something clever: an easy, even rhythm through the four words, each one light and clear, "and tagged" landing softly. Not a list read off a page, not an announcer.',
    pace: 'Everyday conversational speed, about 175 words a minute; short natural beats at the commas, the whole line in one easy breath.',
    maxPause: 0.2,
  },
  {
    at: 447,
    to: 498,
    cues: [0, 3],
    text: 'Find it again\nin your own words.',
    style: `${TALK} Easy and warm; "in your own words" landing softly, leaving space before the logo.`,
    pace: 'Everyday conversational speed, about 170 words a minute; easy, never drawn out.',
    maxPause: 0.2,
  },
];
