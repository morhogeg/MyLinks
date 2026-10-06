import React from 'react';
import { AbsoluteFill } from 'remotion';
import { OPENING } from '../../../../clips/revisit-timeline.mjs';
import { MarkAssembly, SaveChip, type SaveKind } from '../../kit/Brand';
import { EASE_GATHER, EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../../kit/curves';
import { NIGHT, typeGlow } from '../../../look';

/**
 * THE OPENING (round 4, owner: "present the issue, then our solutions"): the
 * problem, then the turn, in the reel's hook language (kit SaveChip,
 * MarkAssembly; the reel's scenes/Hook.tsx is the model, not imported).
 *
 * Ten real saves from the demo account, where they were kept (a video, a
 * post, a thread, a bookmarked page, a screenshot), come into focus; the
 * saves Revisit brings back later are among them (Four Thousand Weeks, The
 * Tail End, the tomato sauce, the V60 video, Piranesi). "You save things to
 * come back to later." "But most of them, you never open again.": they bleach
 * into the paper on "never". "Machina brings them back to you.": they come back
 * to ink as they GATHER (EASE_GATHER, the one move that ends at speed) into a
 * single point just after the name, the brackets snap round it (the app's
 * spring), and the point opens as the iris onto the Revisit tab (Revisit.tsx
 * draws the iris; the point is its first frame, centred on the same pixel).
 *
 * Absolute frames (the opening is the clip's first OPEN frames).
 */

/** where everything gathers: the frame point the Revisit tab's first camera
 *  puts at the centre of its screen, so the iris opens from the point */
export const POINT = { x: 540, y: 1148 };

const CHIPS: { kind: SaveKind; title: string; x: number; y: number; s: number; r: number; blur: number }[] = [
  { kind: 'youtube', title: 'The Ultimate V60 Technique', x: 590, y: 690, s: 0.98, r: -3, blur: 0 },
  { kind: 'web', title: 'Four Thousand Weeks', x: 880, y: 800, s: 0.76, r: 5, blur: 1.6 },
  { kind: 'instagram', title: 'Cala Goloritzé, Sardinia', x: 250, y: 860, s: 1.12, r: -4, blur: 0 },
  { kind: 'x', title: 'How to Get Rich (without getting lucky)', x: 640, y: 985, s: 0.92, r: 2.5, blur: 0 },
  { kind: 'web', title: 'The Tail End', x: 150, y: 1110, s: 1.6, r: -6, blur: 3.5 },
  { kind: 'screenshot', title: 'Read Piranesi, and go in blind', x: 760, y: 1170, s: 1.0, r: 3.5, blur: 0 },
  { kind: 'web', title: "Marcella Hazan's tomato sauce", x: 400, y: 1300, s: 1.1, r: -2.5, blur: 0 },
  { kind: 'youtube', title: 'Inside the mind of a master procrastinator', x: 860, y: 1400, s: 0.7, r: 4, blur: 1.6 },
  { kind: 'instagram', title: 'Cosmic Cliffs in the Carina Nebula', x: 480, y: 1520, s: 0.98, r: -3, blur: 0 },
  { kind: 'x', title: 'You do not rise to the level of your goals', x: 800, y: 1650, s: 1.55, r: 5, blur: 3.5 },
];

const O = OPENING;
const MARK_W = 220;

const chipAt = (k: number, f: number) => {
  const c = CHIPS[k];
  // in focus on a rolling cascade that began before frame 0, so the first
  // frame (the poster a feed shows) already reads: most saves nearly sharp,
  // the last few still coming in
  const t0 = k * 1.2 - 10;
  const arrive = prog(f, t0, t0 + 20, EASE_MODAL);
  // the hang: a slow push-in, nearer ones faster (parallax)
  const hang = prog(f, 0, O.gather[0], (t) => t);
  const push = 1 + hang * 0.09 * c.s;
  const g = prog(f, O.gather[0] - 6, O.gather[1], EASE_GATHER);
  // never opened again: bleached into the paper, back to ink as they gather
  const b = prog(f, O.bleach, O.bleach + 30, EASE_MODAL) * (1 - prog(f, O.gather[0] - 8, O.gather[1] - 4, EASE_IN_OUT));
  return {
    x: POINT.x + (c.x - POINT.x) * push * (1 - g),
    y: POINT.y + ((c.y - POINT.y) * push + (1 - arrive) * 26 * c.s) * (1 - g),
    s: c.s * push * mix(0.95, 1, arrive) * mix(1, 0.06, Math.pow(g, 0.7)),
    r: c.r * (1 - g) + g * (k % 2 ? 16 : -16),
    o: mix(0.5, 1, arrive) * (1 - Math.pow(g, 5)) * (1 - 0.72 * b),
    blur: (1 - arrive) * 8 + c.blur * (1 - g) + g * 2 + 3 * b,
    grey: b,
    g,
  };
};

export const Opening: React.FC<{ f: number }> = ({ f }) => {
  if (f > O.iris[1]) return null;
  // the point: everything gathered; the brackets snap round it; then the
  // brackets part and the point becomes the iris
  const dot = prog(f, O.gather[1], O.gather[1] + 7, EASE_SPRING);
  const flash = f < O.gather[1] ? Math.pow(prog(f, O.gather[0], O.gather[1], (t) => t), 3) * 0.45 : Math.max(0, 1 - (f - O.gather[1]) / 18);
  const close = prog(f, O.gather[1] + 1, O.snap + 4, EASE_SPRING);
  const part = prog(f, O.iris[0] - 6, O.iris[0] + 6, EASE_MODAL);
  const dotR = 52 * (MARK_W / 448);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {f < O.gather[1] + 1 &&
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
                  filter: [p.blur > 0.2 ? `blur(${p.blur.toFixed(2)}px)` : '', p.grey > 0.01 ? `grayscale(${p.grey.toFixed(3)}) brightness(${(1 - 0.45 * p.grey).toFixed(3)})` : ''].join(' ').trim() || undefined,
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
          background: `radial-gradient(38% 22% at 50% ${(POINT.y / 1920) * 100}%, rgba(225,232,255,${(0.85 * flash).toFixed(3)}) 0%, rgba(${NIGHT.glow},${(0.3 * flash).toFixed(3)}) 30%, rgba(${NIGHT.glow},0) 65%)`,
        }}
      />

      {/* the mark: the brackets (the point is drawn on its own: it opens) */}
      {f >= O.gather[1] - 1 && part < 1 && (
        <div
          style={{
            position: 'absolute',
            left: POINT.x,
            top: POINT.y,
            transform: 'translate(-50%, -50%)',
            opacity: 1 - part,
            filter: `drop-shadow(0 0 ${22 + flash * 34}px rgba(${NIGHT.glow},${(0.32 + flash * 0.4).toFixed(3)}))`,
          }}
        >
          <MarkAssembly close={Math.max(0, close * (1 - part * 0.35))} dot={0} width={MARK_W} />
        </div>
      )}

      {/* the point: everything gathered, the iris's first frame */}
      {dot > 0 && f < O.iris[0] + 8 && (
        <div
          style={{
            position: 'absolute',
            left: POINT.x,
            top: POINT.y,
            width: dotR * 2,
            height: dotR * 2,
            borderRadius: '50%',
            background: NIGHT.ink,
            transform: `translate(-50%, -50%) scale(${dot})`,
            boxShadow: `0 0 ${18 + flash * 30}px ${4 + flash * 6}px rgba(${NIGHT.glow},${(0.45 + flash * 0.35).toFixed(3)})`,
            opacity: 1 - prog(f, O.iris[0], O.iris[0] + 8, EASE_MODAL),
          }}
        />
      )}
    </AbsoluteFill>
  );
};

/** the point's radius in px: the iris starts from it */
export const POINT_R = 52 * (MARK_W / 448);
