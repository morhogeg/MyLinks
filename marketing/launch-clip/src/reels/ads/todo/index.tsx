import React from 'react';
import { Composition } from 'remotion';
import { FEED_HEIGHT, FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from '../../../../clips/ad-todo-timeline.mjs';
import { AdTodo } from './AdTodo';

/**
 * Meta ad 3's compositions (registered in src/Root.tsx):
 *  - MachinaAdTodo        9:16, score + narrator + captions (the main cut)
 *  - MachinaAdTodoMusic   9:16, score + captions, no narrator (the A/B cut)
 *  - MachinaAdTodoFeed    4:5 (1080 × 1350), score + narrator + captions
 *  - MachinaAdTodoSilent  9:16, captions, no sound (stills and QA)
 */
export const AdTodoCompositions: React.FC = () => (
  <>
    <Composition id="MachinaAdTodo" component={AdTodo} durationInFrames={TOTAL_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT}
      defaultProps={{ withAudio: true, withCaptions: true, audioFile: 'ads/todo/score-vo.wav' }} />
    <Composition id="MachinaAdTodoMusic" component={AdTodo} durationInFrames={TOTAL_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT}
      defaultProps={{ withAudio: true, withCaptions: true, audioFile: 'ads/todo/score-music.wav' }} />
    <Composition id="MachinaAdTodoFeed" component={AdTodo} durationInFrames={TOTAL_FRAMES} fps={FPS} width={WIDTH} height={FEED_HEIGHT}
      defaultProps={{ withAudio: true, withCaptions: true, audioFile: 'ads/todo/score-vo.wav' }} />
    <Composition id="MachinaAdTodoSilent" component={AdTodo} durationInFrames={TOTAL_FRAMES} fps={FPS} width={WIDTH} height={HEIGHT}
      defaultProps={{ withAudio: false, withCaptions: true }} />
    <Composition id="MachinaAdTodoFeedSilent" component={AdTodo} durationInFrames={TOTAL_FRAMES} fps={FPS} width={WIDTH} height={FEED_HEIGHT}
      defaultProps={{ withAudio: false, withCaptions: true }} />
  </>
);
