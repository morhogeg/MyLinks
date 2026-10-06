/**
 * Meta ad 1's score (the night look, audio/nocturne.mjs):
 *   node audio/ads/card-score.mjs     →  public/ads/card/score.wav
 *   node audio/mix-vo.mjs adcard      →  public/ads/card/score-vo.wav
 *   node audio/mix-vo.mjs adcard-music →  public/ads/card/score-music.wav
 *
 * The forgotten saves in the dark; the light as they collapse into the mark;
 * the card drives, its key points and graph peak, the reminder drives again;
 * the lockup lands it.
 */
import * as T from '../../ads/card-timeline.mjs';
import { writeScore } from '../score-lib.mjs';

const H = T.HITS;

writeScore({
  script: 'adcard',
  fps: T.FPS,
  bpm: T.BPM,
  total: T.TOTAL_FRAMES,
  out: 'ads/card/score.wav',
  sections: [
    { from: 0, kind: 'dark' },
    { from: H.collapse, kind: 'turn' },
    { from: H.shareStarts[0], kind: 'drive' },
    { from: H.keyPoints, kind: 'peak' },
    { from: H.bellTap, kind: 'drive' },
    { from: H.lockup, kind: 'end' },
  ],
  hits: {
    booms: [H.dotLands, H.markStrike],
    softBooms: [H.toApp, H.due],
    risers: T.RISERS.map(([, end]) => end),
    ticks: [...H.shareTaps, H.cardTap, H.graphTap, H.bellTap, H.saveTap],
    glints: [H.article, H.thread, H.screenshot, ...H.shareLands, H.keyPoints, H.related, H.smart, H.reminderSet, H.dueLift],
    whooshes: [H.toApp - 8, H.back, H.throw],
  },
});
