import React from 'react';
import { AbsoluteFill, useVideoConfig } from 'remotion';
import { HITS } from '../../../../clips/ad-todo-timeline.mjs';
import { MarkAssembly, SaveChip, type SaveKind } from '../../kit/Brand';
import { Wordmark } from '../../../ui/Brand';
import { EASE_GATHER, EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../../kit/curves';
import { useShape } from './frame';
import { NIGHT, typeGlow } from '../../../look';

/**
 * 1 THE PAIN and 2 THE ANSWER, in the reel's hook language (kit SaveChip,
 * MarkAssembly; the REVISIT clip's Opening.tsx is the model, not imported).
 *
 * Round 6 (the owner's script). The poster, frame 0: real saves of every kind
 * from the demo account, where they were kept (a YouTube video, an Instagram
 * post, an article, an X post, a screenshot), under "How many things did you
 * save this month…"; already in focus (their cascade began before frame 0).
 * On "never open again" they grey out. As the narrator names "that video",
 * "the post", "that article", "the screenshot", each comes back in colour and
 * lifts toward the viewer (an ink ring, a deeper shadow: the kit's Lift). On
 * "buried across a dozen different apps" they drift apart and fade. On "That's
 * exactly why we made Machina." they come back to ink as they rush into one
 * point (EASE_GATHER), and the brackets snap round it on "Machina". The point
 * then opens as an iris onto the app (App.tsx).
 *
 * The chips are the kit's: the app's own platform marks, titles of real saves.
 */

/** where everything gathers (tall frame; the feed shape moves it by dy) */
export const POINT = { x: 540, y: 960 };
const MARK_W = 220;
/** the wordmark under it, in the lockup's proportion (mark 262 : word 660) */
const WORD_W = Math.round(MARK_W * (660 / 262));
/** the point's radius in px: the iris starts from it */
export const POINT_R = 52 * (MARK_W / 448);

const CHIPS: { kind: SaveKind; title: string; x: number; y: number; s: number; r: number; blur: number }[] = [
  { kind: 'youtube', title: 'How to overcome your addiction to technology', x: 560, y: 590, s: 0.98, r: -3, blur: 0 },
  { kind: 'web', title: 'Four Thousand Weeks', x: 900, y: 700, s: 0.76, r: 5, blur: 1.6 },
  { kind: 'instagram', title: 'One week, one small bag', x: 270, y: 770, s: 1.12, r: -4, blur: 0 },
  { kind: 'x', title: 'You do not rise to the level of your goals', x: 640, y: 890, s: 0.92, r: 2.5, blur: 0 },
  { kind: 'web', title: 'The Tail End', x: 240, y: 1010, s: 1.6, r: -6, blur: 3.5 },
  { kind: 'screenshot', title: 'Read Piranesi, and go in blind', x: 760, y: 1070, s: 1.0, r: 3.5, blur: 0 },
  { kind: 'web', title: 'The Most Important Question of Your Life', x: 420, y: 1200, s: 1.05, r: -2.5, blur: 0 },
  { kind: 'youtube', title: 'Inside the mind of a master procrastinator', x: 860, y: 1310, s: 0.7, r: 4, blur: 1.6 },
  { kind: 'instagram', title: 'Cosmic Cliffs in the Carina Nebula', x: 470, y: 1420, s: 0.98, r: -3, blur: 0 },
  { kind: 'instagram', title: 'Fushimi Inari at dawn', x: 820, y: 1560, s: 1.5, r: 5, blur: 3.5 },
];

const CHIP_SCALE = 1.12;
/** (owner, 2026-10-04: titles ran off the sides on the first frame) the spread
 *  is drawn toward the centre so every save sits inside the frame */
const SPREAD_X = 0.74;

/** the four saves the narrator names, in order (round 6): the video, the
 *  post, the article, the screenshot (indices into CHIPS) */
const NAMED = [0, 2, 6, 5];

const chipAt = (k: number, f: number, P: { x: number; y: number }, dy: number) => {
  const c = CHIPS[k];
  // in focus on a rolling cascade that began before frame 0, so the first
  // frame (the poster a feed shows) already reads
  const t0 = k * 1.2 - 14;
  const arrive = prog(f, t0, t0 + 20, EASE_MODAL);
  // the hang: a slow push-in, nearer ones faster (parallax)
  const hang = prog(f, 0, HITS.gather[0], (t) => t);
  const push = 1 + hang * 0.05 * c.s;
  // "…and never open again?": they grey out and go soft
  const grey = prog(f, HITS.grey, HITS.grey + 20, EASE_MODAL);
  // as each is named it comes back in colour and lifts toward the viewer,
  // and stays lit until they are buried
  const n = NAMED.indexOf(k);
  const lit = n < 0 ? 0 : prog(f, HITS.named[n], HITS.named[n] + 10, EASE_SPRING);
  // "buried across a dozen different apps": they drift apart and fade
  const bury = prog(f, HITS.bury[0], HITS.bury[1], EASE_IN_OUT);
  const g = prog(f, HITS.gather[0] - 6, HITS.gather[1], EASE_GATHER);
  // (back to ink as they gather)
  const ink = prog(f, HITS.gather[0] - 8, HITS.gather[1] - 4, EASE_IN_OUT);
  const b = Math.max(0, grey * (1 - lit) * (1 - ink));
  const spread = 1 + 0.35 * bury * (1 - g);
  const near = 1 + 0.07 * lit * (1 - bury);
  // "How many things…": a ripple runs through the saves, one after another
  const st = f - (HITS.stir + k * 3);
  const ripple = st > 0 && st < 18 ? Math.sin((st / 18) * Math.PI) : 0;
  return {
    x: P.x + (c.x - POINT.x) * SPREAD_X * push * spread * (1 - g),
    y: P.y + ((c.y - POINT.y) * push * spread + (1 - arrive) * 26 * c.s - 14 * ripple) * (1 - g),
    // (the saves are set 30% larger than the REVISIT clip's: on a phone the
    // poster's titles must read at a glance)
    s: CHIP_SCALE * c.s * push * near * mix(0.95, 1, arrive) * mix(1, 0.06 / CHIP_SCALE, Math.pow(g, 0.7)),
    r: c.r * (1 - g) * (1 - 0.6 * lit * (1 - bury)) + g * (k % 2 ? 16 : -16),
    o: mix(0.5, 1, arrive) * (1 - Math.pow(g, 5)) * (1 - 0.6 * b) * (1 - 0.75 * bury * (1 - ink)),
    blur: (1 - arrive) * 8 + c.blur * (1 - g) * (1 - lit * (1 - bury)) + g * 2 + 2.5 * b + 6 * bury * (1 - ink),
    grey: Math.min(1, b + bury * (1 - ink)),
    lit: lit * (1 - bury),
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
        // (the named saves are drawn last, so the one lit is on top)
        [...CHIPS.keys()].sort((a, z) => NAMED.indexOf(a) - NAMED.indexOf(z)).map((k) => { const c = CHIPS[k]; return (
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
                  filter: [p.blur > 0.2 ? `blur(${p.blur.toFixed(2)}px)` : '', p.grey > 0.01 ? `grayscale(${p.grey.toFixed(3)}) brightness(${(1 - 0.45 * p.grey).toFixed(3)})` : ''].join(' ').trim() || undefined,
                }}
              >
                <SaveChip kind={c.kind} title={c.title} style={p.lit > 0.01 ? { boxShadow: `inset 0 1px 0 rgba(255,255,255,0.07), 0 ${Math.round(18 + 22 * p.lit)}px ${Math.round(40 + 40 * p.lit)}px -14px rgba(0,0,0,${(0.8 + 0.1 * p.lit).toFixed(3)}), 0 0 0 ${(1.5 * p.lit).toFixed(2)}px rgba(236,239,246,${(0.6 * p.lit).toFixed(3)}), 0 0 ${Math.round(26 * p.lit)}px rgba(${NIGHT.glow},${(0.4 * p.lit).toFixed(3)})` } : undefined} />
              </div>
            );
          }));
        })}

      {/* the landing: a lift of white light */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(38% 22% at 50% ${((P.y / height) * 100).toFixed(2)}%, rgba(225,232,255,${(0.85 * flash).toFixed(3)}) 0%, rgba(${NIGHT.glow},${(0.3 * flash).toFixed(3)}) 30%, rgba(${NIGHT.glow},0) 65%)`,
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
            filter: `drop-shadow(0 0 ${22 + flash * 34}px rgba(${NIGHT.glow},${(0.32 + flash * 0.4).toFixed(3)}))`,
          }}
        >
          <MarkAssembly close={Math.max(0, close * (1 - part * 0.35))} dot={0} width={MARK_W} />
        </div>
      )}

      {/* the name, the brand's own drawn wordmark (the closing lockup's, kit
          Lockup), wiping in under the brackets as "Machina" is said (owner,
          2026-10-04: show the name in its font); it leaves as the app opens */}
      {f >= HITS.snap - 2 && part < 1 && (() => {
        const word = prog(f, HITS.snap, HITS.snap + 14, EASE_MODAL);
        return (
          <div
            style={{
              position: 'absolute',
              left: P.x - WORD_W / 2,
              top: P.y + MARK_W / 2 + 56,
              width: WORD_W,
              color: NIGHT.ink,
              lineHeight: 0,
              clipPath: `inset(-10% ${((1 - word) * 100).toFixed(2)}% -10% 0)`,
              transform: `translateY(${Math.round((1 - word) * 12)}px)`,
              filter: typeGlow(1.1),
              opacity: 1 - part,
            }}
          >
            <Wordmark style={{ width: '100%', height: 'auto' }} />
          </div>
        );
      })()}

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
            background: NIGHT.ink,
            transform: `translate(-50%, -50%) scale(${dot})`,
            boxShadow: `0 0 ${18 + flash * 30}px ${4 + flash * 6}px rgba(${NIGHT.glow},${(0.45 + flash * 0.35).toFixed(3)})`,
            opacity: 1 - prog(f, HITS.iris[0], HITS.iris[0] + 8, EASE_MODAL),
          }}
        />
      )}
    </AbsoluteFill>
  );
};
