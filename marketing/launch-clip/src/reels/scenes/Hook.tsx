import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CAPTIONS, FPS, HITS, HOLDS, holdStart, real } from '../../../reel-timeline.mjs';
import VO from '../data/reel-vo.json';
import { EASE_GATHER, EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../kit/curves';
import { MarkAssembly, SaveChip, type SaveKind } from '../kit/Brand';
import { Wordmark } from '../../ui/Brand';
import { HANDOFF } from './handoff';
import { NIGHT, typeGlow } from '../../look';

/**
 * 0:00 – 4.3s. Saves everywhere → one point → the mark.
 *
 * Ten real saves from the demo account (the same cards the app shows later),
 * each where it was kept: a YouTube video, an Instagram post, an X thread, a
 * bookmarked page, a screenshot. They come into focus on 16ths (a soft
 * scatter is already there on frame 0, the reel's poster), hang in depth, then
 * collapse on an ACCELERATING curve (EASE_GATHER, the one move that ends at
 * speed) into a single point of ink on beat 3. The brackets snap shut around
 * it on the app's spring, the narrator names it (the caption sets "Machina."
 * over the tagline in the band above the mark; the drawn wordmark is saved
 * for the lockup), and the point drops to become the app's own + button.
 */

// where everything gathers (and the mark stays). The saves hang BELOW the
// caption band: the narrator names the problem over them.
const C = { x: 540, y: 1000 };

/**
 * The problem (owner, round 4: open like the launch film). While the source
 * clock holds, the narrator says "An article here. A recipe there. A video
 * somewhere else.": each named save lifts forward as its word is spoken,
 * then "Saved, and rarely seen again." bleaches them all into the paper,
 * and they only come back to full ink as they are pulled into the point.
 */
const NAMED: [chip: number, caption: number, word: number][] = [
  [4, 1, 1], // "article" → The Tail End
  [6, 1, 4], // "recipe" → Marcella Hazan's tomato sauce
  [0, 1, 7], // "video" → the TED talk on YouTube
];
const wordFrame = (caption: number, word: number) => {
  const c = CAPTIONS[caption];
  const t = VO.find((v) => v.frame === c.at);
  return c.at + Math.round((t?.words[word] ?? 0) * FPS);
};
const BLEACH_FROM = CAPTIONS[2].at + 6;

/** "Introducing Machina.": the drawn wordmark wipes in on the spoken name */
const NAME = CAPTIONS.find((c) => c.place === 'mark')!;
const NAME_AT = (() => {
  const t = VO.find((v) => v.frame === NAME.at);
  return NAME.at + Math.round((t?.words[1] ?? 0.7) * FPS);
})();

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

const H0 = holdStart('problem');
const HLEN = HOLDS.find((h) => h.id === 'problem')!.len;

/** Where chip k is at source frame f, output frame `out` (without trails). */
const chipAt = (k: number, f: number, out: number) => {
  const c = CHIPS[k];
  const t0 = 1 + k * 2; // they arrive on a rolling cascade
  // (round 13: they come INTO FOCUS rather than out of nothing, so the very
  // first frame, the one a feed shows before it plays, is already the scatter)
  const arrive = prog(f, t0, t0 + 12, EASE_MODAL);
  // the hang: a slow push-in (near ones faster: parallax) and a drift apart
  const hang = prog(f, 0, HITS.collapse, (t) => t);
  const depth = c.s; // bigger = nearer
  // …which keeps going, slowly, while the narrator holds the clock
  const drift = prog(out, H0, H0 + HLEN, (t) => t);
  const push = 1 + (hang * 0.05 + drift * 0.06) * depth;
  // named by the narrator: this save lifts forward on its word
  const e = NAMED.filter(([chip]) => chip === k).reduce((acc, [, cap, word]) => {
    const w = wordFrame(cap, word);
    return acc + prog(out, w - 2, w + 6, EASE_SPRING) * (1 - prog(out, w + 34, w + 50, EASE_MODAL));
  }, 0);
  const ox = (c.x - C.x) * push * (1 - 0.35 * e);
  const oy = (c.y - C.y) * push + (1 - arrive) * 28 * depth;
  // the gather
  const g = prog(f, HITS.collapse - 8, HITS.dotLands, EASE_GATHER);
  // "rarely seen again": bleached into the paper, back to ink as it is gathered
  // (the ink comes back eased in and out as they accelerate inward; on
  // EASE_MODAL it came back in two frames, a pop)
  const b = prog(out, BLEACH_FROM, BLEACH_FROM + 36, EASE_MODAL) * (1 - prog(f, HITS.collapse - 4, HITS.dotLands - 2, EASE_IN_OUT));
  return {
    x: C.x + ox * (1 - g),
    y: C.y + oy * (1 - g),
    s: c.s * push * (1 + 0.14 * e) * mix(0.95, 1, arrive) * mix(1, 0.06, Math.pow(g, 0.7)),
    r: c.r * (1 - g) * (1 - 0.5 * e) + g * (k % 2 ? 16 : -16),
    o: mix(0.5, 1, arrive) * (1 - Math.pow(g, 5)) * (1 - 0.72 * b),
    blur: (1 - arrive) * 8 + c.blur * (1 - g) * (1 - e) + g * 2 + 3 * b,
    grey: b,
    e,
    g,
  };
};

export const Hook: React.FC<{ f: number; out: number }> = ({ f, out }) => {
  if (f > HANDOFF.end) return null;

  // ── the point, the flash, the snap
  const dot = f < HITS.dotLands ? 0 : prog(f, HITS.dotLands, HITS.dotLands + 7, EASE_SPRING);
  const flash = f < HITS.dotLands ? Math.pow(prog(f, HITS.collapse, HITS.dotLands, (t) => t), 3) * 0.5 : Math.max(0, 1 - (f - HITS.dotLands) / 18);
  // brackets: in from wide, a spring overshoot inward, settle
  const close = prog(f, HITS.dotLands + 1, HITS.bracketsClose + 4, EASE_SPRING);

  // ── the mark settles a touch smaller as it holds
  const form = prog(f, HITS.markLocked - 6, HITS.markLocked + 12, EASE_MODAL);

  // ── the hand-off: brackets part and fade, the name leaves, the point
  // travels to where the app's + button will be
  const part = prog(f, HANDOFF.part, HANDOFF.part + 10, EASE_MODAL);
  const travel = prog(f, HANDOFF.travel, HANDOFF.iris, EASE_IN_OUT);
  // the name: the wordmark wipes in under the mark and the pair eases up into
  // one centred lockup; both part before the point drops
  const wm = prog(out, NAME_AT, NAME_AT + 16, EASE_MODAL);
  // (round 13: the pair glides up, eased in and out, instead of jumping off
  // the mark's rest at EASE_MODAL speed; and it stays up while the brackets
  // part, so the point leaves in ONE move instead of dropping 70px first)
  const lift = prog(out, NAME_AT - 8, NAME_AT + 22, EASE_IN_OUT);
  const markY = C.y - 70 * lift;
  // while the name and the shares hold, the lockup is never dead still: a
  // slow push around the point (the shares aim at the point, which stays put)
  const push = 1 + 0.04 * prog(out, NAME_AT + 22, real(HANDOFF.part), (t) => t);
  const markScale = mix(1, 0.86, form);
  const MARK_W = 300;
  const dotR = 52 * (MARK_W / 448) * markScale; // the point's radius, px
  const dotX = mix(C.x, HANDOFF.plus.x, travel);
  const dotY = mix(markY, HANDOFF.plus.y, travel);
  // the point grows with the push, and is exactly the + button's size on arrival
  const dotScale = mix(push, HANDOFF.plus.r / dotR, travel);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* the saves, with speed trails while they collapse */}
      {f < HITS.dotLands + 1 &&
        CHIPS.map((c, k) =>
          [3, 2, 1, 0].map((lag) => {
            const p = chipAt(k, f - lag * 1.2, out);
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
                  filter: [p.blur > 0.2 ? `blur(${p.blur}px)` : '', p.grey > 0.01 ? `grayscale(${p.grey}) brightness(${(1 - 0.5 * p.grey).toFixed(3)})` : ''].join(' ').trim() || undefined,
                }}
              >
                <SaveChip kind={c.kind} title={c.title} />
              </div>
            );
          }),
        )}

      {/* the landing: a burst of light where everything gathered */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(42% 24% at 50% ${(markY / 1920) * 100}%, rgba(225,232,255,${(0.85 * flash).toFixed(3)}) 0%, rgba(${NIGHT.glow},${(0.3 * flash).toFixed(3)}) 30%, rgba(${NIGHT.glow},0) 65%)`,
        }}
      />

      {/* the mark: brackets only (the point is drawn separately so it can travel) */}
      {f >= HITS.dotLands - 1 && (
        <div
          style={{
            position: 'absolute',
            left: C.x,
            top: markY,
            transform: `translate(-50%, -50%) scale(${markScale * push})`,
            opacity: 1 - part,
            filter: `drop-shadow(0 0 ${22 + flash * 34}px rgba(${NIGHT.glow},${(0.32 + flash * 0.4).toFixed(3)}))`,
          }}
        >
          <MarkAssembly close={Math.max(0, close * (1 - part * 0.35))} dot={0} width={MARK_W} />
        </div>
      )}

      {/* the name, under the mark */}
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
            color: NIGHT.ink,
            lineHeight: 0,
            filter: `${typeGlow(1.1)}${wm < 0.999 ? ` blur(${((1 - wm) * 4).toFixed(2)}px)` : ''}`,
          }}
        >
          <Wordmark style={{ width: '100%', height: 'auto' }} />
        </div>
      )}

      {/* the point: everything gathered, a dot of light, then the + button (white in the dark app) */}
      {dot > 0 && f < HANDOFF.end && (
        <div
          style={{
            position: 'absolute',
            left: dotX,
            top: dotY,
            width: dotR * 2,
            height: dotR * 2,
            borderRadius: '50%',
            background: NIGHT.ink,
            transform: `translate(-50%, -50%) scale(${dot * dotScale})`,
            boxShadow: `0 0 ${18 + flash * 30}px ${4 + flash * 6}px rgba(${NIGHT.glow},${(0.45 + flash * 0.35).toFixed(3)})`,
            opacity: 1 - prog(f, HANDOFF.iris + 2, HANDOFF.end, EASE_MODAL),
          }}
        />
      )}

    </AbsoluteFill>
  );
};
