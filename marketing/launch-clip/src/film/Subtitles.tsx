import React from 'react';
import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import { SUBTITLES, BAR_FRAMES } from '../../timeline.mjs';
import { sans } from '../fonts';

/**
 * Captions, laid out rather than subtitled.
 *
 * A line centred under the device was the wrong place twice over: it sat in the
 * device's shadow, and it made the film look like something with subtitles
 * burned on. So product beats put the type in a LEFT COLUMN with the device
 * held right of centre — the editorial two-column setting — and only the beats
 * with no device (the scatter, the lockup) keep a centred line.
 *
 * Which one a cue uses is declared per cue in `timeline.mjs`; the scenes shift
 * their device by `BASE_X` to open the column.
 *
 * All motion here lands on WHOLE pixels. Sub-pixel translation forces Chromium
 * to re-rasterize the glyphs every frame, which reads as a shimmer on type this
 * large — one of the two jitters in the Ask beat.
 */

const LEFT_X = 132;
const COLUMN_W = 660;

export const Subtitles: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {SUBTITLES.map((s) => {
        const from = Math.round(s.bar * BAR_FRAMES);
        const dur = Math.round(s.bars * BAR_FRAMES);
        const local = frame - from;
        if (local < -2 || local > dur + 12) return null;

        const IN = 12;
        const OUT = 10;
        const enter = interpolate(local, [0, IN], [0, 1], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const exit = interpolate(local, [dur - OUT, dur], [1, 0], {
          extrapolateLeft: 'clamp',
          extrapolateRight: 'clamp',
        });
        const o = Math.min(enter, exit);
        // eased separately from the fade, and rounded — see the note above
        const travel = Math.round((1 - Math.pow(enter, 0.42)) * 16);

        if (s.place === 'left') {
          return (
            <div
              key={s.text}
              style={{
                position: 'absolute',
                left: LEFT_X,
                top: '50%',
                width: COLUMN_W,
                transform: `translate(${travel}px, -50%)`,
                opacity: o,
                display: 'flex',
                gap: 26,
                alignItems: 'stretch',
              }}
            >
              {/* the accent rule grows with the line — the app's own gradient */}
              <div
                style={{
                  width: 3,
                  borderRadius: 2,
                  background: 'linear-gradient(180deg, #FFFFFF, #CBD2E0)',
                  opacity: 0.85,
                  transform: `scaleY(${enter})`,
                  transformOrigin: 'center top',
                }}
              />
              <span
                style={{
                  fontFamily: sans,
                  fontSize: 50,
                  fontWeight: 500,
                  lineHeight: 1.14,
                  letterSpacing: '-0.026em',
                  color: 'rgba(242,242,248,0.98)',
                  textShadow: '0 2px 30px rgba(0,0,0,0.75)',
                }}
              >
                {s.text}
              </span>
            </div>
          );
        }

        return (
          <React.Fragment key={s.text}>
            {/* a scrim only where a centred line actually needs one */}
            <AbsoluteFill
              style={{
                background:
                  'linear-gradient(180deg, rgba(4,4,6,0) 64%, rgba(4,4,6,0.5) 84%, rgba(4,4,6,0.82) 100%)',
                opacity: o,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: 92,
                display: 'flex',
                justifyContent: 'center',
                opacity: o,
                transform: `translateY(${travel}px)`,
              }}
            >
              <span
                style={{
                  fontFamily: sans,
                  fontSize: 44,
                  fontWeight: 500,
                  letterSpacing: '-0.024em',
                  color: 'rgba(242,242,248,0.98)',
                  textShadow: '0 1px 2px rgba(0,0,0,0.7), 0 8px 34px rgba(0,0,0,0.85)',
                  textAlign: 'center',
                  maxWidth: 1300,
                }}
              >
                {s.text}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};
