/**
 * Meta ad 2's score, "The trip" (the night look, audio/nocturne.mjs):
 *   node audio/ads/trip-score.mjs     →  public/ads/trip/score.wav
 *   node audio/mix-vo.mjs trip        →  public/ads/trip/score-vo.wav
 *   node audio/mix-vo.mjs trip-music  →  public/ads/trip/score-music.wav
 *
 * The question over the piles in the dark; the light as they gather; the
 * chat drives; across the saves and into the graph it peaks; the lockup.
 */
import * as T from '../../ads/trip-timeline.mjs';
import { every, writeScore } from '../score-lib.mjs';

const H = T.HITS;

writeScore({
  script: 'trip',
  fps: T.FPS,
  bpm: T.BPM,
  total: T.TOTAL_FRAMES,
  out: 'ads/trip/score.wav',
  sections: [
    { from: 0, kind: 'dark' },
    { from: H.collapse, kind: 'turn' },
    { from: H.open, kind: 'drive' },
    { from: H.feed, kind: 'peak' },
    { from: H.lockup, kind: 'end' },
  ],
  hits: {
    booms: [H.dotLands, H.markStrike],
    softBooms: [H.open, H.ask2],
    risers: T.RISERS.map(([, end]) => end),
    ticks: [H.send, H.send2, H.graphTap],
    typing: [...every(H.open, H.send), ...every(H.ask2, H.send2)],
    glints: [H.source, H.lead, ...H.chips, H.sources2],
    whooshes: [H.part, H.feed, H.lockup],
  },
});
