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
 * summed up. Every Sunday it writes up your week (the real synthesis, tapped
 * open) and pulls out what to actually do: the ink list comes back, folds
 * down to the five saves that call for an action and lands on the real "Do
 * this" list, where each "Watch …" is rewritten as the thing to do. The
 * payoff (75%): "Even the procrastination one." The video's line is ticked,
 * the rest follow on the beat, and the real list folds away to "All done.
 * New tasks arrive with your saves." The tagline; then a fresh sheet lands
 * with the list back on it, exactly frame 0: new saves, a new list.
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

/** a whole number of bars, so the score's pulse runs straight through the loop */
export const TOTAL_FRAMES = beat(56);
export const TOTAL_SEC = TOTAL_FRAMES / FPS;

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

export const CAPTIONS = [
  // the hook, on screen from frame 0 (the scene sets it big)
  { at: 6, to: 60, place: 'scene', text: 'Your saves are\na to-do list.', duck: 0.4, style: 'A wry, friendly observation, catching a friend out with a grin; quick and bright, one breath, no pause inside the line; landing lightly on "list".', pace: PACE },
  { at: 70, to: 150, text: 'Watch later.\nRead later.\nTry later.', style: 'A teasing little list in three quick beats, each "later" a touch more knowing and amused, like rolling your eyes at a friend; light, no long pauses.', pace: PACE },
  { at: 180, to: 250, text: 'You even saved a video\non procrastination.', style: 'Delighted, catching a friend out, quick, a laugh building toward "procrastination" and landing on it with a grin.', pace: PACE },
  { at: 262, to: 320, text: 'Relax.\nMachina watched it.', duck: 0.4, style: '"Relax." warm and reassuring, then straight on, conspiratorial and pleased, the name with a smile; quick and light, no drawn-out words.', pace: PACE },
  { at: 345, to: 420, text: 'Every Sunday,\nit writes up your week,', style: 'Warm and inviting, like describing a lovely little ritual; quick, flowing straight on, the sentence is not finished.', pace: PACE },
  { at: 428, to: 480, text: 'and pulls out\nwhat to actually do.', style: 'The same sentence continuing, bright and confident, landing softly on "do" with a smile; quick.', pace: PACE },
  { at: 600, to: 640, text: 'Even the\nprocrastination one.', style: 'A delighted, teasing callback with a laugh in the voice, quick and light; landing on "one" with a grin.', pace: PACE },
  // the sign-off: FIND THE BOOK's take, word for word (the same key, so the
  // same voice and the same read: the house sign-off)
  { at: 700, to: 780, place: 'scene', text: 'Machina.\nEverything you save, finally useful.', duck: 0.4, style: 'A confident, warm sign-off; the name with a smile, then the tagline sincere but brisk, no drawn-out words.', pace: PACE },
];
