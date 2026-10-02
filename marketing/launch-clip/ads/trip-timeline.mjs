/**
 * Meta ad 2 of 3, "The trip you already planned" (Ask): the single source of
 * truth for its time. A Sardinia trip researched in five apps (an Instagram
 * post, a YouTube video, an article, a Facebook post, a screenshot of Dana's
 * message), pulled together by Machina, then asked about. Picture
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
 * poster (the trip's saves, legible, with the hook line already up); the
 * narrator starts by 0.5s; the mark by about 3s (it strikes at 4.0s: the
 * gather can only start once "five apps" has been heard); every line burned
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
  hook: 0, // the trip's saves, each in the app it was saved in (the poster)
  lost: beat(5), // "scattered": the piles drift apart and go soft
  collapse: beat(6.5), // they gather into one point (EASE_GATHER)…
  dotLands: beat(7.5), // …which lands
  bracketsClose: beat(8), // the brackets snap shut around it
  part: beat(12), // the wordmark leaves; the mark shrinks onto the app's own
  open: beat(13), // CUT (match cut on the mark) to Ask, its promise under it
  typeFrom: beat(14), // the question types, a character every 1.5 frames
  send: beat(17), // Send is tapped; the cut to the answer lands on the touch
  sources: beat(21), // the sources arrive under the finished answer
  chips: [beat(22), beat(23), beat(24)], // each source lifts, on its beat
  citeTap: beat(27), // the first source is tapped: its card opens
  summary: beat(28), // the passage the answer drew on lifts
  lockup: beat(31), // the card is thrown out; the mark launches
  markStrike: beat(33), // the mark's point strikes
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
  // 1. the hook, on screen from frame 0 over the trip's saves
  { at: beat(0.5), to: beat(4), hook: true, pre: true, text: 'You already planned this trip.' },
  { at: beat(4), to: beat(8), text: "It's just scattered\nacross five apps." },
  // 2. the gather, the brackets, the wordmark wiping in on "Machina"
  { at: beat(8), to: beat(12.5), text: 'Machina keeps it all\nin one place.' },
  // 3. Ask opens on its promise; the question types itself
  { at: beat(14), to: beat(17), text: 'Then you just ask.' },
  // 4. the answer streams in
  { at: beat(17), to: beat(21.5), text: 'The answer comes only\nfrom your saves.' },
  // 5. the sources lift on beats; one is tapped and its card opens
  // (the Ask clip's owner-approved line, set as two captions to keep the
  // words on screen under 8)
  { at: beat(22), to: beat(26), text: 'Every answer shows\nits sources.' },
  { at: beat(26), to: beat(29.5), until: true, text: 'Tap one to check it.' },
  // 6. the close: the name (the wordmark wipes in as it is said), then the
  // tagline on ONE line, exactly; the music steps back under both
  { at: beat(34), to: beat(43), place: 'lockup', text: 'Machina.\nEverything you save, finally useful.', duck: 0.4 },
];

export const TOTAL_FRAMES = CAPTIONS[CAPTIONS.length - 1].to;
export const TOTAL_SEC = TOTAL_FRAMES / FPS;

/** Risers END on the reveal they lead into. [from, to] in frames. */
export const RISERS = [
  [beat(6), HITS.dotLands], // the gather → the point lands
  [beat(30), HITS.markStrike], // the throw → the mark strikes
];

/** One chord per bar (the film's and the reel's vocabulary). */
export const BAR_CHORDS = ['Fmaj7', 'G6', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'Cmaj7', 'Cmaj7'];
