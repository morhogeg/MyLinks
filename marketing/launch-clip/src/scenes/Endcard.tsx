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
 * would retract it. The closing line names the payoff the whole film has been
 * building — saves that are read, filed, connected and answerable, i.e. finally
 * USEFUL — and it is the one slot to swap for a real App Store badge or URL once
 * the listing is live. (It deliberately does NOT claim anything about learning:
 * Machina is not a learning app.)
 */
export const Endcard: React.FC = () => {
  const f = useCurrentFrame();
  const fr = useFraming();

  // Slowed in round 13b (owner: the last slide was a bit fast) — each element
  // gets its own breath, and the frame holds a full second after the footer.
  const icon = prog(f, 2, 30, EASE_OUT);
  const word = prog(f, 56, 96, EASE_MODAL);
  const tag = prog(f, 94, 130, EASE_MODAL);
  const rule = prog(f, 134, 166, EASE_MODAL);
  const foot = prog(f, 148, 182, EASE_MODAL);

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
          Capture. Ask. Connect.
        </div>

        <div
          style={{
            marginTop: 40,
            width: 300 * rule,
            height: 1,
            background: 'linear-gradient(90deg, rgba(20,20,27,0) 0%, rgba(20,20,27,0.45) 50%, rgba(20,20,27,0) 100%)',
          }}
        />

        <div
          style={{
            marginTop: 24,
            fontFamily: sans,
            fontSize: 16,
            fontWeight: 500,
            letterSpacing: '0.02em',
            color: 'rgba(55,60,72,0.92)',
            opacity: foot,
          }}
        >
          Everything you save, finally useful.
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
