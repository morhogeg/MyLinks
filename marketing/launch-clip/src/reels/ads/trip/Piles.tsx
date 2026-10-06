import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Compass, Image as ImageIcon } from 'lucide-react';
import { HITS } from '../../../../ads/trip-timeline.mjs';
import { EASE_GATHER, EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../../kit/curves';
import { MarkAssembly } from '../../kit/Brand';
import { PLATFORM_INK, PlatformMark } from '../../../ui/app';
import { sans } from '../../../fonts';
import { INK, INK_SOFT } from '../../kit/Type';
import { Wordmark } from '../../../ui/Brand';
import { useAdFrame } from './format';
import { NIGHT, typeGlow } from '../../../look';

/**
 * The hook and the name (the SAVE and REVISIT clips' hook-pile pattern).
 *
 * Frame 0 is the poster: saves of every kind where they were kept, five
 * piles, each an app's own save list with its mark (Instagram · Saved,
 * YouTube · Watch later, Safari · Reading List, Facebook · Saved, Photos ·
 * Screenshots), under the hook "What if your saves could talk back?". As
 * the line ends the piles drift apart
 * and go soft; they gather into one point of ink (EASE_GATHER), the brackets
 * snap shut around it (the app's spring) and the drawn wordmark wipes in as
 * "Machina" is said ("With Machina, they can."). Then the mark and the
 * wordmark leave together, pushing in as they soften, and the cut to the
 * chat lands on the beat (AskChat.tsx).
 *
 * Owner, round 2: not a trip (round 1's piles were all one trip and read as
 * a travel app); round 3: an Ask ad from start to finish. The piles are mixed on
 * purpose: a space photo, a TED talk, an essay, a money essay, a novel tip;
 * the TED talk and the essay are two of the saves the chat answers from.
 *
 * The piles are the ad's own cards, not rebuilt app UI: a mark as the Machina
 * app draws it (a compass for Safari, a picture for Photos), the name of that
 * app's save list, and titles of real saves of the demo account (verify
 * checks).
 */

type Kind = 'youtube' | 'instagram' | 'facebook' | 'safari' | 'photos';
type Pile = { kind: Kind; app: string; list: string; titles: string[]; drop?: string; r: number };
/** each pile's titles, real demo saves, in the app they were saved from where
 *  the demo account says so. `drop` is a newer save that slides in at the top
 *  during the hook, pushing the list down (round 6, owner: make the piles
 *  move); the demo account holds only two screenshots, so Photos has none and
 *  only floats */
export const PILES: Pile[] = [
  { kind: 'instagram', app: 'Instagram', list: 'Saved', titles: ['Cosmic Cliffs in the Carina Nebula', 'Cala Goloritzé, Sardinia'], drop: 'Fushimi Inari at dawn', r: -2.5 },
  { kind: 'youtube', app: 'YouTube', list: 'Watch later', titles: ['Inside the mind of a master procrastinator', 'Optimistic Nihilism'], drop: "Steve Jobs' 2005 Stanford Commencement Address", r: 2.5 },
  { kind: 'safari', app: 'Safari', list: 'Reading List', titles: ['The Tail End', 'Laws of UX'], drop: 'Dieter Rams: ten principles for good design', r: 2 },
  { kind: 'facebook', app: 'Facebook', list: 'Saved', titles: ['The Psychology of Money', 'Perfect Days'], drop: 'Four Thousand Weeks', r: -2 },
  { kind: 'photos', app: 'Photos', list: 'Screenshots', titles: ['Read Piranesi, and go in blind', "Dana's Sardinia tips"], r: -1.5 },
];
/** when each pile's new save slides in: staggered so no two lists move
 *  together, all landed before the piles drift apart */
const DROP_AT = [12, 26, 19, 33];

const SAFARI_INK = 'rgb(0, 122, 255)';
const PHOTOS_INK = 'rgb(245, 158, 11)';
const inkOf = (k: Kind) => (k === 'safari' ? SAFARI_INK : k === 'photos' ? PHOTOS_INK : PLATFORM_INK[k]);
const tint = (rgb: string, a: number) => rgb.replace('rgb(', 'rgba(').replace(')', `, ${a})`);
const PILE_W = 450;
const ROW = 54;

const PileCard: React.FC<{ p: Pile; soft: number; drop: number }> = ({ p, soft, drop }) => {
  const ink = inkOf(p.kind);
  return (
    <div
      style={{
        width: PILE_W,
        padding: '22px 24px 14px',
        borderRadius: 32,
        background: 'linear-gradient(180deg, #1D1D21 0%, #141417 100%)',
        border: `1px solid ${NIGHT.cardEdge}`,
        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.07), 0 1px 2px rgba(0,0,0,0.5), 0 22px 52px -18px rgba(0,0,0,0.85), 0 44px 80px -40px rgba(0,0,0,0.7)',
        fontFamily: sans,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ width: 58, height: 58, borderRadius: 17, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ink, background: tint(ink, 0.16) }}>
          {p.kind === 'safari' ? <Compass size={34} strokeWidth={1.9} /> : p.kind === 'photos' ? <ImageIcon size={32} strokeWidth={1.9} /> : <PlatformMark kind={p.kind} size={34} />}
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 29, fontWeight: 700, letterSpacing: '-0.02em', color: INK }}>{p.app}</span>
          <span style={{ display: 'block', marginTop: 1, fontSize: 22, fontWeight: 560, color: INK_SOFT }}>{p.list}</span>
        </span>
      </div>
      {/* the list window: two rows; a newer save slides in at the top and
          pushes the last row out of the window */}
      <div style={{ marginTop: 12, height: ROW * 2, overflow: 'hidden' }}>
      <div
        style={{
          transform: `translateY(${Math.round(-ROW * (p.drop ? 1 - drop : 0))}px)`,
          filter: soft > 0.01 ? `blur(${(soft * 4).toFixed(2)}px) grayscale(${soft.toFixed(3)}) brightness(${(1 - 0.45 * soft).toFixed(3)})` : undefined,
          opacity: 1 - 0.5 * soft,
        }}
      >
        {(p.drop ? [p.drop, ...p.titles] : p.titles).map((t, k) => (
          <div key={k} style={{ height: ROW, display: 'flex', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.09)', opacity: p.drop && k === 0 ? Math.min(1, drop * 1.4) : 1 }}>
            <span
              style={{
                fontSize: 25,
                fontWeight: 600,
                letterSpacing: '-0.012em',
                color: INK,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {t}
            </span>
          </div>
        ))}
      </div>
      </div>
    </div>
  );
};

/** the mark's width, and its scale once formed */
const MARK_W = 300;
const FORMED = 0.86;

export const Piles: React.FC<{ f: number }> = ({ f }) => {
  const L = useAdFrame();
  if (f >= HITS.open) return null;
  const C = { x: 540, y: L.markY };
  const NAME_AT = HITS.wordmark;

  const pileAt = (k: number, fr: number) => {
    const c = L.piles[k];
    // a slow push from frame 0 (the poster is already the five piles)
    const push = 1 + 0.035 * prog(fr, 0, HITS.collapse, (t) => t);
    // "scattered": the piles drift apart and go soft
    const lost = prog(fr, HITS.lost, HITS.lost + 28, EASE_IN_OUT);
    const g = prog(fr, HITS.collapse, HITS.dotLands, EASE_GATHER);
    const ox = (c.x - C.x) * push * (1 + 0.07 * lost);
    const oy = (c.y - C.y) * push * (1 + 0.05 * lost);
    return {
      x: C.x + ox * (1 - g),
      y: C.y + oy * (1 - g),
      s: push * mix(1, 0.05, Math.pow(g, 0.7)),
      r: PILES[k].r * (1 + lost * 0.8) * (1 - g) + g * (k % 2 ? 16 : -16),
      o: (1 - Math.pow(g, 5)) * (1 - 0.3 * lost * (1 - g)),
      blur: g * 2 + 0.8 * lost * (1 - g),
      soft: lost,
      // the pile's newer save slides in (the app's spring)
      drop: k < DROP_AT.length ? prog(fr, DROP_AT[k], DROP_AT[k] + 14, EASE_SPRING) : 0,
      g,
    };
  };

  const dot = f < HITS.dotLands ? 0 : prog(f, HITS.dotLands, HITS.dotLands + 7, EASE_SPRING);
  const flash = f < HITS.dotLands ? Math.pow(prog(f, HITS.collapse, HITS.dotLands, (t) => t), 3) * 0.5 : Math.max(0, 1 - (f - HITS.dotLands) / 18);
  const close = prog(f, HITS.dotLands + 1, HITS.bracketsClose + 4, EASE_SPRING);
  const form = prog(f, HITS.bracketsClose - 6, HITS.bracketsClose + 12, EASE_MODAL);
  const wm = prog(f, NAME_AT, NAME_AT + 16, EASE_MODAL);
  // the wordmark leaves (eased in and out: a fast-start fade reads as a blink)
  // the mark and the wordmark leave together, pushing in as they soften,
  // gone by the cut
  const exit = prog(f, HITS.part, HITS.open - 2, EASE_IN_OUT);
  const wmOut = exit;
  // a slow push on the paths while the name holds (text never pushed)
  const push = 1 + 0.035 * prog(f, NAME_AT + 16, HITS.part, (t) => t);
  const markScale = mix(1, FORMED, form) * push * (1 + 0.08 * exit);
  const dotR = 52 * (MARK_W / 448);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {f < HITS.dotLands + 1 &&
        PILES.map((p, k) =>
          [3, 2, 1, 0].map((lag) => {
            const q = pileAt(k, f - lag * 1.2);
            if (lag > 0 && q.g < 0.08) return null;
            const alpha = lag === 0 ? 1 : [0, 0.28, 0.16, 0.08][lag];
            return (
              <div
                key={`${k}-${lag}`}
                style={{
                  position: 'absolute',
                  left: q.x,
                  top: q.y,
                  transform: `translate(-50%, -50%) rotate(${q.r}deg) scale(${q.s})`,
                  opacity: q.o * alpha,
                  filter: q.blur > 0.2 ? `blur(${q.blur.toFixed(2)}px)` : undefined,
                }}
              >
                <PileCard p={p} soft={q.soft} drop={q.drop} />
              </div>
            );
          }),
        )}

      <AbsoluteFill
        style={{
          background: `radial-gradient(38% 22% at 50% ${((C.y / L.height) * 100).toFixed(2)}%, rgba(225,232,255,${(0.85 * flash).toFixed(3)}) 0%, rgba(${NIGHT.glow},${(0.3 * flash).toFixed(3)}) 30%, rgba(${NIGHT.glow},0) 65%)`,
        }}
      />

      {f >= HITS.dotLands - 1 && (
        <div
          style={{
            position: 'absolute',
            left: C.x,
            top: C.y,
            width: MARK_W,
            transform: `translate(-50%, -50%) scale(${markScale})`,
            opacity: 1 - exit,
            filter: `drop-shadow(0 0 ${22 + flash * 34}px rgba(${NIGHT.glow},${(0.32 + flash * 0.4).toFixed(3)}))${exit > 0.001 ? ` blur(${(exit * 6).toFixed(2)}px)` : ''}`,
          }}
        >
          <MarkAssembly close={close} dot={0} width={MARK_W} />
          {dot > 0 && (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: '50%',
                width: dotR * 2,
                height: dotR * 2,
                borderRadius: '50%',
                background: NIGHT.ink,
                boxShadow: `0 0 26px 6px rgba(${NIGHT.glow},0.6)`,
                transform: `translate(-50%, -50%) scale(${dot})`,
              }}
            />
          )}
        </div>
      )}

      {wm > 0 && wmOut < 1 && (
        <div
          style={{
            position: 'absolute',
            left: C.x,
            top: C.y + 170,
            width: 460 * push * (1 + 0.08 * exit),
            transform: `translate(-50%, 0) translateY(${Math.round((1 - wm) * 10 + wmOut * 8)}px)`,
            clipPath: `inset(-20% ${((1 - wm) * 100).toFixed(2)}% -20% 0)`,
            opacity: 1 - wmOut,
            color: NIGHT.ink,
            lineHeight: 0,
            filter: `${typeGlow(1.1)}${wm < 0.999 || wmOut > 0.001 ? ` blur(${((1 - wm) * 4 + wmOut * 6).toFixed(2)}px)` : ''}`,
          }}
        >
          <Wordmark style={{ width: '100%', height: 'auto' }} />
        </div>
      )}
    </AbsoluteFill>
  );
};
