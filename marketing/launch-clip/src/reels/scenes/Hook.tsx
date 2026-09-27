import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HITS } from '../../../reel-timeline.mjs';
import { EASE_GATHER, EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../kit/curves';
import { MarkAssembly, SaveChip, type SaveKind } from '../kit/Brand';
import { HANDOFF } from './handoff';

/**
 * 0:00 – 6.9s. Saves everywhere, then gone → one point → the mark.
 *
 * Ten real saves from the demo account (the same cards the app shows later),
 * each where it was kept: a YouTube video, an Instagram post, an X thread, a
 * bookmarked page, a screenshot. They arrive on 16ths, hang in depth, then
 * collapse on an ACCELERATING curve (EASE_GATHER, the one move that ends at
 * speed) into a single point of ink on beat 3. The brackets snap shut around
 * it on the app's spring, the narrator names it (the caption sets "Machina."
 * over the tagline in the band above the mark; the drawn wordmark is saved
 * for the lockup), and the point drops to become the app's own + button.
 */

// where everything gathers (and the mark stays). The saves hang BELOW the
// caption band: the narrator's first line is read over them.
const C = { x: 540, y: 1000 };

/**
 * Three depths: far (small, a little soft), mid (the readable ones), near
 * (big, soft, partly out of frame: the lens is IN the scatter). Titles are
 * real saves from the demo account.
 */
const CHIPS: { kind: SaveKind; title: string; x: number; y: number; s: number; r: number; blur: number }[] = [
  { kind: 'youtube', title: 'Inside the mind of a master procrastinator', x: 600, y: 690, s: 1.05, r: -3, blur: 0 },
  { kind: 'web', title: 'Four Thousand Weeks', x: 900, y: 817, s: 0.74, r: 5, blur: 1.6 },
  { kind: 'instagram', title: 'Cala Goloritzé, Sardinia', x: 250, y: 849, s: 1.2, r: -4, blur: 0 },
  { kind: 'x', title: 'How to Get Rich (without getting lucky)', x: 640, y: 976, s: 0.96, r: 2.5, blur: 0 },
  { kind: 'web', title: 'The Tail End', x: 130, y: 1103, s: 1.75, r: -6, blur: 4 },
  { kind: 'screenshot', title: 'Read Piranesi, and go in blind', x: 760, y: 1159, s: 1.02, r: 3.5, blur: 0 },
  { kind: 'web', title: "Marcella Hazan's tomato sauce", x: 380, y: 1293, s: 1.18, r: -2.5, blur: 0 },
  { kind: 'youtube', title: 'The Ultimate V60 Technique', x: 880, y: 1388, s: 0.72, r: 4, blur: 1.6 },
  { kind: 'instagram', title: 'Cosmic Cliffs in the Carina Nebula', x: 520, y: 1515, s: 1.0, r: -3, blur: 0 },
  { kind: 'x', title: 'You do not rise to the level of your goals', x: 820, y: 1650, s: 1.7, r: 5, blur: 4 },
];

/** Where chip k is at frame f (without trails). */
const chipAt = (k: number, f: number) => {
  const c = CHIPS[k];
  const t0 = 2 + k * 4; // they arrive on a rolling cascade, a 16th apart
  const arrive = prog(f, t0, t0 + 12, EASE_MODAL);
  // the hang: a slow push-in (near ones faster: parallax) and a drift apart
  const hang = prog(f, 0, HITS.collapse, (t) => t);
  const depth = c.s; // bigger = nearer
  const push = 1 + hang * 0.05 * depth;
  const ox = (c.x - C.x) * push;
  const oy = (c.y - C.y) * push + (1 - arrive) * 50 * depth;
  // the gather
  const g = prog(f, HITS.collapse - 8, HITS.dotLands, EASE_GATHER);
  return {
    x: C.x + ox * (1 - g),
    y: C.y + oy * (1 - g),
    s: c.s * push * mix(0.9, 1, arrive) * mix(1, 0.06, Math.pow(g, 0.7)),
    r: c.r * (1 - g) + g * (k % 2 ? 16 : -16),
    o: arrive * (1 - Math.pow(g, 5)),
    blur: (1 - arrive) * 14 + c.blur * (1 - g) + g * 2,
    g,
  };
};

export const Hook: React.FC<{ f: number }> = ({ f }) => {
  if (f > HANDOFF.end) return null;

  // ── the point, the flash, the snap
  const dot = f < HITS.dotLands ? 0 : prog(f, HITS.dotLands, HITS.dotLands + 7, EASE_SPRING);
  const flash = f < HITS.dotLands ? Math.pow(prog(f, HITS.collapse, HITS.dotLands, (t) => t), 3) * 0.5 : Math.max(0, 1 - (f - HITS.dotLands) / 18);
  // brackets: in from wide, a spring overshoot inward, settle
  const close = prog(f, HITS.dotLands + 1, HITS.bracketsClose + 4, EASE_SPRING);

  // ── the mark settles a touch smaller over the name and promise (the caption)
  const form = prog(f, HITS.markLocked - 6, HITS.markLocked + 12, EASE_MODAL);

  // ── the hand-off: brackets part and fade, the name leaves, the point
  // travels to where the app's + button will be
  const part = prog(f, HANDOFF.part, HANDOFF.part + 10, EASE_MODAL);
  const travel = prog(f, HANDOFF.travel, HANDOFF.iris, EASE_IN_OUT);
  const markY = C.y;
  const markScale = mix(1, 0.86, form);
  const MARK_W = 300;
  const dotR = 52 * (MARK_W / 448) * markScale; // the point's radius, px
  const dotX = mix(C.x, HANDOFF.plus.x, travel);
  const dotY = mix(markY, HANDOFF.plus.y, travel);
  const dotScale = mix(1, HANDOFF.plus.r / dotR, travel);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* the saves, with speed trails while they collapse */}
      {f < HITS.dotLands + 1 &&
        CHIPS.map((c, k) =>
          [3, 2, 1, 0].map((lag) => {
            const p = chipAt(k, f - lag * 1.2);
            if (lag > 0 && p.g < 0.08) return null;
            const alpha = lag === 0 ? 1 : [0, 0.28, 0.16, 0.08][lag];
            return (
              <div
                key={`${k}-${lag}`}
                style={{
                  position: 'absolute',
                  left: p.x,
                  top: p.y,
                  transform: `translate(-50%, -50%) rotate(${p.r}deg) scale(${p.s})`,
                  opacity: p.o * alpha,
                  filter: p.blur > 0.2 ? `blur(${p.blur}px)` : undefined,
                }}
              >
                <SaveChip kind={c.kind} title={c.title} />
              </div>
            );
          }),
        )}

      {/* the landing: a lift of white light */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(38% 22% at 50% ${(markY / 1920) * 100}%, rgba(255,255,255,${0.9 * flash}) 0%, rgba(255,255,255,0) 70%)`,
        }}
      />

      {/* the mark: brackets only (the point is drawn separately so it can travel) */}
      {f >= HITS.dotLands - 1 && (
        <div
          style={{
            position: 'absolute',
            left: C.x,
            top: markY,
            transform: `translate(-50%, -50%) scale(${markScale})`,
            opacity: 1 - part,
            filter: `drop-shadow(0 ${10 + flash * 10}px ${30 + flash * 40}px rgba(24,32,48,${0.22 + flash * 0.2}))`,
          }}
        >
          <MarkAssembly close={Math.max(0, close * (1 - part * 0.35))} dot={0} width={MARK_W} />
        </div>
      )}

      {/* the point: everything gathered, then the + button's ink */}
      {dot > 0 && f < HANDOFF.end && (
        <div
          style={{
            position: 'absolute',
            left: dotX,
            top: dotY,
            width: dotR * 2,
            height: dotR * 2,
            borderRadius: '50%',
            background: '#14141B',
            transform: `translate(-50%, -50%) scale(${dot * dotScale})`,
            boxShadow: `0 ${8 + flash * 8}px ${26 + flash * 30}px rgba(24,32,48,${0.3 + flash * 0.2})`,
            opacity: 1 - prog(f, HANDOFF.iris + 2, HANDOFF.end, EASE_MODAL),
          }}
        />
      )}

    </AbsoluteFill>
  );
};
