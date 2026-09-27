import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HITS } from '../../../reel-timeline.mjs';
import { AppShot, Lift, Tap } from '../kit/AppShot';
import { camAt, camVelocity, type Key } from '../kit/camera';
import { EASE_GATHER, EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../kit/curves';
import { at, center, rectOf, takeOf } from '../kit/takes';

/**
 * 20.3s – 27.7s. ASK, the hero: "What do my saves say about time?" typed into
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

/** the cut to the composer, a beat before the question starts */
const COMPOSER = S.askTypeFrom - 8;
/** the cut to the answer, just after send */
const ANSWER = S.answerFrom - 2;
/** keystrokes and stream chunks the capture recorded (one frame each) */
// (a count only: the frames from the send to the first streamed words are
// never shown, see verify)
const TYPED = takeOf(T).marks.sent - at(T, 'typing');
const STREAMED = at(T, 'sources') - at(T, 'stream');

export const askKeys: Key[] = [
  // the hero, wide and still while the app draws its mark
  { f: S.askTap, cx: 196.5, cy: 300, z: 2.0, fx: 540, fy: 1100 },
  { f: COMPOSER - 1, cy: 306, z: 2.05, ease: linear },
  // CUT (on the beat) to the composer as the question types
  { f: COMPOSER, cx: 196.5, cy: 700, z: 2.5, fx: 540, fy: 1260, ease: linear },
  { f: S.send - 2, cy: 706, z: 2.62, ease: linear },
  { f: ANSWER - 1, ease: linear },
  // CUT (just after send) to the answer arriving
  { f: ANSWER, cx: 196.5, cy: 250, z: 2.6, fx: 540, fy: 1130, ease: linear },
  { f: S.sources, cy: 262, z: 2.66, ease: linear },
  // the travel down onto the three sources (hold to hold)
  { f: S.chips[0], cx: 175, cy: 492, z: 2.85, fy: 1160, ease: EASE_IN_OUT },
  { f: S.chips[2] + 6, cy: 497, z: 2.95, ease: linear },
  { f: S.graphTap - 12, cx: 170, cy: 532, z: 2.5, fy: 1140, ease: EASE_IN_OUT },
  { f: S.graphTap, cx: 160, cy: 548, z: 2.55, ease: linear },
  // the dive into the Graph chip, accelerating into the cut to Connect
  { f: S.graph - 1, cx: 52.75, cy: 606.5, z: 3.5, fx: 540, fy: 1120, ease: EASE_GATHER },
];

export const Ask: React.FC<{ f: number }> = ({ f }) => {
  // hard cut in from Find on the beat; hard cut out to Connect on the downbeat (the riser lands there)
  if (f < S.askTap || f >= S.graph) return null;

  const i =
    f < COMPOSER
      ? at(T, 'open', Math.min(11, 3 + Math.floor((f - S.askTap) / 2)))
      : f < S.askTypeFrom
        ? at(T, 'open', 11)
        : f < S.send
          ? at(T, 'typing', Math.min(TYPED - 1, Math.floor(((f - S.askTypeFrom) * TYPED) / (S.send - S.askTypeFrom - 2))))
          : f < ANSWER
            ? at(T, 'typing', TYPED - 1)
            : f < S.sources
              ? at(T, 'stream', Math.min(STREAMED - 1, Math.floor(((f - ANSWER) * STREAMED) / (S.sources - ANSWER))))
              : at(T, 'sources', Math.min(19, f - S.sources));

  const cam = camAt(askKeys, f);
  const v = camVelocity(askKeys, f);
  const send = center(rectOf(T, at(T, 'typing', 20), 'send'));
  const composer = center(rectOf(T, at(T, 'open', 11), 'composer'));
  const graph = center(rectOf(T, at(T, 'sources', 2), 'graphChip'));

  return (
    <AbsoluteFill>
      <AppShot take={T} i={i} cam={cam} motion={v}>
        <Tap x={composer.x} y={composer.y} t={prog(f, COMPOSER + 1, COMPOSER + 15, (t) => t)} />
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
