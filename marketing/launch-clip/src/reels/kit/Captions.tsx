import React from 'react';
import { AbsoluteFill } from 'remotion';
import { KineticLine, Kicker } from './Type';

/**
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
export type ReelCaption = { at: number; to: number; text: string; place?: 'top' | 'hook' | 'lockup' };
export type ReelKicker = { at: number; to: number; text: string };
export type WordTiming = { frame: number | null; words: number[] }[];

export const SLOTS = { kicker: 290, top: 346 };

/**
 * The band the type lives in is paper: app screens that rise into it fade
 * out under a gradient of the set tone (opaque to BAND.solid, clear by
 * BAND.clear), so the camera can frame the app big without type ever sitting
 * on UI. Subjects are aimed below BAND.clear.
 */
export const BAND = { solid: 510, clear: 720 };

export const BandScrim: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => (
  <AbsoluteFill
    style={{
      pointerEvents: 'none',
      opacity,
      background: `linear-gradient(180deg, #EEF0F4 0px, #EEF0F4 ${BAND.solid}px, rgba(238,240,244,0) ${BAND.clear}px)`,
    }}
  />
);

export const Captions: React.FC<{
  frame: number;
  fps: number;
  captions: ReelCaption[];
  timing: WordTiming;
  kickers?: ReelKicker[];
  showCaptions?: boolean;
  showKickers?: boolean;
}> = ({ frame, fps, captions, timing, kickers = [], showCaptions = true, showKickers = true }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    {showKickers &&
      kickers.map((k) => (
        <div key={k.at} style={{ position: 'absolute', left: 0, right: 0, top: SLOTS.kicker }}>
          <Kicker text={k.text} frame={frame} from={k.at} to={k.to} />
        </div>
      ))}
    {showCaptions &&
      captions.map((c, i) => {
        // a `lockup` line is set by the lockup itself, in its own type
        if (c.place === 'lockup') return null;
        const t = timing.find((x) => x.frame === c.at) ?? timing[i];
        const starts = t?.words.map((s) => Math.round(s * fps));
        return (
          <div
            key={c.at}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: SLOTS.top,
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
              size={56}
              sizes={c.place === 'hook' ? [96, 52] : undefined}
              weight={c.place === 'hook' ? 580 : 600}
              width={c.place === 'hook' ? 960 : 980}
            />
          </div>
        );
      })}
  </AbsoluteFill>
);
