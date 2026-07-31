import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Phone } from '../ui/Phone';
import { useFraming } from '../film/format';
import { FloorGlow, Rig, SET_BG, Stage } from '../film/effects';
import { drift, prog, ramp, typed, EASE_IN_OUT, EASE_MODAL, EASE_OUT } from '../film/anim';
import { FeedScreen } from '../ui/screens';
import { CARDS, SEARCH_HITS, SEARCH_QUERY } from '../data/library';

/**
 * The library, and the claim the film has to actually PROVE: retrieval from a
 * half-memory.
 *
 * The typed query — "why cramming never sticks" — shares not one word with the
 * ONE card it retrieves. That is the entire reason this scene exists, and why
 * the copy in `data/library.ts` is fixed: a query with lexical overlap would make
 * the beat indistinguishable from ⌘F, and more than one survivor would make it
 * read as a filter narrowing rather than the app finding THE thing.
 */
export const Library: React.FC = () => {
  const f = useCurrentFrame();
  const fr = useFraming();

  // the feed lands card by card, then scrolls under its own weight
  const enters = CARDS.map((_, i) => prog(f, 6 + i * 5, 26 + i * 5, EASE_MODAL));
  const scrollY = ramp(f, [30, 120], [0, 250], EASE_IN_OUT) - ramp(f, [124, 150], [0, 250], EASE_MODAL);

  // the query, then the semantic snap (bar 13.1 ⇒ frame ~157)
  const chars = typed(f, 132, 168, SEARCH_QUERY.length);
  const semantic = prog(f, 150, 176, EASE_OUT);
  const filtered = prog(f, 166, 190, EASE_MODAL);

  // camera: a straight-on establishing hold, then a slow 2D push onto the hits
  // Framed to READ: the feed at 1.5×, pushing to 1.85× on the matches. The old
  // 0.9× "whole device on a table" shot was unreadable on a phone.
  const push = prog(f, 168, 300, EASE_IN_OUT);
  const scale = ramp(f, [0, 60], [1.44, 1.5], EASE_OUT) + push * 0.42;
  // the push lands on the ONE surviving card, sitting right under the query
  const target = ramp(f, [120, 240], [430, 265], EASE_IN_OUT);
  const y = fr.focusY(target, scale * fr.scaleMul) + drift(f, 4, 280);
  const rotY = ramp(f, [0, 46], [-9, -4], EASE_OUT) * (1 - prog(f, 168, 214, EASE_IN_OUT));

  const out = 1 - prog(f, 288, 300);
  const inFade = prog(f, 0, 4);

  return (
    <AbsoluteFill style={{ background: SET_BG, opacity: out * inFade }}>
      <Stage intensity={0.64} backlight={0.36} />
      <Rig scale={scale * fr.scaleMul} rotY={rotY} x={fr.baseX} y={y} origin="center 38%">
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
