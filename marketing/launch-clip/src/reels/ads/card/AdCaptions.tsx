import React from 'react';
import { AbsoluteFill } from 'remotion';
import { KineticLine, Kicker } from '../../kit/Type';
import { useAdFrame } from './format';

/**
 * The narration on screen, in the ad's caption band (the kit's Captions with
 * the slot read from the shape: 346px in 9:16, inside Meta's top 270px limit).
 * Every line is a KineticLine on the narrator's measured word timing; a
 * `poster` line is already set on frame 0 (it arrives before the ad starts),
 * so the first frame reads with the sound off.
 */
export type AdCaption = { at: number; to: number; text: string; size?: number; poster?: boolean; place?: 'lockup'; kicker?: string };
export type AdKicker = { at: number; to: number; text: string };

/** the kicker sits one label above the line (the kit's 290 over 346) */
const KICKER_ABOVE = 56;

export const AdCaptions: React.FC<{ frame: number; fps: number; captions: AdCaption[]; kickers?: AdKicker[]; timing: { frame: number | null; words: number[] }[] }> = ({ frame, fps, captions, kickers = [], timing }) => {
  const { line } = useAdFrame();
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {kickers.map((k) => (
        <div key={`k${k.at}`} style={{ position: 'absolute', left: 0, right: 0, top: line - KICKER_ABOVE }}>
          <Kicker text={k.text} frame={frame} from={k.at} to={k.to} />
        </div>
      ))}
      {captions.map((c) => {
        if (c.place === 'lockup') return null;
        const t = timing.find((x) => x.frame === c.at);
        // a poster line is fully set by frame 0: it "arrives" 30 frames early
        const from = c.poster ? c.at - 40 : c.at;
        const starts = c.poster ? t?.words.map(() => 0) : t?.words.map((s) => Math.round(s * fps));
        return (
          <div key={c.at} style={{ position: 'absolute', left: 0, right: 0, top: line, display: 'flex', justifyContent: 'center' }}>
            <KineticLine text={c.text} frame={frame} from={from} to={c.to} starts={starts} size={c.size ?? 60} width={980} />
          </div>
        );
      })}
    </AbsoluteFill>
  );
};
