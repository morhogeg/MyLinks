/**
 * SAVE THIS, the organic Reel's single source of truth for time. Picture
 * (src/reels/clips/savethis/), score (audio/savethis-score.mjs), narrator
 * (audio/synth-vo.py savethis) and `npm run verify` read this file.
 *
 * ONE IDEA: the reel saves itself. It opens by predicting the viewer will
 * save this video and never watch it again (the hook, readable on frame 0);
 * the save falls down a shaft onto every other save; "unless you save it to
 * Machina" floods them with colour and gathers them into the mark; the REAL
 * app reads it, maps it among the saves before it (its graph), buries it
 * under weeks of newer saves, and a search in the viewer's own words brings
 * it back. Its cover is this reel's first frame: the camera dives into it
 * ("This time, you'll watch it again.") and lands ON frame 0, so the reel
 * loops into its own hook without a cut.
 *
 * Written in OUTPUT frames on a 128.57 BPM grid, 14 frames a beat (the
 * REVISIT quick cut's pace: an organic Reel, not a feature explainer). Every
 * frame of app UI is the real app (`capture/shoot.mjs` savethis take,
 * today's `web/` on main). The cut is timed to the narrator's measured
 * takes (src/reels/clips/savethis/savethis-vo.json), not the reverse.
 */

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export const BEAT_FRAMES = 14;
export const BPM = (60 * FPS) / BEAT_FRAMES; // 128.57
export const BAR_FRAMES = BEAT_FRAMES * 4; // 56
export const BEAT = BEAT_FRAMES / FPS; // 0.4667s
export const BAR = BAR_FRAMES / FPS; // 1.8667s

/** Beat (quarter note, may be fractional) → frame. */
export const beat = (n) => Math.round(n * BEAT_FRAMES);
export const onBeat = (f) => Math.round(f / BEAT_FRAMES) * BEAT_FRAMES;

/** frames a typed character stays (the capture types one per 60fps frame) */
export const TYPE_FRAMES = 2;

/**
 * Picture events, in frames, each on the word it answers. Taps, landings and
 * cuts sit on the beat; the fall, the gather and the typing run between.
 */
export const HITS = {
  tapSave: beat(2), // the thumb fills the bookmark on "save"
  drop: beat(4), // "And never watch it again": it tips, and falls
  land: beat(9), // it lands on the heap, in the beat after "there,"
  gather: beat(12), // "Unless…": the heap rushes up into one point
  markStrike: beat(15), // the brackets close on it, on "Machina"
  iris: beat(16), // the point opens into the app
  phase0: beat(17), // the real pipeline, a phase a beat…
  done: beat(22), // …and the card, read
  graph: beat(26), // "…by topic,": CUT to the graph, the saves mapped by topic
  connect: beat(28), // "…connects it to": the thumb on its dot; its ties light on "what you've saved before"
  skip: beat(31), // three weeks later
  bury: beat(33), // newer saves land on top of it, from "buried"
  fieldTap: beat(37), // "type what you remember": the search field
  type: beat(37.5), // "never watch it again"
  found: beat(41), // this video's card, alone ("There it is,…")
  // (round 5) four beats later than before, for the payoff line
  tagline: beat(45) + 4, // "Machina. Everything you save, finally useful."
  cardTap: beat(53), // the thumb taps its cover…
  poster: beat(55), // …the dive lands ON frame 0
};

/** a whole beat, so the score's pulse runs straight through the loop */
export const TOTAL_FRAMES = beat(59);
export const TOTAL_SEC = TOTAL_FRAMES / FPS;

/** The cut. One beat of story per scene. */
export const SCENES = [
  { id: 'hook', from: 0, dur: HITS.drop }, // the prediction, the save
  { id: 'shaft', from: HITS.drop, dur: HITS.gather - HITS.drop }, // where saves go
  { id: 'turn', from: HITS.gather, dur: HITS.iris - HITS.gather }, // gathered into the mark
  { id: 'app', from: HITS.iris, dur: HITS.cardTap - HITS.iris }, // read, buried, found
  { id: 'dive', from: HITS.cardTap, dur: HITS.poster - HITS.cardTap }, // into its cover
  { id: 'poster', from: HITS.poster, dur: TOTAL_FRAMES - HITS.poster }, // frame 0 again
];

/**
 * THE VOICE: Gemini TTS, Sulafat (the house voice), this reel's tone: a
 * friend calling you out with a grin, then letting you in on the fix. Wry,
 * quick, never salesy. `style` is each line's acting note, `pace` replaces
 * the house pace note (audio/gemini_tts.py); text, style and pace are the
 * take's key in audio/vo-takes/, so changing any of them re-voices the line.
 * The captions ARE the script, spoken verbatim ("\n" breaks on screen only).
 * `place: 'scene'` lines are set by their scene (the poster's type, the
 * found card's lockup), not by Captions.
 *
 * NO em dashes, no literal "AI", no "second brain", no "library" (verify).
 */
const PACE = 'Brisk, playful and conversational, about 175 words a minute; pauses short and light, never a dramatic beat.';

export const CAPTIONS = [
  // the hook: the poster's own type, on screen from frame 0
  { at: 5, to: 54, place: 'scene', text: 'You’re going to\nsave this video.', duck: 0.4, style: 'A friendly, knowing call-out, half teasing, as if catching a friend in the act. Quick and light, one breath, no pause inside the line.', pace: PACE },
  { at: 54, to: 99, text: 'And never\nwatch it again.', duck: 0.45, style: 'Wry and lightly amused, a little deadpan; landing low and certain on "again".', pace: PACE },
  { at: 100, to: 162, text: 'Right down there,\nwith all the others.', style: 'Amused and quick, a wry aside, as if pointing down into a deep hole; light, no drawn-out words.', pace: PACE },
  // (owner, round 2: no full stop after the name on screen; the voice keeps its take)
  { at: 166, to: 236, text: 'Unless you save it\nto Machina', tts: 'Unless you save it to Machina.', duck: 0.4, style: 'The turn: bright, warm and confident, a little conspiratorial; the name lands with a smile.', pace: PACE },
  { at: 238, to: 302, text: 'It reads every save,\nfrom any app,', style: 'Clear and easy, genuinely pleased; flowing straight on, the sentence is not finished.', pace: PACE },
  // (owner, round 3: "reads" alone undersold it) what the read IS, over the
  // finished card, each named part lifting on its word
  { at: 304, to: 370, text: 'understands it, sums it up,\nfiles it by topic,', style: 'Brisk and pleased, rattling off the list with a smile; light, no drawn-out words, the sentence carries on.', pace: PACE },
  // (owner, round 2: "remembers what's in it" was not a strong enough
  // benefit; round 4: show the graph, not the Related cards list) the app's
  // graph: the thumb taps the new save's dot and its ties to older saves light
  { at: 372, to: 432, text: 'and connects it to\nwhat you’ve saved before.', style: 'Clear and genuinely pleased, flowing on from the line before; a little lift on "connects", landing warmly on "saved before".', pace: PACE },
  { at: 434, to: 514, text: 'Weeks later, buried\nunder everything else,', style: 'Storytelling, quick and a touch dramatic; trailing on into the next line.', pace: PACE },
  { at: 518, to: 554, text: 'type what you remember.', style: 'Easy and casual, like the simplest thing in the world.', pace: PACE },
  // (owner, round 5: the search showed the result but nobody said it) the
  // payoff, on the card coming back: found, from a half-memory, not its title
  { at: 556, to: 624, text: 'There it is,\nexactly the one you meant.', style: 'The payoff, warm and quietly delighted: a small reveal on "There it is", then quick and sure, a light lift on "exactly"; no drawn-out words.', pace: PACE },
  // the find: the name and the tagline, said once, over the save it just
  // brought back (owner, round 2: the name in the voice); the drawn wordmark
  // wipes in on "Machina"
  { at: HITS.tagline, to: HITS.tagline + 100, place: 'scene', text: 'Machina.\nEverything you save,\nfinally useful.', duck: 0.4, style: 'A confident, warm sign-off; the name with a smile, then the tagline sincere but brisk, no drawn-out words.', pace: PACE },
  // the thumb taps the found card's cover and the camera dives into it,
  // landing on frame 0 as the reel starts again under this line. (owner,
  // round 4: "See? You're watching it again." read as a riddle) The hook's
  // "never watch it again", answered as a promise
  { at: HITS.poster - 10, to: HITS.poster + 50, text: 'This time, you’ll\nwatch it again.', duck: 0.4, style: 'Warm and sure, a small smile in the voice: a promise, not a punchline. Light and quick, a short breath after "This time", landing softly on "again".', pace: PACE },
];

/** a small letterspaced label above the line, with it (the kit's Kicker) */
export const KICKERS = [{ at: 430, to: 514, text: 'Three weeks later' }];

/** Risers END on the reveal they lead into. [from, to] in frames. */
export const RISERS = [
  [HITS.gather, HITS.markStrike], // the heap rushing up into the mark
  [HITS.type, HITS.found], // the query, into the card it finds
  [HITS.cardTap, HITS.poster], // the dive into the cover
];

/**
 * Harmony, [from frame, chord], the house vocabulary (C major, the film's
 * voicings): the hook and the fall hang on the minor (the loss), the turn
 * lifts through V to I on the strike, the search sits on vi again and the
 * find lands home; the dive leaves on IV, which falls back to vi at the top
 * of the loop.
 */
export const CHORDS = [
  [0, 'Am7'],
  [HITS.drop, 'Fmaj7'],
  [HITS.gather, 'G6'],
  [HITS.markStrike, 'Cmaj7'],
  [HITS.done, 'Fmaj7'],
  [HITS.skip, 'G6'],
  [HITS.fieldTap, 'Am7'],
  [HITS.found, 'Cmaj7'],
  [HITS.cardTap, 'G6'],
  [HITS.poster, 'Fmaj7'],
];
