import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Share as ShareIcon } from 'lucide-react';
import { HITS, SHARE_SLOT } from '../../../../ads/card-timeline.mjs';
import { sans } from '../../../fonts';
import { PLATFORM_INK, PlatformMark } from '../../../ui/app';
import { Tap } from '../../kit/AppShot';
import { EASE_GATHER, EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../../kit/curves';
import { INK, INK_SOFT } from '../../kit/Type';
import { useAdFrame } from './format';
import { MARK, PILE, TALK, TALK_ROW } from './Hook';

/**
 * "Share it to Machina." The kit's share gesture (the reel's ShareBeat, the
 * SAVE clip's Shares), for one save: the talk lifts out of the fading Watch
 * later list as a card wearing YouTube's mark (as the Machina app draws it),
 * as the narrator says "Share it to Machina" (never before its line), its
 * Share button is tapped once the name has wiped in, and it is pulled into the
 * Machina mark, which answers with a ring.
 *
 * THE SLOT. The iOS share sheet is native and cannot be captured from the web
 * build, so this is a brand graphic, not rebuilt iOS UI. It lives entirely in
 * SHARE_SLOT (card-timeline.mjs), drawn by this one component, so a real
 * iPhone screen recording of Share → Machina can replace it later cut for
 * cut: from the talk lifting out of the list to it landing in the mark.
 */

const CARD_W = 780;
const REST = { x: 540, y: 690, s: 0.94 };
const INK_YT = PLATFORM_INK.youtube;
const tint = (rgb: string, a: number) => rgb.replace('rgb(', 'rgba(').replace(')', `, ${a})`);

const Card: React.FC<{ share: number }> = ({ share }) => (
  <div
    style={{
      width: CARD_W,
      padding: '30px 34px 30px 30px',
      borderRadius: 38,
      background: '#FFFFFF',
      border: '1px solid rgba(16,24,40,0.07)',
      boxShadow: '0 1px 2px rgba(16,24,40,0.06), 0 24px 60px -18px rgba(24,32,48,0.3), 0 50px 90px -40px rgba(24,32,48,0.22)',
      fontFamily: sans,
      display: 'flex',
      alignItems: 'center',
      gap: 26,
    }}
  >
    <span style={{ width: 92, height: 92, borderRadius: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: INK_YT, background: tint(INK_YT, 0.11) }}>
      <PlatformMark kind="youtube" size={50} />
    </span>
    <span style={{ flex: 1, minWidth: 0 }}>
      <span style={{ display: 'block', fontSize: 24, fontWeight: 600, letterSpacing: '0.02em', color: INK_SOFT }}>YouTube · {TALK.by}</span>
      <span style={{ display: 'block', marginTop: 6, fontSize: 36, fontWeight: 620, letterSpacing: '-0.015em', lineHeight: 1.15, color: INK }}>{TALK.title}</span>
    </span>
    <span
      style={{
        width: 84,
        height: 84,
        borderRadius: 42,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: share > 0 ? '#FFFFFF' : INK,
        background: share > 0 ? `rgba(20,20,27,${0.9 * share})` : 'rgba(20,20,27,0.06)',
        transform: `scale(${1 - 0.08 * Math.sin(Math.min(1, share) * Math.PI)})`,
      }}
    >
      <ShareIcon size={38} strokeWidth={2} />
    </span>
  </div>
);

export const Share: React.FC<{ f: number }> = ({ f }) => {
  const { dy } = useAdFrame();
  const [from, land] = SHARE_SLOT as [number, number];
  if (f < from || f > land + 24) return null;
  const TAP = HITS.shareTap;
  // out of the list: from the talk's row, up to where it is shared
  const lift = prog(f, from, from + 22, EASE_MODAL);
  const share = prog(f, TAP - 2, TAP + 4, EASE_MODAL);
  const pull = prog(f, TAP + 4, land, EASE_GATHER);
  const rowY = PILE.y + TALK_ROW.dy + dy;
  const restY = REST.y + dy;
  const markY = MARK.y + dy;
  const x = mix(REST.x, MARK.x, pull) - 60 * Math.sin(pull * Math.PI);
  const y = mix(mix(rowY, restY, lift), markY, pull);
  const scale = mix(TALK_ROW.w / CARD_W, REST.s, lift) * mix(1, 0.05, Math.pow(pull, 0.8));
  const ring = prog(f, land, land + 22, EASE_MODAL);
  const p = prog(f, land, land + 10, EASE_SPRING) * (1 - prog(f, land + 10, land + 20, EASE_IN_OUT));
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {f <= land && (
        <div
          style={{
            position: 'absolute',
            left: x,
            top: y,
            transform: `translate(-50%, -50%) scale(${scale}) rotate(${-4 * pull}deg)`,
            opacity: prog(f, from, from + 6, EASE_IN_OUT) * (1 - prog(f, land - 3, land, EASE_IN_OUT)),
            filter: pull > 0.05 ? `blur(${(pull * 5).toFixed(2)}px)` : undefined,
          }}
        >
          <Card share={share} />
          <div style={{ position: 'absolute', right: 34 + 42, top: '50%', width: 0, height: 0 }}>
            <Tap x={0} y={0} size={70} t={prog(f, TAP - 7, TAP + 12, (v) => v)} />
          </div>
        </div>
      )}
      {f >= land && ring < 1 && (
        <div
          style={{
            position: 'absolute',
            left: MARK.x,
            top: markY,
            width: 60,
            height: 60,
            borderRadius: '50%',
            border: `3px solid rgba(20,20,27,${0.45 * (1 - ring)})`,
            transform: `translate(-50%, -50%) scale(${mix(0.6, 4.2, ring)})`,
          }}
        />
      )}
      {p > 0.01 && (
        <div
          style={{
            position: 'absolute',
            left: MARK.x,
            top: markY,
            width: 36,
            height: 36,
            borderRadius: '50%',
            background: 'rgba(20,20,27,0.9)',
            transform: `translate(-50%, -50%) scale(${1 + 0.35 * p})`,
            opacity: p,
          }}
        />
      )}
    </AbsoluteFill>
  );
};
