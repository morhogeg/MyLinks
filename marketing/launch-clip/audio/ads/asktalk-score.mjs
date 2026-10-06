/**
 * Meta ad 2's "talking to a friend" edition (the night look, audio/nocturne.mjs):
 *   node audio/ads/asktalk-score.mjs      →  public/ads/asktalk/score.wav
 *   node audio/mix-vo.mjs asktalk         →  public/ads/asktalk/score-vo.wav
 *   node audio/mix-vo.mjs asktalk-music   →  public/ads/asktalk/score-music.wav
 *
 * The two named saves catching the light in the dark; the gather; the chat
 * drives; the sources, the theme and the graph peak; the lockup.
 */
import * as T from '../../ads/asktalk-timeline.mjs';
import { every, writeScore } from '../score-lib.mjs';

const H = T.HITS;

writeScore({
  script: 'asktalk',
  fps: T.FPS,
  bpm: T.BPM,
  total: T.TOTAL_FRAMES,
  out: 'ads/asktalk/score.wav',
  sections: [
    { from: 0, kind: 'dark' },
    { from: H.collapse, kind: 'turn' },
    { from: H.open, kind: 'drive' },
    { from: H.source, kind: 'peak' },
    { from: H.lockup, kind: 'end' },
  ],
  hits: {
    booms: [H.dotLands, H.markStrike],
    softBooms: [H.open, H.ask2],
    risers: T.RISERS.map(([, end]) => end),
    ticks: [H.send, H.send2, H.graphTap],
    typing: [...every(H.open, H.send), ...every(H.ask2, H.send2)],
    glints: [H.talk, H.article, H.source, H.lead, ...H.chips, H.sources2],
    whooshes: [H.part, H.lockup],
  },
});
