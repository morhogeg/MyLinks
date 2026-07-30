import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { mono } from '../fonts';
import { prog, ramp, EASE_MODAL, EASE_OUT, EASE_SPRING } from '../film/anim';

/**
 * Cold open — the app launching.
 *
 * Not an invented title card: this is `BootScreen` from `web/app/page.tsx`,
 * ported frame-for-frame from its CSS keyframes in `globals.css`, down to the
 * delays. Same staged arrival the identity spec calls for ("the arms join. The
 * brackets close. The point lands. Only then does the wordmark arrive"), same
 * letterspaced monospace setting for MACHINA, same radial graphite ground, and
 * the same push-through exit the app plays when auth resolves — which doubles
 * as the cut into the film.
 *
 * Timings below are the shipped values in seconds × 30fps:
 *   brackets  0.55s ease-modal  delay 0.14   →  f 4–21
 *   dot       0.36s ease-spring delay 0.60   →  f 18–29
 *   glow      0.70s ease-out    delay 0.55   →  f 17–38
 *   wordmark  0.70s ease-out    delay 1.05   →  f 32–53
 *   exit      0.58s push-through + 0.34s dissolve
 */
export const ColdOpen: React.FC = () => {
  const f = useCurrentFrame();

  const brackets = prog(f, 4, 21, EASE_MODAL);
  const dot = prog(f, 18, 29, EASE_SPRING);
  const glow = prog(f, 17, 38, EASE_OUT);
  const word = prog(f, 32, 53, EASE_OUT);

  // the exit: the mark accelerates past the viewer while the frame dissolves
  const EXIT = 58;
  const push = prog(f, EXIT, EXIT + 17, EASE_OUT);
  const pushScale = 1 + Math.pow(push, 2.2) * 12;
  const dissolve = 1 - prog(f, EXIT + 6, EXIT + 17);

  const MARK_W = 360; // the boot mark is min(30vw, 117px); scaled for a 1080 frame

  return (
    <AbsoluteFill
      style={{
        // the boot frame's own ground — fixed graphite, not a themed surface
        backgroundImage:
          'radial-gradient(120% 90% at 50% 42%, #131319, #050507 72%)',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: dissolve,
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          transform: `scale(${pushScale})`,
        }}
      >
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          {/* the halo breathes with LIGHT, never the ink */}
          <span
            style={{
              position: 'absolute',
              inset: '-45%',
              borderRadius: '50%',
              background:
                'radial-gradient(closest-side, rgba(174,184,206,0.20), rgba(174,184,206,0) 72%)',
              opacity: Math.max(0, Math.sin(((f - 48) / 126) * Math.PI * 2)) * 0.9,
            }}
          />
          <span
            style={{
              position: 'relative',
              width: MARK_W,
              color: '#FFFFFF',
              filter: `drop-shadow(0 0 ${glow * 54}px rgba(174,184,206,${glow * 0.34}))`,
            }}
          >
            <svg viewBox="288 292 448 416" style={{ width: '100%', height: 'auto' }} fill="currentColor">
              <g transform={`translate(${(brackets - 1) * 282} 0)`} opacity={brackets}>
                <path d="M296 300 L396 300 L396 358 L354 358 L354 642 L396 642 L396 700 L296 700 Z" />
              </g>
              <g transform={`translate(${(1 - brackets) * 282} 0)`} opacity={brackets}>
                <path d="M728 300 L628 300 L628 358 L670 358 L670 642 L628 642 L628 700 L728 700 Z" />
              </g>
              <circle cx="512" cy="500" r={52 * dot} opacity={dot} />
            </svg>
          </span>
        </span>

        {/* MACHINA — the launch setting: letterspaced monospace that breathes
            open as it fades in (0.30em → 0.46em), never the drawn wordmark. */}
        <span
          style={{
            marginTop: MARK_W * 0.359,
            fontFamily: mono,
            fontSize: MARK_W * 0.145,
            textTransform: 'uppercase',
            color: '#E6E6F0',
            letterSpacing: `${ramp(f, [32, 53], [0.3, 0.46], EASE_OUT)}em`,
            textIndent: '0.46em',
            opacity: word,
          }}
        >
          Machina
        </span>
      </div>
    </AbsoluteFill>
  );
};
