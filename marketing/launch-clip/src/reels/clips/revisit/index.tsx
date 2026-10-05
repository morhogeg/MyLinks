import React from 'react';
import { Composition } from 'remotion';
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from '../../../../clips/revisit-timeline.mjs';
import { MachinaClipRevisit } from './MachinaClipRevisit';

/**
 * The REVISIT feature clip's compositions (registered in src/Root.tsx):
 *  - MachinaClipRevisit        score + narrator + captions (the deliverable)
 *  - MachinaClipRevisitSilent  captions, no sound (stills and QA)
 *  - MachinaClipRevisitClean   no sound, no captions or kickers (the lockup keeps its line)
 */
export const RevisitClipCompositions: React.FC = () => (
  <>
    <Composition
      id="MachinaClipRevisit"
      component={MachinaClipRevisit}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{ withAudio: true, withCaptions: true, audioFile: 'clips/revisit/score-vo.wav' }}
    />
    <Composition
      id="MachinaClipRevisitSilent"
      component={MachinaClipRevisit}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{ withAudio: false, withCaptions: true }}
    />
    <Composition
      id="MachinaClipRevisitClean"
      component={MachinaClipRevisit}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{ withAudio: false, withCaptions: false }}
    />
  </>
);
