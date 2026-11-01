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

/** 44 beats, 22.0s: 34 beats of story, then the shared ending. (Round 2:
 *  the voice is no longer sped up in assembly, the owner heard the stretch
 *  as metallic; round 3's card line names what Machina does, half a second
 *  longer. The natural takes need 15.1s) */
export const TOTAL_FRAMES = beat(44);
export const TOTAL_SEC = TOTAL_FRAMES / FPS;
/** the kit's Signature is the last SIGNATURE.frames frames (house rule) */
export const SIGNATURE_AT = TOTAL_FRAMES - SIGNATURE.frames;

/**
 * Alternate readings, voiced in the same run as CAPTIONS (synth-vo.py
 * `shots-alt`), so a line is cast from natural takes by measurement instead
 * of being sped up in assembly (round 1's Rubber Band stretch read as
 * metallic). The chosen one's words, style and pace move into CAPTIONS (the
 * take key is text + style + pace). Round 4's two other hook readings: B
 * ran 3.83s (too long for a hook), C was as flat as round 3's.
 */
export const CAPTIONS_ALT = [
  {
    at: 3,
    to: 96,
    text: 'My screenshots,\nbefore and after.',
    say: 'My screenshots, before and after Machina.',
    style: 'Casual and a little wry, like holding up your phone to a friend: "My screenshots" with a knowing smile, running straight on into "before and after Machina". Relaxed, nothing announced or drawn out.',
    pace: 'Brisk everyday conversational speed, about 185 words a minute.',
  },
  {
    at: 266,
    to: 338,
    text: 'So I started sharing them\nto Machina.',
    style: 'Easy and matter-of-fact, the simple fix in a story told to a friend: one light, flowing line, a hint of a smile on "to Machina".',
    pace: 'Brisk everyday conversational speed, about 185 words a minute.',
  },
  {
    at: 342,
    to: 458,
    text: 'After: each one is analyzed,\ncategorized, summarized and tagged.',
    style: 'Natural and conversational, quietly pleased: "After:" a light turn, then an easy, even rhythm through the four words, each one light and clear, "and tagged" landing softly. Not a list read off a page, not an announcer.',
    pace: 'Everyday conversational speed, about 180 words a minute; short natural beats at the commas, the whole line in one easy breath.',
  },
  {
    at: 462,
    to: 513,
    text: 'Now I find any of them\nin my own words.',
    style: 'Warm and a little delighted, like the happy ending of a story told to a friend: easy and light, a small smile on "in my own words".',
    pace: 'Everyday conversational speed, about 175 words a minute; easy, never drawn out.',
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
  iris: 323, // the mark's point opens into the app: the newest card
  cards: 340, // (round 3) the feed reads down past all three, to rest on the camera card
  // …whose parts ring as the line names them, each 2 frames ahead of its
  // word (the eye leads the ear): the screenshot "analyzed", the category
  // "categorized", the summary "summarized", the tags "tagged" (word starts
  // from the measured take, src/reels/clips/shots/shots-vo.json; verify
  // holds them to it)
  parts: [364, 383, 407, 435],
  find: 457, // CUT: Find: the field focuses (8 frames), the query typed under a rack focus
  result: 477, // the one card it means (the app's own card-enter)
  ring: 489, // its ink ring, once it has settled
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
  // ROUND 5 (owner: "the first half doesn't make sense: we say camera roll vs
  // Machina, then before and after"). One spine now, BEFORE AND AFTER (the
  // reel's own title, F04, and the order the picture already runs in: the
  // roll, the share, the cards, Find), told in the first person throughout
  // (the brief's most relatable line, "No idea why I took most of them", is
  // first person). "Before:" and "After:" both name a STATE; the share is the
  // hinge between them, not labelled "After" (round 4's "After: share each
  // screenshot" put the label on a step). Every screen row = the voice's
  // words, except the cover, which drops "Machina" (the right screen wears
  // the app's own wordmark). Rows measured in Geist at the house sizes: the
  // widest, "categorized, summarized and tagged.", 893px of the 950 between
  // Meta's side margins.
  {
    at: 3,
    to: 96,
    place: 'hook',
    // the cover: the big line names the subject and the format; the labels
    // over the two screens (Shots.tsx) say which side is which
    cues: [0, 2],
    text: 'My screenshots,\nbefore and after.',
    say: 'My screenshots, before and after Machina.',
    style: 'Natural and conversational, like starting to tell a friend a little story about your own phone: easy and warm, one flowing sentence, a small smile on "before and after", "Machina" said lightly. Never announced, no word drawn out.',
    pace: 'Everyday conversational speed, about 180 words a minute; only a comma-length beat after "screenshots".',
    maxPause: 0.2,
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
    // the hinge: what I did. "Started sharing them" is true however they are
    // shared (several at once make ONE card, G3; the picture shows one share
    // per screenshot)
    cues: [0, 5],
    text: 'So I started sharing them\nto Machina.',
    style: 'Natural and conversational, the turn in a story told to a friend: a little brighter than the line before, "So" light and easy, "to Machina" warm. Not a pitch, no word stressed.',
    pace: PACE,
    maxPause: 0.2,
  },
  {
    at: 342,
    to: 458,
    // the after: a state, like the before. The verbs run top to bottom as
    // their parts sit on the card, and each one rings its part as it is said
    // (the screenshot, the category, the summary, the tags; HITS.parts). The
    // app's own steps for a screenshot are Scanning image / Reading text /
    // Understanding content / Organizing & tagging (web/lib/scanPhases.ts).
    // Rows arrive on "After:" and "categorized"
    cues: [0, 5],
    text: 'After: each one is analyzed,\ncategorized, summarized and tagged.',
    style: 'Warm and a little impressed, like telling a friend what changed: "After:" a light, bright turn, "each one is" easy and quick, then the four words with a gentle, satisfying rhythm, a small smile on "and tagged". Conversational, never a sales pitch.',
    pace: 'Brisk everyday conversational speed, about 185 words a minute; only the briefest beats at the commas.',
    maxPause: 0.2,
  },
  {
    at: 462,
    to: 513,
    cues: [0, 6],
    text: 'Now I find any of them\nin my own words.',
    style: 'Natural and conversational, quietly satisfied, the end of the little story: easy and warm, "in my own words" landing softly, leaving space before the logo.',
    pace: 'Everyday conversational speed, about 170 words a minute; easy, never drawn out.',
    maxPause: 0.2,
  },
];
