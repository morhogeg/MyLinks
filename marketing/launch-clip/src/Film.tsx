import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { SCENES, barToFrame } from '../timeline.mjs';
import { CaptionScrim, Grain, Vignette } from './film/effects';
import { Subtitles } from './film/Subtitles';
import { ColdOpen } from './scenes/ColdOpen';
import { Scatter } from './scenes/Scatter';
import { WordmarkScene } from './scenes/WordmarkScene';
import { Capture } from './scenes/Capture';
import { Library } from './scenes/Library';
import { AskScene } from './scenes/AskScene';
import { GraphScene } from './scenes/GraphScene';
import { CollectionsScene } from './scenes/CollectionsScene';
import { DigestScene } from './scenes/DigestScene';
import { Endcard } from './scenes/Endcard';
import { sans } from './fonts';

const SCENE_COMPONENTS: Record<string, React.FC> = {
  coldOpen: ColdOpen,
  scatter: Scatter,
  wordmark: WordmarkScene,
  capture: Capture,
  library: Library,
  ask: AskScene,
  graph: GraphScene,
  collections: CollectionsScene,
  digest: DigestScene,
  endcard: Endcard,
};

/**
 * The film. Scene boundaries come from `timeline.mjs` — the same file the score
 * was arranged against — so the edit and the music cannot drift apart.
 *
 * The grade lives here rather than in each scene: one grain plate, one vignette,
 * one subtitle track over the whole picture, which is what makes nine separately
 * built scenes look like one piece of film.
 */
export const Film: React.FC<{ withAudio?: boolean; withSubtitles?: boolean }> = ({
  withAudio = true,
  withSubtitles = true,
}) => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ background: '#050505', fontFamily: sans }}>
      {withAudio && <Audio src={staticFile('score.wav')} />}

      {SCENES.map((s) => {
        const C = SCENE_COMPONENTS[s.id];
        return (
          <Sequence
            key={s.id}
            from={barToFrame(s.bar)}
            durationInFrames={barToFrame(s.bars)}
            layout="none"
          >
            <C />
          </Sequence>
        );
      })}

      <Vignette strength={0.9} />
      <Grain opacity={0.05} />
      {withSubtitles && (
        <>
          <CaptionScrim opacity={0.9} />
          <Subtitles />
        </>
      )}

      {/* the first and last breath of black — no film starts on a lit frame */}
      <AbsoluteFill
        style={{
          background: '#000',
          opacity: Math.max(
            frame < 6 ? 1 - frame / 6 : 0,
            0,
          ),
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};
