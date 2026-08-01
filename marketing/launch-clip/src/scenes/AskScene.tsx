import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Phone } from '../ui/Phone';
import { useFraming } from '../film/format';
import { FloorGlow, Rig, SET_BG, Stage } from '../film/effects';
import { drift, prog, ramp, typed, EASE_IN_OUT, EASE_MODAL, EASE_OUT } from '../film/anim';
import { AskScreen } from '../ui/screens';
import { ASK_ANSWER, ASK_QUESTION, ASK_SOURCES } from '../data/library';

/**
 * The hero scene: Ask. Five bars — the widest shot in the film's schedule,
 * because the typing, the stream and the three citations were racing the
 * captions at four.
 *
 * Everything before this earns it and everything after extends it. The beat that
 * matters is not the answer appearing — any chatbot does that — it is the three
 * citation chips landing underneath it, each one a card the user saved. So the
 * camera holds through the streaming and then pushes onto the chips.
 */
export const AskScene: React.FC = () => {
  const f = useCurrentFrame();
  const fr = useFraming();

  const q = typed(f, 18, 100, ASK_QUESTION.length);
  const thinking = prog(f, 104, 112) * (1 - prog(f, 112, 118));
  const streamed = Math.round(
    ramp(f, [113, 228], [0, ASK_ANSWER.length], EASE_IN_OUT),
  );
  const sources = ASK_SOURCES.map((_, i) => prog(f, 232 + i * 12, 252 + i * 12, EASE_MODAL));
  const graphChip = prog(f, 292, 310, EASE_MODAL);
  // the finger lands on the Graph chip (contact ≈ frame 336, HITS.graphTap),
  // and the camera dives after it — the cut into the graph is a TAP
  const graphTap = prog(f, 322, 350, EASE_IN_OUT);
  const dive = prog(f, 338, 372, EASE_IN_OUT);

  // camera: settle in, hold through the stream, then a slow 2D push down onto
  // the proof. No rotation once the type starts — angled text is unreadable text.
  const settle = prog(f, 0, 26, EASE_OUT);
  const push = prog(f, 224, 348, EASE_IN_OUT);
  const scale = ramp(f, [0, 26], [1.46, 1.52], EASE_OUT) + push * 0.36 + dive * 0.34;
  // The shot holds a slight angle through the typing and the streaming, then
  // squares up to dead-on exactly as the three citations land. Off-axis to
  // on-axis is the move that says "this is the point" without a caption doing
  // it — and the citations are the point of the whole film.
  const rotY = ramp(f, [0, 26], [11, 7], EASE_OUT) * (1 - prog(f, 228, 296, EASE_IN_OUT));
  // from the question, down onto the answer and its three chips — then onto
  // the Graph chip itself as the finger lands
  const target = ramp(f, [140, 300], [300, 375], EASE_IN_OUT) + dive * 95;
  // vertical: bias the device down so its top clears the two-line caption
  // block (owner screenshot note, round 13c — same fix library/digest carry)
  const y = fr.focusY(target, scale * fr.scaleMul) + drift(f, 3, 300) + (fr.vertical ? 90 : 0);

  const out = 1 - prog(f, 363, 375);
  const inFade = prog(f, 0, 4);

  return (
    <AbsoluteFill style={{ background: SET_BG, opacity: out * inFade }}>
      <Stage intensity={0.64} backlight={0.4} drift={push * 0.3} />
      <Rig scale={scale * fr.scaleMul} rotY={rotY} x={fr.baseX} y={y} origin="center 44%">
        <div style={{ position: 'relative' }}>
          <FloorGlow y={890} w={700} opacity={0.5} />
          <Phone>
            <AskScreen
              typed={q}
              thinking={thinking}
              streamed={streamed}
              sources={sources}
              graphChip={graphChip}
              graphTap={graphTap}
            />
          </Phone>
        </div>
      </Rig>
    </AbsoluteFill>
  );
};
