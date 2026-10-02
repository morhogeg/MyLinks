/**
 * Meta ad 2 of 3, the Ask ad (the branch is named for its first concept, "The
 * trip you already planned"): the single source of truth for its time.
 * Round 4 (owner-approved script, 2026-10-02): the chat, shown off. The hook
 * ("What if your saves could talk back?") over saves of every kind from five
 * apps; they gather into the mark ("With Machina, they can."); a simple
 * question gets a simple answer from one save; the feed rushes past and a big
 * question gets one answer woven from three saves on three platforms; the
 * theme it found and the saves it connected lift, with the questions the app
 * suggests next under them, and its Graph chip opens the real graph with
 * those saves lit (round 5); "Download Machina." (said, not shown) and the
 * tagline.
 * Picture (src/reels/ads/trip/), score (audio/ads/trip-score.mjs), narrator
 * (audio/synth-vo.py trip) and the ad's verify gates
 * (audio/ads/trip-verify.mjs) all read this file.
 *
 * Written in OUTPUT frames on the reel's grid: 112.5 BPM, 16 frames a beat.
 * Cuts and taps on beats or 8ths, every line starting on a beat or an 8th.
 * The app's motion plays at the reel's steady pace (a frame captured at 30fps
 * lasts K output frames, one at 60fps lasts one); typing plays a character a
 * frame (TYPE_STEP), so a question asks itself as fast as it reads.
 *
 * THE META SPEC (2026-10-02 brief): about 20s, never over 30; frame 0 is the
 * poster (saves from five apps, legible, the hook line already up); the
 * narrator starts by 0.5s; the mark forms at 2.9s; every line burned in, at
 * most 8 words up at once (the two long sentences are spoken whole and shown
 * as two captions each, `split`); every line, logo and key app moment inside
 * the 9:16 safe zone (verified on stills).
 *
 * Every frame of app UI is the real app, one continuous take (`adask`,
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
export const TAKE = 'adask';

/**
 * Picture events, in frames. The scenes and the score read these same
 * numbers. A tap lands on the frame the app answers it.
 */
export const HITS = {
  hook: 0, // saves of every kind, each in the app it was saved in (the poster)
  lost: beat(3), // the line lands: the piles drift apart and go soft
  collapse: beat(4), // they gather into one point (EASE_GATHER)…
  dotLands: beat(5), // …which lands
  bracketsClose: beat(5.5), // the brackets snap shut around it (2.9s)
  wordmark: beat(6), // the drawn wordmark wipes in as "Machina" is said
  part: beat(7.5), // the mark and the wordmark leave
  open: beat(9), // CUT to the chat: the simple question types itself
  send: beat(12.5), // Send is tapped; the cut to its answer lands on the touch
  feed: beat(17), // CUT to the feed rushing past ("…hundreds of saves")
  ask2: beat(19), // CUT to a new chat, the big question typed
  send2: beat(19.5), // Send is tapped; its answer arrives on the touch
  sources2: beat(22.5), // its three sources and the suggested next questions arrive
  lead: beat(24), // the theme it found (the answer's first line) lifts
  chips: [448, 458, 468], // the three saves it connected lift ("you never noticed": vo.json)
  graphTap: beat(30.5), // its Graph chip is tapped: the saves it connected, lit in the real graph
  lockup: beat(35), // thrown out into the lockup; the mark launches (round 6: the graph holds a beat longer)
  markStrike: beat(37), // the mark's point strikes as the call to action is said
};

/** how many of the feed's captured 12pt steps the rush plays: it stops short
 *  of the first recipe card in the feed (Marcella Hazan's sauce enters at
 *  step 199; no recipe in frame, owner 2026-10-02; verify checks) */
export const FEED_STEPS = 186;

/** output frames per typed character (the capture types one per frame) */
export const TYPE_STEP = 1;

/**
 * The captions ARE the script (audio/synth-vo.py trip speaks each as
 * written, "Machina" respelled for the voice only). `at` is the frame the
 * voice starts, `to` the frame the line has left (the dwell rule: 0.3–1.2s
 * after the voice). `pre` puts a line on screen, whole, from frame 0, so the
 * poster says the hook with the sound off. `split: n` speaks a sentence whole
 * but shows it as two captions, the second arriving with word n, so no more
 * than 8 words are ever up at once. `\n` is a break on screen only.
 */
export const CAPTIONS = [
  { at: beat(0.5), to: beat(4.5), hook: true, pre: true, text: 'What if your saves\ncould talk back?' },
  { at: beat(5.5), to: beat(8.5), text: 'With Machina, they can.', duck: 0.4 },
  { at: beat(9.5), to: beat(13.5), text: "Ask it about\nanything you've saved." },
  { at: beat(17), to: beat(23.5), split: 5, text: 'Even across hundreds of saves,\nyou get one clear answer.' },
  // (round 5, owner: the graph plays under "you never noticed.", so the line
  // stays up while it blooms: `until`)
  { at: beat(24), to: beat(32), split: 7, until: true, text: 'And it finds the themes and connections\nyou never noticed.' },
  // the call to action, said as the mark strikes and the wordmark wipes in on
  // the name; never on screen (owner, round 5: keep the narration, not the text)
  { at: beat(37), to: beat(40), text: 'Download Machina.', cta: true, hidden: true, duck: 0.4 },
  // the close: the tagline on ONE line, exactly; the music steps back
  { at: beat(40), to: beat(47), place: 'lockup', text: 'Everything you save, finally useful.', duck: 0.4 },
];

export const TOTAL_FRAMES = CAPTIONS[CAPTIONS.length - 1].to;
export const TOTAL_SEC = TOTAL_FRAMES / FPS;

/** Risers END on the reveal they lead into. [from, to] in frames. */
export const RISERS = [
  [beat(3), HITS.dotLands], // the gather → the point lands
  [beat(17), HITS.ask2], // the feed rushing past → the big question
  [beat(34), HITS.markStrike], // the throw → the mark strikes
];

/** One chord per bar (the film's and the reel's vocabulary). */
export const BAR_CHORDS = ['Fmaj7', 'G6', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'Cmaj7', 'Cmaj7'];
