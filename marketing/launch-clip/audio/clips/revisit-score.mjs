/**
 * The REVISIT clip's score (the night look, audio/nocturne.mjs):
 *   node audio/clips/revisit-score.mjs  →  public/clips/revisit/score.wav
 *   node audio/mix-vo.mjs revisit       →  public/clips/revisit/score-vo.wav
 *
 * The opening's saves lost in the dark; the light as they gather into the
 * point and iris into Revisit; the reminders drive; the weekly recap is CALM
 * (it is read, never rushed); the standout lifts back into the drive; the
 * lockup lands it. HITS are app frames: clip frame = HITS + OPEN.
 */
import * as T from '../../clips/revisit-timeline.mjs';
import { writeScore } from '../score-lib.mjs';

const H = T.HITS;
const O = T.OPEN;
const c = (f) => f + O;

writeScore({
  script: 'revisit',
  fps: T.FPS,
  bpm: T.BPM,
  total: T.TOTAL_FRAMES,
  out: 'clips/revisit/score.wav',
  sections: [
    { from: 0, kind: 'dark' },
    { from: T.OPENING.gather[0], kind: 'turn' },
    { from: c(H.settle), kind: 'drive' },
    { from: c(H.rise[0]), kind: 'calm' },
    { from: c(H.standout), kind: 'drive' },
    { from: c(H.out), kind: 'end' },
  ],
  hits: {
    booms: [T.OPENING.gather[1], c(H.markStrike)],
    risers: T.RISERS.map(([, end]) => end),
    ticks: [H.bell, H.cancel, H.openTap, H.tick, H.recapTap, H.cardTap].map(c),
    glints: [H.dueLift, H.smartLift, H.keyPoints[0], H.todoLift, H.standout].map(c),
    whooshes: [c(H.travel[0]), c(H.out)],
  },
});
