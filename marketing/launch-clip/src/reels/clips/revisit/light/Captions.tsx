import React from 'react';
import { AbsoluteFill } from 'remotion';
import type { ReelCaption, ReelKicker, WordTiming } from '../../../kit/Captions';
import { KineticLine, Kicker } from './Type';

/**
 * (REVISIT's light look: the kit's Captions, on the light Type.)
 *
 * The narration, on screen. Every reel caption is a KineticLine revealed on
 * the narrator's measured word timing, in one of two slots:
 *
 *  - `top`: the default. A centred block in the upper band, clear of the
 *    platform chrome (Reels/TikTok cover roughly the top 12% and the bottom
 *    quarter of a vertical frame) and above the app, which owns the middle.
 *  - `hook`: the same band, set as the name over its promise (a big first
 *    line). It sits ABOVE the mark, never under it: the mark's point drops
 *    out of the bottom of the frame to become the + button.
 *  - `lockup`: not drawn here; the closing lockup sets the line in its own
 *    letterspaced type, on the same word timing.
 *
 * Kickers sit in the same band, one label above the line.
 */
export const SLOTS = { kicker: 290, top: 346 };

export const Captions: React.FC<{
  frame: number;
  fps: number;
  captions: ReelCaption[];
  timing: WordTiming;
  kickers?: ReelKicker[];
  showCaptions?: boolean;
  showKickers?: boolean;
  /** where the kicker and the line sit (default: the reel's SLOTS) */
  slots?: { kicker: number; top: number };
}> = ({ frame, fps, captions, timing, kickers = [], showCaptions = true, showKickers = true, slots = SLOTS }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    {showKickers &&
      kickers.map((k) => (
        <div key={k.at} style={{ position: 'absolute', left: 0, right: 0, top: slots.kicker }}>
          <Kicker text={k.text} frame={frame} from={k.at} to={k.to} />
        </div>
      ))}
    {showCaptions &&
      captions.map((c, i) => {
        // a `lockup` line is set by the lockup itself, in its own type
        // `lockup` and `mark` lines are set by the brand pieces themselves
        if (c.place === 'lockup' || c.place === 'mark') return null;
        const t = timing.find((x) => x.frame === c.at) ?? timing[i];
        const starts = t?.words.map((s) => Math.round(s * fps));
        return (
          <div
            key={c.at}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: slots.top,
              display: 'flex',
              justifyContent: 'center',
            }}
          >
            <KineticLine
              text={c.text}
              frame={frame}
              from={c.at}
              to={c.to}
              starts={starts}
              poster={c.poster}
              size={56}
              sizes={c.sizes ?? (c.place === 'hook' ? [96, 52] : undefined)}
              weight={c.place === 'hook' ? 580 : 600}
              width={c.place === 'hook' ? 960 : 980}
            />
          </div>
        );
      })}
  </AbsoluteFill>
);
