import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CAPTIONS, FPS, HITS } from '../../../../ads/card-timeline.mjs';
import VO from './vo.json';
import { EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../../kit/curves';
import { MarkAssembly } from '../../kit/Brand';
import { PLATFORM_INK, PlatformMark } from '../../../ui/app';
import { sans } from '../../../fonts';
import { INK, INK_SOFT } from '../../kit/Type';
import { Wordmark } from '../../../ui/Brand';
import { useAdFrame } from './format';
import { AD_PLUS } from './handoff';

/**
 * The hook and the name. Frame 0 is the poster: YouTube's Watch later, the
 * one save list everyone has, with the talk on top and the hook line already
 * set over it ("That talk you saved for later?"). "You'll never get to it.":
 * the list bleaches into the paper, and the talk lifts out of it (Share.tsx
 * carries it from there). The Machina mark assembles where the share will
 * land (the point strikes, the brackets snap shut: the app's spring), the
 * drawn wordmark wipes in as "Machina" is said, then the point drops to
 * become the app's + button (the reel's match cut; handoff.ts).
 *
 * The pile is the SAVE clip's pile card (an app's mark as the Machina app
 * draws it, the name of that app's save list, titles of real saves),
 * set big for one list. No YouTube UI is drawn: no thumbnails, no chrome.
 */

/** the pile's centre and the mark's, in 9:16 frame pixels */
export const PILE = { x: 540, y: 960 };
export const MARK = { x: 540, y: 900 };
export const MARK_W = 300;

/** the talk first (copied from the owner's phone), then real demo saves */
export const TALK = { title: 'How to overcome your addiction to technology', by: 'Big Think Clips' };
const TITLES = [TALK.title, 'Inside the mind of a master procrastinator', 'Optimistic Nihilism', "Steve Jobs' 2005 Stanford Commencement Address"];

const W = 900;
const HEAD = 96;
const ROW = 92;
const PAD = 34;
/** the talk's row centre, relative to the pile's centre (Share.tsx starts there) */
const PILE_H = PAD + HEAD + 18 + ROW * TITLES.length + PAD - 12;
export const TALK_ROW = { dy: -PILE_H / 2 + PAD + HEAD + 18 + ROW / 2, w: W - 2 * PAD };

const INK_YT = PLATFORM_INK.youtube;
const tint = (rgb: string, a: number) => rgb.replace('rgb(', 'rgba(').replace(')', `, ${a})`);

const wordAt = (at: number, k: number) => {
  const t = VO.find((v) => v.frame === at);
  return at + Math.round((t?.words[k] ?? 0) * FPS);
};
const SHARE_LINE = CAPTIONS[2];
/** "Machina" in "Share it to Machina.": the wordmark wipes in as it is said */
export const NAME_AT = wordAt(SHARE_LINE.at, 3);

const Pile: React.FC<{ lost: number; talkGone: number }> = ({ lost, talkGone }) => (
  <div
    style={{
      width: W,
      padding: `${PAD}px ${PAD}px ${PAD - 12}px`,
      borderRadius: 44,
      background: '#FFFFFF',
      border: '1px solid rgba(16,24,40,0.07)',
      boxShadow: '0 1px 2px rgba(16,24,40,0.06), 0 28px 64px -20px rgba(24,32,48,0.3), 0 54px 96px -44px rgba(24,32,48,0.2)',
      fontFamily: sans,
    }}
  >
    <div style={{ height: HEAD, display: 'flex', alignItems: 'center', gap: 24 }}>
      <span style={{ width: 92, height: 92, borderRadius: 26, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: INK_YT, background: tint(INK_YT, 0.12) }}>
        <PlatformMark kind="youtube" size={52} />
      </span>
      <span>
        <span style={{ display: 'block', fontSize: 42, fontWeight: 700, letterSpacing: '-0.02em', color: INK }}>YouTube</span>
        <span style={{ display: 'block', marginTop: 2, fontSize: 31, fontWeight: 560, color: INK_SOFT }}>Watch later</span>
      </span>
    </div>
    <div style={{ marginTop: 18 }}>
      {TITLES.map((t, k) => {
        const g = k === 0 ? 0 : lost;
        return (
          <div
            key={t}
            style={{
              height: ROW,
              display: 'flex',
              alignItems: 'center',
              gap: 20,
              borderTop: '1px solid rgba(16,24,40,0.06)',
              opacity: k === 0 ? 1 - talkGone : 1 - 0.6 * g,
              filter: g > 0.01 ? `blur(${(g * 6).toFixed(2)}px) grayscale(${g.toFixed(3)})` : undefined,
            }}
          >
            <span style={{ width: 54, height: 54, borderRadius: 14, flexShrink: 0, background: tint(INK_YT, 0.1) }} />
            <span style={{ fontSize: 33, fontWeight: k === 0 ? 640 : 560, letterSpacing: '-0.012em', color: INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t}</span>
          </div>
        );
      })}
    </div>
  </div>
);

export const Hook: React.FC<{ f: number }> = ({ f }) => {
  const { dy } = useAdFrame();
  if (f > HITS.toApp + 16) return null;
  // the pile: a gentle push in from frame 0 (the poster is already the pile);
  // "never": the list bleaches, then the pile leaves into the paper
  const push = 1 + 0.035 * prog(f, 0, HITS.dotLands, (t) => t);
  const lost = prog(f, HITS.lost, HITS.lost + 20, EASE_IN_OUT);
  const leave = prog(f, HITS.talkLifts + 4, HITS.dotLands + 16, EASE_IN_OUT);
  const talkGone = prog(f, HITS.talkLifts, HITS.talkLifts + 6, EASE_IN_OUT);

  // the mark: the point strikes, the brackets snap, the name wipes in
  const dot = f < HITS.dotLands ? 0 : prog(f, HITS.dotLands, HITS.dotLands + 7, EASE_SPRING);
  const flash = f < HITS.dotLands ? 0 : Math.max(0, 1 - (f - HITS.dotLands) / 18);
  const close = prog(f, HITS.dotLands + 1, HITS.bracketsClose + 4, EASE_SPRING);
  const form = prog(f, HITS.bracketsClose - 6, HITS.bracketsClose + 12, EASE_MODAL);
  const markIn = prog(f, HITS.dotLands - 4, HITS.dotLands + 4, EASE_IN_OUT);
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
      {leave < 1 && (
        <div
          style={{
            position: 'absolute',
            left: PILE.x,
            top: PILE.y + dy + 40 * leave,
            transform: `translate(-50%, -50%) scale(${push * mix(1, 0.94, leave)})`,
            opacity: 1 - leave,
            filter: leave > 0.01 ? `blur(${(leave * 8).toFixed(2)}px)` : undefined,
          }}
        >
          <Pile lost={lost} talkGone={talkGone} />
        </div>
      )}

      <AbsoluteFill
        style={{
          background: `radial-gradient(38% 22% at 50% ${(markY / 1920) * 100}%, rgba(255,255,255,${0.9 * flash}) 0%, rgba(255,255,255,0) 70%)`,
        }}
      />

      {f >= HITS.dotLands - 4 && part < 1 && (
        <div
          style={{
            position: 'absolute',
            left: MARK.x,
            top: markY,
            transform: `translate(-50%, -50%) scale(${markScale * drift})`,
            opacity: markIn * (1 - part),
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
            left: MARK.x,
            top: markY + 168 * drift,
            width: 460 * drift,
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
            opacity: 1 - prog(f, HITS.toApp + 2, HITS.toApp + 16, EASE_IN_OUT),
          }}
        />
      )}
    </AbsoluteFill>
  );
};
