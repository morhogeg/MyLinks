/**
 * The ASK feature clip's single source of truth for time: a ~30s explainer
 * of Ask for someone seeing it for the first time. A hook that frames the
 * promise (your saves hold more knowledge than you remember; Ask reaches it), Machina
 * named, then five things Ask does, each shown in the real app with why it
 * matters, a concrete takeaway, and the reel's lockup. Picture
 * (src/reels/clips/ask/), score (audio/clips/ask-score.mjs), narrator
 * (audio/synth-vo.py ask) and `npm run verify` all read this file, the way the
 * highlight reel's parts read reel-timeline.mjs (its template).
 *
 * ONE CLOCK. The reel wrote its cut in source frames and played it K = 2
 * slower; a clip is written straight in OUTPUT frames on the same grid:
 * 112.5 BPM, 16 frames a beat, 64 a bar. What K = 2 still means here is the
 * reel's steady pace: the app's own motion always plays at half speed, a
 * frame the capture took at 30fps lasting K output frames and one taken at
 * 60fps lasting one. Cuts and taps land on beats, secondary events on 8ths.
 *
 * Every frame of app UI is the real app, one continuous take (`askfull`,
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
export const TAKE = 'askfull';

/**
 * Picture events, in frames. The scenes and the score read these same
 * numbers, so moving a hit moves the picture and its sound together. A tap
 * lands on the frame the app answers it.
 */
export const HITS = {
  hook: 0, // the feed, scrolling ever faster: everything you have saved
  open: beat(9), // CUT, at speed, to Ask opening; its mark launches…
  appMark: beat(11), // …and its point strikes (the app's own launch)
  typeFrom: beat(12), // CUT to the composer: the question types, a character every K frames
  send: beat(17), // Send is tapped; the cut to the answer lands on the touch
  sources: beat(21), // the sources arrive under the finished answer
  chips: [beat(24), beat(25), beat(26)], // each source lifts, on its beat
  citeTap: beat(29), // the first source is tapped: the card it cites opens
  summary: beat(30), // its summary, the passage the answer drew on, lifts
  closeTap: beat(33), // the card is closed
  followTap: beat(37), // one of the continuations the app suggests under the answer is tapped: a second answer
  scroll2: beat(39), // its sources scroll into view
  graphTap: beat(43), // its Graph chip: the cited saves lit among the rest
  lockup: beat(50), // the graph is thrown out; the mark launches as it leaves
  markStrike: beat(52), // the mark's point strikes
};

/**
 * The captions ARE the script: the narrator speaks each line as written
 * (audio/synth-vo.py ask), "Machina" respelled for the voice only. `at` is
 * the frame the voice starts (on a beat), `to` the frame the line has left.
 * THE DWELL RULE (reel round 11): a line leaves 0.3–1.2s after its voice, or
 * up to 4s with an `until` naming the action still playing. `\n` is a break
 * on screen only. No em dashes, no literal "AI", no "second brain", no
 * "library" (verify). Each of the five things Ask does gets its line: what it
 * does, and why that matters.
 */
export const CAPTIONS = [
  // (finishing pass: the hook speaks from 0.5s, since a feed decides in the
  // first second, and leaves a beat before the cut so the feed's last rush
  // into Ask plays clean)
  // the hook: what your saves add up to, over the feed flying past (owner,
  // round 2: frame the knowledge Ask reaches, not the search; no chapter word)
  // (`tight`, owner 2026-09-29: the voice paused 0.22s after "knowledge"
  // on its own; synth-vo.py closes pauses inside the line)
  { at: beat(1), to: beat(7) + 8, hook: true, tight: true, text: 'Your saves hold more knowledge\nthan you remember.' },
  // the name, on Ask opening
  { at: beat(10), to: beat(14), text: 'With Machina, you just ask.' },
  // 1. plain words: no remembering where, or what it was called
  { at: beat(14), to: beat(20), text: 'Ask in your own words.\nNo keywords, no folders.' },
  // 2. grounded: the answer is made of what you saved
  { at: beat(20), to: beat(25), text: 'The answer is written\nfrom your own saves.' },
  // 3. sources: so it can be trusted, and checked
  { at: beat(25), to: beat(31) + 8, text: 'Every answer shows its sources.\nTap one to check it.' },
  // 4. follow-ups: go deeper without starting over
  // (owner, round 3: this line is about the continuation chips the app
  // suggests under an answer; it starts once the card has closed, so no
  // other tap is on screen while it plays)
  { at: beat(34), to: beat(39) + 8, text: 'Keep going. One tap asks\nthe next question.' },
  // 5. connections: what else those saves sit next to
  { at: beat(41), to: beat(45), text: 'Then see how\nthose saves connect.' },
  // the takeaway
  { at: beat(45), to: beat(50), text: 'Ask once. Get the answer,\nand the proof.' },
  // (finishing pass: the end card holds ~2s after the last word, the owner's
  // rule for the reel; it held 1.3s. The tagline runs longer than the
  // subtitle did, so the close grew one beat: 33.1s, a 1.96s hold)
  // the close: the name (the drawn wordmark wipes in as it is said), then
  // the tagline on ONE line (owner 2026-09-28: every launch film ends on
  // "Everything you save, finally useful."; 2026-09-29: one line, as the
  // Revisit clip sets it); the music steps back
  // under both
  { at: beat(53), to: beat(62), place: 'lockup', text: 'Machina.\nEverything you save, finally useful.', duck: 0.4 },
];

export const TOTAL_FRAMES = CAPTIONS[CAPTIONS.length - 1].to;
export const TOTAL_SEC = TOTAL_FRAMES / FPS;

/**
 * The chapter word above the line: on screen only while the narration is,
 * in KICKER_LEAD frames before each line, out WITH it; lines closer than
 * KICKER_BRIDGE share one label (the reel's rule, verbatim). The hook has
 * none: ASK arrives with the name.
 */
const KICKER_LEAD = 4;
export const KICKER_BRIDGE = 24;
export const KICKERS = (() => {
  const spans = [];
  for (const c of CAPTIONS.filter((x) => !x.place && !x.hook)) {
    const last = spans[spans.length - 1];
    if (last && c.at - last.to < KICKER_BRIDGE) last.to = c.to;
    else spans.push({ at: c.at - KICKER_LEAD, to: c.to, text: 'Ask' });
  }
  return spans;
})();

/** Risers END on the reveal they lead into. [from, to] in frames. */
export const RISERS = [
  [beat(5), HITS.open], // the feed, accelerating → Ask
  [beat(49), HITS.markStrike], // the throw → the mark strikes
];

/** One chord per bar (the film's and the reel's vocabulary). */
export const BAR_CHORDS = ['Fmaj7', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'G6', 'Cmaj7', 'Cmaj7'];
