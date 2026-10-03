import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Compass, Image as ImageIcon, Share as ShareIcon } from 'lucide-react';
import { HITS } from '../../../../ads/card-timeline.mjs';
import { sans } from '../../../fonts';
import { PLATFORM_INK, PlatformMark } from '../../../ui/app';
import { Tap } from '../../kit/AppShot';
import { EASE_GATHER, EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../../kit/curves';
import { INK, INK_SOFT } from '../../kit/Type';
import { useAdFrame } from './format';
import { MARK } from './Hook';

/**
 * "From any app, just share it to Machina." The kit's share gesture (the
 * reel's ShareBeat, the SAVE clip's Shares) for the three saves the hook
 * named, a beat apart: the article (Safari), the thread (X), the screenshot
 * (Photos). Each enters from its own edge, its Share button is tapped, and it
 * is pulled into the Machina mark, which answers with a ring.
 *
 * THE SLOT. The iOS share sheet is native and cannot be captured from the web
 * build, so this is a brand graphic, not rebuilt iOS UI (SHARE_SLOT in the
 * timeline marks where a real iPhone recording could replace it). Titles are
 * the demo's real saves and the hook's own screenshot; verify checks them.
 */

type Kind = 'safari' | 'x' | 'photos';
type Source = { kind: Kind; app: string; by: string; title: string; from: [number, number] };
export const SOURCES: Source[] = [
  { kind: 'safari', app: 'Safari', by: 'markmanson.net', title: 'The Most Important Question of Your Life', from: [-700, 0] },
  { kind: 'x', app: 'X', by: '@naval', title: 'How to Get Rich (without getting lucky)', from: [700, 0] },
  { kind: 'photos', app: 'Photos', by: 'Screenshot', title: 'Maya: You HAVE to do the Tour du Mont Blanc', from: [0, -560] },
];
const CARD_W = 780;
const REST = { x: 540, y: 690, s: 0.94 };
const ENTER = 12;
const SAFARI_INK = 'rgb(0, 122, 255)';
const PHOTOS_INK = 'rgb(245, 158, 11)';
const ink = (s: Source) => (s.kind === 'safari' ? SAFARI_INK : s.kind === 'photos' ? PHOTOS_INK : PLATFORM_INK[s.kind]);
const tint = (rgb: string, a: number) => rgb.replace('rgb(', 'rgba(').replace(')', `, ${a})`);

const Card: React.FC<{ s: Source; share: number }> = ({ s, share }) => (
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
    <span style={{ width: 92, height: 92, borderRadius: 24, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: ink(s), background: tint(ink(s), 0.11) }}>
      {s.kind === 'safari' ? <Compass size={50} strokeWidth={1.9} /> : s.kind === 'photos' ? <ImageIcon size={48} strokeWidth={1.9} /> : <PlatformMark kind={s.kind} size={50} />}
    </span>
    <span style={{ flex: 1, minWidth: 0 }}>
      <span style={{ display: 'block', fontSize: 24, fontWeight: 600, letterSpacing: '0.02em', color: INK_SOFT }}>
        {s.app} · {s.by}
      </span>
      <span style={{ display: 'block', marginTop: 6, fontSize: 36, fontWeight: 620, letterSpacing: '-0.015em', lineHeight: 1.15, color: INK }}>{s.title}</span>
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
  const markY = MARK.y + dy;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {SOURCES.map((s, k) => {
        const t0 = HITS.shareStarts[k];
        const TAP = HITS.shareTaps[k] - t0;
        const LAND = HITS.shareLands[k] - t0;
        const t = f - t0;
        if (t < 0 || t > LAND + 24) return null;
        const enter = prog(t, 0, ENTER, EASE_MODAL);
        const share = prog(t, TAP - 2, TAP + 4, EASE_MODAL);
        const pull = prog(t, TAP + 4, LAND, EASE_GATHER);
        const side = s.from[0] < 0 ? -1 : 1;
        const x = mix(REST.x + s.from[0] * (1 - enter), MARK.x, pull) + side * 60 * Math.sin(pull * Math.PI);
        const y = mix(REST.y + dy + s.from[1] * (1 - enter), markY, pull);
        const scale = REST.s * mix(1, 0.05, Math.pow(pull, 0.8)) * mix(0.94, 1, enter);
        const ring = prog(t, LAND, LAND + 22, EASE_MODAL);
        const p = prog(t, LAND, LAND + 10, EASE_SPRING) * (1 - prog(t, LAND + 10, LAND + 20, EASE_IN_OUT));
        return (
          <React.Fragment key={s.kind}>
            {t <= LAND && (
              <div
                style={{
                  position: 'absolute',
                  left: x,
                  top: y,
                  transform: `translate(-50%, -50%) scale(${scale}) rotate(${side * 4 * pull}deg)`,
                  opacity: Math.min(1, enter * 1.4) * (1 - prog(t, LAND - 3, LAND, EASE_IN_OUT)),
                  filter: pull > 0.05 || enter < 0.97 ? `blur(${(pull * 5 + (1 - enter) * 6).toFixed(2)}px)` : undefined,
                  zIndex: k,
                }}
              >
                <Card s={s} share={share} />
                <div style={{ position: 'absolute', right: 34 + 42, top: '50%', width: 0, height: 0 }}>
                  <Tap x={0} y={0} size={70} t={prog(f, HITS.shareTaps[k] - 7, HITS.shareTaps[k] + 12, (v) => v)} />
                </div>
              </div>
            )}
            {t >= LAND && ring < 1 && (
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
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};
