/**
 * Meta ad 3's score (the night look, audio/nocturne.mjs):
 *   node audio/ads/todo-score.mjs      →  public/ads/todo/score.wav
 *   node audio/mix-vo.mjs adtodo       →  public/ads/todo/score-vo.wav
 *   node audio/mix-vo.mjs adtodo-music →  public/ads/todo/score-music.wav
 *
 * Every forgotten save in the dark, each named one catching the light; the
 * gather and the snap; the feed drives; the summary and the clusters peak;
 * the lockup lands it.
 */
import * as T from '../../clips/ad-todo-timeline.mjs';
import { writeScore } from '../score-lib.mjs';

const H = T.HITS;

writeScore({
  script: 'adtodo',
  fps: T.FPS,
  bpm: T.BPM,
  total: T.TOTAL_FRAMES,
  out: 'ads/todo/score.wav',
  sections: [
    { from: 0, kind: 'dark' },
    { from: H.gather[0], kind: 'turn' },
    { from: H.iris[0], kind: 'drive' },
    { from: H.glide[0], kind: 'peak' },
    { from: H.out, kind: 'end' },
  ],
  hits: {
    booms: [H.snap, H.markStrike],
    softBooms: [H.cluster],
    risers: T.RISERS.map(([, end]) => end),
    ticks: [...H.named.map((f) => f + 1), ...H.lands],
    glints: [...H.named, H.keyPoints, H.cluster, H.cluster2],
    whooshes: [H.iris[0], H.out],
  },
});
