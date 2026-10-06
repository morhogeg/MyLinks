import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { mono } from '../fonts';
import { prog, ramp, EASE_MODAL, EASE_OUT, EASE_SPRING } from '../film/anim';
import { NIGHT } from '../look';

/**
 * Cold open — the app launching, in the app's REAL boot look (the night look,
 * 2026-10-05): the shipped graphite ground and a white mark of light. Light
 * is already arriving on frame 0 (a cool pool behind where the mark will
 * form, and a soft glow gathering at the point), so the film never opens on
 * a dead black hold.
 *
 * The MOTION is still `BootScreen` from `web/app/page.tsx`, ported
 * frame-for-frame from its CSS keyframes in `globals.css`, down to the delays:
 * same staged arrival ("the arms join. The brackets close. The point lands.
 * Only then does the wordmark arrive"), same letterspaced monospace setting
 * for MACHINA, and the same push-through exit that doubles as the cut into
 * the film.
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
  const K = MARK_W / 117; // the shipped glow radii, at the film's mark size

  // the light arriving: up from a visible glow on frame 0, full as the
  // brackets settle; the point's own glow then takes over
  const arrive = prog(f, 0, 20, EASE_OUT);
  const gathering = (0.42 + 0.58 * arrive) * (1 - 0.55 * dot);

  return (
    <AbsoluteFill
      style={{
        // the shipped BootScreen ground: the prototype's radial graphite
        backgroundImage: 'radial-gradient(120% 90% at 50% 42%, #131319, #050507 72%)',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: dissolve,
      }}
    >
      {/* the key light, behind where the mark forms: lit from the first frame */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(40% 48% at 50% 43%, rgba(${NIGHT.key},${(0.13 + 0.09 * arrive).toFixed(3)}) 0%, rgba(${NIGHT.key},${(0.05 + 0.03 * arrive).toFixed(3)}) 46%, rgba(${NIGHT.key},0) 100%)`,
        }}
      />

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          transform: `scale(${pushScale})`,
        }}
      >
        <span style={{ position: 'relative', display: 'inline-flex' }}>
          {/* the light gathering at the point before the brackets close on it */}
          <span
            style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              width: MARK_W * 1.5,
              height: MARK_W * 1.5,
              transform: 'translate(-50%, -50%)',
              borderRadius: '50%',
              background: `radial-gradient(closest-side, rgba(225,232,255,${(0.24 * gathering).toFixed(3)}) 0%, rgba(${NIGHT.glow},${(0.1 * gathering).toFixed(3)}) 34%, rgba(${NIGHT.glow},0) 100%)`,
            }}
          />
          {/* the halo breathes with LIGHT, never the geometry: the shipped
              silver halo behind the mark */}
          <span
            style={{
              position: 'absolute',
              inset: '-45%',
              borderRadius: '50%',
              background:
                'radial-gradient(closest-side, rgba(174,184,206,0.2), rgba(174,184,206,0) 72%)',
              opacity: Math.max(0, Math.sin(((f - 48) / 126) * Math.PI * 2)),
            }}
          />
          <span
            style={{
              position: 'relative',
              width: MARK_W,
              // text-white, and the shipped boot-glow (0 → 18px of silver at
              // 0.34), scaled to the film's mark
              color: '#FFFFFF',
              filter: `drop-shadow(0 0 ${(glow * 18 * K).toFixed(2)}px rgba(174,184,206,${(glow * 0.34).toFixed(3)}))`,
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
            open as it fades in (0.30em → 0.46em), in the shipped #E6E6F0. */}
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
