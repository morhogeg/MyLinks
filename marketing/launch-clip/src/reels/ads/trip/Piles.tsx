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
type Pile = { kind: Kind; app: string; list: string; titles: string[]; r: number };
/** each pile's titles, real demo saves, in the app they were saved from where
 *  the demo account says so */
export const PILES: Pile[] = [
  { kind: 'instagram', app: 'Instagram', list: 'Saved', titles: ['Cosmic Cliffs in the Carina Nebula', 'Cala Goloritzé, Sardinia'], r: -2.5 },
  { kind: 'youtube', app: 'YouTube', list: 'Watch later', titles: ['Inside the mind of a master procrastinator', 'Optimistic Nihilism'], r: 2.5 },
  { kind: 'safari', app: 'Safari', list: 'Reading List', titles: ['The Tail End', 'Laws of UX'], r: 2 },
  { kind: 'facebook', app: 'Facebook', list: 'Saved', titles: ['The Psychology of Money', 'Perfect Days'], r: -2 },
  { kind: 'photos', app: 'Photos', list: 'Screenshots', titles: ['Read Piranesi, and go in blind', "Dana's Sardinia tips"], r: -1.5 },
];

const SAFARI_INK = 'rgb(0, 122, 255)';
const PHOTOS_INK = 'rgb(245, 158, 11)';
const inkOf = (k: Kind) => (k === 'safari' ? SAFARI_INK : k === 'photos' ? PHOTOS_INK : PLATFORM_INK[k]);
const tint = (rgb: string, a: number) => rgb.replace('rgb(', 'rgba(').replace(')', `, ${a})`);
const PILE_W = 450;
const ROW = 54;

const PileCard: React.FC<{ p: Pile; soft: number }> = ({ p, soft }) => {
  const ink = inkOf(p.kind);
  return (
    <div
      style={{
        width: PILE_W,
        padding: '22px 24px 14px',
        borderRadius: 32,
        background: '#FFFFFF',
        border: '1px solid rgba(16,24,40,0.07)',
        boxShadow: '0 1px 2px rgba(16,24,40,0.06), 0 22px 52px -18px rgba(24,32,48,0.3), 0 44px 80px -40px rgba(24,32,48,0.2)',
        fontFamily: sans,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <span style={{ width: 58, height: 58, borderRadius: 17, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ink, background: tint(ink, 0.12) }}>
          {p.kind === 'safari' ? <Compass size={34} strokeWidth={1.9} /> : p.kind === 'photos' ? <ImageIcon size={32} strokeWidth={1.9} /> : <PlatformMark kind={p.kind} size={34} />}
        </span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 29, fontWeight: 700, letterSpacing: '-0.02em', color: INK }}>{p.app}</span>
          <span style={{ display: 'block', marginTop: 1, fontSize: 22, fontWeight: 560, color: INK_SOFT }}>{p.list}</span>
        </span>
      </div>
      <div
        style={{
          marginTop: 12,
          filter: soft > 0.01 ? `blur(${(soft * 4).toFixed(2)}px) grayscale(${soft.toFixed(3)})` : undefined,
          opacity: 1 - 0.5 * soft,
        }}
      >
        {p.titles.map((t, k) => (
          <div key={k} style={{ height: ROW, display: 'flex', alignItems: 'center', borderTop: '1px solid rgba(16,24,40,0.07)' }}>
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
                <PileCard p={p} soft={q.soft} />
              </div>
            );
          }),
        )}

      <AbsoluteFill
        style={{
          background: `radial-gradient(38% 22% at 50% ${((C.y / L.height) * 100).toFixed(2)}%, rgba(255,255,255,${0.9 * flash}) 0%, rgba(255,255,255,0) 70%)`,
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
            filter: `drop-shadow(0 ${10 + flash * 10}px ${30 + flash * 40}px rgba(24,32,48,${0.22 + flash * 0.2}))${exit > 0.001 ? ` blur(${(exit * 6).toFixed(2)}px)` : ''}`,
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
                background: '#14141B',
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
            color: '#14141B',
            lineHeight: 0,
            filter: `drop-shadow(0 4px 24px rgba(24,32,48,0.14))${wm < 0.999 || wmOut > 0.001 ? ` blur(${((1 - wm) * 4 + wmOut * 6).toFixed(2)}px)` : ''}`,
          }}
        >
          <Wordmark style={{ width: '100%', height: 'auto' }} />
        </div>
      )}
    </AbsoluteFill>
  );
};
