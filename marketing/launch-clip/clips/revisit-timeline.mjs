/**
 * TICK IT OFF (the revisit reel): the single source of truth for time.
 * Picture (src/reels/clips/revisit/), score (audio/revisit-score.mjs),
 * narrator (audio/synth-vo.py revisit) and audio/revisit-verify.mjs read this
 * file.
 *
 * ONE IDEA: your saves don't just sit there. Frame 0 says what they are: "Your
 * saves are a to-do list.", over an ink list of this account's real saves,
 * every one waiting on an empty circle (Watch, Read, Try, Visit). The list
 * ratchets on, "later" after "later", spins like a slot reel and stops on the
 * one that gives the game away: you even saved a video on procrastination
 * (Mark Manson's, real, on his own channel). "Relax. Machina watched it.": the
 * sheet tears off the pad and under it is the real app, that save's card,
 * summed up. (Round 6, owner: make it clear that Machina writes a to-do from
 * each card, and then there is the weekly synthesis.) "For every save you can
 * act on, it writes you a to-do.": the ink list comes back, the five saves
 * you can act on light up and land on the real "Do this" list, where each
 * "Watch …" is rewritten as its to-do. The payoff (60%, at half speed): "Even
 * the procrastination one." The video's to-do is ticked,
 * the rest follow on the beat, and the real list folds away to "All done.
 * New tasks arrive with your saves." Then the week: "And every Sunday, it
 * writes up your week.", this week's synthesis tapped open right under "All
 * done.", its first paragraph on that video and "the smallest step you can
 * take today", underlined in ink. The tagline, held on the logo to the
 * last frame (round 2, owner: the final frame is the logo and the tagline);
 * the loop cuts on the beat from the logo back to the hook.
 *
 * Written in OUTPUT frames on a 120 BPM grid (15 frames a beat, a bar is 2s).
 * The cut is timed to the narrator's measured takes
 * (src/reels/clips/revisit/revisit-vo.json), not the reverse.
 */

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export const BEAT_FRAMES = 15;
export const BPM = (60 * FPS) / BEAT_FRAMES; // 120
export const BAR_FRAMES = BEAT_FRAMES * 4; // 60
export const BEAT = BEAT_FRAMES / FPS; // 0.5s
export const BAR = BAR_FRAMES / FPS; // 2s

/** Beat (quarter note, may be fractional) → frame. */
export const beat = (n) => Math.round(n * BEAT_FRAMES);

/**
 * a whole number of beats, so the score's pulse runs straight through the
 * loop (round 4: 58, two more than before, for the payoff played at half
 * speed; the last bar under the logo is a half bar, as it always was)
 */
export const TOTAL_FRAMES = beat(58);
export const TOTAL_SEC = TOTAL_FRAMES / FPS;

/**
 * Picture events, in frames, each on the word it answers (timed to the
 * measured takes, src/reels/clips/revisit/revisit-vo.json).
 */
export const HITS = {
  push: 0, // frame 0: the hook over the list (also the cover), a slow push
  hookOut: 56, // the hook's type rolls out; the list starts to move
  step1: 65, // "Watch later.": the list ratchets on one save
  step2: 99, // "Read later.": two more
  step3: 137, // "Try later.": three more
  spin: 150, // the list spins like a slot reel…
  stop: 241, // …and stops dead on "procrastination": Manson's video (the ink ring) (round 5: the take's whole "You" back, the word 5 frames later)
  tear: 288, // after "Relax.": the sheet tears off the pad
  card: 300, // under it, the real app: that video's card, summed up ("Machina watched it.")
  // (round 6) the to-dos straight after the card, then the ticks, then the week
  land: 337, // "For every save you can act on,": a sheet lands, every save on it, small
  pick: 378, // "…act on": the five you can act on light up, a 16th apart
  fly: 390, // "it writes you a to-do": they fly out of the list onto the real "Do this" rows
  rewrite: 414, // each "Watch …" becomes its to-do, a row every 6 frames (as "to-do" is said)
  push2: 440, // in to the video's to-do
  tick: 520, // "…one.": the video's to-do ticked; the rest follow an 8th apart, at half speed
  allDone: 602, // the rows have folded away (from tick + 39, an 8th apart): "All done. New tasks arrive with your saves."
  weekTap: 650, // "And every Sunday, it writes up your week.": this week's synthesis, under "All done.", tapped open
  weekRead: 676, // its first paragraph: the video, the smallest step
  underline: 680, // "the smallest step you can take today", underlined in ink
  lockup: 722, // the app dissolves into paper; "Machina. Everything you save, finally useful."
  loopLead: 840, // the last bar leans back to vi, into the loop's downbeat (the cut to frame 0)
};

/** The cut. */
export const SCENES = [
  { id: 'list', from: 0, dur: HITS.card - 0 }, // the hook, the list, the spin, the stop, the tear
  { id: 'card', from: HITS.card, dur: HITS.land + 12 - HITS.card }, // the card, summed up
  { id: 'todo', from: HITS.land, dur: HITS.push2 - HITS.land }, // the saves you can act on, each written as its to-do
  { id: 'tick', from: HITS.push2, dur: HITS.allDone + 8 - HITS.push2 }, // the ticks, all done
  { id: 'week', from: HITS.allDone + 8, dur: HITS.lockup - HITS.allDone - 8 }, // this week's synthesis, opened in Revisit
  { id: 'end', from: HITS.lockup, dur: TOTAL_FRAMES - HITS.lockup }, // the sign-off, held to the last frame
];

/**
 * THE VOICE: Gemini TTS (gemini-3.8-flash-tts), Sulafat, the house voice.
 * This reel's tone: a friend catching you out and laughing with you, then
 * showing you the trick. Quick, warm, a little cheeky, never salesy. `style`
 * is each line's acting note and `pace` replaces the house pace note
 * (audio/gemini_tts.py); text, style and pace are the take's key in
 * audio/vo-takes/, so changing any of them re-voices the line. The captions
 * ARE the script, spoken verbatim ("\n" breaks on screen only). `place:
 * 'scene'` lines are set by their scene (the hook's type, the lockup).
 *
 * NO em dashes, no literal "AI", no "second brain", no "library" (verify).
 */
const PACE = 'Quick, playful and conversational, about 180 words a minute; pauses short and light, never a dramatic beat.';
/** (round 6) the two lines that explain the app, at an easy, natural pace */
const NATURAL = 'Natural and conversational, about 160 words a minute; relaxed and clear, every word given its room, no rushing.';

export const CAPTIONS = [
  // the hook, on screen from frame 0 (the scene sets it big)
  { at: 6, to: 56, place: 'scene', text: 'Your saves are\na to-do list.', duck: 0.4, style: 'A wry, friendly observation, catching a friend out with a grin; quick and bright, one breath, no pause inside the line; landing lightly on "list".', pace: PACE },
  { at: 64, to: 172, text: 'Watch later.\nRead later.\nTry later.', style: 'A teasing little list in three quick beats, each "later" a touch more knowing and amused, like rolling your eyes at a friend; light, no long pauses.', pace: PACE },
  // (round 5, owner: "the you word is barely audible") the take's "You" had
  // been trimmed off as a breath (audio/gemini_tts.py to_the_words); back, it
  // is the line's softest word, so it is lifted 3dB (audio/synth-vo.py `lift`)
  { at: 182, to: 274, lift: [0.14, 3], text: 'You even saved a video\non procrastination.', style: 'Delighted, catching a friend out, quick, a laugh building toward "procrastination" and landing on it with a grin.', pace: PACE },
  { at: 276, to: 338, text: 'Relax.\nMachina watched it.', duck: 0.4, style: '"Relax." warm and reassuring, then straight on, conspiratorial and pleased, the name with a smile; quick and light, no drawn-out words.', pace: PACE },
  // (round 6, owner: "it should be clear to the user that Machina creates an
  // action item or to do from each card, and then we have the weekly
  // synthesis") the to-dos come straight after the card, said outright; the
  // analysis writes one only when a save supports a concrete action
  // (functions/ai_service.py: "include only when genuine"), so: every save
  // you can act on. Voiced at a natural pace (round 5's line was directed
  // "quick" twice and came out rushed)
  { at: 343, to: 440, text: 'For every save you can act on,\nit writes you a to-do.', style: 'Clear and warm, explaining the trick to a friend at an easy, natural pace, never rushed: a small breath after "act on", then "it writes you a to-do" with a smile, landing on "to-do".', pace: NATURAL },
  { at: 476, to: 532, text: 'Even the\nprocrastination one.', style: 'A delighted, teasing callback with a laugh in the voice, quick and light; landing on "one" with a grin.', pace: PACE },
  // (round 6) and then the week: this week's synthesis, opened in Revisit
  // right under "All done."
  { at: 612, to: 690, text: 'And every Sunday,\nit writes up your week.', style: 'Warm and inviting, like describing a lovely little ritual: an easy, natural pace, a light lift on "Sunday", the sentence finished and settled on "week".', pace: NATURAL },
  // the sign-off: FIND THE BOOK's take, word for word (the same key, so the
  // same voice and the same read: the house sign-off)
  { at: 726, to: 828, place: 'scene', text: 'Machina.\nEverything you save, finally useful.', duck: 0.4, style: 'A confident, warm sign-off; the name with a smile, then the tagline sincere but brisk, no drawn-out words.', pace: PACE },
];

/** no chapter words in this one */
export const KICKERS = [];

/** Risers END on the reveal they lead into. [from, to] in frames. */
export const RISERS = [
  [HITS.spin, HITS.stop], // the slot spinning up, cut dead on "procrastination"
  [HITS.land, HITS.fly], // the list coming back, into the flight
];

/**
 * Harmony, [from frame, chord] (the house vocabulary, C major): the hook and
 * the "later"s hang on vi and IV; the spin climbs on V and stops on nothing;
 * the tear opens on I (the real app); the to-dos lift through V; the ticks
 * land home on I, step by step; Sunday's page rests on IV, then vi (round 6:
 * the week comes after the ticks); the sign-off rests IV → I under the logo,
 * and the last bar leans to vi, the chord the loop opens on.
 */
export const CHORDS = [
  [0, 'Am7'],
  [HITS.step2, 'Fmaj7'],
  [HITS.spin, 'G6'],
  [HITS.card - 4, 'Cmaj7'],
  [HITS.land, 'G6'],
  [HITS.rewrite, 'Cmaj7'],
  [HITS.push2 + 30, 'Fmaj7'],
  [HITS.tick, 'Cmaj7'],
  [HITS.allDone + 8, 'Fmaj7'],
  [HITS.weekRead, 'Am7'],
  [HITS.lockup, 'Fmaj7'],
  [HITS.lockup + 30, 'Cmaj7'],
  [HITS.loopLead, 'Am7'],
];
