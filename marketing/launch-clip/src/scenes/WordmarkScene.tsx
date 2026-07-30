import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Wordmark } from '../ui/Brand';
import { Stage } from '../film/effects';
import { CONSTELLATION, PANEL_OFFSET, PlatformPanel } from '../ui/platforms';
import { drift, prog, ramp, EASE_IN_OUT, EASE_MODAL, EASE_OUT } from '../film/anim';

/**
 * The turn: five places become one, and the one has a name.
 *
 * The five platform panels rush back in from exactly where they drifted out to
 * and collapse into a single point of light; the brackets close around that
 * point, then open to release the name. That gather IS the promise from the
 * founder letter — "one place for everything that catches my interest, wherever
 * I found it" — so the film states it as a move rather than as a claim.
 *
 * No tagline here on purpose: `Capture. Ask. Connect.` belongs to the endcard,
 * and a caption is already carrying this beat. Two lines of type would make the
 * lockup an advert instead of a lockup.
 */
export const WordmarkScene: React.FC = () => {
  const f = useCurrentFrame();

  // ── 1. the gather (frames 0–26): panels fly to centre and collapse
  const gather = prog(f, 0, 26, EASE_IN_OUT);
  const COLLAPSE = 26;

  // ── 2. the brackets close around the point (26–44)
  const close = prog(f, COLLAPSE, COLLAPSE + 18, EASE_OUT);
  // ── 3. and open again, releasing the name (48–86)
  const part = prog(f, 48, 86, EASE_OUT);
  const wordIn = prog(f, 56, 94, EASE_MODAL);
  const dotOut = prog(f, 46, 70, EASE_OUT);

  // brackets travel from wide-open, to tight around the point, to the lockup
  const spread = (1 - close) * 620 + close * 96 + part * (430 - 96);

  // The flash BUILDS as the five converge and spikes on the landing. Written as
  // a plain decay it sat at full brightness for the whole gather and washed the
  // incoming panels into one white blob — the opposite of the point.
  const flash =
    f < COLLAPSE
      ? Math.pow(gather, 3.4) * 0.5
      : Math.max(0, 1 - (f - COLLAPSE) / 26);
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
        filter: `drop-shadow(0 0 ${20 + flash * 26}px rgba(203,210,226,${0.3 + flash * 0.3}))`,
        opacity: close,
        overflow: 'hidden',
      }}
    >
      <svg
        viewBox={side === -1 ? '288 292 116 416' : '620 292 116 416'}
        style={{ width: '100%', height: '100%' }}
        fill="currentColor"
      >
        <path d="M296 300 L396 300 L396 358 L354 358 L354 642 L396 642 L396 700 L296 700 Z" />
        <path d="M728 300 L628 300 L628 358 L670 358 L670 642 L628 642 L628 700 L728 700 Z" />
      </svg>
    </div>
  );

  return (
    <AbsoluteFill style={{ background: '#050505', opacity: out }}>
      <Stage intensity={0.6} backlight={0.26 * (1 - gather)} />

      {/* the gather — the same constellation, running backwards into a point */}
      {gather < 1 && (
        <AbsoluteFill
          style={{
            perspective: 1700,
            perspectiveOrigin: '50% 48%',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ position: 'relative', width: 1, height: 1, transformStyle: 'preserve-3d' }}>
            {CONSTELLATION.map((p) => {
              // start where the scatter left them (fully drifted), end at centre
              const x = (p.x + p.dx) * (1 - gather);
              const y = (p.y + p.dy) * (1 - gather);
              const z = p.z * (1 - gather);
              return (
                <div
                  key={p.k}
                  style={{
                    position: 'absolute',
                    left: 0,
                    top: 0,
                    marginLeft: PANEL_OFFSET.x,
                    marginTop: PANEL_OFFSET.y,
                    transform: [
                      `translate3d(${x}px, ${y}px, ${z}px)`,
                      `rotateY(${p.rotY * (1 - gather)}deg) rotateX(${p.rotX * (1 - gather)}deg)`,
                      `scale(${1 - gather * 0.78})`,
                    ].join(' '),
                    opacity: Math.pow(1 - gather, 0.45),
                    // a smear of speed — but capped: at 9px they stopped being
                    // recognisable surfaces and the gather read as a light blob
                    filter: `blur(${gather * 4}px)`,
                  }}
                >
                  <PlatformPanel k={p.k} />
                </div>
              );
            })}
          </div>
        </AbsoluteFill>
      )}

      {/* the collapse flash */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(42% 38% at 50% 50%, rgba(242,245,250,${
            0.42 * flash * flash
          }) 0%, rgba(203,210,226,0) 70%)`,
        }}
      />

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            position: 'relative',
            width: 1500,
            height: 400,
            transform: `translateY(${float}px) scale(${outScale})`,
          }}
        >
          {bracket(-1)}
          {bracket(1)}

          {/* everything the brackets gathered, held as one point — then released
              into the name */}
          <div
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: `translate(-50%, -50%) scale(${(0.4 + gather * 0.6) * (1 + dotOut * 5.5)})`,
              width: 62,
              height: 62,
              borderRadius: 62,
              background: '#F2F5FA',
              opacity: gather * (1 - dotOut) * 0.92,
              filter: 'blur(0.4px)',
            }}
          />

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
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
