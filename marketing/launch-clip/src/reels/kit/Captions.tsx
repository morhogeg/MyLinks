import React from 'react';
import { AbsoluteFill } from 'remotion';
import { KineticLine, Kicker, type Plate } from './Type';

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
export type ReelCaption = { at: number; to: number; text: string; say?: string; place?: 'top' | 'hook' | 'lockup' | 'mark'; sizes?: number[] };
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

/** a #RRGGBB tone at no opacity, for a gradient that fades it out */
export const clearOf = (hex: string) =>
  `rgba(${parseInt(hex.slice(1, 3), 16)},${parseInt(hex.slice(3, 5), 16)},${parseInt(hex.slice(5, 7), 16)},0)`;

/**
 * THE HOUSE BAND (every video from 2026-10-25 on): FIND THE BOOK's round-5
 * band, made the standard (owner, on it and again on POV: the captions took
 * too much of the frame). The line high in the safe area (Meta keeps the top
 * 14%, 269px, clear) a size down, weight 650, on a shallow paper scrim
 * (solid to 410px, clear by 550px), so the picture owns everything below
 * 550px. Two lines at most.
 */
export const HOUSE_BAND = { top: 268, size: 60, weight: 650, width: 1000, solid: 410, clear: 550 };

export const BandScrim: React.FC<{ opacity?: number; tone?: string; band?: { solid: number; clear: number } }> = ({ opacity = 1, tone = '#EEF0F4', band = BAND }) => (
  <AbsoluteFill
    style={{
      pointerEvents: 'none',
      opacity,
      background: `linear-gradient(180deg, ${tone} 0px, ${tone} ${band.solid}px, ${clearOf(tone)} ${band.clear}px)`,
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
  /** lines fade in and out, never cut by a mask (KineticLine `clean`) */
  clean?: boolean;
  /** with `clean`: each line on a pill of this tone, for lines set over UI
   *  with no paper band under them */
  plate?: Plate;
}> = ({ frame, fps, captions, timing, kickers = [], showCaptions = true, showKickers = true, clean = false, plate }) => (
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
        // `lockup` and `mark` lines are set by the brand pieces themselves
        if (c.place === 'lockup' || c.place === 'mark') return null;
        const t = timing.find((x) => x.frame === c.at) ?? timing[i];
        const starts = t?.words.map((s) => Math.round(s * fps));
        // a clean line waits for the one before it to be gone
        const shown = captions.slice(0, i).filter((p) => p.place !== 'lockup' && p.place !== 'mark');
        const before = shown[shown.length - 1];
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
              sizes={c.sizes ?? (c.place === 'hook' ? [96, 52] : undefined)}
              weight={c.place === 'hook' ? 580 : 600}
              width={c.place === 'hook' ? 960 : 980}
              clean={clean}
              enterAt={clean && before ? before.to + 1 : undefined}
              plate={plate}
            />
          </div>
        );
      })}
  </AbsoluteFill>
);
