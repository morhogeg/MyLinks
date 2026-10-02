import React from 'react';
import { AbsoluteFill } from 'remotion';
import { KineticLine } from '../../kit/Type';
import type { WordTiming } from '../../kit/Captions';
import { useAdFrame } from './format';

type AdCaption = { at: number; to: number; text: string; pre?: boolean; place?: string };

/**
 * The narrated lines, the kit's KineticLine in the kit's type (56px, Geist
 * 600), at the shape's line position (format.ts). One addition for the ad:
 * a `pre` line is on screen, whole, from frame 0 (the poster has to say the
 * hook with the sound off); the narrator still starts it at `at`.
 */
export const AdCaptions: React.FC<{ frame: number; fps: number; captions: AdCaption[]; timing: WordTiming }> = ({ frame, fps, captions, timing }) => {
  const L = useAdFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {captions.map((c) => {
        if (c.place === 'lockup') return null;
        const t = timing.find((x) => x.frame === c.at);
        const words = c.text.split(/\s+/).filter(Boolean);
        // a `pre` line's words have all landed before frame 0
        const from = c.pre ? -24 : c.at;
        const starts = c.pre ? words.map(() => 0) : t?.words.map((s) => Math.round(s * fps));
        return (
          <div key={c.at} style={{ position: 'absolute', left: 0, right: 0, top: L.lineTop, display: 'flex', justifyContent: 'center' }}>
            <KineticLine text={c.text} frame={frame} from={from} to={c.to} starts={starts} size={56} width={980} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** the band the line lives in is paper: app screens fade out under it */
export const AdBandScrim: React.FC<{ opacity?: number }> = ({ opacity = 1 }) => {
  const { band } = useAdFrame();
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        opacity,
        background: `linear-gradient(180deg, #EEF0F4 0px, #EEF0F4 ${band.solid}px, rgba(238,240,244,0) ${band.clear}px)`,
      }}
    />
  );
};
