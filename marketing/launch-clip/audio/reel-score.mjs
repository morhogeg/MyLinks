/**
 * The highlight reel's score (the night look, audio/nocturne.mjs):
 *   node audio/reel-score.mjs   →   public/reel-score.wav
 *   node audio/mix-vo.mjs reel  →   public/reel-score-vo.wav (+ the narrator)
 *
 * Cue sheet, in OUTPUT frames (the timeline's HITS are source frames: real()).
 * Lost in the dark until the saves collapse; the light comes on as the point
 * lands and holds through the name; the product drives from the share beat,
 * peaks on Ask and the graph, breathes for Revisit, and lands on the lockup.
 */
import * as T from '../reel-timeline.mjs';
import { writeScore } from './score-lib.mjs';

const r = (f) => Math.round(T.real(f));
const H = T.HITS;
const shareBeat = T.holdStart('share');

writeScore({
  script: 'reel',
  fps: T.FPS,
  bpm: T.BPM,
  total: T.TOTAL_FRAMES,
  out: 'reel-score.wav',
  sections: [
    { from: 0, kind: 'dark' },
    { from: r(H.collapse), kind: 'turn' },
    { from: shareBeat, kind: 'drive' },
    { from: r(H.askTap), kind: 'peak' },
    { from: r(H.revisitTap), kind: 'drive' },
    { from: r(H.lockup), kind: 'end' },
  ],
  hits: {
    booms: [r(H.dotLands), r(H.markStrike)],
    softBooms: [r(H.toApp), r(H.graph)],
    risers: T.RISERS.map(([, end]) => r(end)),
    ticks: [H.plusTap, H.saveTap, H.searchTap, H.askTap, H.send, H.graphTap, H.revisitTap, H.recapTap].map(r),
    glints: [...H.phases, ...H.chips, H.cardLands, H.found, H.standout].map(r),
    whooshes: [r(H.toApp) - 8, r(H.graphTap) + 6, r(H.lockup) - 10],
  },
});
