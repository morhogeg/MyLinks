/**
 * The ASK clip's score (the night look, audio/nocturne.mjs):
 *   node audio/clips/ask-score.mjs  →  public/ask-score.wav
 *   node audio/mix-vo.mjs ask       →  public/ask-score-vo.wav
 *
 * A still, open hook over the feed; the cut into Ask lands on a boom and
 * the light; the answer drives; sources, the follow-up and the graph are the
 * peak; the lockup lands it.
 */
import * as T from '../../clips/ask-timeline.mjs';
import { every, writeScore } from '../score-lib.mjs';

const H = T.HITS;

writeScore({
  script: 'ask',
  fps: T.FPS,
  bpm: T.BPM,
  total: T.TOTAL_FRAMES,
  out: 'ask-score.wav',
  sections: [
    { from: 0, kind: 'still' },
    { from: H.open, kind: 'turn' },
    { from: H.typeFrom, kind: 'drive' },
    { from: H.chips[0], kind: 'peak' },
    { from: H.lockup, kind: 'end' },
  ],
  hits: {
    booms: [H.open, H.markStrike],
    risers: T.RISERS.map(([, end]) => end),
    ticks: [H.send, H.citeTap, H.closeTap, H.followTap, H.graphTap],
    typing: every(H.typeFrom, H.send),
    glints: [H.appMark, ...H.chips, H.summary],
    whooshes: [H.open - 22, H.graphTap + 6, H.lockup],
  },
});
