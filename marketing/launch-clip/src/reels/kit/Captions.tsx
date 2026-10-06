import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { NIGHT, stageLight } from '../../look';
import { Dither, Haze } from './Paper';
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
export type ReelCaption = { at: number; to: number; text: string; say?: string; place?: 'top' | 'hook' | 'lockup' | 'mark'; sizes?: number[]; poster?: boolean };
export type ReelKicker = { at: number; to: number; text: string };
export type WordTiming = { frame: number | null; words: number[] }[];

export const SLOTS = { kicker: 290, top: 346 };

/**
 * The band the type lives in is the night set itself: app screens that rise
 * into it fade out under a replica of the set (the same light, haze and
 * dither as Paper, so the seam cannot show), opaque to BAND.solid and clear
 * by BAND.clear, so the camera can frame the app big without type ever
 * sitting on UI. Subjects are aimed below BAND.clear.
 */
export const BAND = { solid: 510, clear: 720 };

/** `band`: a video that sets its type higher (a feature clip, `slots` on
 *  Captions) moves its scrim up with it; the default is the reel's */
export const BandScrim: React.FC<{ opacity?: number; band?: { solid: number; clear: number } }> = ({ opacity = 1, band = BAND }) => {
  const frame = useCurrentFrame();
  const mask = `linear-gradient(180deg, #000 0px, #000 ${band.solid}px, rgba(0,0,0,0) ${band.clear}px)`;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity, WebkitMaskImage: mask, maskImage: mask }}>
      <AbsoluteFill style={{ background: NIGHT.set }} />
      <AbsoluteFill style={{ background: stageLight(Math.sin(frame / 180) * 0.5) }} />
      <Haze frame={frame} />
      <Dither />
    </AbsoluteFill>
  );
};

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
