/**
 * Meta ad 2 of 3, the Ask ad (built as "The trip you already planned"): the
 * single source of truth for its time. Round 2 (owner): the hook says what
 * Machina is in one sentence ("Machina keeps all your saves, from every app,
 * in one place.") over saves of every kind from five apps, then shows Ask,
 * with a trip question as the one worked example. Picture
 * (src/reels/ads/trip/), score (audio/ads/trip-score.mjs), narrator
 * (audio/synth-vo.py trip) and the ad's verify gates (audio/ads/trip-verify.mjs)
 * all read this file, the way the Ask clip's parts read clips/ask-timeline.mjs
 * (its template).
 *
 * Written in OUTPUT frames on the reel's grid: 112.5 BPM, 16 frames a beat.
 * Cuts and taps on beats, secondary events on 8ths, every line starting on a
 * beat or an 8th. The app's motion plays at the reel's steady pace (a frame
 * captured at 30fps lasts K output frames, one at 60fps lasts one).
 *
 * THE META SPEC (2026-10-02 brief): about 20s, never over 30; frame 0 is the
 * poster (saves from five apps, legible, with the hook line already up and
 * the name in it); the narrator starts by 0.5s; the mark forms at 3.7s, on
 * "in one place"; every line burned
 * in, at most about 8 words up at once; every line, logo and key app moment
 * inside the 9:16 safe zone (verified on stills).
 *
 * Every frame of app UI is the real app, one continuous take (`adtrip`,
 * capture/shoot.mjs).
 */

export const FPS = 30;
export const WIDTH = 1080;
export const HEIGHT = 1920;
/** the Feed edition (4:5) */
export const FEED_HEIGHT = 1350;

export const K = 2;
export const BPM = 112.5;
export const BEAT_FRAMES = 16;
export const BAR_FRAMES = BEAT_FRAMES * 4; // 64
export const BEAT = BEAT_FRAMES / FPS;
export const BAR = BAR_FRAMES / FPS;

/** Beat (may be fractional) → frame. */
export const beat = (n) => Math.round(n * BEAT_FRAMES);

/** the capture take every app frame comes from */
export const TAKE = 'adtrip';

/**
 * Picture events, in frames. The scenes and the score read these same
 * numbers. A tap lands on the frame the app answers it.
 */
export const HITS = {
  hook: 0, // saves of every kind, each in the app it was saved in (the poster)
  lost: beat(4.5), // "from every app": the piles drift apart and go soft
  collapse: beat(5.5), // "in one place": they gather into one point (EASE_GATHER)…
  dotLands: beat(6.5), // …which lands
  bracketsClose: beat(7), // the brackets snap shut around it (3.7s)
  wordmark: beat(7.5), // the drawn wordmark wipes in under the mark
  part: beat(9), // the wordmark leaves; the mark shrinks onto the app's own
  open: beat(10), // CUT (match cut on the mark) to Ask, its promise under it
  typeFrom: beat(11), // the question types, a character every 1.5 frames
  send: beat(14), // Send is tapped; the cut to the answer lands on the touch
  sources: beat(18), // the sources arrive under the finished answer
  chips: [beat(19), beat(20), beat(21)], // each source lifts, on its beat
  citeTap: beat(24), // the first source is tapped: its card opens
  summary: beat(25), // the passage the answer drew on lifts
  lockup: beat(28), // the card is thrown out; the mark launches
  markStrike: beat(30), // the mark's point strikes
};

/** output frames per typed character (the capture types one per frame) */
export const TYPE_STEP = 1.5;

/**
 * The captions ARE the script (audio/synth-vo.py trip speaks each as
 * written, "Machina" respelled for the voice only). `at` is the frame the
 * voice starts, `to` the frame the line has left (the dwell rule: 0.3–1.2s
 * after the voice). `pre` puts a line on screen before its voice: the hook is
 * up, whole, from frame 0, so the poster frame says it with the sound off.
 * `\n` is a break on screen only. At most about 8 words on screen at once.
 */
export const CAPTIONS = [
  // 1. the hook (owner, round 2: say what Machina is, in one sentence, then
  // show Ask; round 1's trip hook read as a travel app). One sentence, set as
  // two captions to keep the words on screen under 8; the first is up, whole,
  // from frame 0, over saves of every kind from five apps
  { at: beat(0.5), to: beat(4.5), hook: true, pre: true, text: 'Machina keeps all your saves,' },
  // the piles drift apart on "every app" and gather into the mark on "in one place"
  { at: beat(4.5), to: beat(8.5), text: 'from every app,\nin one place.' },
  // 2. Ask opens on its promise; the question types itself
  { at: beat(11), to: beat(14), text: 'Then you just ask.' },
  // 3. the answer streams in
  { at: beat(14), to: beat(18.5), text: 'The answer comes only\nfrom your saves.' },
  // 4. the sources lift on beats; one is tapped and its card opens
  // (the Ask clip's owner-approved line, set as two captions to keep the
  // words on screen under 8)
  { at: beat(19), to: beat(23), text: 'Every answer shows\nits sources.' },
  { at: beat(23), to: beat(26.5), until: true, text: 'Tap one to check it.' },
  // 5. the close: the name (the wordmark wipes in as it is said), then the
  // tagline on ONE line, exactly; the music steps back under both
  { at: beat(31), to: beat(40), place: 'lockup', text: 'Machina.\nEverything you save, finally useful.', duck: 0.4 },
];

export const TOTAL_FRAMES = CAPTIONS[CAPTIONS.length - 1].to;
export const TOTAL_SEC = TOTAL_FRAMES / FPS;

/** Risers END on the reveal they lead into. [from, to] in frames. */
export const RISERS = [
  [beat(5), HITS.dotLands], // the gather → the point lands
  [beat(27), HITS.markStrike], // the throw → the mark strikes
];

/** One chord per bar (the film's and the reel's vocabulary). */
export const BAR_CHORDS = ['Fmaj7', 'G6', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'Cmaj7', 'Cmaj7'];
