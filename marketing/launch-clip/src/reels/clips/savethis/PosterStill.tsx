import React from 'react';
import { AbsoluteFill } from 'remotion';
import { sans } from '../../../fonts';
import { Lens, Paper } from '../../kit/Paper';
import { GRADE } from './grade';
import { PosterArt } from './Poster';

/**
 * Frame 0 alone, for the cover the capture serves to the app
 * (`npx remotion still src/index.ts MachinaSaveThisPoster
 * public/clips/savethis/cover.jpg`): the same Paper, type, bookmark and lens
 * the reel's first frame draws, with nothing that depends on the capture.
 */
export const PosterStill: React.FC = () => (
  <AbsoluteFill style={{ fontFamily: sans }}>
    <Paper tone={GRADE.tone} cool={GRADE.cool} />
    <PosterArt />
    <Lens vignette={GRADE.vignette} grain={GRADE.grain} />
  </AbsoluteFill>
);
