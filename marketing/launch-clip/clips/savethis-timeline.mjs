/**
 * SAVE THIS, the organic Reel's single source of truth for time. Picture
 * (src/reels/clips/savethis/), score (audio/savethis-score.mjs), narrator
 * (audio/synth-vo.py savethis) and `npm run verify` read this file.
 *
 * ONE IDEA: the reel saves itself. It opens by predicting the viewer will
 * save this video and never watch it again (the hook, readable on frame 0);
 * the save falls down a shaft of every other save; "unless you save it to
 * Machina" gathers them into the mark; the REAL app reads it, buries it
 * under weeks of newer saves, and a search in the viewer's own words brings
 * it back. Its cover is this reel's first frame: the camera dives into it,
 * "See? You're watching it again.", the tagline, and the loop lands on the
 * hook again.
 *
 * Written in OUTPUT frames on a 128.57 BPM grid, 14 frames a beat (the
 * REVISIT quick cut's pace: an organic Reel, not a feature explainer). Every
 * frame of app UI is the real app (`capture/shoot.mjs` savethis takes,
 * today's `web/` on main). Times are re-cut to the narrator's measured takes
 * (time the cuts to the audio, not the reverse).
 */

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

/** app motion: a 60fps capture shown one frame per output frame (half speed)
 *  where it must read, two per frame (real speed) where it only has to move */
export const K = 2;
export const BEAT_FRAMES = 14;
export const BPM = (60 * FPS) / BEAT_FRAMES; // 128.57
export const BAR_FRAMES = BEAT_FRAMES * 4; // 56
export const BEAT = BEAT_FRAMES / FPS; // 0.4667s
export const BAR = BAR_FRAMES / FPS; // 1.8667s

/** Beat (quarter note, may be fractional) → frame. */
export const beat = (n) => Math.round(n * BEAT_FRAMES);
export const onBeat = (f) => Math.round(f / BEAT_FRAMES) * BEAT_FRAMES;

/** frames a typed character stays (the capture types one a 60fps frame) */
export const TYPE_FRAMES = 2;

/**
 * Picture events, in frames. Taps, landings and cuts sit on the beat; the
 * fall, the gather and the typing run between them.
 */
export const HITS = {
  tapSave: beat(1), // the thumb fills the bookmark on "save"
  drop: beat(4), // "And never watch it again": it falls
  land: beat(9.5), // it lands on the heap of every other save
  gather: beat(11), // "Unless…": the heap rushes back up into one point
  markStrike: beat(14), // the brackets close on it, on "Machina"
  iris: beat(15), // the point opens into the app: the save arriving
  phase0: beat(16), // the real pipeline, a phase an 8th…
  done: beat(21), // …the card, read
  bury: beat(25), // weeks of newer saves land on top of it
  fieldTap: beat(31), // "type what you remember": the search field
  type: beat(32), // "never watch it again"
  found: beat(36), // this video's card lands alone
  cardTap: beat(40), // the thumb taps its cover…
  dive: beat(40.5), // …the camera dives into it
  hookAgain: beat(43), // the cover IS the first frame: the hook again
  lockup: beat(45), // the mark strikes, the tagline
};

export const TOTAL_FRAMES = beat(50);
export const TOTAL_SEC = TOTAL_FRAMES / FPS;

/** The cut. One beat of story per scene. */
export const SCENES = [
  { id: 'hook', from: 0, dur: HITS.drop }, // the prediction, the save
  { id: 'shaft', from: HITS.drop, dur: HITS.gather - HITS.drop }, // where saves go
  { id: 'turn', from: HITS.gather, dur: HITS.iris - HITS.gather }, // gathered into the mark
  { id: 'app', from: HITS.iris, dur: HITS.cardTap - HITS.iris }, // read, buried, found
  { id: 'dive', from: HITS.cardTap, dur: HITS.lockup - HITS.cardTap }, // into its cover
  { id: 'lockup', from: HITS.lockup, dur: TOTAL_FRAMES - HITS.lockup },
];

/**
 * THE VOICE: Gemini TTS, Sulafat (the house voice), this reel's tone: a
 * friend calling you out with a grin, then letting you in on the fix. Wry,
 * quick, never salesy. `style` is each line's acting note, `pace` replaces
 * the house pace note (audio/gemini_tts.py). The captions ARE the script:
 * spoken verbatim, "\n" a break on screen only. `place: 'scene'` lines are
 * set by the scene itself (the hook's poster type), not by Captions.
 *
 * NO em dashes, no literal "AI", no "second brain", no "library" (verify).
 */
const PACE = 'Brisk, playful and conversational, about 175 words a minute; pauses short and light, never a dramatic beat.';

export const CAPTIONS = [
  // the hook: on screen from frame 0, the poster
  { at: 3, to: 52, place: 'scene', text: 'You’re going to\nsave this video.', duck: 0.4, style: 'A friendly, knowing call-out, half teasing, as if catching a friend in the act. Quick and light, one breath, no pause inside the line.', pace: PACE },
  { at: 56, to: 98, place: 'scene', text: 'And never\nwatch it again.', duck: 0.45, style: 'Wry and lightly amused, a little deadpan; landing low and certain on "again".', pace: PACE },
  { at: 104, to: 160, text: 'Right down there,\nwith all the others.', style: 'Mock-solemn and amused, as if peering down into a deep hole; a small smile in the voice.', pace: PACE },
  { at: 166, to: 216, text: 'Unless you save it\nto Machina.', duck: 0.4, style: 'The turn: bright, warm and confident, a little conspiratorial; the name lands with a smile.', pace: PACE },
  { at: 226, to: 276, text: 'It reads every save,\nfrom any app,', style: 'Clear and easy, genuinely pleased; flowing straight on, the sentence is not finished.', pace: PACE },
  { at: 280, to: 322, text: 'and remembers\nwhat’s in it.', style: 'Warm and reassuring, settling down softly at the end.', pace: PACE },
  { at: 340, to: 404, text: 'Weeks later, buried\nunder everything else,', style: 'Storytelling, quick and a touch dramatic; trailing on into the next line.', pace: PACE },
  { at: 410, to: 448, text: 'type what you remember.', style: 'Easy and casual, like the simplest thing in the world.', pace: PACE },
  { at: 508, to: 540, text: 'There it is.', style: 'Quietly satisfied, a small smile; short and soft.', pace: PACE },
  { at: 568, to: 616, text: 'See? You’re\nwatching it again.', duck: 0.4, style: 'Playful and delighted, a little laugh in the voice on "See?", then landing the joke warmly.', pace: PACE },
  // the close: the tagline, said once (the reel's sign-off; the loop follows)
  { at: 640, to: 700, place: 'lockup', text: 'Everything you save,\nfinally useful.', duck: 0.4, style: 'Sincere, warm and unhurried; the closing thought, a quiet smile.', pace: PACE },
];

/** a small letterspaced label above the line, with it (the kit's Kicker) */
export const KICKERS = [{ at: 336, to: 404, text: 'Three weeks later' }];

/** Risers END on the reveal they lead into. [from, to] in frames. */
export const RISERS = [
  [HITS.gather, HITS.markStrike], // the heap rushing up into the mark
  [HITS.type, HITS.found], // the query, into the card it finds
  [HITS.cardTap, HITS.hookAgain], // the dive into the cover
];

/**
 * Harmony, [from frame, chord]: the house vocabulary (C major, the film's
 * voicings). The hook and the fall hang on a minor colour (the loss), the
 * turn lifts to IV, the app walks I → V, the find lands on I, the lockup
 * resolves home.
 */
export const CHORDS = [
  [0, 'Am7'],
  [HITS.drop, 'Fmaj7'],
  [HITS.gather, 'G6'],
  [HITS.markStrike, 'Cmaj7'],
  [HITS.done, 'Fmaj7'],
  [HITS.bury, 'G6'],
  [HITS.type, 'Am7'],
  [HITS.found, 'Cmaj7'],
  [HITS.dive, 'G6'],
  [HITS.lockup, 'Cmaj7'],
];
