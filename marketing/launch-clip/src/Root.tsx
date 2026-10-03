import React from 'react';
import { Composition } from 'remotion';
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from '../timeline.mjs';
import * as REEL from '../reel-timeline.mjs';
import { Film } from './Film';
import { MachinaReel } from './reels/MachinaReel';
import * as ASK from '../clips/ask-timeline.mjs';
import { MachinaAsk } from './reels/clips/ask/MachinaAsk';
import * as TRIP from '../ads/trip-timeline.mjs';
import { MachinaAdTrip } from './reels/ads/trip/MachinaAdTrip';
import * as ASKTALK from '../ads/asktalk-timeline.mjs';
import { MachinaAdAskTalk } from './reels/ads/asktalk/MachinaAdAskTalk';

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
    {/* feature clip: ASK (src/reels/clips/ask, its clock in clips/ask-timeline.mjs):
        MachinaAsk (score + narrator + captions, the deliverable), Silent (stills/QA), Clean */}
    <>
      <Composition
        id="MachinaAsk"
        component={MachinaAsk}
        durationInFrames={ASK.TOTAL_FRAMES}
        fps={ASK.FPS}
        width={ASK.WIDTH}
        height={ASK.HEIGHT}
        defaultProps={{ withAudio: true, withCaptions: true, audioFile: 'ask-score-vo.wav' }}
      />
      <Composition
        id="MachinaAskSilent"
        component={MachinaAsk}
        durationInFrames={ASK.TOTAL_FRAMES}
        fps={ASK.FPS}
        width={ASK.WIDTH}
        height={ASK.HEIGHT}
        defaultProps={{ withAudio: false, withCaptions: true }}
      />
      <Composition
        id="MachinaAskClean"
        component={MachinaAsk}
        durationInFrames={ASK.TOTAL_FRAMES}
        fps={ASK.FPS}
        width={ASK.WIDTH}
        height={ASK.HEIGHT}
        defaultProps={{ withAudio: false, withCaptions: false }}
      />
    </>
    {/* Meta ad: THE TRIP (src/reels/ads/trip, its clock in ads/trip-timeline.mjs):
        MachinaAdTrip (9:16, the main cut), MachinaAdTripMusic (9:16, no
        narrator), MachinaAdTripFeed (4:5, reframed) */}
    <>
      <Composition
        id="MachinaAdTrip"
        component={MachinaAdTrip}
        durationInFrames={TRIP.TOTAL_FRAMES}
        fps={TRIP.FPS}
        width={TRIP.WIDTH}
        height={TRIP.HEIGHT}
        defaultProps={{ shape: 'story' as const, audioFile: 'ads/trip/score-vo.wav', withCaptions: true }}
      />
      <Composition
        id="MachinaAdTripMusic"
        component={MachinaAdTrip}
        durationInFrames={TRIP.TOTAL_FRAMES}
        fps={TRIP.FPS}
        width={TRIP.WIDTH}
        height={TRIP.HEIGHT}
        defaultProps={{ shape: 'story' as const, audioFile: 'ads/trip/score-music.wav', withCaptions: true }}
      />
      <Composition
        id="MachinaAdTripFeed"
        component={MachinaAdTrip}
        durationInFrames={TRIP.TOTAL_FRAMES}
        fps={TRIP.FPS}
        width={TRIP.WIDTH}
        height={TRIP.FEED_HEIGHT}
        defaultProps={{ shape: 'feed' as const, audioFile: 'ads/trip/score-vo.wav', withCaptions: true }}
      />
    </>
    {/* Meta ad 2, the "talking to a friend" edition (src/reels/ads/asktalk, its
        clock in ads/asktalk-timeline.mjs), beside round 6 above */}
    <>
      <Composition
        id="MachinaAdAskTalk"
        component={MachinaAdAskTalk}
        durationInFrames={ASKTALK.TOTAL_FRAMES}
        fps={ASKTALK.FPS}
        width={ASKTALK.WIDTH}
        height={ASKTALK.HEIGHT}
        defaultProps={{ shape: 'story' as const, audioFile: 'ads/asktalk/score-vo.wav', withCaptions: true }}
      />
      <Composition
        id="MachinaAdAskTalkMusic"
        component={MachinaAdAskTalk}
        durationInFrames={ASKTALK.TOTAL_FRAMES}
        fps={ASKTALK.FPS}
        width={ASKTALK.WIDTH}
        height={ASKTALK.HEIGHT}
        defaultProps={{ shape: 'story' as const, audioFile: 'ads/asktalk/score-music.wav', withCaptions: true }}
      />
      <Composition
        id="MachinaAdAskTalkFeed"
        component={MachinaAdAskTalk}
        durationInFrames={ASKTALK.TOTAL_FRAMES}
        fps={ASKTALK.FPS}
        width={ASKTALK.WIDTH}
        height={ASKTALK.FEED_HEIGHT}
        defaultProps={{ shape: 'feed' as const, audioFile: 'ads/asktalk/score-vo.wav', withCaptions: true }}
      />
    </>
  </>
);
