import React from 'react';
import { interpolate, useCurrentFrame } from 'remotion';
import { SUBTITLES, BAR_FRAMES } from '../../timeline.mjs';
import { sans } from '../fonts';

/**
 * Captions. Deliberately NOT a boxed subtitle track: one line, centred low,
 * rising a few pixels as it fades in, with the previous line already gone. No
 * two lines are ever on screen at once — a stack of copy is what makes a
 * product film feel like an infomercial.
 */
export const Subtitles: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <>
      {SUBTITLES.map((s) => {
        const from = Math.round(s.bar * BAR_FRAMES);
        const dur = Math.round(s.bars * BAR_FRAMES);
        const local = frame - from;
        if (local < -2 || local > dur + 12) return null;

        const IN = 11;
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
        // ease the rise separately from the fade — the fade is linear-ish, the
        // motion decelerates, which is what reads as "settled" rather than "slid"
        const rise = (1 - Math.pow(enter, 0.42)) * 14;

        return (
          <div
            key={s.text}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 88,
              display: 'flex',
              justifyContent: 'center',
              opacity: o,
              transform: `translateY(${rise}px)`,
            }}
          >
            <span
              style={{
                fontFamily: sans,
                fontSize: 37,
                fontWeight: 500,
                letterSpacing: '-0.018em',
                color: 'rgba(240,240,246,0.97)',
                textShadow:
                  '0 1px 2px rgba(0,0,0,0.7), 0 8px 34px rgba(0,0,0,0.85), 0 0 70px rgba(0,0,0,0.6)',
                textAlign: 'center',
                maxWidth: 1300,
              }}
            >
              {s.text}
            </span>
          </div>
        );
      })}
    </>
  );
};
