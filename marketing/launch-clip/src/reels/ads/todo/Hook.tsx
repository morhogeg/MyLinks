import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { HITS } from '../../../../clips/ad-todo-timeline.mjs';
import { MarkAssembly, SaveChip, type SaveKind } from '../../kit/Brand';
import { EASE_GATHER, EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../../kit/curves';
import { useShape } from './frame';

/**
 * 1 HOOK and 2 SHARE (round 4), in the reel's hook language (kit SaveChip,
 * MarkAssembly; the REVISIT clip's Opening.tsx is the model, not imported).
 *
 * The poster, frame 0: real saves of every kind from the demo account, where
 * they were kept (a YouTube video, an Instagram post, an article, an X post, a
 * screenshot), under "You save it. You never see it again."; they are already
 * in focus (their cascade began before frame 0). On "never" they bleach into
 * the paper. On "Share it to Machina instead." they come back to ink as they
 * rush into one point (EASE_GATHER), the brackets snap round it (the app's
 * spring): the mark, at 2.9s. The point then opens as an iris onto the app
 * (App.tsx draws the iris, centred on the same pixel).
 *
 * The chips are the kit's: the app's own platform marks, titles of real saves.
 */

/** where everything gathers (tall frame; the feed shape moves it by dy) */
export const POINT = { x: 540, y: 960 };
const MARK_W = 220;
/** the point's radius in px: the iris starts from it */
export const POINT_R = 52 * (MARK_W / 448);

const CHIPS: { kind: SaveKind; title: string; x: number; y: number; s: number; r: number; blur: number }[] = [
  { kind: 'youtube', title: 'How to overcome your addiction to technology', x: 560, y: 590, s: 0.98, r: -3, blur: 0 },
  { kind: 'web', title: 'Four Thousand Weeks', x: 900, y: 700, s: 0.76, r: 5, blur: 1.6 },
  { kind: 'instagram', title: 'One week, one small bag', x: 270, y: 770, s: 1.12, r: -4, blur: 0 },
  { kind: 'x', title: 'You do not rise to the level of your goals', x: 640, y: 890, s: 0.92, r: 2.5, blur: 0 },
  { kind: 'web', title: 'The Tail End', x: 150, y: 1010, s: 1.6, r: -6, blur: 3.5 },
  { kind: 'screenshot', title: 'Read Piranesi, and go in blind', x: 760, y: 1070, s: 1.0, r: 3.5, blur: 0 },
  { kind: 'web', title: 'The Most Important Question of Your Life', x: 420, y: 1200, s: 1.05, r: -2.5, blur: 0 },
  { kind: 'youtube', title: 'Inside the mind of a master procrastinator', x: 860, y: 1310, s: 0.7, r: 4, blur: 1.6 },
  { kind: 'instagram', title: 'Cosmic Cliffs in the Carina Nebula', x: 470, y: 1420, s: 0.98, r: -3, blur: 0 },
  { kind: 'instagram', title: 'Fushimi Inari at dawn', x: 820, y: 1560, s: 1.5, r: 5, blur: 3.5 },
];

const CHIP_SCALE = 1.3;

const chipAt = (k: number, f: number, P: { x: number; y: number }, dy: number) => {
  const c = CHIPS[k];
  // in focus on a rolling cascade that began before frame 0, so the first
  // frame (the poster a feed shows) already reads
  const t0 = k * 1.2 - 14;
  const arrive = prog(f, t0, t0 + 20, EASE_MODAL);
  // the hang: a slow push-in, nearer ones faster (parallax)
  const hang = prog(f, 0, HITS.gather[0], (t) => t);
  const push = 1 + hang * 0.08 * c.s;
  const g = prog(f, HITS.gather[0] - 6, HITS.gather[1], EASE_GATHER);
  // never seen again: bleached into the paper, back to ink as they gather
  const b = prog(f, HITS.bleach, HITS.bleach + 20, EASE_MODAL) * (1 - prog(f, HITS.gather[0] - 8, HITS.gather[1] - 4, EASE_IN_OUT));
  return {
    x: P.x + (c.x - POINT.x) * push * (1 - g),
    y: P.y + ((c.y - POINT.y) * push + (1 - arrive) * 26 * c.s) * (1 - g),
    // (the saves are set 30% larger than the REVISIT clip's: on a phone the
    // poster's titles must read at a glance)
    s: CHIP_SCALE * c.s * push * mix(0.95, 1, arrive) * mix(1, 0.06 / CHIP_SCALE, Math.pow(g, 0.7)),
    r: c.r * (1 - g) + g * (k % 2 ? 16 : -16),
    o: mix(0.5, 1, arrive) * (1 - Math.pow(g, 5)) * (1 - 0.72 * b),
    blur: (1 - arrive) * 8 + c.blur * (1 - g) + g * 2 + 3 * b,
    grey: b,
    g,
    dy,
  };
};

export const Hook: React.FC<{ f: number }> = ({ f }) => {
  const { dy } = useShape();
  const { height } = useVideoConfig();
  if (f > HITS.iris[1]) return null;
  const P = { x: POINT.x, y: POINT.y + dy };
  const dot = prog(f, HITS.gather[1], HITS.gather[1] + 7, EASE_SPRING);
  const flash = f < HITS.gather[1] ? Math.pow(prog(f, HITS.gather[0], HITS.gather[1], (t) => t), 3) * 0.45 : Math.max(0, 1 - (f - HITS.gather[1]) / 18);
  const close = prog(f, HITS.gather[1] + 1, HITS.snap + 4, EASE_SPRING);
  const part = prog(f, HITS.iris[0] - 6, HITS.iris[0] + 6, EASE_MODAL);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {f < HITS.gather[1] + 1 &&
        CHIPS.map((c, k) =>
          [3, 2, 1, 0].map((lag) => {
            const p = chipAt(k, f - lag * 1.2, P, dy);
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
                  filter: [p.blur > 0.2 ? `blur(${p.blur.toFixed(2)}px)` : '', p.grey > 0.01 ? `grayscale(${p.grey.toFixed(3)})` : ''].join(' ').trim() || undefined,
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
          background: `radial-gradient(38% 22% at 50% ${((P.y / height) * 100).toFixed(2)}%, rgba(255,255,255,${0.9 * flash}) 0%, rgba(255,255,255,0) 70%)`,
        }}
      />

      {/* the mark: the brackets (the point is drawn on its own: it opens) */}
      {f >= HITS.gather[1] - 1 && part < 1 && (
        <div
          style={{
            position: 'absolute',
            left: P.x,
            top: P.y,
            transform: 'translate(-50%, -50%)',
            opacity: 1 - part,
            filter: `drop-shadow(0 ${10 + flash * 10}px ${30 + flash * 40}px rgba(24,32,48,${0.22 + flash * 0.2}))`,
          }}
        >
          <MarkAssembly close={Math.max(0, close * (1 - part * 0.35))} dot={0} width={MARK_W} />
        </div>
      )}

      {/* the point: everything gathered, the iris's first frame */}
      {dot > 0 && f < HITS.iris[0] + 8 && (
        <div
          style={{
            position: 'absolute',
            left: P.x,
            top: P.y,
            width: POINT_R * 2,
            height: POINT_R * 2,
            borderRadius: '50%',
            background: '#14141B',
            transform: `translate(-50%, -50%) scale(${dot})`,
            boxShadow: `0 ${8 + flash * 8}px ${26 + flash * 30}px rgba(24,32,48,${0.3 + flash * 0.2})`,
            opacity: 1 - prog(f, HITS.iris[0], HITS.iris[0] + 8, EASE_MODAL),
          }}
        />
      )}
    </AbsoluteFill>
  );
};
