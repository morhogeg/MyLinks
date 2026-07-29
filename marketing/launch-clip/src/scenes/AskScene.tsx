import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Phone } from '../ui/Phone';
import { FloorGlow, Rig, Stage } from '../film/effects';
import { BASE_SCALE, BASE_Y, drift, prog, ramp, typed, EASE_IN_OUT, EASE_MODAL, EASE_OUT } from '../film/anim';
import { AskScreen } from '../ui/screens';
import { ASK_ANSWER, ASK_QUESTION, ASK_SOURCES } from '../data/library';

/**
 * The hero scene: Ask.
 *
 * Everything before this earns it and everything after extends it. The beat that
 * matters is not the answer appearing — any chatbot does that — it is the three
 * citation chips landing underneath it, each one a card the user saved. So the
 * camera holds through the streaming and then pushes onto the chips.
 */
export const AskScene: React.FC = () => {
  const f = useCurrentFrame();

  const q = typed(f, 18, 92, ASK_QUESTION.length);
  const thinking = prog(f, 96, 104) * (1 - prog(f, 104, 110));
  const streamed = Math.round(
    ramp(f, [105, 196], [0, ASK_ANSWER.length], EASE_IN_OUT),
  );
  const sources = ASK_SOURCES.map((_, i) => prog(f, 198 + i * 11, 216 + i * 11, EASE_MODAL));
  const graphChip = prog(f, 240, 258, EASE_MODAL);

  // camera: settle in, hold through the stream, then a slow 2D push down onto
  // the proof. No rotation once the type starts — angled text is unreadable text.
  const settle = prog(f, 0, 26, EASE_OUT);
  const push = prog(f, 190, 300, EASE_IN_OUT);
  const scale = BASE_SCALE * (1.02 - settle * 0.02) * (1 + push * 0.44);
  const rotY = ramp(f, [0, 30], [10, 0], EASE_OUT);
  const y = BASE_Y + drift(f, 4, 300) - push * 120;

  const out = 1 - prog(f, 288, 300);
  const inFade = prog(f, 0, 9);

  return (
    <AbsoluteFill style={{ background: '#050505', opacity: out * inFade }}>
      <Stage intensity={0.62} backlight={0.46} drift={push * 0.3} />
      <Rig scale={scale} rotY={rotY} y={y} origin="center 44%">
        <div style={{ position: 'relative' }}>
          <FloorGlow y={890} w={700} opacity={0.5} />
          <Phone>
            <AskScreen
              typed={q}
              thinking={thinking}
              streamed={streamed}
              sources={sources}
              graphChip={graphChip}
            />
          </Phone>
        </div>
      </Rig>
    </AbsoluteFill>
  );
};
