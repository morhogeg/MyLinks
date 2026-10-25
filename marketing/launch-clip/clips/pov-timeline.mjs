/**
 * POV: YOU SAVED IT (2026-10-25): the single source of truth for time.
 * Picture (src/reels/clips/pov/), score (audio/pov-score.mjs), narrator
 * (audio/synth-vo.py pov) and audio/house-verify.mjs read this file.
 *
 * ONE IDEA, the owner's script: everyone has hunted for a save and lost.
 * Frame 0 is a blank search bar and a blinking caret under "POV: you saved
 * it." The hunt runs through every place a save hides (an Instagram-style
 * saved grid, a TikTok-style favorites grid, a wall of screenshots, the chat
 * you send yourself links in), quicker each time over a ticking pulse; the
 * search types "that Lisbon café" and finds nothing, twice, and the music
 * drops to almost nothing. Then the turn, slower: every place drifts apart
 * and bleaches into the paper, "Saving was never the hard part. Finding it
 * again is." The saves rush back from every side into one point of ink, and
 * the point becomes the logo: the kit's Signature, the ending every new video
 * shares, with "Coming soon · mymachina.app" under it (the footer is the one
 * line that changes on launch day: `ENDINGS`).
 *
 * The places are schematic and un-branded, like the launch film's act one:
 * generic grids in the platforms' own layout, the platform named in type,
 * no logos, no third-party thumbnails, no Machina chrome before the end
 * (if the hunt wore Machina's chrome, the failure would read as Machina's).
 * No recipe or cooking content (owner, 2026-10-02): the lost save is a café.
 *
 * Written in OUTPUT frames on a 120 BPM grid (15 frames a beat, a bar is 2s).
 * The cut is timed to the narrator's measured takes (src/reels/clips/pov/
 * pov-vo.json), not the reverse.
 */

import { SIGNATURE } from '../src/reels/kit/signature.mjs';

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export const BEAT_FRAMES = 15;
export const BPM = (60 * FPS) / BEAT_FRAMES; // 120
export const BAR_FRAMES = BEAT_FRAMES * 4; // 60
export const BEAT = BEAT_FRAMES / FPS; // 0.5s

/** Beat (quarter note, may be fractional) → frame. */
export const beat = (n) => Math.round(n * BEAT_FRAMES);

/** 60 beats: the hunt, the turn, the gather, then the shared ending */
export const TOTAL_FRAMES = beat(60);
export const TOTAL_SEC = TOTAL_FRAMES / FPS;
/** the kit's Signature is the last SIGNATURE.frames frames (house rule) */
export const SIGNATURE_AT = TOTAL_FRAMES - SIGNATURE.frames;

/** the footer under the signature: today, and on launch day (a render prop) */
export const ENDINGS = {
  soon: 'Coming soon · mymachina.app',
  store: 'Now on the App Store · mymachina.app',
};

/** Picture events, in frames. Cuts and hits sit on the beat. */
export const HITS = {
  hook: 0, // the blank search bar, the caret, "POV: you saved it."
  insta: beat(6), // CUT: an Instagram-style saved grid, whipping up
  tiktok: beat(9), // whip-pan: a TikTok-style favorites grid
  shots: beat(12), // CUT: a wall of screenshots flying upward
  chat: beat(18), // CUT: the chat you send yourself links in
  search: beat(24), // CUT: back to the search bar
  type: beat(24.5), // "that Lisbon café", typed
  none1: beat(26.5), // "No results"
  // the sound design's marks under the montage, kept at round 1's values so
  // the score and its effects stay byte-identical (round 3, owner: keep the
  // music and the effects): the scroll's tick flurry, its stop, a soft low
  // note. The picture's montage is MONTAGE below.
  scroll: beat(28), // the tick flurry starts ("You scroll.")
  freeze: beat(29.5), // …and stops
  none2: beat(30), // a soft low note
  drift: beat(32), // the turn: every place drifts apart and bleaches out
  white: beat(40), // only paper is left
  gather: beat(41.6), // the saves rush back from every side…
  point: beat(49), // …into one point of ink
  signature: SIGNATURE_AT, // beat 50: the point becomes the logo
};

/**
 * (round 3, owner) Between the two "No results": a frantic but READABLE
 * swipe through every place again, Instagram, TikTok, the screenshots, the
 * chat, each on screen 13 frames (0.43s), each arriving on a thrown swipe
 * up (5 frames, motion-blurred) instead of a hard cut. Its time came from
 * the first "No results" hold (0.73s → 0.4s); nothing from 0:16 on moved.
 * The search swipes back in at `again`, on the spoken "nothing.".
 */
export const MONTAGE = { from: 410, scene: 13, swipe: 5, again: 462 };

/** the lost save, typed into the search */
export const QUERY = 'that Lisbon café';

/**
 * THE VOICE: Gemini TTS (gemini-3.8-flash-tts), Sulafat, the house voice.
 * This reel's tone (owner): warm and a little wry, like a friend who has
 * been there too. Quick at the start; it slows down at "Saving was never the
 * hard part." `text` is what the screen shows, `say` what is spoken (the
 * owner's script sets different words for each); `style` is the line's
 * acting note and `pace` its tempo (audio/gemini_tts.py). `cues`: for each
 * line on screen, the spoken word it arrives on (the hook's are empty: it is
 * on screen from frame 0, the cover). The take's key is
 * text + style + pace, so changing any of them re-voices the line.
 *
 * The tagline is NOT here: the Signature says it, in its one shared take.
 * NO em dashes, no literal "AI", no "second brain", no "library" (verify).
 */
const QUICK = 'Quick and conversational, about 175 words a minute; light, short pauses, never rushed into a gabble.';
const SLOW = 'Slower and warmer for this line, about 125 words a minute; a real, unhurried beat between the two sentences.';

export const CAPTIONS = [
  // the hook, on screen from frame 0 (the scene sets it big): the cover
  { at: 6, to: 84, place: 'hook', cues: [], text: 'POV:\nyou saved it.', say: 'You saved it. You know you did.', style: 'Warm and a little wry, like a friend who has been there too: "You saved it" as a knowing nudge, then "You know you did" with a small, rueful smile.', pace: QUICK },
  { at: 96, to: 174, cues: [0, 4], text: 'Instagram?\nTikTok?', say: 'Was it on Instagram? TikTok?', style: 'Quick and searching, half to yourself: "Was it on Instagram?" a real question, "TikTok?" quicker, already doubting.', pace: QUICK },
  { at: 186, to: 264, cues: [0], text: 'Your screenshots?', say: 'Buried somewhere in your screenshots?', style: 'Wry, a little amused at the mess: "Buried somewhere" with a knowing lilt, "in your screenshots?" landing lightly.', pace: QUICK },
  { at: 276, to: 354, cues: [0, 3], text: 'That chat\nwith yourself?', say: 'Or that chat where you send yourself links?', style: 'Warm and teasing, the friend who does this too: a fond eye-roll on "send yourself links".', pace: QUICK },
  // (round 3, owner) on the spoken "Still" the screen line rolls over to
  // "Still nothing." (`then`: screen only, the take is unchanged)
  { at: 372, to: 476, cues: [1], then: { text: 'Still nothing.', cue: 5 }, text: 'Nothing.', say: 'You search. Nothing. You scroll. Still nothing.', style: 'Deflating, dry and wry: "You search." quick, "Nothing." flat and small; "You scroll." quick again, "Still nothing." flatter, a tiny sigh in it. Short gaps, nothing dramatic.', pace: QUICK },
  // (round 3, owner) the punchline gets its own line, on its word, a touch
  // heavier (`punch`: the line set heavier); three lines, the one caption
  // allowed past the house band's two
  { at: 486, to: 622, cues: [0, 3, 6], punch: 2, text: 'Saving was never\nthe hard part.\nFinding it again is.', say: 'Saving was never the hard part. Finding it again is.', style: 'The turn: slow down, warm and sincere, close to the listener, the friend who has figured it out; "Finding it again is." quietly, with weight on "Finding".', pace: SLOW },
  { at: 624, to: 752, cues: [3, 6], text: 'One place.\nEvery save. Any app.', say: 'So we’re building one place for everything you save, from any app.', style: 'Bright and warm, quietly excited, letting the listener in on it; "one place" lifted a little, "from any app" landing with a smile.', pace: QUICK },
];

/**
 * Harmony, [from frame, chord] (the house vocabulary, C major): the hunt
 * circles vi and IV over a ticking pulse that builds; "Nothing." is almost
 * silence; the turn rests on IV; the gather lifts through V; the logo opens
 * onto a bright, calm I.
 */
export const CHORDS = [
  [0, 'Am7'],
  [HITS.insta, 'Fmaj7'],
  [HITS.shots, 'Am7'],
  [HITS.chat, 'Fmaj7'],
  [HITS.search, 'Am7'],
  [HITS.drift, 'Fmaj7'],
  [HITS.gather, 'G6'],
  [HITS.signature, 'Cmaj7'],
];
