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

/** 41 beats, 20.5s: 31 beats of story, then the shared ending (20.0s left
 *  the Find beat under a second on screen; the voice runs 14.0s) */
export const TOTAL_FRAMES = beat(41);
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
];

/**
 * Picture events, in output frames. Each one is a named frame the score also
 * keys to (audio/shots-score.mjs), so picture and sound move together. The
 * voice lines sit between them (CAPTIONS `at`).
 */
export const HITS = {
  hook: 0, // two screens: the roll on the left already moving, Machina still on the right
  flick: 6, // the roll's one long flick, top to bottom (it lands at `land`)
  grow: 88, // the roll's screen takes the frame; Machina's slides away
  land: 150, // the flick comes to rest on the last row: the three, and "2,847 Screenshots"
  tap: 181, // the first of them tapped open (no idea why)
  swipe1: 204, // swiped to the next
  swipe2: 227, // and the next
  row: 250, // the three line up; the mark assembles under them
  share1: 266, // each one's Share tapped…
  share2: 281,
  share3: 296,
  land1: 278, // …and pulled into the mark (8th notes; the last on "Machina")
  land2: 293,
  land3: 308,
  iris: 312, // the mark's point opens into the app: the three cards
  card2: 350, // the feed reads down to the next card…
  card3: 388, // …and the next
  find: 424, // CUT: Find: the field focuses (8 frames), the query typed under a rack focus
  result: 444, // the one card it means
  ring: 456, // its ink ring, once it has settled
  signature: SIGNATURE_AT,
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
    to: 91,
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
    at: 95,
    to: 181,
    cues: [0],
    text: 'Before: 2,847 screenshots.',
    style: 'Natural and conversational, wry and light, like owning up to a habit everyone has: "Before:" a light set-up, then the number read out plainly and a little ruefully, "screenshots" landing softly. Never dramatic.',
    pace: 'Quick everyday conversational speed, about 185 words a minute; the number in one easy run, no pauses inside it.',
    maxPause: 0.22,
  },
  {
    at: 185,
    to: 249,
    cues: [0, 3],
    text: 'No idea why\nI took most of them.',
    style: 'Natural and conversational, amused at yourself, a small self-aware laugh in the voice without actually laughing; easy and light, no word stressed.',
    pace: PACE,
    maxPause: 0.2,
  },
  {
    at: 253,
    to: 328,
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
    at: 332,
    to: 423,
    cues: [0, 3],
    text: 'Every screenshot becomes\na card that says what it is.',
    style: 'Natural and conversational, quietly pleased, like pointing out something clever a friend did; light and unforced, a gentle natural stress on "says what it is".',
    pace: 'Everyday conversational speed, about 175 words a minute; the whole line in one easy breath.',
    maxPause: 0.2,
  },
  {
    at: 427,
    to: 480,
    cues: [0, 3],
    text: 'Find it again\nin your own words.',
    style: `${TALK} Easy and warm; "in your own words" landing softly, leaving space before the logo.`,
    pace: 'Everyday conversational speed, about 170 words a minute; easy, never drawn out.',
    maxPause: 0.2,
  },
];
