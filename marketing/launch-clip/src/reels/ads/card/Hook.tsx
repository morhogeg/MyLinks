import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { CAPTIONS, FPS, HITS } from '../../../../ads/card-timeline.mjs';
import VO from './vo.json';
import { EASE_GATHER, EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../../kit/curves';
import { MarkAssembly } from '../../kit/Brand';
import { Compass, Image as ImageIcon } from 'lucide-react';
import { PLATFORM_INK, PlatformMark } from '../../../ui/app';
import { sans } from '../../../fonts';
import { INK, INK_SOFT } from '../../kit/Type';
import { Wordmark } from '../../../ui/Brand';
import { useAdFrame } from './format';
import { AD_PLUS } from './handoff';
import { NIGHT, typeGlow } from '../../../look';

/**
 * The hook and the name (round 5: saves, not videos). Frame 0, the poster:
 * four apps' own save lists (Safari's Reading List, X's Bookmarks,
 * Instagram's Saved, the screenshots in Photos), each with its mark, and the
 * question already set over them. "How many things did you save this
 * month…": a new save drops into each list. "…and never open again?": they
 * grey out. Then the camera visits the pain, one list per line: the article
 * you promised yourself you'd read (Reading List), the thread you bookmarked
 * at 1 a.m. (Bookmarks), the screenshot you swore you'd remember (Photos, a
 * friend's message sliding in). "That's exactly why we made Machina.": the
 * lists gather into one point, the brackets snap, the drawn wordmark wipes in
 * on the name. The shares fly into this mark (Share.tsx); then its point drops
 * to become the app's + button (handoff.ts).
 *
 * The lists are the SAVE clip's pile cards (an app's mark as the Machina app
 * draws it, the name of that app's save list, titles of real demo saves; the
 * screenshots drawn for the ad, scripts/ad-card-shots.mjs). No app UI is drawn.
 */

export const MARK = { x: 540, y: 930 };
export const MARK_W = 300;

type Kind = 'safari' | 'x' | 'instagram' | 'photos';
type Pile = { kind: Kind; app: string; list: string; titles: string[]; shots: string[]; hero: boolean; x: number; y: number; r: number };
// Round 6 (owner: make every list dynamic, like the screenshots): every list
// is a strip of tiles drawn for the ad (scripts/ad-card-shots.mjs). A new save
// slides in on "this month"; a list the camera visits (`hero`) slides in one
// more as its line names it: the article, the thread, the screenshot. shots[0]
// is that hero. `titles` are what the tiles show, in order (verify checks
// them against the demo account).
const PILES: Pile[] = [
  { kind: 'safari', app: 'Safari', list: 'Reading List', titles: ['The Most Important Question of Your Life', 'The Tail End', 'Laws of UX', 'Dieter Rams: ten principles for good design'], shots: ['article-1.jpg', 'article-2.jpg', 'article-3.jpg', 'article-4.jpg'], hero: true, x: 295, y: 765, r: -2.5 },
  { kind: 'x', app: 'X', list: 'Bookmarks', titles: ['How to Get Rich (without getting lucky)', 'You do not rise to the level of your goals', 'How I read 40 books a year without speed reading'], shots: ['post-x-1.jpg', 'post-x-2.jpg', 'post-x-3.jpg'], hero: true, x: 785, y: 758, r: 2.5 },
  { kind: 'instagram', app: 'Instagram', list: 'Saved', titles: ['Fushimi Inari at dawn', 'Cala Goloritzé, Sardinia', 'Cosmic Cliffs in the Carina Nebula'], shots: ['ig-1.jpg', 'ig-2.jpg', 'ig-3.jpg'], hero: false, x: 290, y: 1098, r: 2 },
  { kind: 'photos', app: 'Photos', list: 'Screenshots', titles: [], shots: ['shot-1.jpg', 'shot-2.jpg', 'shot-3.jpg', 'post-1.jpg'], hero: true, x: 790, y: 1090, r: -2 },
];
/** which list each pain line visits */
const VISITS: [number, number][] = [
  [HITS.article, 0],
  [HITS.thread, 1],
  [HITS.screenshot, 3],
];
const SCALE = 0.96;
const ZOOM = 1.75;
const C = { x: 540, y: 930 };

const SAFARI_INK = 'rgb(0, 122, 255)';
const PHOTOS_INK = 'rgb(245, 158, 11)';
const inkOf = (k: Kind) => (k === 'safari' ? SAFARI_INK : k === 'photos' ? PHOTOS_INK : PLATFORM_INK[k]);
const tint = (rgb: string, a: number) => rgb.replace('rgb(', 'rgba(').replace(')', `, ${a})`);
const ROW = 64;
const SHOT_W = 120;
const SHOT_GAP = 14;

const wordAt = (at: number, k: number) => {
  const t = VO.find((v) => v.frame === at);
  return at + Math.round((t?.words[k] ?? 0) * FPS);
};
const HOOK = CAPTIONS[0];
const NAME = CAPTIONS.find((c) => /exactly why we made Machina/.test(c.say))!;
/** "save" in "How many things did you save this month…": a new save drops into each list */
const SAVED = wordAt(HOOK.at, 5);
/** "Machina" in "That's exactly why we made Machina.": the wordmark wipes in as it is said */
export const NAME_AT = wordAt(NAME.at, 5);

const PileCard: React.FC<{ p: Pile; pending: number; grey: number }> = ({ p, pending, grey }) => {
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
      <div style={{ marginTop: 16, height: ROW * 3, overflow: 'hidden', filter: grey > 0.01 ? `blur(${(grey * 4).toFixed(2)}px) grayscale(${grey.toFixed(3)}) brightness(${(1 - 0.45 * grey).toFixed(3)})` : undefined, opacity: 1 - 0.5 * grey }}>
        {/* the strip: `pending` tiles are still off to the left; each arrival slides it right */}
        <div style={{ display: 'flex', gap: SHOT_GAP, paddingTop: 8, transform: `translateX(${Math.round(-(SHOT_W + SHOT_GAP) * pending)}px)` }}>
          {p.shots.map((f, k) => (
            <Img
              key={f}
              src={staticFile(`ads/card/hook/${f}`)}
              style={{ width: SHOT_W, height: ROW * 3 - 16, flexShrink: 0, objectFit: 'cover', objectPosition: 'left top', borderRadius: 10, border: '1px solid rgba(255,255,255,0.10)', opacity: Math.min(1, Math.max(0, 1 + k - pending)) }}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

/** the camera over the lists: the overview, or one list (k) brought forward */
const camAt = (f: number) => {
  let x = C.x;
  let y = C.y;
  let s = 1 + 0.03 * prog(f, 0, HITS.article, (t) => t);
  let focus = -1;
  let w = 0;
  for (const [at, k] of VISITS) {
    const p = prog(f, at - 4, at + 14, EASE_IN_OUT);
    if (p <= 0) continue;
    const tx = PILES[k].x;
    const ty = PILES[k].y;
    x = mix(x, tx, p);
    y = mix(y, ty, p);
    s = mix(s, ZOOM, p);
    focus = k;
    w = p;
  }
  // back to the overview as the lists gather
  const back = prog(f, HITS.collapse - 6, HITS.collapse + 8, EASE_IN_OUT);
  return { x: mix(x, C.x, back), y: mix(y, C.y, back), s: mix(s, 1, back), focus, w: w * (1 - back) };
};

export const Hook: React.FC<{ f: number }> = ({ f }) => {
  const { dy } = useAdFrame();
  if (f > HITS.toApp + 16) return null;
  const cam = camAt(f);
  const lost = prog(f, HITS.lost, HITS.lost + 20, EASE_IN_OUT);
  const g = prog(f, HITS.collapse, HITS.dotLands, EASE_GATHER);

  // the mark: the point strikes, the brackets snap, the name wipes in
  const dot = f < HITS.dotLands ? 0 : prog(f, HITS.dotLands, HITS.dotLands + 7, EASE_SPRING);
  const flash = f < HITS.dotLands ? Math.pow(prog(f, HITS.collapse, HITS.dotLands, (t) => t), 3) * 0.5 : Math.max(0, 1 - (f - HITS.dotLands) / 18);
  const close = prog(f, HITS.dotLands + 1, HITS.bracketsClose + 4, EASE_SPRING);
  const form = prog(f, HITS.bracketsClose - 6, HITS.bracketsClose + 12, EASE_MODAL);
  const part = prog(f, HITS.part, HITS.part + 16, EASE_IN_OUT);
  const travel = prog(f, HITS.part + 2, HITS.toApp, EASE_IN_OUT);
  const wm = prog(f, NAME_AT, NAME_AT + 16, EASE_MODAL);
  const drift = 1 + 0.03 * prog(f, HITS.bracketsClose, HITS.part, (t) => t);
  const markScale = mix(1, 0.86, form);
  const markY = MARK.y + dy;
  const dotR = 52 * (MARK_W / 448) * markScale;
  const plus = { x: AD_PLUS.x, y: AD_PLUS.y + dy };
  const dotX = mix(MARK.x, plus.x, travel);
  const dotY = mix(markY, plus.y, travel);
  const dotScale = mix(drift, AD_PLUS.r / dotR, travel);

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {f < HITS.dotLands + 1 &&
        PILES.map((p, k) => {
          // where the list sits under the camera, then gathered into the point
          const px = C.x + (p.x - cam.x) * cam.s;
          const py = C.y + dy + (p.y - cam.y) * cam.s;
          const x = mix(px, MARK.x, g);
          const y = mix(py, markY, g);
          const s = SCALE * cam.s * mix(1, 0.05, Math.pow(g, 0.7));
          const focused = cam.focus === k ? cam.w : 0;
          const others = cam.focus >= 0 && cam.focus !== k ? cam.w : 0;
          // a new save on "this month"; the hero as its line names it
          const first = prog(f, SAVED - 6 + k * 5, SAVED + 8 + k * 5, EASE_SPRING);
          const visit = VISITS.find(([, v]) => v === k);
          const second = p.hero && visit ? prog(f, visit[0] + 12, visit[0] + 26, EASE_SPRING) : 0;
          const pending = (p.hero ? 2 : 1) - first - second;
          // grey once lost; the list the camera visits comes back into focus
          const grey = lost * (1 - focused);
          return (
            <div
              key={p.kind}
              style={{
                position: 'absolute',
                left: x,
                top: y,
                transform: `translate(-50%, -50%) rotate(${p.r * (1 - focused) * (1 - g) + g * (k % 2 ? 16 : -16)}deg) scale(${s})`,
                opacity: (1 - Math.pow(g, 5)) * (1 - 0.75 * others),
                filter: g * 2 + others * 6 > 0.2 ? `blur(${(g * 2 + others * 6).toFixed(2)}px)` : undefined,
                zIndex: focused > 0.5 ? 2 : 1,
              }}
            >
              <PileCard p={p} pending={pending} grey={grey} />
            </div>
          );
        })}

      <AbsoluteFill
        style={{
          background: `radial-gradient(38% 22% at 50% ${(markY / 1920) * 100}%, rgba(225,232,255,${(0.85 * flash).toFixed(3)}) 0%, rgba(${NIGHT.glow},${(0.3 * flash).toFixed(3)}) 30%, rgba(${NIGHT.glow},0) 65%)`,
        }}
      />

      {f >= HITS.dotLands - 1 && part < 1 && (
        <div
          style={{
            position: 'absolute',
            left: MARK.x,
            top: markY,
            transform: `translate(-50%, -50%) scale(${markScale * drift})`,
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
            left: MARK.x,
            top: markY + 168 * drift,
            width: 460 * drift,
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
            opacity: 1 - prog(f, HITS.toApp + 2, HITS.toApp + 16, EASE_IN_OUT),
          }}
        />
      )}
    </AbsoluteFill>
  );
};
