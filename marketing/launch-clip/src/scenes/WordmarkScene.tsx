import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { CitationGlyph, Wordmark } from '../ui/Brand';
import { Stage } from '../film/effects';
import { drift, prog, ramp, EASE_OUT, EASE_MODAL } from '../film/anim';
import { sans } from '../fonts';

/**
 * The name, delivered by the mark itself.
 *
 * The brackets from the cold open travel outward and the wordmark resolves in
 * the space they open up, so the lockup reads as [ MACHINA ] — the mark holding
 * its own name, which is the whole idea of a citation. The dot expands and
 * dissolves as the letters arrive: what the brackets were holding is now the
 * name.
 */
export const WordmarkScene: React.FC = () => {
  const f = useCurrentFrame();

  const part = prog(f, 6, 44, EASE_OUT); // brackets separating
  const wordIn = prog(f, 18, 52, EASE_MODAL);
  const dotOut = prog(f, 8, 30, EASE_OUT);

  const spread = part * 430;
  const bloom = Math.max(0, 1 - f / 30);
  const tag = prog(f, 58, 82, EASE_MODAL);

  const float = drift(f, 4, 250);
  const outScale = ramp(f, [112, 150], [1, 1.03], EASE_OUT);
  const out = 1 - prog(f, 134, 150);

  const bracket = (side: -1 | 1) => (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        transform: `translate(calc(-50% + ${side * spread}px), -50%)`,
        // 116 × 416 crop of the mark's viewBox — keep the ratio or the bracket
        // stems thicken and it stops being the shipped geometry
        width: 49,
        height: 176,
        color: '#F2F5FA',
        filter: 'drop-shadow(0 0 24px rgba(203,210,226,0.30))',
        overflow: 'hidden',
      }}
    >
      {/* one bracket at a time, cropped out of the full mark's viewBox */}
      <svg viewBox={side === -1 ? '288 292 116 416' : '620 292 116 416'} style={{ width: '100%', height: '100%' }} fill="currentColor">
        <path d="M296 300 L396 300 L396 358 L354 358 L354 642 L396 642 L396 700 L296 700 Z" />
        <path d="M728 300 L628 300 L628 358 L670 358 L670 642 L628 642 L628 700 L728 700 Z" />
      </svg>
    </div>
  );

  return (
    <AbsoluteFill style={{ background: '#050505', opacity: out }}>
      <Stage intensity={0.6} />
      <AbsoluteFill
        style={{
          background: `radial-gradient(45% 40% at 50% 47%, rgba(242,245,250,${
            0.3 * bloom * bloom
          }) 0%, rgba(203,210,226,0) 70%)`,
        }}
      />

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ position: 'relative', width: 1500, height: 400, transform: `translateY(${float}px) scale(${outScale})` }}>
          {bracket(-1)}
          {bracket(1)}

          {/* the dot, growing out of existence as the name arrives */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: `translate(-50%, -50%) scale(${1 + dotOut * 5.5})`,
              width: 62,
              height: 62,
              borderRadius: 62,
              background: '#F2F5FA',
              opacity: (1 - dotOut) * 0.9,
              filter: 'blur(0.4px)',
            }}
          />

          {/* MACHINA */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: `translate(-50%, -50%) scale(${0.94 + wordIn * 0.06})`,
              width: 700,
              color: '#F2F5FA',
              opacity: wordIn,
              filter: `drop-shadow(0 0 30px rgba(203,210,226,${0.22 * wordIn}))`,
            }}
          >
            <Wordmark style={{ width: '100%', height: 'auto' }} />
          </div>
        </div>

        {/* the App Store subtitle, verbatim (docs/BRANDING.md D-2) */}
        <div
          style={{
            position: 'absolute',
            top: '50%',
            marginTop: 130,
            fontFamily: sans,
            fontSize: 17,
            fontWeight: 600,
            letterSpacing: '0.34em',
            textTransform: 'uppercase',
            color: 'rgba(203,210,226,0.72)',
            opacity: tag,
            transform: `translateY(${(1 - tag) * 8}px)`,
          }}
        >
          Capture. Ask. Connect.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
