import React from 'react';
import { Composition } from 'remotion';
import { FPS, HEIGHT, TOTAL_FRAMES, WIDTH } from '../timeline.mjs';
import * as REEL from '../reel-timeline.mjs';
import { Film } from './Film';
import { MachinaReel } from './reels/MachinaReel';
import * as FIND from '../clips/find-timeline.mjs';
import { FindClip } from './reels/clips/find/FindClip';
import * as SAVETHIS from '../clips/savethis-timeline.mjs';
import { PosterStill } from './reels/clips/savethis/PosterStill';
import { SaveThis } from './reels/clips/savethis/SaveThis';
import * as NEEDLE from '../clips/needle-timeline.mjs';
import { Needle } from './reels/clips/needle/Needle';
import * as REVISIT from '../clips/revisit-timeline.mjs';
import { Revisit } from './reels/clips/revisit/Revisit';
import { Signature } from './reels/kit/Signature';
import * as POV from '../clips/pov-timeline.mjs';
import { Pov } from './reels/clips/pov/Pov';
import * as PREVIEW from '../clips/preview-timeline.mjs';
import { AppPreview, AppPreviewShutter, SHUTTER_COUNTS, SHUTTER_TOTAL } from './reels/clips/preview/Preview';
import { SIGNATURE } from './reels/kit/signature.mjs';
import * as LATER from '../clips/later-timeline.mjs';
import { LATER_SHUTTER, Later, LaterShutter } from './reels/clips/later/Later';
import { ShotsStill } from './reels/clips/shots/Screens';
import { Shots } from './reels/clips/shots/Shots';
import * as SHOTS from '../clips/shots-timeline.mjs';

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
    {/* the FIND feature clip (src/reels/clips/find, clips/find-timeline.mjs):
        MachinaFind is the deliverable (score + narrator + captions);
        Silent has no sound (stills, QA); Clean has no captions or kicker */}
    <Composition
      id="MachinaFind"
      component={FindClip}
      durationInFrames={FIND.TOTAL_FRAMES}
      fps={FIND.FPS}
      width={FIND.WIDTH}
      height={FIND.HEIGHT}
      defaultProps={{ withAudio: true, withCaptions: true }}
    />
    <Composition
      id="MachinaFindSilent"
      component={FindClip}
      durationInFrames={FIND.TOTAL_FRAMES}
      fps={FIND.FPS}
      width={FIND.WIDTH}
      height={FIND.HEIGHT}
      defaultProps={{ withAudio: false, withCaptions: true }}
    />
    <Composition
      id="MachinaFindClean"
      component={FindClip}
      durationInFrames={FIND.TOTAL_FRAMES}
      fps={FIND.FPS}
      width={FIND.WIDTH}
      height={FIND.HEIGHT}
      defaultProps={{ withAudio: false, withCaptions: false }}
    />
    {/* SAVE THIS, the organic Reel (src/reels/clips/savethis,
        clips/savethis-timeline.mjs). The poster is its frame 0, rendered
        alone as the cover the app shows (the capture reads it) */}
    <Composition
      id="MachinaSaveThis"
      component={SaveThis}
      durationInFrames={SAVETHIS.TOTAL_FRAMES}
      fps={SAVETHIS.FPS}
      width={SAVETHIS.WIDTH}
      height={SAVETHIS.HEIGHT}
      defaultProps={{ withAudio: true, withCaptions: true }}
    />
    <Composition
      id="MachinaSaveThisSilent"
      component={SaveThis}
      durationInFrames={SAVETHIS.TOTAL_FRAMES}
      fps={SAVETHIS.FPS}
      width={SAVETHIS.WIDTH}
      height={SAVETHIS.HEIGHT}
      defaultProps={{ withAudio: false, withCaptions: true }}
    />
    {/* FIND THE BOOK, the needle reel (src/reels/clips/needle,
        clips/needle-timeline.mjs) */}
    <Composition
      id="MachinaNeedle"
      component={Needle}
      durationInFrames={NEEDLE.TOTAL_FRAMES}
      fps={NEEDLE.FPS}
      width={NEEDLE.WIDTH}
      height={NEEDLE.HEIGHT}
      defaultProps={{ withAudio: true, withCaptions: true }}
    />
    <Composition
      id="MachinaNeedleSilent"
      component={Needle}
      durationInFrames={NEEDLE.TOTAL_FRAMES}
      fps={NEEDLE.FPS}
      width={NEEDLE.WIDTH}
      height={NEEDLE.HEIGHT}
      defaultProps={{ withAudio: false, withCaptions: true }}
    />
    {/* (owner, round 17) the same reel without the paper fades at the app
        screens' edges: the app as it looks, status bar and tab bar in view;
        the captions keep a soft paper halo of their own */}
    <Composition
      id="MachinaSaveThisNoFade"
      component={SaveThis}
      durationInFrames={SAVETHIS.TOTAL_FRAMES}
      fps={SAVETHIS.FPS}
      width={SAVETHIS.WIDTH}
      height={SAVETHIS.HEIGHT}
      defaultProps={{ withAudio: true, withCaptions: true, fades: false }}
    />
    {/* TICK IT OFF, the revisit reel (src/reels/clips/revisit,
        clips/revisit-timeline.mjs): the deliverable, and Silent for stills */}
    <Composition
      id="MachinaRevisit"
      component={Revisit}
      durationInFrames={REVISIT.TOTAL_FRAMES}
      fps={REVISIT.FPS}
      width={REVISIT.WIDTH}
      height={REVISIT.HEIGHT}
      defaultProps={{ withAudio: true, withCaptions: true }}
    />
    <Composition
      id="MachinaRevisitSilent"
      component={Revisit}
      durationInFrames={REVISIT.TOTAL_FRAMES}
      fps={REVISIT.FPS}
      width={REVISIT.WIDTH}
      height={REVISIT.HEIGHT}
      defaultProps={{ withAudio: false, withCaptions: true }}
    />
    <Composition
      id="MachinaSaveThisPoster"
      component={PosterStill}
      durationInFrames={1}
      fps={SAVETHIS.FPS}
      width={SAVETHIS.WIDTH}
      height={SAVETHIS.HEIGHT}
    />
    {/* THE SIGNATURE (kit/Signature.tsx): the shared ending, alone; the
        reference every new video's last frames are checked against */}
    <Composition
      id="MachinaSignature"
      component={() => <Signature from={0} withAudio />}
      durationInFrames={SIGNATURE.frames}
      fps={SIGNATURE.fps}
      width={1080}
      height={1920}
    />
    {/* POV: YOU SAVED IT (src/reels/clips/pov, clips/pov-timeline.mjs): the
        deliverable, Silent for stills, and the launch-day ending */}
    <Composition
      id="MachinaPov"
      component={Pov}
      durationInFrames={POV.TOTAL_FRAMES}
      fps={POV.FPS}
      width={POV.WIDTH}
      height={POV.HEIGHT}
      defaultProps={{ withAudio: true, withCaptions: true, ending: 'soon' as const }}
    />
    <Composition
      id="MachinaPovSilent"
      component={Pov}
      durationInFrames={POV.TOTAL_FRAMES}
      fps={POV.FPS}
      width={POV.WIDTH}
      height={POV.HEIGHT}
      defaultProps={{ withAudio: false, withCaptions: true, ending: 'soon' as const }}
    />
    <Composition
      id="MachinaPovStore"
      component={Pov}
      durationInFrames={POV.TOTAL_FRAMES}
      fps={POV.FPS}
      width={POV.WIDTH}
      height={POV.HEIGHT}
      defaultProps={{ withAudio: true, withCaptions: true, ending: 'store' as const }}
    />
    {/* THE APP STORE PREVIEW (src/reels/clips/preview, clips/preview-timeline.mjs):
        real screen recordings, 1080 x 2340 here, encoded to 886 x 1920 */}
    <Composition
      id="MachinaAppPreview"
      component={AppPreview}
      durationInFrames={PREVIEW.TOTAL_FRAMES}
      fps={PREVIEW.FPS}
      width={PREVIEW.WIDTH}
      height={PREVIEW.HEIGHT}
      defaultProps={{ withAudio: true, withCaptions: true }}
    />
    <Composition
      id="MachinaAppPreviewSilent"
      component={AppPreview}
      durationInFrames={PREVIEW.TOTAL_FRAMES}
      fps={PREVIEW.FPS}
      width={PREVIEW.WIDTH}
      height={PREVIEW.HEIGHT}
      defaultProps={{ withAudio: false, withCaptions: true }}
    />
    {/* every exposure of every frame (the shutter): scripts/preview-render.mjs
        renders it and averages each frame's exposures into the master */}
    <Composition
      id="MachinaAppPreviewShutter"
      component={AppPreviewShutter}
      durationInFrames={SHUTTER_TOTAL}
      fps={PREVIEW.FPS}
      width={PREVIEW.WIDTH}
      height={PREVIEW.HEIGHT}
      defaultProps={{ counts: SHUTTER_COUNTS }}
    />
    {/* LATER NEVER COMES, the Instagram Reel on the preview (src/reels/clips/later,
        clips/later-timeline.mjs): 1080 x 1920, the footer of the day as `ending` */}
    <Composition
      id="MachinaLater"
      component={Later}
      durationInFrames={LATER.TOTAL_FRAMES}
      fps={LATER.FPS}
      width={LATER.WIDTH}
      height={LATER.HEIGHT}
      defaultProps={{ withAudio: true, withCaptions: true, ending: 'soon' as const }}
    />
    <Composition
      id="MachinaLaterStore"
      component={Later}
      durationInFrames={LATER.TOTAL_FRAMES}
      fps={LATER.FPS}
      width={LATER.WIDTH}
      height={LATER.HEIGHT}
      defaultProps={{ withAudio: true, withCaptions: true, ending: 'store' as const }}
    />
    <Composition
      id="MachinaLaterSilent"
      component={Later}
      durationInFrames={LATER.TOTAL_FRAMES}
      fps={LATER.FPS}
      width={LATER.WIDTH}
      height={LATER.HEIGHT}
      defaultProps={{ withAudio: false, withCaptions: true, ending: 'soon' as const }}
    />
    {/* every exposure of every frame (the shutter): scripts/shutter-render.mjs
        renders it and averages each frame's exposures into the master */}
    <Composition
      id="MachinaLaterShutter"
      component={LaterShutter}
      durationInFrames={LATER_SHUTTER.total}
      fps={LATER.FPS}
      width={LATER.WIDTH}
      height={LATER.HEIGHT}
      defaultProps={{ ending: 'soon' as const, counts: LATER_SHUTTER.counts }}
    />
    {/* SAME SCREENSHOTS (src/reels/clips/shots, clips/shots-timeline.mjs):
        the three screenshots, rendered once (public/clips/shots/<id>.png) */}
    <Composition
      id="MachinaShotsStill"
      component={ShotsStill}
      durationInFrames={1}
      fps={30}
      width={1179}
      height={2556}
      defaultProps={{ id: 'camera' as const }}
    />
    {/* SAME SCREENSHOTS: the deliverable, Silent for stills, the launch-day ending */}
    <Composition
      id="MachinaShots"
      component={Shots}
      durationInFrames={SHOTS.TOTAL_FRAMES}
      fps={SHOTS.FPS}
      width={SHOTS.WIDTH}
      height={SHOTS.HEIGHT}
      defaultProps={{ withAudio: true, withCaptions: true, ending: 'soon' as const }}
    />
    <Composition
      id="MachinaShotsSilent"
      component={Shots}
      durationInFrames={SHOTS.TOTAL_FRAMES}
      fps={SHOTS.FPS}
      width={SHOTS.WIDTH}
      height={SHOTS.HEIGHT}
      defaultProps={{ withAudio: false, withCaptions: true, ending: 'soon' as const }}
    />
    <Composition
      id="MachinaShotsStore"
      component={Shots}
      durationInFrames={SHOTS.TOTAL_FRAMES}
      fps={SHOTS.FPS}
      width={SHOTS.WIDTH}
      height={SHOTS.HEIGHT}
      defaultProps={{ withAudio: true, withCaptions: true, ending: 'store' as const }}
    />
  </>
);
