/**
 * Meta ad 2 of 3, the Ask ad (the branch is named for its first concept, "The
 * trip you already planned"): the single source of truth for its time. Round
 * 3 (owner): an Ask ad from start to finish, in the Ask clip's own words. The
 * hook is the Ask clip's approved line ("Your saves hold more knowledge than
 * you remember.") over saves of every kind from five apps; they gather into
 * the mark on "With Machina, you just ask."; then Ask: the question, the
 * answer written from your own saves, its three sources from three apps (the
 * standout), one tapped open; then "Download Machina." and the tagline.
 * Picture (src/reels/ads/trip/), score (audio/ads/trip-score.mjs), narrator
 * (audio/synth-vo.py trip) and the ad's verify gates
 * (audio/ads/trip-verify.mjs) all read this file.
 *
 * Written in OUTPUT frames on the reel's grid: 112.5 BPM, 16 frames a beat.
 * Cuts and taps on beats, secondary events on 8ths, every line starting on a
 * beat or an 8th. The app's motion plays at the reel's steady pace (a frame
 * captured at 30fps lasts K output frames, one at 60fps lasts one).
 *
 * THE META SPEC (2026-10-02 brief): about 20s, never over 30; frame 0 is the
 * poster (saves from five apps, legible, the hook line already up); the
 * narrator starts by 0.5s; the mark forms at 3.5s; every line burned in, at
 * most about 8 words up at once; every line, logo and key app moment inside
 * the 9:16 safe zone (verified on stills).
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
  lost: beat(4), // "…than you remember": the piles drift apart and go soft
  collapse: beat(5), // they gather into one point (EASE_GATHER)…
  dotLands: beat(6), // …which lands
  bracketsClose: beat(6.5), // the brackets snap shut around it (3.5s)
  wordmark: beat(7), // the drawn wordmark wipes in as "Machina" is said
  part: beat(10), // the wordmark leaves; the mark shrinks onto the app's own
  open: beat(11), // CUT (match cut on the mark) to Ask, its promise under it
  typeFrom: beat(12), // the question types, a character every 1.5 frames
  send: beat(15), // Send is tapped; the cut to the answer lands on the touch
  sources: beat(19), // the sources arrive under the finished answer
  chips: [324, 338, 368], // each source lifts as the voice names it ("post", "video", "screenshot": vo.json)
  citeTap: beat(26), // the first source is tapped: its card opens
  summary: beat(27), // the passage the answer drew on lifts
  lockup: beat(30), // the card is thrown out; the mark launches
  markStrike: beat(32), // the mark's point strikes
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
  // 1. the hook (owner, round 3: an Ask ad, start to finish; reuse the Ask
  // clip's lines). The Ask clip's owner-approved hook, up whole from frame 0
  // over saves of every kind from five apps (`tight`: the voice's own pause
  // after "knowledge" is closed, as in the Ask clip)
  { at: beat(0.5), to: beat(6), hook: true, pre: true, tight: true, text: 'Your saves hold more knowledge\nthan you remember.' },
  // 2. the name: the saves gather into the mark (the Ask clip's line)
  { at: beat(6.5), to: beat(10.5), text: 'With Machina, you just ask.', duck: 0.4 },
  // 3. Ask opens on its promise; the question types itself (the Ask clip's line)
  { at: beat(12), to: beat(15), text: 'Ask in your own words.' },
  // 4. the answer streams in (the Ask clip's line)
  { at: beat(15), to: beat(20), text: 'The answer is written\nfrom your own saves.' },
  // 5. the standout: each source lifts as it is named
  { at: beat(20), to: beat(25.5), text: "A post, a video,\neven a friend's screenshot." },
  // 6. one is tapped and its card opens on the passage (the Ask clip's line)
  { at: beat(25.5), to: beat(29), until: true, text: 'Tap one to check it.' },
  // 7. the call to action, as the mark strikes and the wordmark wipes in on the name
  { at: beat(32), to: beat(35), text: 'Download Machina.', cta: true, duck: 0.4 },
  // 8. the close: the tagline on ONE line, exactly, under the lockup; the
  // music steps back
  { at: beat(35), to: beat(42.5), place: 'lockup', text: 'Everything you save, finally useful.', duck: 0.4 },
];

export const TOTAL_FRAMES = CAPTIONS[CAPTIONS.length - 1].to;
export const TOTAL_SEC = TOTAL_FRAMES / FPS;

/** Risers END on the reveal they lead into. [from, to] in frames. */
export const RISERS = [
  [beat(4), HITS.dotLands], // the gather → the point lands
  [beat(29), HITS.markStrike], // the throw → the mark strikes
];

/** One chord per bar (the film's and the reel's vocabulary). */
export const BAR_CHORDS = ['Fmaj7', 'G6', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'Cmaj7', 'Cmaj7'];
