/**
 * The FIND clip's score (the night look, audio/nocturne.mjs):
 *   node audio/find-score.mjs   →  public/clips/find/score.wav
 *   node audio/mix-vo.mjs find  →  public/clips/find/score-vo.wav
 *
 * The question in the dark ("what was it called?"), the light on "Machina
 * finds it", a driving search, the lockup. Keystrokes are quiet ticks.
 */
import * as T from '../clips/find-timeline.mjs';
import { every, writeScore } from './score-lib.mjs';

const H = T.HITS;

writeScore({
  script: 'find',
  fps: T.FPS,
  bpm: T.BPM,
  total: T.TOTAL_FRAMES,
  out: 'clips/find/score.wav',
  sections: [
    { from: 0, kind: 'dark' },
    { from: 128, kind: 'turn' },
    { from: H.type1, kind: 'drive' },
    { from: H.lockup, kind: 'end' },
  ],
  hits: {
    booms: [H.markStrike],
    softBooms: [H.fieldTap],
    risers: T.RISERS.map(([, end]) => end),
    ticks: [H.fieldTap, H.chipTap, H.cardTap],
    typing: [...every(H.type1, H.found1), ...every(H.type2, H.found2), ...every(H.type3, H.chipTap)],
    glints: [H.found1, H.found2, H.chipTap + 8, H.cardTap + 16],
    whooshes: [H.scroll, H.scrollBack, H.throwOut],
  },
});
