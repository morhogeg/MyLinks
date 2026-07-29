import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { AppIcon, Wordmark } from '../ui/Brand';
import { Stage } from '../film/effects';
import { drift, prog, ramp, EASE_MODAL, EASE_OUT } from '../film/anim';
import { sans } from '../fonts';

/**
 * The endcard: the shipped app icon, the drawn wordmark, the App Store subtitle.
 *
 * No price, no urgency, no "download now" — the film's whole argument is that
 * the product is quiet and confident, and a hard sell in the last four seconds
 * would retract it. The line under the rule is the one slot to swap for a real
 * App Store badge or URL once the listing is live.
 */
export const Endcard: React.FC = () => {
  const f = useCurrentFrame();

  const icon = prog(f, 2, 30, EASE_OUT);
  const word = prog(f, 24, 58, EASE_MODAL);
  const tag = prog(f, 46, 80, EASE_MODAL);
  const rule = prog(f, 84, 118, EASE_MODAL);
  const foot = prog(f, 96, 126, EASE_MODAL);

  const bloom = Math.max(0, 1 - f / 34);
  const float = drift(f, 4, 300);
  const out = 1 - prog(f, 186, 222);

  return (
    <AbsoluteFill style={{ background: '#050505', opacity: out }}>
      <Stage intensity={0.62} />
      <AbsoluteFill
        style={{
          background: `radial-gradient(42% 38% at 50% 40%, rgba(242,245,250,${
            0.26 * bloom * bloom
          }) 0%, rgba(203,210,226,0) 72%)`,
        }}
      />

      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          transform: `translateY(${float}px)`,
        }}
      >
        <div
          style={{
            opacity: icon,
            transform: `scale(${ramp(f, [2, 30], [0.86, 1], EASE_OUT)})`,
            filter: `drop-shadow(0 26px 60px rgba(0,0,0,0.75)) drop-shadow(0 0 ${
              30 + bloom * 60
            }px rgba(174,184,206,${0.22 + bloom * 0.3}))`,
            marginBottom: 52,
          }}
        >
          <AppIcon size={196} />
        </div>

        <div
          style={{
            width: 560,
            color: '#F2F5FA',
            opacity: word,
            transform: `translateY(${(1 - word) * 10}px)`,
            filter: 'drop-shadow(0 0 26px rgba(203,210,226,0.20))',
          }}
        >
          <Wordmark style={{ width: '100%', height: 'auto' }} />
        </div>

        <div
          style={{
            marginTop: 34,
            fontFamily: sans,
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: '0.36em',
            textTransform: 'uppercase',
            color: 'rgba(203,210,226,0.78)',
            opacity: tag,
            transform: `translateY(${(1 - tag) * 8}px)`,
          }}
        >
          Capture. Ask. Connect.
        </div>

        <div
          style={{
            marginTop: 40,
            width: 300 * rule,
            height: 1,
            background: 'linear-gradient(90deg, rgba(203,210,226,0) 0%, rgba(203,210,226,0.55) 50%, rgba(203,210,226,0) 100%)',
          }}
        />

        <div
          style={{
            marginTop: 24,
            fontFamily: sans,
            fontSize: 16,
            fontWeight: 500,
            letterSpacing: '0.02em',
            color: 'rgba(196,196,208,0.92)',
            opacity: foot,
          }}
        >
          Your knowledge, on iPhone.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
