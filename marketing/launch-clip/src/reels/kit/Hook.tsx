import React from 'react';
import { sans } from '../../fonts';
import { prog } from './curves';
import { INK } from './Type';

/**
 * THE HOUSE HOOK (every video from 2026-10-25 on): FIND THE BOOK's dare,
 * made the standard. The frame-0 line a viewer reads with the sound off, set
 * big in the caption band: an optional kicker (uppercase, letterspaced) over
 * one or two big lines. It is on screen from frame 0 (it is the cover), and
 * rolls up out of its own mask in the last frames before `to`.
 *
 * Its own type (heavier and tighter than a caption) is the one place a hook
 * differs from the narration; everything else is the house band's.
 */
export const HOOK_TYPE = { top: 262, kicker: 42, kickerGap: 14, size: 96 };

export const HookTitle: React.FC<{ kicker?: string; lines: string[]; frame: number; to: number }> = ({ kicker, lines, frame, to }) => {
  if (frame >= to + 1) return null;
  const out = prog(frame, to - 7, to, (t) => t * t * t);
  const roll = { transform: `translateY(${Math.round(-out * 108)}%)` };
  const clip = { overflow: 'hidden', padding: '0.04em 0.12em 0.12em', margin: '-0.04em 0 -0.12em' } as const;
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: HOOK_TYPE.top, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {kicker && (
        <div style={{ ...clip, marginBottom: HOOK_TYPE.kickerGap - 0.12 * HOOK_TYPE.kicker }}>
          <div
            style={{
              ...roll,
              fontFamily: sans,
              fontSize: HOOK_TYPE.kicker,
              fontWeight: 760,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              lineHeight: 1.1,
              color: INK,
              whiteSpace: 'nowrap',
            }}
          >
            {kicker}
          </div>
        </div>
      )}
      {lines.map((l, k) => (
        <div key={k} style={clip}>
          <div
            style={{
              ...roll,
              fontFamily: sans,
              fontSize: HOOK_TYPE.size,
              fontWeight: 720,
              letterSpacing: '-0.042em',
              lineHeight: 1.02,
              color: INK,
              whiteSpace: 'nowrap',
            }}
          >
            {l}
          </div>
        </div>
      ))}
    </div>
  );
};
