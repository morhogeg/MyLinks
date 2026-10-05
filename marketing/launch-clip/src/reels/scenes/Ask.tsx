import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HITS } from '../../../reel-timeline.mjs';
import { AppShot, Lift, Tap } from '../kit/AppShot';
import { camAt, camVelocity, type Key } from '../kit/camera';
import { EASE_GATHER, EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../kit/curves';
import { at, center, rectOf } from '../kit/takes';

/**
 * 9.1s – 13.9s. ASK, the hero: "What do my saves say about time?" typed into
 * the real composer, sent, the answer streaming in, and three citation chips
 * from three platforms (a Wait But Why essay, a TED talk on YouTube, a thread
 * on X). Each chip lifts on its own 8th note; then the answer's own Graph
 * chip is tapped, which is how the reel gets to Connect: through the app.
 *
 * The app's "Searching your …" thinking line is never shown (its wording is
 * off-limits for the reel): the cut goes from the sent question straight to
 * the first streamed words, which is also what the eye wants.
 */

const T = 'ask';
const S = HITS;

const CHIPS = ['chip1', 'chip2', 'chip3'] as const;

const linear = (t: number) => t;

export const askKeys: Key[] = [
  // the hero, wide and still while the app draws its mark
  { f: 272, cx: 196.5, cy: 300, z: 2.0, fx: 540, fy: 1100 },
  { f: 283, cy: 306, z: 2.04, ease: linear },
  // CUT (on the beat) to the composer as the question types
  { f: 284, cx: 196.5, cy: 700, z: 2.5, fx: 540, fy: 1260, ease: linear },
  { f: 316, cy: 706, z: 2.62, ease: linear },
  { f: 317, ease: linear },
  // CUT (on the 8th after send) to the answer arriving
  { f: 318, cx: 196.5, cy: 250, z: 2.6, fx: 540, fy: 1130, ease: linear },
  { f: 342, cy: 262, z: 2.66, ease: linear },
  // the travel down onto the three sources (hold to hold)
  { f: 352, cx: 175, cy: 492, z: 2.85, fy: 1160, ease: EASE_IN_OUT },
  { f: 380, cy: 497, z: 2.95, ease: linear },
  // back and onto the Graph chip in ONE move that comes to rest as the finger
  // lands (round 13: a pull-back, then a linear drift, then the dive started
  // and stopped the camera twice in a second)
  { f: 400, cx: 160, cy: 548, z: 2.55, fy: 1140, ease: EASE_IN_OUT },
  // the dive into the Graph chip, accelerating into the cut to Connect: it is
  // still at full speed on the last frame before the cut (the key sits ON the
  // cut; one frame short, the dive froze for a frame before it)
  { f: S.graph, cx: 52.75, cy: 606.5, z: 3.5, fx: 540, fy: 1120, ease: EASE_GATHER },
];

export const Ask: React.FC<{ f: number }> = ({ f }) => {
  // hard cut in from Find on the beat; hard cut out to Connect on the downbeat (the riser lands there)
  if (f < S.askTap || f >= S.graph) return null;

  const i =
    f < 280
      ? at(T, 'open', Math.min(11, 5 + (f - 272)))
      : f < S.askTypeFrom
        ? at(T, 'open', 11)
        : f < S.send
          ? at(T, 'typing', f - S.askTypeFrom)
          : f < S.answerFrom - 2
            ? at(T, 'typing', 31)
            : f < S.sources
              ? at(T, 'stream', Math.min(22, f - (S.answerFrom - 2)))
              : at(T, 'sources', Math.min(19, f - S.sources));

  const cam = camAt(askKeys, f);
  const v = camVelocity(askKeys, f);
  const send = center(rectOf(T, at(T, 'typing', 20), 'send'));
  const graph = center(rectOf(T, at(T, 'sources', 2), 'graphChip'));

  return (
    <AbsoluteFill>
      <AppShot take={T} i={i} cam={cam} motion={v}>
        <Tap x={send.x} y={send.y} t={prog(f, S.send - 5, S.send + 9, (t) => t)} />
        {f >= S.sources &&
          CHIPS.map((key, k) => {
            const hit = S.chips[k];
            const up = prog(f, hit - 1, hit + 5, EASE_SPRING);
            const down = prog(f, hit + 7, hit + 18, EASE_MODAL);
            return (
              <Lift
                key={key}
                take={T}
                i={i}
                rect={rectOf(T, i, key)}
                radius={12}
                lift={up * mix(1, 0.28, down)}
                rise={5}
                grow={0.05}
                ring={0.7 * up * (1 - down)}
              />
            );
          })}
        <Tap x={graph.x} y={graph.y} t={prog(f, S.graphTap - 5, S.graphTap + 9, (t) => t)} />
      </AppShot>
    </AbsoluteFill>
  );
};
