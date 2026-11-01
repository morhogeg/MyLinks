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

/** 50 beats, 25.0s: 40 beats of story, then the shared ending. (Round 2:
 *  the voice is no longer sped up in assembly, the owner heard the stretch
 *  as metallic; round 6, owner: two seconds more for a stronger close) */
export const TOTAL_FRAMES = beat(50);
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
    at: 481,
    to: 562,
    text: 'When I need one,\nI just describe it.',
    style: 'Bright and playful, like sharing a neat trick with a friend: a lift on "need one", a smile on "describe it". Conversational and light.',
    pace: 'Everyday conversational speed, about 180 words a minute.',
  },
  {
    at: 570,
    to: 640,
    text: 'Now every screenshot\nmakes sense.',
    style: 'Bright and warm, like the punchline of a good story: "Now every screenshot" with a lift, "makes sense" with a satisfied smile. Natural, never performed.',
    pace: 'Everyday conversational speed, about 175 words a minute.',
  },
];

/**
 * Picture events, in output frames. Each one is a named frame the score also
 * keys to (audio/shots-score.mjs), so picture and sound move together. The
 * voice lines sit between them (CAPTIONS `at`).
 */
export const HITS = {
  hook: 0, // the cover: BEFORE (the roll, scrolling) | AFTER (Machina, still)
  grow: 88, // the roll's screen takes the frame; Machina's slides away; the flick begins
  land: 158, // the flick comes to rest on the last row: the three, and "2,847 Screenshots"
  tap: 189, // the newest of them tapped open (no idea why); Photos opens on it…
  swipe1: 213, // …and a swipe to the right goes back in time, to the one before
  swipe2: 236, // and the next
  // (round 7, owner: the share was abrupt and unclear) the gesture everyone
  // knows: the screenshot in the viewer shrinks, Machina's app icon rises
  // under it, a finger taps the icon and the screenshot flies in; once
  // slowly, then twice quickly, the next ones arriving from the right where
  // the viewer left them; the third lands on "Machina"
  target: 252, // the screenshot shrinks to share size; the icon rises
  share1: 278, // the taps on the icon (the pad lands)…
  share2: 302,
  share3: 316,
  land1: 292, // …and each screenshot in the icon, the next one entering only
  land2: 310, // once the one before has landed; the second on "Machina", the
  land3: 324, // third just after the line
  iris: 326, // the icon opens into the app, as a tapped icon does: the newest card
  cards: 341, // the feed reads down past all three, to rest on the camera card (moving
  // already on the frame the iris completes, where the slab's edge appears: a still
  // frame there showed it pop)
  // …whose parts ring as the line names them, each 2 frames ahead of its
  // word (the eye leads the ear): the title "analyzed", the category
  // "categorized", the summary "summarized", the tags "tagged" (word starts
  // from the measured take, src/reels/clips/shots/shots-vo.json; verify
  // holds them to it)
  parts: [371, 390, 422, 448],
  find: 477, // CUT: Find: the field focuses (8 frames) and waits under a rack focus…
  typing: 514, // …and the query types itself as she says "I just describe it"
  result: 526, // the one card it means (the app's own card-enter)
  ring: 535, // its ink ring, once it has settled
  close: 548, // (round 6) on "Now": the view pulls back into the cover's BEFORE | AFTER
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
  // the app's own wordmark), and the After line, which drops "each one is"
  // (below). Rows measured in Geist at the house sizes, the font embedded in
  // the page (loaded by file:// it silently fell back to another face and
  // measured short): the widest, "After: analyzed, categorized,", is 780px
  // of the 950 between Meta's side margins.
  {
    at: 3,
    to: 88,
    place: 'hook',
    // the cover: the big line names the subject and the format; the labels
    // over the two screens (Shots.tsx) say which side is which
    cues: [0, 2],
    text: 'My screenshots,\nbefore and after.',
    say: 'My screenshots, before and after Machina.',
    // cast (run 85) from two readings by pitch movement, against LATER NEVER
    // COMES' six approved lines (movement 50 to 65, range 9.4 to 18.5
    // semitones): this one 57.9 / 15.8; the other came back flat (26.6)
    style: 'Casual and a little wry, like holding up your phone to a friend: "My screenshots" with a knowing smile, running straight on into "before and after Machina". Relaxed, nothing announced or drawn out.',
    pace: 'Brisk everyday conversational speed, about 185 words a minute.',
    maxPause: 0.2,
  },
  {
    at: 92,
    to: 186,
    cues: [0],
    text: 'Before: 2,847 screenshots.',
    style: 'Natural and conversational, wry and light, like owning up to a habit everyone has: "Before:" a light set-up, then the number read out plainly and a little ruefully, "screenshots" landing softly. Never dramatic.',
    pace: 'Quick everyday conversational speed, about 185 words a minute; the number in one easy run, no pauses inside it.',
    maxPause: 0.22,
  },
  {
    at: 190,
    to: 255,
    cues: [0, 3],
    text: 'No idea why\nI took most of them.',
    style: 'Natural and conversational, amused at yourself, a small self-aware laugh in the voice without actually laughing; easy and light, no word stressed.',
    pace: PACE,
    maxPause: 0.2,
  },
  {
    at: 269,
    to: 329,
    // the hinge: what I did. "Started sharing them" is true however they are
    // shared (several at once make ONE card, G3; the picture shows one share
    // per screenshot)
    cues: [0, 5],
    text: 'So I started sharing them\nto Machina.',
    // re-directed (run 86): run 85's two readings both moved ~38, under the
    // approved band ("matter-of-fact" and "easy" read flat); this reading
    // moves 62.7 smoothed (LATER's approved lines 41 to 42), 1.78s
    style: 'Natural and conversational, with a little warmth and a smile, like telling a friend the simple thing you finally did: "So" bright and light, "I started sharing them" flowing, "to Machina" warm, like good news. Not an announcer, no word drawn out.',
    pace: PACE,
    maxPause: 0.2,
  },
  {
    at: 333,
    to: 477,
    // the after: a state, like the before. The verbs run top to bottom as
    // their parts sit on the card, and each one rings its part as it is said
    // (the screenshot, the category, the summary, the tags; HITS.parts). The
    // app's own steps for a screenshot are Scanning image / Reading text /
    // Understanding content / Organizing & tagging (web/lib/scanPhases.ts).
    // The screen drops "each one is" (round 3's approved layout): the
    // voice's full row "categorized, summarized and tagged." is 1028px in
    // Geist, past the 950 between Meta's margins. Rows arrive on "After:" and
    // "summarized"
    cues: [0, 6],
    text: 'After: analyzed, categorized,\nsummarized and tagged.',
    say: 'After: each one is analyzed, categorized, summarized and tagged.',
    // cast (run 85) from two readings by pitch movement: this one moved 49.7
    // (range 12.4 semitones); the other ("quietly pleased") 40.7 (9.0)
    style: 'Warm and a little impressed, like telling a friend what changed: "After:" a light, bright turn, "each one is" easy and quick, then the four words with a gentle, satisfying rhythm, a small smile on "and tagged". Conversational, never a sales pitch.',
    pace: 'Brisk everyday conversational speed, about 185 words a minute; only the briefest beats at the commas.',
    maxPause: 0.2,
  },
  {
    at: 481,
    to: 544,
    // round 6 (owner: revise the payoff): the mechanism said plainly; the
    // query types itself as she says "describe it"
    cues: [0, 4],
    text: 'When I need one,\nI just describe it.',
    // cast (run 87) from two readings by pitch movement: 47.8 (range 10.1
    // semitones), 1.88s; the other 43.8
    style: 'Bright and playful, like sharing a neat trick with a friend: a lift on "need one", a smile on "describe it". Conversational and light.',
    pace: 'Everyday conversational speed, about 180 words a minute.',
    maxPause: 0.2,
  },
  {
    at: 548,
    to: 620,
    // round 6 (owner: a stronger closing statement, two seconds more): it
    // answers the opening's "No idea why I took most of them", over the
    // cover's BEFORE | AFTER again (Shots.tsx). Set a touch heavier: the
    // statement. Never the tagline (the Signature says "finally useful")
    cues: [0, 3],
    statement: true,
    text: 'Now every screenshot\nmakes sense.',
    // cast (run 87): 61.7 (range 11.6 semitones; LATER's approved hook 60.5),
    // 2.20s; the other came back flat (33.3)
    style: 'Bright and warm, like the punchline of a good story: "Now every screenshot" with a lift, "makes sense" with a satisfied smile. Natural, never performed.',
    pace: 'Everyday conversational speed, about 175 words a minute.',
    maxPause: 0.25,
  },
];
