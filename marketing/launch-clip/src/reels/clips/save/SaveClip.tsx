import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { clockAt } from '../../../../reel-timeline.mjs';
import { CAPTIONS, CARD_AT, FPS, HITS, KICKERS, reelFrame } from '../../../../clips/save-timeline.mjs';
import { sans } from '../../../fonts';
import VO from './vo.json';
import { BandScrim, Captions, type ReelCaption } from '../../kit/Captions';
import { CLOCK } from '../../kit/camera';
import { EASE_MODAL, mix, prog } from '../../kit/curves';
import { Lens, Paper } from '../../kit/Paper';
import { Hook } from '../../scenes/Hook';
import { Save } from '../../scenes/Save';
import { SaveModes } from '../../scenes/SaveModes';
import { ShareBeat } from '../../scenes/ShareBeat';
import { Card } from './Card';
import { End } from './End';

/**
 * SAVE, the feature clip: 29.9s, 1080 × 1920, on its own clock
 * (clips/save-timeline.mjs), from the reel kit (src/reels/kit).
 *
 * Until CARD_AT it PLAYS THE REEL: the reel's own scenes, imported unchanged,
 * driven by the reel's clock at `reelFrame(f)`, so the shares pulled into the
 * mark, the point becoming the +, the Add dialog's Link / Image / Note tour,
 * the five phases and the card landing are the approved reel's shots, frame
 * for frame (MachinaReel.tsx draws them the same way). One liberty, at the
 * very start: the reel's mark and name come into focus over the first beat
 * (the reel's own entrance for things on frame 0), so the first frame, the
 * one a feed shows before it plays, is the brand on paper.
 *
 * Then the clip's own beats: the card opened to its Key Points and thrown
 * out (Card.tsx), and the reel's lockup (End.tsx). Every frame of app UI is
 * the real app, captured by capture/shoot.mjs (take "save").
 */
export const SaveClip: React.FC<{
  withAudio?: boolean;
  withCaptions?: boolean;
  audioFile?: string;
}> = ({ withAudio = true, withCaptions = true, audioFile = 'clips/save/score-vo.wav' }) => {
  const f = useCurrentFrame();
  const reel = f < CARD_AT ? clockAt(reelFrame(f)) : null;
  // motion blur per OUTPUT frame, as MachinaReel sets it
  CLOCK.perFrame = reel && !reel.hold ? 1 / reel.k : 0;
  const focus = prog(f, 0, 16, EASE_MODAL);
  return (
    <AbsoluteFill style={{ fontFamily: sans }}>
      {withAudio && <Audio src={staticFile(audioFile)} />}
      {/* (the set drifts on the reel's clock: through the borrowed stretch the
          light is the reel's too) */}
      <Paper drift={Math.sin(reelFrame(f) / 180) * 0.5} />

      {reel &&
        (reel.hold === 'modes' ? (
          <SaveModes u={reel.u} />
        ) : (
          <>
            {/* the mark and the name, held by the reel's hook; in focus by the first beat */}
            <AbsoluteFill
              style={{
                opacity: mix(0.55, 1, focus),
                filter: focus < 0.999 ? `blur(${((1 - focus) * 7).toFixed(2)}px)` : undefined,
              }}
            >
              <Hook f={reel.src} out={reelFrame(f)} />
            </AbsoluteFill>
            <Save f={reel.src} />
          </>
        ))}
      {reel?.hold === 'share' && <ShareBeat u={reel.u} />}
      <Card u={f - CARD_AT} />
      <End f={f} />

      {/* type never sits on UI: the app fades out under the caption band (the
          reel's scrim, off while the screen is thrown into the lockup, 12–28
          frames into the throw as in the reel) */}
      <BandScrim opacity={(reel ? prog(reel.src, 112, 120) : 1) * (1 - prog(f, HITS.throw + 12, HITS.throw + 28))} />
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
    </AbsoluteFill>
  );
};
