/**
 * The ASK feature clip's single source of truth for time: "ask your saves
 * anything; every answer shows its sources". Picture (src/reels/clips/ask/),
 * score (audio/clips/ask-score.mjs), narrator (audio/synth-vo.py ask) and
 * `npm run verify` all read this file, the way the highlight reel's parts
 * read reel-timeline.mjs (its template).
 *
 * ONE CLOCK. The reel wrote its cut in source frames and played it K = 2
 * slower; a clip is written straight in OUTPUT frames on the same grid:
 * 112.5 BPM, 16 frames a beat, 64 a bar. What K = 2 still means here is the
 * reel's steady pace: the app's own motion always plays at half speed, a
 * frame the capture took at 30fps lasting K output frames and one taken at
 * 60fps lasting one. Cuts and taps land on beats, secondary events (a word
 * of the answer arriving, the cut after a tap) on 8ths.
 *
 * Every frame of app UI is the real app, one continuous take (`askcite`,
 * capture/shoot.mjs): the clip never swaps takes.
 */

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;

export const K = 2;
export const BPM = 112.5;
export const BEAT_FRAMES = 16;
export const BAR_FRAMES = BEAT_FRAMES * 4; // 64
export const BEAT = BEAT_FRAMES / FPS; // 0.5333s
export const BAR = BAR_FRAMES / FPS; // 2.1333s

/** Beat (quarter note, may be fractional) → frame. */
export const beat = (n) => Math.round(n * BEAT_FRAMES);
/** Bar → frame. */
export const bar = (n) => Math.round(n * BAR_FRAMES);
/** the nearest beat */
export const onBeat = (f) => Math.round(f / BEAT_FRAMES) * BEAT_FRAMES;

/** the capture take every app frame comes from */
export const TAKE = 'askcite';

/**
 * Picture events, in frames. The scenes and the score read these same
 * numbers, so moving a hit moves the picture and its sound together.
 */
export const HITS = {
  open: 0, // Ask, opening: the screen comes into focus as its mark launches (60fps, one captured frame a frame)
  typeFrom: beat(3), // CUT to the composer: the question types, a character every K frames
  send: bar(2), // Send is tapped…
  answerFrom: bar(2), // …and the cut to the answer's first words lands on the touch
  sources: bar(3) + 24, // the sources arrive under the finished answer
  chips: [beat(15), beat(16), beat(17)], // each source lifts, on its beat
  citeTap: bar(5), // the first source is tapped: the card it cites opens
  summary: beat(22), // its summary, the passage the answer drew on, lifts
  lockup: bar(7), // the card is thrown out; the mark launches as it leaves
  markStrike: beat(30), // the mark's point strikes
};

/**
 * The captions ARE the script: the narrator speaks each line as written
 * (audio/synth-vo.py ask), "Machina" respelled for the voice only. `at` is
 * the frame the voice starts (on a beat), `to` the frame the line has left.
 * THE DWELL RULE (reel round 11): a line leaves 0.3–1.2s after its voice, or
 * up to 4s with an `until` naming the action still playing. `\n` is a break
 * on screen only. No em dashes, no literal "AI", no "second brain", no
 * "library" (verify). At most three lines, then the closing subtitle.
 */
export const CAPTIONS = [
  // over the empty Ask screen, as its mark lands
  { at: beat(1), to: bar(1), text: 'Ask anything.' },
  // over the answer streaming in, one sentence carried across two lines:
  // the claim while the words arrive, the proof as the sources lift
  { at: beat(9), to: beat(14) + 8, text: 'Every answer comes straight\nfrom your saves,' },
  { at: beat(15), to: beat(19) + 8, text: 'with the sources to prove it.' },
  // the close: the name (the drawn wordmark wipes in as it is said), then
  // the App Store subtitle; the music steps back under both
  { at: beat(31), to: beat(31) + 144, place: 'lockup', text: 'Machina.\nNever lose another great find.', duck: 0.4 },
];

export const TOTAL_FRAMES = CAPTIONS[CAPTIONS.length - 1].to;
export const TOTAL_SEC = TOTAL_FRAMES / FPS;

/**
 * The chapter word above the line: on screen only while the narration is,
 * in KICKER_LEAD frames before each line, out WITH it; lines closer than
 * KICKER_BRIDGE share one label (the reel's rule, verbatim).
 */
const KICKER_LEAD = 4;
export const KICKER_BRIDGE = 24;
export const KICKERS = (() => {
  const spans = [];
  for (const c of CAPTIONS.filter((x) => !x.place)) {
    const last = spans[spans.length - 1];
    if (last && c.at - last.to < KICKER_BRIDGE) last.to = c.to;
    else spans.push({ at: c.at - KICKER_LEAD, to: c.to, text: 'Ask' });
  }
  return spans;
})();

/** Risers END on the reveal they lead into. [from, to] in frames. */
export const RISERS = [
  [bar(1) + 32, HITS.send], // the typed question → Send
  [bar(4) + 32, HITS.citeTap], // the sources held → the card opens
  [bar(7), HITS.markStrike], // the throw → the mark strikes
];

/** One chord per bar (the film's and the reel's vocabulary). */
export const BAR_CHORDS = ['Fmaj7', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'Cmaj7'];
