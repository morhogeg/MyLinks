/**
 * SAVE THIS, the organic Reel's single source of truth for time. Picture
 * (src/reels/clips/savethis/), score (audio/savethis-score.mjs), narrator
 * (audio/synth-vo.py savethis) and `npm run verify` read this file.
 *
 * ONE IDEA: the reel saves itself. It opens by predicting the viewer will
 * save this video and never watch it again (the hook, readable on frame 0);
 * the save falls down a shaft onto every other save; "unless you save it to
 * Machina" floods them with colour and gathers them into the mark; the REAL
 * app reads it and maps it among the saves before it (its graph): now
 * every save is one question away, so it can answer from them: Ask, a real
 * question about the three saves the graph just tied together, answered from
 * them, every source cited (the proof), this reel among them. The problem is
 * said once, at the top; everything after "Unless" is the answer to it
 * (owner, round 9). The sign-off is the app's own mark drawing in on paper
 * (round 12), "This time, you'll watch it again." over it, and the logo holds
 * to the loop, which cuts back to the hook (owner, round 13: the last frame
 * is the logo).
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

/** frames a typed character stays (the capture types one per 60fps frame;
 *  the reel plays two a frame: the question bursts in, then holds) */
export const TYPE_FRAMES = 0.5;

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
  // (rounds 10, 11) the bridge: what all that reading adds up to, over
  // Ask's own opening screen, its suggestions questions about the saves
  // (owner, round 12: the graph a half second longer; round 13: a bit
  // less) half a beat more of it than round 11
  knows: beat(31.5), // "Now every save…": CUT from the graph to Ask
  // (round 9) Ask, the solution's last word, each part on its own word;
  // (round 12) "So," said over Ask opening, the cut on "ask"
  askTap: beat(38), // "…ask": CUT to Ask's composer, on the beat, as…
  asking: beat(38), // …the question bursts in on "ask it anything"
  send: 559, // "and get the answer": sent, the answer streams
  proof: 603, // "with the proof": the saves it came from, cited, then each pinged in turn
  // (owner, round 12: not the Ask chat under the tagline) the brand card;
  // (owner, round 13) the proof held half a second longer before it, after
  // its pings
  tagline: beat(48), // "Machina. Everything you save, finally useful.": the app's own mark draws in
  // (owner, round 13: the last frame is the logo, not the poster) the
  // promise over the logo, which holds to the loop
  watch: beat(56), // "This time, you'll watch it again."
};

/** a whole beat, so the score's pulse runs straight through the loop */
export const TOTAL_FRAMES = beat(61);

/** (owner, round 13) the three citations' highlights, an 8th apart from the
 *  beat after "proof" is said: as the camera settles on them, clear of the
 *  voice and of the music's duck under it (the score pings each) */
export const CITE_PINGS = [0, 1, 2].map((k) => beat(44) + 7 * k);

/** (round 12) the sign-off's mark: the app's launch, a touch quicker than its
 *  39 frames, from just before the name; its point strikes at 0.56 of it */
export const MARK_DRAW = { from: HITS.tagline - 6, frames: 32 };
export const MARK_STRIKE = MARK_DRAW.from + Math.round(0.56 * MARK_DRAW.frames);
export const TOTAL_SEC = TOTAL_FRAMES / FPS;

/** The cut. One beat of story per scene. */
export const SCENES = [
  { id: 'hook', from: 0, dur: HITS.drop }, // the prediction, the save
  { id: 'shaft', from: HITS.drop, dur: HITS.gather - HITS.drop }, // where saves go
  { id: 'turn', from: HITS.gather, dur: HITS.iris - HITS.gather }, // gathered into the mark
  { id: 'app', from: HITS.iris, dur: HITS.tagline - HITS.iris }, // read, mapped, asked
  { id: 'card', from: HITS.tagline, dur: TOTAL_FRAMES - HITS.tagline }, // the mark, the name, the line; the promise
];

/**
 * THE VOICE: Gemini TTS, Sulafat (the house voice), this reel's tone: a
 * friend calling you out with a grin, then letting you in on the fix. Wry,
 * quick, never salesy. `style` is each line's acting note, `pace` replaces
 * the house pace note (audio/gemini_tts.py); text, style and pace are the
 * take's key in audio/vo-takes/, so changing any of them re-voices the line.
 * The captions ARE the script, spoken verbatim ("\n" breaks on screen only).
 * `place: 'scene'` lines are set by their scene (the poster's type, the
 * tagline's lockup), not by Captions.
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
  // (owner, round 10: "So ask it anything" came too abruptly) the bridge,
  // what the reading adds up to, said as the solution, not the problem
  // again (round 9); (owner, round 11: "better than you do" read as
  // argumentative; the owner's pick of three) over Ask's own opening
  // screen, its suggestions one-tap questions about the saves
  { at: HITS.knows + 2, to: HITS.askTap - 13, text: 'Now every save is\none question away.', style: 'Warm and easy, a small smile, flowing on from the line before; light and quick, no drawn-out words.', pace: PACE },
  // (owner, round 9: problem, solution, then the problem again made no
  // sense) Ask is the solution's last word, its consequence: because it has
  // read, understood and connected every save, ask it anything; the
  // question types on "ask it anything", the answer streams on "get the
  // answer", the saves it came from land on "proof"
  { at: HITS.askTap - 9, to: HITS.tagline - 6, runGap: 0.05, text: 'So, ask it anything,\nand get the answer,\nwith the proof.', style: 'Confident and simple: a clear, warm "So," to open, then one easy sentence in three quick beats; light and brisk, landing softly on "proof".', pace: PACE },
  // the name and the tagline, said once (owner, round 2: the name in the
  // voice); (owner, round 12) on paper, the app's own mark drawing in, the
  // drawn wordmark wiping in on "Machina"
  { at: HITS.tagline, to: HITS.tagline + 100, place: 'scene', text: 'Machina.\nEverything you save, finally useful.', duck: 0.4, style: 'A confident, warm sign-off; the name with a smile, then the tagline sincere but brisk, no drawn-out words.', pace: PACE },
  // over the logo, which holds to the loop (owner, round 13). (owner, round
  // 4: "See? You're watching it again." read as a riddle) The hook's "never
  // watch it again", answered as a promise
  { at: HITS.watch, to: TOTAL_FRAMES + 6, text: 'This time, you’ll\nwatch it again.', duck: 0.4, style: 'Warm and sure, a small smile in the voice: a promise, not a punchline. Light and quick, a short breath after "This time", landing softly on "again".', pace: PACE },
];

/** a small letterspaced label above the line, with it (the kit's Kicker) */
export const KICKERS = [];

/** Risers END on the reveal they lead into. [from, to] in frames. */
export const RISERS = [
  [HITS.gather, HITS.markStrike], // the heap rushing up into the mark
  [HITS.asking, HITS.proof], // the question, into the answer's proof
];

/**
 * Harmony, [from frame, chord], the house vocabulary (C major, the film's
 * voicings): the hook and the fall hang on the minor (the loss), the turn
 * lifts through V to I on the strike, the reading and the graph rest on IV,
 * the bridge and the question lift to V and the proof lands home, under the
 * sign-off too; the promise leaves on IV, which falls back to vi at the top
 * of the loop.
 */
export const CHORDS = [
  [0, 'Am7'],
  [HITS.drop, 'Fmaj7'],
  [HITS.gather, 'G6'],
  [HITS.markStrike, 'Cmaj7'],
  [HITS.done, 'Fmaj7'],
  [HITS.knows, 'G6'],
  [HITS.proof, 'Cmaj7'],
  [HITS.watch, 'Fmaj7'],
];
