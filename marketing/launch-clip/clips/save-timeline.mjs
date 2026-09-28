/**
 * SAVE, the feature clip ("Save anything, from anywhere, and Machina does the
 * rest"): its single source of time. reel-timeline.mjs is the template; the
 * picture (src/reels/clips/save/), the score (audio/clips/save-score.mjs), the
 * narrator (audio/synth-vo.py save) and `npm run verify` all read this file.
 *
 * THE CUT is a re-edit of the highlight reel's own Save chapter, on the
 * reel's grid (112.5 BPM, 16 frames a beat, one steady speed, K = 2):
 *
 *  1. frames 0 … CARD_AT PLAY THE REEL, frame for frame, from REEL_FROM (the
 *     share beat, just before its first card arrives) through the Add dialog,
 *     its Link / Image / Note tour, the five phases and the card landing. The
 *     reel's scenes are imported unchanged and driven by the reel's own clock
 *     (`reelFrame`), so every shot there is the approved reel's, pixel for
 *     pixel. REEL_FROM is a whole number of beats: the reel's beat lines are
 *     the clip's, and every tap and landing keeps its beat.
 *  2. the clip's own beat (src/reels/clips/save/Card.tsx): the new card
 *     tapped open, read down to its Key Points, then thrown out of frame;
 *  3. the reel's lockup (src/reels/clips/save/End.tsx): the mark launches,
 *     "Machina. Never lose another great find."
 *
 * Captions, kickers, hits and the score are in CLIP output frames.
 */

import * as REEL from '../reel-timeline.mjs';

export const { FPS, WIDTH, HEIGHT, K, BPM, BEAT_FRAMES, BAR_FRAMES, BEAT, BAR } = REEL;

/** the nearest beat */
export const onBeat = (f) => Math.round(f / BEAT_FRAMES) * BEAT_FRAMES;

/** The reel output frame the clip opens on: 24 frames into the reel's share
 *  hold, 12 frames before its first card arrives (a beat for the lockup to
 *  come into focus, the kicker and the line to arrive). A whole number of
 *  beats (480 = 30), so the reel's grid is the clip's. */
export const REEL_FROM = REEL.holdStart('share') + 24;
/** clip frame → the reel output frame it plays (frames before CARD_AT) */
export const reelFrame = (f) => f + REEL_FROM;
/** a reel output frame, in the clip */
const clip = (reelOut) => reelOut - REEL_FROM;

/** Where the clip leaves the reel: the reel's card hold, on the frame the
 *  reel would open the new card. From here the clip's own scenes play. */
export const CARD_AT = clip(REEL.holdStart('card'));

/**
 * The card beat, in frames from CARD_AT (Card.tsx). The card is tapped on a
 * beat (the app opens it on that frame and the tick sounds), the detail view
 * is read from its title and gist down to the Key Points, which lift on the
 * downbeat of bar 10, and the camera throws the screen out of frame into the
 * lockup (the reel's Recall → End move). Whole beats: the lockup starts on a
 * bar line.
 */
export const CARD = {
  tap: 16,
  /** the read-down, the app's scroll captured in 5pt steps */
  scroll: [80, 116],
  /** the Key Points lift (bar 10) */
  keyPoints: 112,
  /** the throw starts on the lockup's downbeat, as the drums stop: the
   *  screen clears the frame as the mark's first ticks appear (measured: it
   *  is gone ~20 frames in, the mark shows from 20 frames in) */
  throw: 176,
};
export const THROW_LEN = 30;
export const CARD_LEN = 176; // 11 beats: the lockup (and the throw) start on bar 11
export const LOCKUP = CARD_AT + CARD_LEN;
/** the lockup (End.tsx): the mark's point strikes a beat before the line */
export const STRIKE = LOCKUP + 48;
export const TOTAL_FRAMES = LOCKUP + 192;
export const TOTAL_SEC = TOTAL_FRAMES / FPS;

/**
 * Picture events the score acknowledges, in CLIP frames. The reel's are read
 * off the reel's own timeline (the scenes that draw them read the same
 * numbers), the card's and the lockup's off the clip's.
 */
const S0 = REEL.holdStart('share');
const M0 = REEL.holdStart('modes');
export const HITS = {
  shareTaps: REEL.SHARE_STARTS.map((t) => clip(S0 + t + REEL.SHARE_BEAT.tap)),
  sharePulls: REEL.SHARE_STARTS.map((t) => clip(S0 + t + REEL.SHARE_BEAT.pull)),
  shareLands: REEL.SHARE_STARTS.map((t) => clip(S0 + t + REEL.SHARE_BEAT.land)),
  /** the point arrives on the + button (the iris opens around it) */
  toApp: clip(REEL.real(REEL.HITS.toApp)),
  plusTap: clip(REEL.real(REEL.HITS.plusTap)),
  dialog: clip(REEL.real(REEL.HITS.dialog)),
  tour: clip(M0),
  modeTaps: REEL.MODES.taps.map((u) => clip(M0 + u)),
  paste: clip(M0 + REEL.MODES.paste),
  saveTap: clip(M0 + REEL.MODES.save),
  phases: REEL.HITS.phases.map((p) => clip(REEL.real(p))),
  saved: clip(REEL.real(REEL.HITS.saved)),
  cardLands: clip(REEL.real(REEL.HITS.cardLands)),
  cardTap: CARD_AT + CARD.tap,
  keyPoints: CARD_AT + CARD.keyPoints,
  throw: CARD_AT + CARD.throw,
  lockup: LOCKUP,
  markStrike: STRIKE,
};

/**
 * The narrator's lines = the captions (verify holds them to each other; the
 * same `af_heart` voice, "Machina" spoken "Makeena"). At most three lines and
 * the closing subtitle. The three are the reel's own Save lines, at the
 * frames the reel says them (so each lands on the same picture): the shares,
 * the dialog's tour, the phases ("reads" on "Reading the page"). The card
 * beat is pure picture: its Key Points are the proof of "summarizes it".
 * NO em dashes, no literal "AI", no "second brain", no "library" (verify).
 */
const reelLine = (opens) => {
  const c = REEL.CAPTIONS.find((x) => x.text.startsWith(opens));
  if (!c) throw new Error(`the reel has no line opening "${opens}"`);
  return { ...c, at: clip(c.at), to: clip(c.to) };
};
export const CAPTIONS = [
  reelLine('Save anything'),
  reelLine('A link, a screenshot'),
  reelLine('Machina reads it'),
  // the close: the name (the drawn wordmark wipes in as it is said), then
  // the subtitle, a beat after the mark strikes
  { at: STRIKE + BEAT_FRAMES, to: TOTAL_FRAMES, place: 'lockup', text: 'Machina.\nNever lose another great find.', duck: 0.4 },
];

/**
 * The chapter word, SAVE, in OUTPUT frames: on screen only with its
 * narration, 4 frames before each line, leaving with it; lines closer than
 * KICKER_BRIDGE frames share one label (the reel's rule, round 11).
 */
const KICKER_LEAD = 4;
export const KICKER_BRIDGE = 24;
export const KICKERS = CAPTIONS.filter((c) => !c.place).reduce((spans, c) => {
  const last = spans[spans.length - 1];
  if (last && c.at - last.to < KICKER_BRIDGE) last.to = c.to;
  else spans.push({ at: c.at - KICKER_LEAD, to: c.to, text: 'Save' });
  return spans;
}, []);

/**
 * THE SCORE's map (audio/clips/save-score.mjs), one chord per CLIP bar: it
 * opens airy on IV while the shares arrive, leans on V as the point drops
 * into the app, comes home as the drums enter on the tour, and resolves IV →
 * I (the plagal close) from the Key Points into the lockup.
 */
export const BAR_CHORDS = ['Fmaj7', 'Cmaj7', 'Fmaj7', 'G6', 'Cmaj7', 'Fmaj7', 'G6', 'Cmaj7', 'Fmaj7', 'G6', 'Fmaj7', 'Cmaj7', 'Cmaj7', 'Cmaj7'];
/** the drums: in on the downbeat the Add dialog's tour starts, out for the
 *  lockup (the mark strikes into air) */
export const DRUMS = [HITS.tour, LOCKUP];
/** Risers END on the reveal they lead into: the app (the iris half open, as
 *  in the reel), and the mark's strike. [from, to] in clip frames. */
export const RISERS = [
  [HITS.toApp - 32, HITS.toApp + 16],
  [LOCKUP - 24, STRIKE],
];
