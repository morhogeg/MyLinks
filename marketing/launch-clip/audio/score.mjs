/**
 * The launch film's score (the night look, audio/nocturne.mjs):
 *   node audio/score.mjs        →  public/score.wav
 *   node audio/mix-vo.mjs film  →  public/score-vo.wav (+ the narrator)
 *
 * Cue sheet in BARS (timeline.mjs: 96 BPM, 75 frames a bar). The boot is a
 * still breath of light; act one (the scattered saves, the loss) is the dark;
 * the gather is the turn; capture and the library drive; Ask and the graph
 * peak; collections and the digest drive again; the endcard lands it.
 *
 * (The endcard's mark strikes ~17 frames in: Endcard.tsx plays the app's
 * launch at 1.9× on EASE_OUT, and the point strikes at u ≈ 0.56.)
 */
import * as T from '../timeline.mjs';
import { writeScore } from './score-lib.mjs';

const f = (bar) => Math.round(bar * T.BAR_FRAMES);
const H = T.HITS;
const END_STRIKE = H.endcard + 17 / T.BAR_FRAMES;

writeScore({
  script: 'film',
  fps: T.FPS,
  bpm: T.BPM,
  total: T.TOTAL_FRAMES,
  out: 'score.wav',
  sections: [
    { from: 0, kind: 'still' },
    { from: f(1), kind: 'dark' },
    { from: f(H.converge), kind: 'turn' },
    { from: f(H.deviceIn), kind: 'drive' },
    { from: f(H.askIn), kind: 'peak' },
    { from: f(H.collectionsIn), kind: 'drive' },
    { from: f(H.endcard), kind: 'end' },
  ],
  hits: {
    booms: [f(H.markLock), f(END_STRIKE)],
    softBooms: [f(H.bootStrike), f(H.askIn)],
    risers: T.RISERS.map(f),
    ticks: [...T.SAVES, H.lossOpenA, H.lossOpenB, H.sourceCutA, H.sourceCutB, H.sourceCutC, H.graphTap].map(f),
    glints: [H.cardLands, H.filterSnap, H.citations, H.graphBloom].map(f),
    whooshes: [H.bootExit, H.converge, H.searchIn, H.graphTap + 0.2].map(f),
  },
});
