import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { AnimatedMark, MARK_LAUNCH_FRAMES, Wordmark } from '../ui/Brand';
import { SET_BG, Stage } from '../film/effects';
import { useFraming } from '../film/format';
import { drift, prog, ramp, EASE_MODAL, EASE_OUT } from '../film/anim';
import { sans } from '../fonts';

/**
 * The endcard: the bare mark, the drawn wordmark, the App Store subtitle —
 * ink on paper, the light grade's closing statement.
 *
 * The letterspaced line IS the listing's subtitle, so it tracks
 * `docs/APP_STORE.md` §2: `Never lose another great find` since 2026-08-26
 * (it was `Capture. Ask. Connect.` until then; the act kickers keep those
 * three words, this line does not).
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
 *
 * No price, no urgency, no "download now" — the film's whole argument is that
 * the product is quiet and confident, and a hard sell in the last four seconds
 * would retract it. The endcard closes on ONE line, the subtitle, and the voice
 * says the same words (owner call 2026-09-17; the tagline `Everything you save,
 * finally useful.` used to sit under a rule below it and was cut so the screen
 * and the voice agree). The space under the subtitle is the slot for a real App
 * Store badge or URL once the listing is live. (It deliberately does NOT claim
 * anything about learning: Machina is not a learning app.)
 */
export const Endcard: React.FC = () => {
  const f = useCurrentFrame();
  const fr = useFraming();

  // Slowed in round 13b (owner: the last slide was a bit fast) — each element
  // gets its own breath, and the frame holds after the subtitle lands.
  const icon = prog(f, 2, 30, EASE_OUT);
  const word = prog(f, 56, 96, EASE_MODAL);
  const tag = prog(f, 94, 130, EASE_MODAL);

  const bloom = Math.max(0, 1 - Math.max(0, f - 34) / 36);
  const float = drift(f, 4, 300);
  // The film ENDS on the lockup (owner call, round 13n) — no fade to white,
  // so the last frame is the mark + wordmark + tagline, which is also what a
  // paused/finished player shows. The audio still carries the film fade.
  const out = 1;

  return (
    <AbsoluteFill style={{ background: SET_BG, opacity: out }}>
      <Stage intensity={0.66} />
      {/* the arrival bloom — a lift of white light behind the mark */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(42% 38% at 50% 40%, rgba(255,255,255,${
            0.6 * bloom * bloom
          }) 0%, rgba(255,255,255,0) 72%)`,
        }}
      />

      <AbsoluteFill
        style={{
          alignItems: 'center',
          justifyContent: 'center',
          transform: `translateY(${float}px) scale(${fr.vertical ? 1.16 : 1})`,
        }}
      >
        <div
          style={{
            opacity: icon,
            transform: `scale(${ramp(f, [2, 34], [0.94, 1], EASE_OUT)})`,
            filter: `drop-shadow(0 ${8 + bloom * 8}px ${30 + bloom * 40}px rgba(24,32,48,${
              0.22 + bloom * 0.2
            }))`,
            marginBottom: 54,
            width: 178,
            color: '#14141B',
          }}
        >
          {/* 1.9× the app's launch duration — the endcard's mark is settling,
              not booting. */}
          <AnimatedMark
            id="end"
            u={prog(f, 2, 2 + MARK_LAUNCH_FRAMES * 1.9, EASE_OUT)}
            style={{ width: '100%', height: 'auto' }}
          />
        </div>

        <div
          style={{
            width: 560,
            color: '#14141B',
            opacity: word,
            transform: `translateY(${(1 - word) * 10}px)`,
            filter: 'drop-shadow(0 4px 26px rgba(24,32,48,0.14))',
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
            color: 'rgba(75,85,99,0.85)',
            opacity: tag,
            transform: `translateY(${(1 - tag) * 8}px)`,
          }}
        >
          Never lose another great find
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
