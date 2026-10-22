import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { CAPTIONS, FPS, HITS, KICKERS, TOTAL_FRAMES } from '../../../../clips/savethis-timeline.mjs';
import { sans } from '../../../fonts';
import { Tap } from '../../kit/AppShot';
import { BandScrim, Captions, clearOf, type ReelCaption, type ReelKicker } from '../../kit/Captions';
import { CLOCK } from '../../kit/camera';
import { EASE_IN_OUT, prog } from '../../kit/curves';
import { Lens, Paper } from '../../kit/Paper';
import { GRADE } from './grade';
import { App, HANDOVER, MARK_TO, PROOF_LINE } from './App';
import { EndCard } from './EndCard';
import { Opening } from './Opening';
import { POSTER } from './Poster';
import VO from './savethis-vo.json';

/**
 * SAVE THIS: the organic Reel. 28.5s, 1080 x 1920, the house look (Paper,
 * Lens, the kit's captions and camera) on its own clock
 * (clips/savethis-timeline.mjs). Every frame of app UI is the real app
 * (capture/shoot.mjs `savethisClip`); the opening and the dive are the
 * reel's own (Opening.tsx, Dive.tsx).
 *
 * It loops: the last frame is the poster, frame 0, so the set's drift is
 * periodic over the reel and every layer that is not the poster is gone by
 * the end.
 */
export const paperDriftAt = (f: number) => Math.sin((2 * Math.PI * f) / TOTAL_FRAMES) * 0.5;

export const SaveThis: React.FC<{
  withAudio?: boolean;
  withCaptions?: boolean;
  audioFile?: string;
}> = ({ withAudio = true, withCaptions = true, audioFile = 'clips/savethis/score-vo.wav' }) => {
  const f = useCurrentFrame();
  // the reel runs on output frames: motion blur measures one frame
  CLOCK.perFrame = 1;
  const drift = paperDriftAt(f);
  // type never sits on UI or on the well: the paper rises behind the band
  // while either is up, and lets go as the cover opens into the poster
  const scrim =
    prog(f, HITS.drop + 2, HITS.drop + 12, EASE_IN_OUT) * (1 - prog(f, HANDOVER - 16, HANDOVER - 2, EASE_IN_OUT));
  return (
    <AbsoluteFill style={{ fontFamily: sans }}>
      {withAudio && <Audio src={staticFile(audioFile)} />}
      <Paper drift={drift} tone={GRADE.tone} cool={GRADE.cool} />
      <App f={f} />
      <Opening f={f} markTo={MARK_TO} paperDrift={drift} />
      {/* the thumb on the poster's bookmark, on "save" */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1080, height: 1920 }}>
        <Tap x={POSTER.bookmark.x} y={POSTER.bookmark.y + 18} t={prog(f, HITS.tapSave - 10, HITS.tapSave + 18, (t) => t)} size={120} />
      </div>
      <BandScrim opacity={scrim} tone={GRADE.tone} />
      {/* (round 4) once the app's camera glides in on the lit ties, the
          paper rises further, over the graph's own header and legend */}
      {f >= HITS.connect && f < HITS.knows && (
        <AbsoluteFill
          style={{
            pointerEvents: 'none',
            opacity: prog(f, HITS.connect + 2, HITS.connect + 18, EASE_IN_OUT),
            background: `linear-gradient(180deg, ${GRADE.tone} 0px, ${GRADE.tone} 700px, ${clearOf(GRADE.tone)} 930px)`,
          }}
        />
      )}
      {/* (round 11) under the graph, paper over the frame's foot (Instagram's
          caption zone, well below the dots): the app's tab bar rides just
          under the edge, and its focus panel slides up as the thumb taps */}
      {f >= HITS.graph && f < HITS.knows && (
        <AbsoluteFill
          style={{
            pointerEvents: 'none',
            background: `linear-gradient(0deg, ${GRADE.tone} 0px, ${GRADE.tone} 200px, ${clearOf(GRADE.tone)} 330px)`,
          }}
        />
      )}
      {/* (round 7) on the proof, the paper rises over the question bubble
          (the camera is down on the answer and its citations) */}
      {f >= HITS.proof && f < HITS.tagline + 4 && (
        <AbsoluteFill
          style={{
            pointerEvents: 'none',
            opacity: prog(f, HITS.proof + 2, HITS.proof + 14, EASE_IN_OUT),
            background: `linear-gradient(180deg, ${GRADE.tone} 0px, ${GRADE.tone} ${PROOF_LINE}px, ${clearOf(GRADE.tone)} ${PROOF_LINE + 10}px)`,
          }}
        />
      )}
      {/* (round 12) the sign-off: the app's mark, the name, the line, and
          the mark opening into the poster */}
      <EndCard f={f} paperDrift={drift} show={withCaptions} />
      <Captions
        frame={f}
        fps={FPS}
        captions={CAPTIONS.filter((c) => c.place !== 'scene') as ReelCaption[]}
        timing={VO}
        kickers={KICKERS as ReelKicker[]}
        showCaptions={withCaptions}
        showKickers={withCaptions}
      />
      <Lens vignette={GRADE.vignette} grain={GRADE.grain} />
    </AbsoluteFill>
  );
};
