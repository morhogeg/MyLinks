import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { AnimatedMark, MARK_LAUNCH_FRAMES, Wordmark } from '../ui/Brand';
import { SET_BG, Stage } from '../film/effects';
import { useFraming } from '../film/format';
import { drift, prog, ramp, EASE_MODAL, EASE_OUT } from '../film/anim';
import { sans } from '../fonts';
import { NIGHT, typeGlow } from '../look';

/**
 * The endcard: the luminous night lockup (2026-10-05). The bare mark strikes
 * with a burst of light, the drawn wordmark wipes in as the narrator says the
 * name, then the tagline lands as a statement, in sentence case with its
 * period, and holds to the last frame. Nothing under it.
 *
 * The mark is the BARE glyph, not the app-icon tile — `docs/BRANDING.md` makes
 * the same call for the header ("a rounded container there reads as a shrunken
 * app icon rather than as the brand mark"), and on a full-frame endcard the grey
 * squircle read as a screenshot of an icon instead of as an identity.
 *
 * And it ARRIVES rather than appearing: `AnimatedMark` runs the app's own
 * `launch` motion (ported from `CitationMark`) — the arms draw out from corner
 * ticks, the brackets close, the point strikes last — played slower than the
 * boot's 39 frames, because this is the closing statement rather than a launch.
 * The point lands on local frame STRIKE (17), where the score's boom sits; the
 * mark's timing is unchanged from the light grade, only its light is new.
 *
 * Word timing comes from the closing voice line (bar 30.1, 75.25s = local
 * 82.5): the name at +0.06s, "Everything" at +1.05s (src/film/vo.json). The
 * statement rises out of its mask 3 frames before its first word, the film's
 * caption motion. No price, no urgency, no "download now", and nothing about
 * learning (Machina is not a learning app): the film ends on the one line,
 * which the voice says word for word.
 */

/** the frame the point lands (u = 1 of the strike), the score's boom */
const STRIKE = 17;
/** the closing voice line, in local frames: "Machina." / "Everything …" */
const SAY_NAME = 84;
const SAY_LINE = 114;
const LEAD = 3;

export const Endcard: React.FC = () => {
  const f = useCurrentFrame();
  const fr = useFraming();

  // the mark's arrival (unchanged): 1.9× the app's launch, eased out, so the
  // point strikes on STRIKE
  const icon = prog(f, 2, 30, EASE_OUT);
  const u = prog(f, 2, 2 + MARK_LAUNCH_FRAMES * 1.9, EASE_OUT);
  // the strike's light: a burst behind the mark, out and gone in a second,
  // peaking as the point lands; the mark's own halo flares with it
  const burst = prog(f, STRIKE - 2, STRIKE + 28, (t) => t);
  const bloom = Math.max(0, 1 - Math.max(0, f - (STRIKE - 2)) / 34);
  // the wordmark wipes in as the narrator says the name
  const word = prog(f, SAY_NAME - 8, SAY_NAME + 8, EASE_MODAL);
  const float = Math.round(drift(f, 4, 300));
  // the digest leaves through the dark; the set's light comes up out of it
  const setUp = prog(f, 0, 8, EASE_OUT);

  const MARK_W = 184;

  return (
    <AbsoluteFill style={{ background: SET_BG }}>
      <AbsoluteFill style={{ opacity: setUp }}>
        <Stage intensity={0.7} />
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          transform: `translateY(${float}px) scale(${fr.vertical ? 1.16 : 1})`,
        }}
      >
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {f >= STRIKE - 2 && burst < 1 && (
            <div
              style={{
                position: 'absolute',
                left: '50%',
                top: (MARK_W * 416) / 576 / 2,
                width: MARK_W * 6,
                height: MARK_W * 6,
                transform: `translate(-50%, -50%) scale(${(0.35 + 0.9 * Math.sqrt(burst)).toFixed(4)})`,
                borderRadius: '50%',
                background: `radial-gradient(circle, rgba(225,232,255,${(0.62 * (1 - burst) ** 1.6).toFixed(4)}) 0%, rgba(${NIGHT.glow},${(0.24 * (1 - burst) ** 1.6).toFixed(4)}) 28%, rgba(${NIGHT.glow},0) 62%)`,
                pointerEvents: 'none',
              }}
            />
          )}

          <div
            style={{
              position: 'relative',
              opacity: icon,
              transform: `scale(${ramp(f, [2, 34], [0.94, 1], EASE_OUT).toFixed(4)})`,
              filter: `drop-shadow(0 0 ${(22 + bloom * 34).toFixed(2)}px rgba(${NIGHT.glow},${(0.32 + bloom * 0.4).toFixed(3)}))`,
              marginBottom: 58,
              width: MARK_W,
              lineHeight: 0,
              color: NIGHT.ink,
            }}
          >
            <AnimatedMark id="end" u={u} style={{ width: '100%', height: 'auto' }} />
          </div>

          {/* the glow wraps the wipe (a filter under a clip-path is cut
              square at the clip's edge) */}
          <div style={{ position: 'relative', filter: typeGlow(1.1) }}>
            <div
              style={{
                width: 560,
                lineHeight: 0,
                color: NIGHT.ink,
                clipPath: `inset(-20% ${((1 - word) * 100).toFixed(3)}% -20% 0)`,
                transform: `translateY(${Math.round((1 - word) * 12)}px)`,
              }}
            >
              <Wordmark style={{ width: '100%', height: 'auto' }} />
            </div>
          </div>

          <Statement
            text="Everything you save, finally useful."
            local={f - (SAY_LINE - LEAD)}
            rows={fr.vertical ? 2 : 1}
            size={fr.vertical ? 50 : 46}
          />
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/** a quick, decisive ease-out (quint), the captions' rise */
const OUT_QUINT = (t: number) => 1 - Math.pow(1 - t, 5);

/**
 * The tagline as a statement: white light in the film's one voice (Geist),
 * set big enough to read as the last thing the film says. Each row rises out
 * of its own mask (9 frames, ease-out quint, rows 2 frames apart), the motion
 * of every caption before it, then holds. `rows` 2 breaks it at its comma
 * (the vertical frame); the words are never changed.
 */
const Statement: React.FC<{ text: string; local: number; rows: 1 | 2; size: number }> = ({ text, local, rows, size }) => {
  const lines = rows === 2 ? text.replace(', ', ',\n').split('\n') : [text];
  return (
    <div
      style={{
        marginTop: 54,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        filter: typeGlow(1),
        visibility: local < -1 ? 'hidden' : 'visible',
      }}
    >
      {lines.map((line, i) => {
        const t = OUT_QUINT(Math.min(1, Math.max(0, (local - i * 2) / 9)));
        return (
          <div key={i} style={{ overflow: 'hidden', padding: '0.06em 0.1em 0.16em', margin: '-0.06em -0.1em -0.16em' }}>
            <div
              style={{
                transform: `translateY(${Math.round((1 - t) * 108)}%)`,
                fontFamily: sans,
                fontSize: size,
                fontWeight: 600,
                lineHeight: 1.14,
                letterSpacing: '-0.028em',
                color: NIGHT.ink,
                whiteSpace: 'nowrap',
              }}
            >
              {line}
            </div>
          </div>
        );
      })}
    </div>
  );
};
