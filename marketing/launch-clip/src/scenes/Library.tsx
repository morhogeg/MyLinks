import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Phone } from '../ui/Phone';
import { useFraming } from '../film/format';
import { FloorGlow, Rig, SET_BG, Stage } from '../film/effects';
import { drift, prog, ramp, typed, EASE_IN_OUT, EASE_MODAL, EASE_OUT, EASE_SPRING } from '../film/anim';
import { FeedScreen } from '../ui/screens';
import { CARDS, SEARCH_HITS, SEARCH_QUERY } from '../data/library';

/**
 * The library, and the claim the film has to actually PROVE: retrieval from a
 * half-memory.
 *
 * The typed query — "easy dinner for guests" — shares not one word with the
 * ONE card it retrieves (the one-pan lemon chicken). That is the entire reason
 * this scene exists, and why the copy in `data/library.ts` is fixed: a query
 * with lexical overlap would make the beat indistinguishable from ⌘F, and more
 * than one survivor would make it read as a filter narrowing rather than the
 * app finding THE thing.
 */
export const Library: React.FC = () => {
  const f = useCurrentFrame();
  const fr = useFraming();

  // THREE bars now (round 13 gave the browse bar to act one): the feed lands,
  // one breath of scroll, then straight into the search — the beat's argument
  // was always the retrieval, not the browsing. Cards settle with a spring
  // overshoot (energy pass).
  const enters = CARDS.map((_, i) => prog(f, 4 + i * 4, 24 + i * 4, EASE_SPRING));
  const scrollY = ramp(f, [26, 92], [0, 220], EASE_IN_OUT) - ramp(f, [96, 118], [0, 220], EASE_MODAL);

  // the query, then the semantic snap (HITS.filterSnap = bar 13.85 ⇒ local ~139)
  const chars = typed(f, 100, 134, SEARCH_QUERY.length);
  const semantic = prog(f, 125, 146, EASE_OUT);
  const filtered = prog(f, 136, 160, EASE_MODAL);

  // camera: a straight-on establishing hold, then a slow 2D push onto the hit
  // Framed to READ: the feed at 1.5×, pushing to 1.85× on the match. The old
  // 0.9× "whole device on a table" shot was unreadable on a phone.
  const push = prog(f, 138, 218, EASE_IN_OUT);
  const scale = ramp(f, [0, 50], [1.44, 1.5], EASE_OUT) + push * 0.42;
  // the push lands on the ONE surviving card, sitting right under the query
  const target = ramp(f, [95, 200], [430, 265], EASE_IN_OUT);
  const y = fr.focusY(target, scale * fr.scaleMul) + drift(f, 4, 280);
  const rotY = ramp(f, [0, 40], [-9, -4], EASE_OUT) * (1 - prog(f, 138, 180, EASE_IN_OUT));

  const out = 1 - prog(f, 213, 225);
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
