import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { CAPTIONS, FPS, HITS } from '../../../../clips/save-timeline.mjs';
import VO from './vo.json';
import { EASE_GATHER, EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../../kit/curves';
import { MarkAssembly } from '../../kit/Brand';
import { Compass, Image as ImageIcon } from 'lucide-react';
import { PLATFORM_INK, PlatformMark } from '../../../ui/app';
import { sans } from '../../../fonts';
import { INK, INK_SOFT } from '../../kit/Type';
import { Wordmark } from '../../../ui/Brand';
import { HANDOFF } from '../../scenes/handoff';
import { NIGHT, typeGlow } from '../../../look';

/**
 * The hook and the name. The problem, shown: your saves live in every app's
 * own save list (YouTube's Watch later, Instagram's Saved, X's Bookmarks,
 * Facebook's Saved, Safari's Reading List, the screenshots in Photos), six
 * piles, each with its app's mark; frame 0, the poster, already shows them.
 * "Your saves are scattered across countless apps": a new save drops into
 * each pile, one after another. "…and impossible to find": the
 * piles blur and bleach into the paper. Then they collapse into one point of ink (EASE_GATHER), the brackets
 * snap shut around it (the app's spring), and the drawn wordmark wipes in as
 * "Machina" is said. The shares arrive into this mark (Shares.tsx); then its
 * point drops to become the app's + button (the reel's match cut, handoff.ts).
 *
 * The piles are the clip's own cards, not rebuilt app UI: an app's mark as
 * the Machina app draws it, the name of that app's save list, and titles of
 * real saves from the demo account (verify checks).
 */

const C = { x: 540, y: 1000 };
const HOOK = CAPTIONS[0];
const NAME = CAPTIONS[1];
const wordAt = (c: { at: number }, k: number) => {
  const t = VO.find((v) => v.frame === c.at);
  return c.at + Math.round((t?.words[k] ?? 0) * FPS);
};
// "Your saves are scattered across countless apps, and impossible to find."
const EVERY = wordAt(HOOK, 3); // "scattered"
const NEVER = wordAt(HOOK, 8); // "impossible"
const NAME_AT = wordAt(NAME, 0);

type Pile = { kind: 'youtube' | 'instagram' | 'x' | 'facebook' | 'safari' | 'photos'; app: string; list: string; titles: string[]; shots?: string[]; x: number; y: number; s: number; r: number };
/** where people keep what they save: each app's own save list */
// (titles[0] is the save that drops in on "scattered"; the rest are already there)
const PILES: Pile[] = [
  { kind: 'youtube', app: 'YouTube', list: 'Watch later', titles: ['The Ultimate V60 Technique', 'Inside the mind of a master procrastinator', 'Optimistic Nihilism', "Steve Jobs' 2005 Stanford Commencement Address"], x: 300, y: 820, s: 1.0, r: -3 },
  { kind: 'instagram', app: 'Instagram', list: 'Saved', titles: ['Fushimi Inari at dawn', 'Cala Goloritzé, Sardinia', 'Cosmic Cliffs in the Carina Nebula', 'Tour du Mont Blanc'], x: 790, y: 780, s: 0.96, r: 3 },
  { kind: 'x', app: 'X', list: 'Bookmarks', titles: ['You do not rise to the level of your goals', 'How to Get Rich (without getting lucky)', 'Four Thousand Weeks', 'Inventing on Principle'], x: 265, y: 1195, s: 0.98, r: 2 },
  { kind: 'safari', app: 'Safari', list: 'Reading List', titles: ["Marcella Hazan's tomato sauce", 'The Tail End', 'Laws of UX', 'Dieter Rams: ten principles for good design'], x: 805, y: 1160, s: 1.02, r: -2.5 },
  { kind: 'facebook', app: 'Facebook', list: 'Saved', titles: ['The Psychology of Money', 'Perfect Days', 'Anderson .Paak & The Free Nationals: Tiny Desk Concert', "Samin Nosrat's buttermilk-brined roast chicken"], x: 320, y: 1570, s: 0.96, r: -2 },
  // screenshots are pictures, not titles: the clip's own invented posts (the
  // recipe the clip saves later, the packing post), drawn by
  // capture/clip-save.mjs and copied small into public/clips/save/hook/
  { kind: 'photos', app: 'Photos', list: 'Screenshots', titles: [], shots: ['shot-1.jpg', 'post-1.jpg', 'shot-2.jpg', 'shot-3.jpg'], x: 790, y: 1540, s: 1.0, r: 3 },
];
const SAFARI_INK = 'rgb(0, 122, 255)';
const PHOTOS_INK = 'rgb(245, 158, 11)';
const inkOf = (k: Pile['kind']) => (k === 'safari' ? SAFARI_INK : k === 'photos' ? PHOTOS_INK : PLATFORM_INK[k]);
const tint = (rgb: string, a: number) => rgb.replace('rgb(', 'rgba(').replace(')', `, ${a})`);
const ROW = 64;
const SHOT_W = 120; // three fill the row; the fourth is pushed out as the new one slides in
const SHOT_GAP = 14;

const PileCard: React.FC<{ p: Pile; drop: number; grey: number }> = ({ p, drop, grey }) => {
  const ink = inkOf(p.kind);
  return (
    <div
      style={{
        width: 440,
        padding: '26px 26px 20px',
        borderRadius: 34,
        background: 'linear-gradient(180deg, #1D1D21 0%, #141417 100%)',
        border: `1px solid ${NIGHT.cardEdge}`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), 0 1px 2px rgba(0,0,0,0.5), 0 22px 52px -18px rgba(0,0,0,0.85), 0 44px 80px -40px rgba(0,0,0,0.7)',
        fontFamily: sans,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
        <span style={{ width: 66, height: 66, borderRadius: 19, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ink, background: tint(ink, 0.16) }}>
          {p.kind === 'safari' ? <Compass size={38} strokeWidth={1.9} /> : p.kind === 'photos' ? <ImageIcon size={36} strokeWidth={1.9} /> : <PlatformMark kind={p.kind} size={38} />}
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 31, fontWeight: 700, letterSpacing: '-0.02em', color: INK }}>{p.app}</span>
          <span style={{ display: 'block', marginTop: 2, fontSize: 23, fontWeight: 560, color: INK_SOFT }}>{p.list}</span>
        </span>
      </div>
      {/* the list: a new save drops in at the top, pushing the rest down
          (screenshots: a new one slides in at the left) */}
      <div style={{ marginTop: 16, height: ROW * 3, overflow: 'hidden', filter: grey > 0.01 ? `blur(${(grey * 5).toFixed(2)}px) grayscale(${grey.toFixed(3)}) brightness(${(1 - 0.45 * grey).toFixed(3)})` : undefined, opacity: 1 - 0.55 * grey }}>
        {p.shots ? (
          <div style={{ display: 'flex', gap: SHOT_GAP, paddingTop: 8, transform: `translateX(${Math.round(-(SHOT_W + SHOT_GAP) * (1 - drop))}px)` }}>
            {p.shots.map((f, k) => (
              <Img
                key={f}
                src={staticFile(`clips/save/hook/${f}`)}
                style={{ width: SHOT_W, height: ROW * 3 - 16, flexShrink: 0, objectFit: 'cover', objectPosition: 'left top', borderRadius: 10, border: '1px solid rgba(255,255,255,0.10)', opacity: k === 0 ? drop : 1 }}
              />
            ))}
          </div>
        ) : (
        <div style={{ transform: `translateY(${Math.round(-ROW * (1 - drop))}px)` }}>
          {p.titles.map((t, k) => (
            <div key={k} style={{ height: ROW, display: 'flex', alignItems: 'center', gap: 14, borderTop: '1px solid rgba(255,255,255,0.08)', opacity: k === 0 ? drop : 1 }}>
              <span style={{ width: 38, height: 38, borderRadius: 10, flexShrink: 0, background: tint(ink, 0.16) }} />
              <span style={{ fontSize: 23, fontWeight: 560, color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t}</span>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  );
};

const pileAt = (k: number, f: number) => {
  const c = PILES[k];
  // a gentle push in from frame 0 (the poster is already the six piles)
  const push = 1 + 0.04 * prog(f, 0, HITS.collapse, (t) => t);
  // "scattered": a new save drops into each pile in turn
  const d0 = EVERY - 6 + k * 5;
  const drop = prog(f, d0, d0 + 14, EASE_SPRING);
  // "impossible to find": the lists blur and bleach, the piles drift apart
  const lost = prog(f, NEVER, NEVER + 26, EASE_IN_OUT);
  const g = prog(f, HITS.collapse, HITS.dotLands, EASE_GATHER);
  const ox = (c.x - C.x) * push * (1 + 0.06 * lost);
  const oy = (c.y - C.y) * push * (1 + 0.04 * lost);
  return {
    x: C.x + ox * (1 - g),
    y: C.y + oy * (1 - g),
    s: c.s * push * mix(1, 0.05, Math.pow(g, 0.7)),
    r: c.r * (1 - g) + g * (k % 2 ? 16 : -16),
    o: (1 - Math.pow(g, 5)) * (1 - 0.35 * lost * (1 - g)),
    blur: g * 2 + 1.2 * lost * (1 - g),
    drop,
    grey: lost,
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
        PILES.map((c, k) =>
          [3, 2, 1, 0].map((lag) => {
            const p = pileAt(k, f - lag * 1.2);
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
                  filter: p.blur > 0.2 ? `blur(${p.blur.toFixed(2)}px)` : undefined,
                }}
              >
                <PileCard p={c} drop={p.drop} grey={p.grey} />
              </div>
            );
          }),
        )}

      <AbsoluteFill
        style={{
          background: `radial-gradient(38% 22% at 50% ${(markY / 1920) * 100}%, rgba(225,232,255,${(0.85 * flash).toFixed(3)}) 0%, rgba(${NIGHT.glow},${(0.3 * flash).toFixed(3)}) 30%, rgba(${NIGHT.glow},0) 65%)`,
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
            filter: `drop-shadow(0 0 ${22 + flash * 34}px rgba(${NIGHT.glow},${(0.32 + flash * 0.4).toFixed(3)}))`,
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
            color: NIGHT.ink,
            lineHeight: 0,
            filter: `${typeGlow(1.1)}${wm < 0.999 ? ` blur(${((1 - wm) * 4).toFixed(2)}px)` : ''}`,
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
            background: NIGHT.ink,
            transform: `translate(-50%, -50%) scale(${dot * dotScale})`,
            boxShadow: `0 0 ${18 + flash * 30}px ${4 + flash * 6}px rgba(${NIGHT.glow},${(0.45 + flash * 0.35).toFixed(3)})`,
            opacity: 1 - prog(f, HITS.toApp + 2, HITS.toApp + 16, EASE_MODAL),
          }}
        />
      )}
    </AbsoluteFill>
  );
};
