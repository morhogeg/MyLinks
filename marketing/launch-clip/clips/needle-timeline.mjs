/**
 * FIND THE BOOK (the needle reel): the single source of truth for time.
 * Picture (src/reels/clips/needle/), score (audio/needle-score.mjs),
 * narrator (audio/synth-vo.py needle) and audio/needle-verify.mjs read this
 * file.
 *
 * ONE IDEA: the answer was in your saves all along. The hook is a dare,
 * readable on frame 0: "Find the book Sam told you to read." Behind it,
 * a field of the demo account's REAL saves (each one a card the shipped app
 * rendered) and, in plain sight, the card it means: a screenshot of Sam's
 * text, "Read Piranesi, and go in blind". Nobody spots it. The camera flies
 * past the beach you swore you'd visit, the talk you'll finish later, the
 * coffee trick you'll never try; "Give up?" stops it dead; "Or just ask
 * Machina" gathers the field into the mark, which is Ask's own mark on the
 * real Ask screen. The question is typed and sent; the field comes back at
 * speed (the drop: it has read every single one) and stops on the needle,
 * the screenshot card, at 70% (the payoff); the camera dives into it and
 * lands inside the real answer, which cites it. The sign-off is the tagline,
 * and the last line sends the viewer back: "P.S. It was in the first frame."
 * The loop cuts on the beat to frame 0, where it is.
 *
 * Written in OUTPUT frames on a 120 BPM grid (15 frames a beat, a bar is 2s).
 * The cut is timed to the narrator's measured takes
 * (src/reels/clips/needle/needle-vo.json), not the reverse.
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
export const onBeat = (f) => Math.round(f / BEAT_FRAMES) * BEAT_FRAMES;

/** Picture events, in frames, each on the word it answers. */
export const HITS = {
  push: beat(5), // "It's in your saves somewhere": the camera starts into the field
  beach: beat(9), // "Past the beach…": Cala Goloritzé swings past, lifted
  talk: beat(13), // "the talk…": the Stanford address
  coffee: beat(17), // "the coffee trick…": the V60 video
  giveUp: beat(21), // "Give up?": the field stops dead
  gather: beat(23), // "Or just ask Machina": every card rushes into one point
  markStrike: beat(26), // the brackets close on it, on "Machina"
  ask: beat(27), // the mark IS Ask's mark: the real Ask screen opens around it
  typing: beat(28), // the question, typed
  send: beat(32), // sent: the field comes back at speed (the drop)
  slow: beat(36), // "Even that screenshot.": braking
  found: beat(39), // the needle: the screenshot card stops and turns (the payoff)
  dive: beat(40), // the camera dives into it…
  answer: beat(41), // …and lands inside the real answer, pulling back
  lockup: beat(47), // "Machina. Everything you save, finally useful."
  ps: beat(52), // "P.S. It was in the first frame."
};

/** a whole bar, so the score's pulse runs straight through the loop */
export const TOTAL_FRAMES = beat(56);
export const TOTAL_SEC = TOTAL_FRAMES / FPS;

/** The cut. */
export const SCENES = [
  { id: 'field', from: 0, dur: HITS.ask }, // the dare, the search, the gather
  { id: 'ask', from: HITS.ask, dur: HITS.send - HITS.ask }, // the real Ask screen, the question
  { id: 'warp', from: HITS.send, dur: HITS.answer - HITS.send }, // through every save, onto the needle
  { id: 'answer', from: HITS.answer, dur: HITS.lockup - HITS.answer }, // the real answer, cited
  { id: 'end', from: HITS.lockup, dur: TOTAL_FRAMES - HITS.lockup }, // the lockup, the P.S.
];

/**
 * THE VOICE: Gemini TTS (gemini-3.8-flash-tts), Sulafat, the house voice.
 * This reel's tone: a friend daring you, grinning at your pile of saves, then
 * letting you in on the trick. Quick and playful, never salesy. `style` is
 * each line's acting note and `pace` replaces the house pace note
 * (audio/gemini_tts.py); text, style and pace are the take's key in
 * audio/vo-takes/, so changing any of them re-voices the line. The captions
 * ARE the script, spoken verbatim ("\n" breaks on screen only). `place:
 * 'scene'` lines are set by their scene (the hook's type, the lockup).
 *
 * NO em dashes, no literal "AI", no "second brain", no "library" (verify).
 */
const PACE = 'Quick, playful and conversational, about 180 words a minute; pauses short and light, never a dramatic beat.';

export const CAPTIONS = [
  // the dare, on screen from frame 0 (the scene sets it big)
  { at: 3, to: 72, place: 'scene', text: 'Find the book\nSam told you\nto read.', duck: 0.4, style: 'A playful dare to a friend, quick and bright, with a grin; one breath, no pause inside the line; landing lightly on "read".', pace: PACE },
  { at: HITS.push, to: HITS.beach - 4, text: 'It’s in your saves\nsomewhere.', style: 'Teasing and knowing, a little conspiratorial, as if waving at a huge messy pile; quick and light.', pace: PACE },
  // the list: each item swings past as it is named
  { at: HITS.beach, to: HITS.talk - 4, text: 'Past the beach\nyou swore you’d visit,', style: 'Starting a list with amusement, a wry nod; quick, flowing straight on, the sentence is not finished.', pace: PACE },
  { at: HITS.talk, to: HITS.coffee - 4, text: 'the talk you’ll\nfinish later,', style: 'The same list, a little quicker, a playful eye-roll; flowing straight on.', pace: PACE },
  { at: HITS.coffee, to: HITS.giveUp - 3, text: 'the coffee trick\nyou’ll never try.', style: 'The last item of the list, quickest, laughing at the listener a little on "never try"; landing it.', pace: PACE },
  { at: HITS.giveUp, to: HITS.gather - 2, text: 'Give up?', style: 'A teasing, grinning two-word question, light and quick.', pace: PACE },
  { at: HITS.gather, to: HITS.ask - 3, text: 'Or just ask\nMachina.', duck: 0.4, style: 'The turn: bright, warm and confident, a little conspiratorial; the name lands with a smile.', pace: PACE },
  // the warp: through every save at speed
  { at: HITS.send + 2, to: HITS.slow - 3, text: 'It’s read every\nsingle one.', style: 'Impressed and warm, quick, a little awed, as if watching it happen right now; no drawn-out words.', pace: PACE },
  { at: HITS.slow, to: HITS.found + 6, text: 'Even that screenshot.', style: 'A delighted, quick aside with a small laugh in the voice, pointing at one thing.', pace: PACE },
  // the payoff, read off the real answer
  { at: HITS.answer, to: HITS.lockup - 6, text: 'Piranesi.\nSam said go in blind.', style: 'The reveal: "Piranesi" said clearly the Italian way (pee-rah-NAY-zee) with a satisfied smile, then the rest warm and quick, like passing on a friend\'s advice.', pace: PACE },
  { at: HITS.lockup, to: HITS.ps - 4, place: 'scene', text: 'Machina.\nEverything you save, finally useful.', duck: 0.4, style: 'A confident, warm sign-off; the name with a smile, then the tagline sincere but brisk, no drawn-out words.', pace: PACE },
  // the rewatch: the needle was on frame 0
  { at: HITS.ps, to: TOTAL_FRAMES + 6, text: 'P.S. It was in\nthe first frame.', duck: 0.4, style: 'A quick, playful aside, close and conspiratorial, like letting the listener in on a secret; light, no drawn-out words.', pace: PACE },
];

/** no chapter words in this one */
export const KICKERS = [];

/** Risers END on the reveal they lead into. [from, to] in frames. */
export const RISERS = [
  [HITS.push, HITS.giveUp], // the search speeding up, cut dead by "Give up?"
  [HITS.gather, HITS.markStrike], // the field rushing into the mark
  [HITS.typing, HITS.send], // the question, into the drop
  [HITS.slow, HITS.found], // braking onto the needle
];

/**
 * Harmony, [from frame, chord] (the house vocabulary, C major): the dare and
 * the search hang on vi and IV; "Give up?" stops on nothing; the turn lifts
 * through V to I on the strike; the question waits on IV, the drop runs V,
 * the needle lands home on I; the sign-off rests on IV → I and the P.S.
 * leaves on vi, the chord the loop opens on.
 */
export const CHORDS = [
  [0, 'Am7'],
  [HITS.beach, 'Fmaj7'],
  [HITS.coffee, 'G6'],
  [HITS.gather, 'G6'],
  [HITS.markStrike, 'Cmaj7'],
  [HITS.typing, 'Fmaj7'],
  [HITS.send, 'G6'],
  [HITS.found, 'Cmaj7'],
  [HITS.lockup, 'Fmaj7'],
  [HITS.lockup + 30, 'Cmaj7'],
  [HITS.ps, 'Am7'],
];
