import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Compass, Share } from 'lucide-react';
import { HITS } from '../../../../clips/save-timeline.mjs';
import { sans } from '../../../fonts';
import { PLATFORM_INK, PlatformMark } from '../../../ui/app';
import { Tap } from '../../kit/AppShot';
import { EASE_GATHER, EASE_MODAL, EASE_SPRING, mix, prog } from '../../kit/curves';
import { INK, INK_SOFT } from '../../kit/Type';

/**
 * ANY APP: "Machina saves from any app. No copying, no pasting."
 * The reel's share gesture (scenes/ShareBeat.tsx) on the clip's own beats,
 * five a beat apart: a YouTube video, an Instagram post, an X Article, a
 * Facebook post and a page in Safari, each entering from its own edge, its
 * Share button tapped, pulled into the Machina mark, which answers with a
 * ring. The share sheet itself is native (the iOS Share Extension), so it is
 * shown as this gesture, not rebuilt: no iOS UI, no third-party image.
 * Titles are the cards the source tour then opens (capture/clip-save.mjs
 * sourceCards) and the montage's one Facebook post (FACEBOOK_SHARE); verify
 * checks them.
 */

type Kind = 'youtube' | 'instagram' | 'x' | 'facebook' | 'safari';
type Source = { kind: Kind; app: string; by: string; title: string; x: number; y: number; r: number; from: [number, number] };

// placed so no card crosses the wordmark (mark at y 930, the name under it):
// two above the mark, two below the name, and each pair a beat or more apart
const SOURCES: Source[] = [
  { kind: 'youtube', app: 'YouTube', by: 'Big Think Clips', title: 'How to overcome your addiction to technology', x: 430, y: 640, r: -3, from: [-620, -40] },
  { kind: 'instagram', app: 'Instagram', by: '@slowcoasts', title: 'One week, one small bag', x: 650, y: 1440, r: 2.5, from: [620, 30] },
  { kind: 'x', app: 'X', by: '@marginalia', title: 'How I read 40 books a year without speed reading', x: 440, y: 1630, r: -2, from: [-620, 20] },
  { kind: 'facebook', app: 'Facebook', by: 'Riverside Market', title: 'The Saturday market is back, 8 to 1', x: 640, y: 700, r: 2, from: [620, -30] },
  { kind: 'safari', app: 'Safari', by: 'markmanson.net', title: 'The Most Important Question of Your Life', x: 470, y: 555, r: -1.5, from: [0, -700] },
];
const SCALE = 0.8;
const ENTER = 12;
/** the mark's point while the name holds (Hook.tsx: C.y 1000, lifted 70) */
const MARK = { x: 540, y: 930 };
const SAFARI_INK = 'rgb(0, 122, 255)';
const ink = (s: Source) => (s.kind === 'safari' ? SAFARI_INK : PLATFORM_INK[s.kind]);
const tint = (rgb: string, a: number) => rgb.replace('rgb(', 'rgba(').replace(')', `, ${a})`);

const Card: React.FC<{ s: Source; share: number }> = ({ s, share }) => (
  <div
    style={{
      width: 780,
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
      {s.kind === 'safari' ? <Compass size={50} strokeWidth={1.9} /> : <PlatformMark kind={s.kind} size={50} />}
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
      <Share size={38} strokeWidth={2} />
    </span>
  </div>
);

export const Shares: React.FC<{ f: number }> = ({ f }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    {SOURCES.map((s, k) => {
      const t0 = HITS.shareStarts[k];
      const TAP = HITS.shareTaps[k] - t0;
      const LAND = HITS.shareLands[k] - t0;
      const PULL = TAP + 4;
      const t = f - t0;
      if (t < 0 || t > LAND + 24) return null;
      const side = s.from[0] < 0 ? -1 : s.from[0] > 0 ? 1 : k % 2 ? -1 : 1;
      const enter = prog(t, 0, ENTER, EASE_MODAL);
      const share = prog(t, TAP - 2, TAP + 4, EASE_MODAL);
      const pull = prog(t, PULL, LAND, EASE_GATHER);
      const x = mix(s.x + s.from[0] * (1 - enter), MARK.x, pull) + side * 60 * Math.sin(pull * Math.PI);
      const y = mix(s.y + s.from[1] * (1 - enter), MARK.y, pull);
      const scale = SCALE * mix(1, 0.05, Math.pow(pull, 0.8)) * mix(0.94, 1, enter);
      const inBlur = (1 - enter) * 6;
      const ring = prog(t, LAND, LAND + 22, EASE_MODAL);
      const p = prog(t, LAND, LAND + 10, EASE_SPRING) * (1 - prog(t, LAND + 10, LAND + 20, EASE_MODAL));
      return (
        <React.Fragment key={s.kind}>
          {t <= LAND && (
            <div
              style={{
                position: 'absolute',
                left: x,
                top: y,
                transform: `translate(-50%, -50%) scale(${scale}) rotate(${s.r * (1 - pull) + side * 4 * pull}deg)`,
                opacity: Math.min(1, enter * 1.4) * (1 - prog(t, LAND - 3, LAND, EASE_MODAL)),
                filter: pull > 0.05 || inBlur > 0.2 ? `blur(${(pull * 5 + inBlur).toFixed(2)}px)` : undefined,
              }}
            >
              <Card s={s} share={share} />
              <div style={{ position: 'absolute', right: 34 + 42, top: '50%', width: 0, height: 0 }}>
                <Tap x={0} y={0} size={70} t={prog(t, TAP - 6, TAP + 12, (v) => v)} />
              </div>
            </div>
          )}
          {t >= LAND && ring < 1 && (
            <div
              style={{
                position: 'absolute',
                left: MARK.x,
                top: MARK.y,
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
                top: MARK.y,
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
