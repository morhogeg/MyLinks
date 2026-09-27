import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { CAPTIONS, FPS, KICKERS, clockAt } from '../../reel-timeline.mjs';
import { sans } from '../fonts';
import VO from './data/reel-vo.json';
import { BandScrim, Captions, type ReelCaption } from './kit/Captions';
import { prog } from './kit/curves';
import { Lens, Paper } from './kit/Paper';
import { Hook } from './scenes/Hook';
import { Save } from './scenes/Save';
import { Find } from './scenes/Find';
import { Ask } from './scenes/Ask';
import { Connect } from './scenes/Connect';
import { Recall } from './scenes/Recall';
import { CardDetail } from './scenes/CardDetail';
import { CLOCK } from './kit/camera';
import { End } from './scenes/End';

/**
 * Machina highlight reel (the pilot): 20s, 1080 × 1920, built from the reel
 * kit (src/reels/kit) on the reel's own clock (reel-timeline.mjs). Every
 * frame of app UI is the real app, captured by capture/shoot.mjs.
 *
 * Scenes read the GLOBAL frame (not Sequence-local time): they hand off on
 * shared frame numbers (the hook's point becomes the + button; Save's screen
 * rides Find's camera until the search tap; Ask's dive into the Graph chip
 * cuts on the downbeat to inside the graph). Each scene draws only its own
 * frames, so no two app takes are ever on screen as a dissolve.
 */
export const MachinaReel: React.FC<{
  withAudio?: boolean;
  withCaptions?: boolean;
  audioFile?: string;
}> = ({ withAudio = true, withCaptions = true, audioFile = 'reel-score-vo.wav' }) => {
  const f = useCurrentFrame();
  // the round-1 cut on a variable-speed clock (reel-timeline.mjs SPEED,
  // HOLDS); the scenes run on SOURCE frames, captions and the lockup on
  // output frames
  const { src, hold, u, k } = clockAt(f);
  CLOCK.perFrame = hold ? 0 : 1 / k;
  return (
    <AbsoluteFill style={{ fontFamily: sans }}>
      {withAudio && <Audio src={staticFile(audioFile)} />}
      <Paper drift={Math.sin(f / 180) * 0.5} />

      {hold === 'card' ? (
        <CardDetail u={u} />
      ) : (
        <>
          <Hook f={src} out={f} />
          <Save f={src} />
          <Find f={src} />
          <Ask f={src} />
          <Connect f={src} />
          <Recall f={src} />
        </>
      )}
      <End f={f} />

      {/* type never sits on UI: the app fades out under the caption band */}
      <BandScrim opacity={prog(src, 112, 120) * (1 - prog(src, 510, 518))} />
      <Captions
        frame={f}
        fps={FPS}
        captions={CAPTIONS as ReelCaption[]}
        timing={VO}
        kickers={KICKERS}
        showCaptions={withCaptions}
        showKickers={withCaptions}
      />
      <Lens />

      {/* the first breath: the reel opens out of white */}
      <AbsoluteFill style={{ background: '#FFFFFF', opacity: Math.max(0, 1 - f / 7), pointerEvents: 'none' }} />
    </AbsoluteFill>
  );
};
