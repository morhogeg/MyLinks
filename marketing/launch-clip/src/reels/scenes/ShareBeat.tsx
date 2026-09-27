import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Compass, Share } from 'lucide-react';
import { HOLDS, SHARE_BEAT, SHARE_STARTS } from '../../../reel-timeline.mjs';
import { sans } from '../../fonts';
import { PLATFORM_INK, PlatformMark } from '../../ui/app';
import { Tap } from '../kit/AppShot';
import { EASE_GATHER, EASE_MODAL, EASE_SPRING, mix, prog } from '../kit/curves';
import { INK, INK_SOFT } from '../kit/Type';

const HOLD = HOLDS.find((h) => h.id === 'share')!;

/**
 * "Save anything, from anywhere." (owner, round 8: share from any app is a
 * key feature; no screen recording, so show it in the reel's own language).
 * Three saves from three apps, one after another, each a card wearing its
 * app's mark the way the opening's saves do (the app's own lucide marks and
 * PLATFORM_INK hues; Safari, which has no mark in that set, wears a compass):
 * the card arrives, its Share button is tapped, and it is pulled into the
 * Machina mark, which answers with a ring of ink. No iOS share sheet is
 * rebuilt and no third-party image is shown: it is a gesture, not a mockup.
 *
 * `u` is OUTPUT frames into the `share` hold; the Hook holds the mark and
 * the wordmark underneath (scenes/Hook.tsx, source frame HOLD.at).
 */

type Source = { kind: 'youtube' | 'instagram' | 'safari'; app: string; by: string; title: string };

const SOURCES: Source[] = [
  { kind: 'youtube', app: 'YouTube', by: 'TED', title: 'Inside the mind of a master procrastinator' },
  { kind: 'instagram', app: 'Instagram', by: '@slowcoasts', title: 'Cala Goloritzé, Sardinia' },
  { kind: 'safari', app: 'Safari', by: 'collaborativefund.com', title: 'The Psychology of Money' },
];

/** each share (starts: reel-timeline SHARE_STARTS): arrives, tapped, pulled
 *  in, lands. The tap and the landing sit on beats (round 13), a beat apart:
 *  the score's tick and bell land with them (reel-timeline SHARE_BEAT). */
const ENTER = 12;
const { tap: TAP, pull: PULL, land: LAND } = SHARE_BEAT;

/** where the mark's point is while the Hook holds (C.y 1000, lifted 70) */
const MARK = { x: 540, y: 930 };
const CARD_Y = 1430;
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
    <span
      style={{
        width: 92,
        height: 92,
        borderRadius: 24,
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: ink(s),
        background: tint(ink(s), 0.11),
      }}
    >
      {s.kind === 'safari' ? <Compass size={50} strokeWidth={1.9} /> : <PlatformMark kind={s.kind} size={50} />}
    </span>
    <span style={{ flex: 1, minWidth: 0 }}>
      <span style={{ display: 'block', fontSize: 24, fontWeight: 600, letterSpacing: '0.02em', color: INK_SOFT }}>
        {s.app} · {s.by}
      </span>
      <span style={{ display: 'block', marginTop: 6, fontSize: 36, fontWeight: 620, letterSpacing: '-0.015em', lineHeight: 1.15, color: INK }}>
        {s.title}
      </span>
    </span>
    {/* the Share button, the way iOS draws it */}
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

export const ShareBeat: React.FC<{ u: number }> = ({ u }) => {
  if (u < 0 || u >= HOLD.len) return null;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {SOURCES.map((s, k) => {
        const t0 = SHARE_STARTS[k];
        const t = u - t0;
        if (t < 0 || t > LAND + 30) return null;
        const side = k % 2 ? -1 : 1;
        const enter = prog(t, 0, ENTER, EASE_MODAL);
        const share = prog(t, TAP - 2, TAP + 4, EASE_MODAL);
        const pull = prog(t, PULL, LAND, EASE_GATHER);
        // an arc up into the point: out to the side a little, then in
        const x = mix(540 + side * 420 * (1 - enter), MARK.x, pull) + side * 60 * Math.sin(pull * Math.PI);
        const y = mix(CARD_Y + 40 * (1 - enter), MARK.y, pull);
        const scale = mix(1, 0.05, Math.pow(pull, 0.8)) * mix(0.94, 1, enter);
        const ring = prog(t, LAND, LAND + 22, EASE_MODAL);
        return (
          <React.Fragment key={s.kind}>
            {t <= LAND && (
              <div
                style={{
                  position: 'absolute',
                  left: x,
                  top: y,
                  transform: `translate(-50%, -50%) scale(${scale}) rotate(${side * 4 * pull}deg)`,
                  opacity: enter * (1 - prog(t, LAND - 3, LAND, EASE_MODAL)),
                  filter: pull > 0.05 ? `blur(${(pull * 5).toFixed(2)}px)` : undefined,
                }}
              >
                <Card s={s} share={share} />
                {/* the thumb on the Share button (card coordinates) */}
                <div style={{ position: 'absolute', right: 34 + 42, top: '50%', width: 0, height: 0 }}>
                  <Tap x={0} y={0} size={70} t={prog(t, TAP - 6, TAP + 12, (v) => v)} />
                </div>
              </div>
            )}
            {/* the mark answers: a ring of ink out from the point */}
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
          </React.Fragment>
        );
      })}
      {/* the point takes each one in with a small spring */}
      {SHARE_STARTS.map((t0, k) => {
        const p = prog(u, t0 + LAND, t0 + LAND + 10, EASE_SPRING) * (1 - prog(u, t0 + LAND + 10, t0 + LAND + 20, EASE_MODAL));
        return p > 0.01 ? (
          <div
            key={k}
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
        ) : null;
      })}
    </AbsoluteFill>
  );
};
