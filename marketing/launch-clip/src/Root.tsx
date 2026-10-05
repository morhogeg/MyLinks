import React from 'react';
import { Composition } from 'remotion';
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from '../timeline.mjs';
import * as REEL from '../reel-timeline.mjs';
import { Film } from './Film';
import { MachinaReel } from './reels/MachinaReel';
import { RevisitClipCompositions } from './reels/clips/revisit';
import { AdTodoCompositions } from './reels/ads/todo';
import * as SAVE from '../clips/save-timeline.mjs';
import { SaveClip } from './reels/clips/save/SaveClip';
import { AdCardCompositions } from './reels/ads/card/Compositions';

/**
 * Compositions:
 *  - MachinaLaunch      the film, as delivered (1920×1080)
 *  - MachinaLaunchSilent the same picture with no score (for a voice-over pass)
 *  - MachinaLaunchClean  no score, no captions (for social cuts / stills)
 *  - MachinaLaunchVertical        the 1080×1920 edition (iPhone / Reels / Shorts)
 *  - MachinaLaunchVerticalSilent  vertical, no score (stills QA / voice-over)
 *
 * The vertical editions are the SAME scene code reframed through
 * `film/format.ts` — device centred and lower, captions centred at the top.
 *
 * The highlight reel (src/reels, its own clock in reel-timeline.mjs):
 *  - MachinaReel        20s, 1080×1920, score + narrator + captions (the deliverable)
 *  - MachinaReelSilent  captions, no sound
 *  - MachinaReelClean   no sound, no captions or kickers (the lockup stays)
 */
export const RemotionRoot: React.FC = () => (
  <>
    <Composition
      id="MachinaLaunch"
      component={Film}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{ withAudio: true, withSubtitles: true }}
    />
    <Composition
      id="MachinaLaunchSilent"
      component={Film}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{ withAudio: false, withSubtitles: true }}
    />
    <Composition
      id="MachinaLaunchClean"
      component={Film}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{ withAudio: false, withSubtitles: false }}
    />
    <Composition
      id="MachinaLaunchVertical"
      component={Film}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={HEIGHT}
      height={WIDTH}
      defaultProps={{ withAudio: true, withSubtitles: true }}
    />
    <Composition
      id="MachinaLaunchVerticalSilent"
      component={Film}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={HEIGHT}
      height={WIDTH}
      defaultProps={{ withAudio: false, withSubtitles: true }}
    />
    {/* voice-over editions — public/score-vo.wav from audio/mix-vo.mjs */}
    <Composition
      id="MachinaLaunchVO"
      component={Film}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={WIDTH}
      height={HEIGHT}
      defaultProps={{ withAudio: true, withSubtitles: true, audioFile: 'score-vo.wav' }}
    />
    <Composition
      id="MachinaLaunchVerticalVO"
      component={Film}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={HEIGHT}
      height={WIDTH}
      defaultProps={{ withAudio: true, withSubtitles: true, audioFile: 'score-vo.wav' }}
    />
    {/* the highlight reel */}
    <Composition
      id="MachinaReel"
      component={MachinaReel}
      durationInFrames={REEL.TOTAL_FRAMES}
      fps={REEL.FPS}
      width={REEL.WIDTH}
      height={REEL.HEIGHT}
      defaultProps={{ withAudio: true, withCaptions: true, audioFile: 'reel-score-vo.wav' }}
    />
    <Composition
      id="MachinaReelSilent"
      component={MachinaReel}
      durationInFrames={REEL.TOTAL_FRAMES}
      fps={REEL.FPS}
      width={REEL.WIDTH}
      height={REEL.HEIGHT}
      defaultProps={{ withAudio: false, withCaptions: true }}
    />
    <Composition
      id="MachinaReelClean"
      component={MachinaReel}
      durationInFrames={REEL.TOTAL_FRAMES}
      fps={REEL.FPS}
      width={REEL.WIDTH}
      height={REEL.HEIGHT}
      defaultProps={{ withAudio: false, withCaptions: false }}
    />
    {/* the REVISIT feature clip (clips/revisit-timeline.mjs) */}
    <RevisitClipCompositions />
    <AdTodoCompositions />
    {/* the SAVE feature clip (src/reels/clips/save, clips/save-timeline.mjs):
        MachinaClipSave (score + narrator + captions, the deliverable), Silent
        (captions, no sound), Clean (no sound, no captions or kickers) */}
    <Composition
      id="MachinaClipSave"
      component={SaveClip}
      durationInFrames={SAVE.TOTAL_FRAMES}
      fps={SAVE.FPS}
      width={SAVE.WIDTH}
      height={SAVE.HEIGHT}
      defaultProps={{ withAudio: true, withCaptions: true, audioFile: 'clips/save/score-vo.wav' }}
    />
    <Composition
      id="MachinaClipSaveSilent"
      component={SaveClip}
      durationInFrames={SAVE.TOTAL_FRAMES}
      fps={SAVE.FPS}
      width={SAVE.WIDTH}
      height={SAVE.HEIGHT}
      defaultProps={{ withAudio: false, withCaptions: true }}
    />
    <Composition
      id="MachinaClipSaveClean"
      component={SaveClip}
      durationInFrames={SAVE.TOTAL_FRAMES}
      fps={SAVE.FPS}
      width={SAVE.WIDTH}
      height={SAVE.HEIGHT}
      defaultProps={{ withAudio: false, withCaptions: false }}
    />
    {/* Meta ad 1, "What one save becomes" (src/reels/ads/card) */}
    <AdCardCompositions />
  </>
);
