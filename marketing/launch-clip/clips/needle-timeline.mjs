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
 * text, "Read Atomic Habits, start small". Nobody spots it. The camera flies
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

/**
 * Picture events, in frames, each on the word it answers (re-timed to the
 * measured takes, src/reels/clips/needle/needle-vo.json). Cuts and hits sit
 * on the beat; "Machina" is said on beat 24, where the brackets strike.
 */
export const HITS = {
  push: beat(4), // the camera starts into the field
  beach: beat(10), // "Past the beach…": Cala Goloritzé, read as it swings past
  talk: 203, // "the talk…": the Stanford address
  coffee: 248, // "the coffee trick…": the V60 video
  giveUp: beat(20), // "Give up?": the field stops dead
  gather: beat(22), // "Or just ask Machina": every card rushes into one point
  markStrike: beat(24), // the brackets close on it, on "Machina"
  ask: 366, // the mark IS Ask's mark: the real Ask screen irises open around it
  typing: beat(27), // the question, typed
  tap: 446, // send
  send: beat(30), // CUT to the field at speed (the drop)
  brake: 500, // "Even that screenshot.": braking toward one card
  found: beat(38), // the needle: Sam's screenshot, facing the camera (the payoff)
  dive: beat(39), // the camera dives into it…
  answer: beat(40), // …and lands inside the real answer, pulling back
  ping: beat(43), // the citation, pinged
  lockup: beat(45), // "Machina. Everything you save, finally useful."
  ps: 777, // "P.S. It was in the first frame."
  burst: 795, // the field flies back out of the mark to frame 0
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
  { at: 6, to: 72, place: 'scene', text: 'Find the book\nSam told you\nto read.', duck: 0.4, style: 'A playful dare to a friend, quick and bright, with a grin; one breath, no pause inside the line; landing lightly on "read".', pace: PACE },
  { at: 75, to: 128, text: 'It’s in your saves\nsomewhere.', style: 'Teasing and knowing, a little conspiratorial, as if waving at a huge messy pile; quick and light.', pace: PACE },
  // the list: each item swings past as it is named
  { at: 135, to: 194, text: 'Past the beach\nyou swore you’d visit,', style: 'Starting a list with amusement, a wry nod; quick, flowing straight on, the sentence is not finished.', pace: PACE },
  { at: 198, to: 239, text: 'the talk you’ll\nfinish later,', style: 'The same list, a little quicker, a playful eye-roll; flowing straight on.', pace: PACE },
  { at: 243, to: 297, text: 'the coffee trick\nyou’ll never try.', style: 'The last item of the list, quickest, laughing at the listener a little on "never try"; landing it.', pace: PACE },
  { at: HITS.giveUp, to: 318, text: 'Give up?', style: 'A teasing, grinning two-word question, light and quick.', pace: PACE },
  { at: 323, to: 386, text: 'Or just ask\nMachina.', duck: 0.4, style: 'The turn: bright, warm and confident, a little conspiratorial; the name lands with a smile.', pace: PACE },
  // the warp: through every save at speed
  { at: 452, to: 510, text: 'It’s read every\nsingle one.', style: 'Impressed and warm, quick, a little awed, as if watching it happen right now; no drawn-out words.', pace: PACE },
  { at: 525, to: 572, text: 'Even that screenshot.', style: 'A delighted, quick aside with a small laugh in the voice, pointing at one thing.', pace: PACE },
  // (round 2, owner: a book everyone knows) the payoff in two: the voice
  // names the book just after the find's hit (its take carries over the dive
  // into the answer), then reads Sam's advice off the real answer
  { at: HITS.found + 4, to: 610, text: 'Atomic Habits.', style: 'The reveal, recognizing it: "Atomic Habits" said clearly, with a delighted, satisfied smile, like spotting a friend across a crowded room; quick and light, one breath.', pace: PACE },
  { at: 613, to: 674, text: 'Sam said start with\nthe two-minute rule.', style: 'Warm and quick, passing on a friend\'s advice with a smile; light, no drawn-out words, landing softly on "rule".', pace: PACE },
  { at: HITS.lockup, to: 776, place: 'scene', text: 'Machina.\nEverything you save, finally useful.', duck: 0.4, style: 'A confident, warm sign-off; the name with a smile, then the tagline sincere but brisk, no drawn-out words.', pace: PACE },
  // the rewatch: the needle was on frame 0
  { at: HITS.ps, to: TOTAL_FRAMES + 6, text: 'P.S. It was in\nthe first frame.', duck: 0.4, style: 'A quick, playful aside, close and conspiratorial, like letting the listener in on a secret; light, no drawn-out words.', pace: PACE },
];

/**
 * (round 3, owner: "a YouTube video as the main thing … a Mark Manson
 * video", shown beside the book) THE VIDEO: the same cut, camera and score,
 * with Sam's pick a YouTube save, Mark Manson's "Life is a Video Game, Here
 * Are the Cheat Codes" (his own channel; title, channel and length checked
 * against YouTube, its summary and key moments Machina's own analysis of it:
 * capture/video-facts/Nxy6SIM11sA.json). Only the lines that name the needle
 * change; the rest are the book's, voiced once (the same takes). The payoff
 * gains what a screenshot cannot give: the answer knows the MINUTE (its key
 * moment, 3:16), pinged on screen as the tip is said.
 */
const VIDEO_LINES = {
  6: { text: 'Find the video\nSam told you\nto watch.', style: 'A playful dare to a friend, quick and bright, with a grin; one breath, no pause inside the line; landing lightly on "watch".' },
  525: { text: 'Watched the videos, too.', style: 'A delighted, quick aside with a small laugh in the voice, as if it is a little ridiculous how thorough it is.' },
  // the name, as the book's is named, so Sam's tip (the longer line) can
  // start just after the camera lands in the answer
  [HITS.found + 4]: { at: HITS.found + 2, to: 601, text: 'Mark Manson.', style: 'The reveal, recognizing it: "Mark Manson" said clearly, with a delighted, satisfied smile, like spotting a friend across a crowded room; quick and light, one breath.' },
  613: { at: 602, text: 'Sam’s cheat code?\nSkip the side quests.', style: 'Quick and warm, passing on a friend\'s tip with a grin: the question and the tip in one breath, barely a beat between them, landing softly on "quests"; no drawn-out words.' },
};
export const VIDEO_CAPTIONS = CAPTIONS.map((c) => (VIDEO_LINES[c.at] ? { ...c, ...VIDEO_LINES[c.at] } : c));

/**
 * Which needle a render is: the book (the default) or the video. The
 * picture picks it from its input props (src/reels/clips/needle/variant.ts),
 * the audio scripts from their `video` argument.
 */
export const NEEDLES = {
  book: { name: 'book', captions: CAPTIONS },
  video: { name: 'video', captions: VIDEO_CAPTIONS },
};

/** no chapter words in this one */
export const KICKERS = [];

/** Risers END on the reveal they lead into. [from, to] in frames. */
export const RISERS = [
  [HITS.push, HITS.giveUp], // the search speeding up, cut dead by "Give up?"
  [HITS.gather, HITS.markStrike], // the field rushing into the mark
  // (the question into the drop, and the swell into the needle, are set by
  // the score itself: louder, and timed against the voice)
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
  // the breath before the needle: the same chord, drawn back
  [HITS.found - 14, 'G6'],
  [HITS.found, 'Cmaj7'],
  [HITS.lockup, 'Fmaj7'],
  [HITS.lockup + 30, 'Cmaj7'],
  [HITS.ps, 'Am7'],
];
