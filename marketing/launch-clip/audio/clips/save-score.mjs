/**
 * The SAVE clip's score (the night look, audio/nocturne.mjs):
 *   node audio/clips/save-score.mjs  →  public/clips/save/score.wav
 *   node audio/mix-vo.mjs save       →  public/clips/save/score-vo.wav
 *
 * Lost in the dark over the six piles; the light comes on as they collapse
 * into the point; the shares and the source tour drive; screenshots → one
 * card is the peak; the lockup lands it.
 */
import * as T from '../../clips/save-timeline.mjs';
import { writeScore } from '../score-lib.mjs';

const H = T.HITS;

writeScore({
  script: 'save',
  fps: T.FPS,
  bpm: T.BPM,
  total: T.TOTAL_FRAMES,
  out: 'clips/save/score.wav',
  sections: [
    { from: 0, kind: 'dark' },
    { from: H.collapse, kind: 'turn' },
    { from: H.shareStarts[0], kind: 'drive' },
    { from: H.shots, kind: 'peak' },
    { from: H.lockup, kind: 'end' },
  ],
  hits: {
    booms: [H.dotLands, H.markStrike],
    softBooms: [H.toApp],
    risers: T.RISERS.map(([, end]) => end),
    ticks: [...H.shareTaps, ...H.srcTaps, H.summarizeTap, H.plusTap, H.imageTap, H.pick, H.saveTap, H.cardTap],
    glints: [...H.shareLands, ...H.moments, H.xPoints, H.photo, H.articleDo, H.noteRead, H.cardDone, H.keyPoints, H.tags, ...H.related],
    whooshes: [H.toApp - 8, H.throw],
  },
});
