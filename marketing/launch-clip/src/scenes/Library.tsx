import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Phone } from '../ui/Phone';
import { FloorGlow, Rig, Stage } from '../film/effects';
import { BASE_SCALE, BASE_Y, drift, prog, ramp, typed, EASE_IN_OUT, EASE_MODAL, EASE_OUT } from '../film/anim';
import { FeedScreen } from '../ui/screens';
import { CARDS, SEARCH_HITS, SEARCH_QUERY } from '../data/library';

/**
 * The library, and the claim the film has to actually PROVE: search by meaning.
 *
 * The typed query — "why cramming never sticks" — shares not one word with the
 * three cards it retrieves. That is the entire reason this scene exists, and why
 * the copy in `data/library.ts` is fixed: a query with lexical overlap would make
 * the beat indistinguishable from ⌘F.
 */
export const Library: React.FC = () => {
  const f = useCurrentFrame();

  // the feed lands card by card, then scrolls under its own weight
  const enters = CARDS.map((_, i) => prog(f, 6 + i * 5, 26 + i * 5, EASE_MODAL));
  const scrollY = ramp(f, [30, 120], [0, 250], EASE_IN_OUT) - ramp(f, [124, 150], [0, 250], EASE_MODAL);

  // the query, then the semantic snap (bar 13.1 ⇒ frame ~157)
  const chars = typed(f, 132, 168, SEARCH_QUERY.length);
  const semantic = prog(f, 150, 176, EASE_OUT);
  const filtered = prog(f, 166, 190, EASE_MODAL);

  // camera: a straight-on establishing hold, then a slow 2D push onto the hits
  const scale = BASE_SCALE * ramp(f, [0, 60], [1.06, 1.0], EASE_OUT) * (1 + prog(f, 170, 300, EASE_IN_OUT) * 0.42);
  const y = BASE_Y + drift(f, 5, 280) - prog(f, 170, 300, EASE_IN_OUT) * 74;
  const rotY = ramp(f, [0, 46], [-8, 0], EASE_OUT);

  const out = 1 - prog(f, 288, 300);
  const inFade = prog(f, 0, 10);

  return (
    <AbsoluteFill style={{ background: '#050505', opacity: out * inFade }}>
      <Stage intensity={0.6} backlight={0.42} />
      <Rig scale={scale} rotY={rotY} y={y} origin="center 38%">
        <div style={{ position: 'relative' }}>
          <FloorGlow y={890} w={700} opacity={0.5} />
          <Phone>
            <FeedScreen
              enters={enters}
              scrollY={scrollY}
              search={{
                value: SEARCH_QUERY.slice(0, chars),
                caret: chars > 0 && chars < SEARCH_QUERY.length,
                semantic,
              }}
              hits={filtered > 0.02 ? SEARCH_HITS : null}
              filtered={filtered}
            />
          </Phone>
        </div>
      </Rig>
    </AbsoluteFill>
  );
};
