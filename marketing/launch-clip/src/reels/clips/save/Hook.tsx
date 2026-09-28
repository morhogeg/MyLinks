import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CAPTIONS, FPS, HITS } from '../../../../clips/save-timeline.mjs';
import VO from './vo.json';
import { EASE_GATHER, EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../../kit/curves';
import { MarkAssembly, SaveChip, type SaveKind } from '../../kit/Brand';
import { Wordmark } from '../../../ui/Brand';
import { HANDOFF } from '../../scenes/handoff';

/**
 * The hook and the name. The problem, shown: great finds, each where it was
 * kept (open tabs, screenshots, bookmarks), come into focus (frame 0, the
 * poster, already reads). "Great finds get lost": they bleach into
 * the paper; each place is lifted back as the narrator names it. Then they
 * collapse into one point of ink (EASE_GATHER), the brackets snap shut around
 * it (the app's spring), and the drawn wordmark wipes in as "Machina" is said.
 * The shares arrive into this mark (Shares.tsx); then its point drops to
 * become the app's + button (the reel's match cut, handoff.ts).
 *
 * Titles are real saves from the demo account (verify checks).
 */

const C = { x: 540, y: 1000 };
const HOOK = CAPTIONS[0];
const NAME = CAPTIONS[1];
const wordAt = (c: { at: number }, k: number) => {
  const t = VO.find((v) => v.frame === c.at);
  return c.at + Math.round((t?.words[k] ?? 0) * FPS);
};
// "Great finds get lost in open tabs, screenshots and bookmarks."
const LOST = wordAt(HOOK, 3);
const NAME_AT = wordAt(NAME, 0);

/** where each was kept: web pages left open (tabs), screenshots, bookmarks */
const CHIPS: { kind: SaveKind; title: string; x: number; y: number; s: number; r: number; blur: number; named?: number }[] = [
  { kind: 'web', title: 'How to Do Great Work', x: 560, y: 700, s: 1.05, r: -3, blur: 0, named: 6 },
  { kind: 'youtube', title: 'The Ultimate V60 Technique', x: 880, y: 820, s: 0.74, r: 5, blur: 1.6 },
  { kind: 'screenshot', title: 'Read Piranesi, and go in blind', x: 330, y: 880, s: 1.16, r: -4, blur: 0, named: 7 },
  { kind: 'instagram', title: 'Fushimi Inari at dawn', x: 150, y: 1060, s: 1.7, r: -6, blur: 4 },
  { kind: 'x', title: 'You do not rise to the level of your goals', x: 650, y: 1010, s: 0.94, r: 2.5, blur: 0 },
  { kind: 'web', title: 'Laws of UX', x: 760, y: 1190, s: 1.1, r: 3.5, blur: 0, named: 9 },
  { kind: 'web', title: 'Four Thousand Weeks', x: 360, y: 1320, s: 1.0, r: -2.5, blur: 0 },
  { kind: 'youtube', title: 'Inventing on Principle', x: 900, y: 1420, s: 0.72, r: 4, blur: 1.6 },
  { kind: 'instagram', title: 'Tour du Mont Blanc', x: 520, y: 1540, s: 1.0, r: -3, blur: 0 },
  { kind: 'x', title: 'How to Get Rich (without getting lucky)', x: 830, y: 1660, s: 1.6, r: 5, blur: 4 },
];

const chipAt = (k: number, f: number) => {
  const c = CHIPS[k];
  // a rolling cascade into focus, already under way on frame 0 (the poster
  // feeds and link previews show): the first saves read, the rest settle
  const t0 = k * 1.5 - 17;
  const arrive = prog(f, t0, t0 + 24, EASE_IN_OUT);
  const push = 1 + 0.05 * prog(f, 0, HITS.collapse, (t) => t) * c.s;
  // named: lifts on its word, and stays lifted until the collapse
  const w = c.named !== undefined ? wordAt(HOOK, c.named) : Infinity;
  const e = prog(f, w - 2, w + 6, EASE_SPRING);
  // "lost": after the word, they bleach into the paper (the places named stay
  // in ink), back to ink only as they are gathered
  const b = prog(f, LOST + 20, LOST + 60, EASE_IN_OUT) * (1 - prog(f, HITS.collapse - 4, HITS.dotLands - 2, EASE_IN_OUT));
  const g = prog(f, HITS.collapse, HITS.dotLands, EASE_GATHER);
  const ox = (c.x - C.x) * push * (1 - 0.3 * e);
  const oy = (c.y - C.y) * push + (1 - arrive) * 28 * c.s;
  return {
    x: C.x + ox * (1 - g),
    y: C.y + oy * (1 - g),
    s: c.s * push * (1 + 0.14 * e) * mix(0.95, 1, arrive) * mix(1, 0.06, Math.pow(g, 0.7)),
    r: c.r * (1 - g) * (1 - 0.5 * e) + g * (k % 2 ? 16 : -16),
    o: mix(0.75, 1, arrive) * (1 - Math.pow(g, 5)) * (1 - 0.72 * b * (1 - e)),
    blur: (1 - arrive) * 5 + c.blur * (1 - g) * (1 - e) + g * 2 + 3 * b * (1 - e),
    grey: b * (1 - e),
    e,
    g,
  };
};

export const Hook: React.FC<{ f: number }> = ({ f }) => {
  if (f > HITS.toApp + 16) return null;
  const dot = f < HITS.dotLands ? 0 : prog(f, HITS.dotLands, HITS.dotLands + 7, EASE_SPRING);
  const flash = f < HITS.dotLands ? Math.pow(prog(f, HITS.collapse, HITS.dotLands, (t) => t), 3) * 0.5 : Math.max(0, 1 - (f - HITS.dotLands) / 18);
  const close = prog(f, HITS.dotLands + 1, HITS.bracketsClose + 4, EASE_SPRING);
  const form = prog(f, HITS.bracketsClose - 6, HITS.bracketsClose + 12, EASE_MODAL);
  // an exit eases in and out (a fast-start fade reads as a blink)
  const part = prog(f, HITS.part, HITS.part + 16, EASE_IN_OUT);
  const travel = prog(f, HITS.part + 2, HITS.toApp, EASE_IN_OUT);
  const wm = prog(f, NAME_AT, NAME_AT + 16, EASE_MODAL);
  const lift = prog(f, NAME_AT - 8, NAME_AT + 22, EASE_IN_OUT);
  const markY = C.y - 70 * lift;
  const push = 1 + 0.04 * prog(f, NAME_AT + 22, HITS.part, (t) => t);
  const markScale = mix(1, 0.86, form);
  const MARK_W = 300;
  const dotR = 52 * (MARK_W / 448) * markScale;
  const dotX = mix(C.x, HANDOFF.plus.x, travel);
  const dotY = mix(markY, HANDOFF.plus.y, travel);
  const dotScale = mix(push, HANDOFF.plus.r / dotR, travel);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
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
                  zIndex: p.e > 0.01 ? 2 : 1,
                  filter: [p.blur > 0.2 ? `blur(${p.blur.toFixed(2)}px)` : '', p.grey > 0.01 ? `grayscale(${p.grey.toFixed(3)})` : ''].join(' ').trim() || undefined,
                }}
              >
                <SaveChip kind={c.kind} title={c.title} />
              </div>
            );
          }),
        )}

      <AbsoluteFill
        style={{
          background: `radial-gradient(38% 22% at 50% ${(markY / 1920) * 100}%, rgba(255,255,255,${0.9 * flash}) 0%, rgba(255,255,255,0) 70%)`,
        }}
      />

      {f >= HITS.dotLands - 1 && part < 1 && (
        <div
          style={{
            position: 'absolute',
            left: C.x,
            top: markY,
            transform: `translate(-50%, -50%) scale(${markScale * push})`,
            opacity: 1 - part,
            filter: `drop-shadow(0 ${10 + flash * 10}px ${30 + flash * 40}px rgba(24,32,48,${0.22 + flash * 0.2}))`,
          }}
        >
          <MarkAssembly close={Math.max(0, close * (1 - part * 0.35))} dot={0} width={MARK_W} />
        </div>
      )}

      {wm > 0 && part < 1 && (
        <div
          style={{
            position: 'absolute',
            left: C.x,
            top: markY + 190 * push,
            width: 460 * push,
            transform: `translate(-50%, 0) translateY(${Math.round((1 - wm) * 10)}px)`,
            clipPath: `inset(-20% ${((1 - wm) * 100).toFixed(2)}% -20% 0)`,
            opacity: 1 - part,
            color: '#14141B',
            lineHeight: 0,
            filter: `drop-shadow(0 4px 24px rgba(24,32,48,0.14))${wm < 0.999 ? ` blur(${((1 - wm) * 4).toFixed(2)}px)` : ''}`,
          }}
        >
          <Wordmark style={{ width: '100%', height: 'auto' }} />
        </div>
      )}

      {dot > 0 && (
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
            opacity: 1 - prog(f, HITS.toApp + 2, HITS.toApp + 16, EASE_MODAL),
          }}
        />
      )}
    </AbsoluteFill>
  );
};
