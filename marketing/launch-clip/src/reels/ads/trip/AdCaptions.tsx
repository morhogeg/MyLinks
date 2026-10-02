import React from 'react';
import { AbsoluteFill } from 'remotion';
import { KineticLine } from '../../kit/Type';
import type { WordTiming } from '../../kit/Captions';
import { useAdFrame } from './format';

type AdCaption = { at: number; to: number; text: string; pre?: boolean; split?: number; place?: string };

/**
 * The narrated lines, the kit's KineticLine in the kit's type (56px, Geist
 * 600), at the shape's line position (format.ts). Two additions for the ad:
 * a `pre` line is on screen, whole, from frame 0 (the poster has to say the
 * hook with the sound off; the narrator still starts it at `at`), and a
 * `split: n` line is spoken whole but shown as two captions, the first
 * leaving as the voice reaches word n and the second arriving on it, so no
 * more than 8 words are ever up at once.
 */
export const AdCaptions: React.FC<{ frame: number; fps: number; captions: AdCaption[]; timing: WordTiming }> = ({ frame, fps, captions, timing }) => {
  const L = useAdFrame();
  const line = (key: string, text: string, from: number, to: number, starts?: number[]) => (
    <div key={key} style={{ position: 'absolute', left: 0, right: 0, top: L.lineTop, display: 'flex', justifyContent: 'center' }}>
      <KineticLine text={text} frame={frame} from={from} to={to} starts={starts} size={56} width={980} />
    </div>
  );
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {captions.flatMap((c) => {
        if (c.place === 'lockup') return [];
        const t = timing.find((x) => x.frame === c.at);
        const words = c.text.split(/\s+/).filter(Boolean);
        // a `pre` line's words have all landed before frame 0
        if (c.pre) return [line(`${c.at}`, c.text, -24, c.to, words.map(() => 0))];
        const starts = t?.words.map((s) => Math.round(s * fps)) ?? [];
        if (!c.split) return [line(`${c.at}`, c.text, c.at, c.to, starts)];
        // two captions: the break falls at word `split`, wherever the "\n" is
        const rows = c.text.split('\n');
        const first = rows[0];
        const second = rows.slice(1).join(' ');
        const turn = c.at + (starts[c.split] ?? 0);
        return [
          line(`${c.at}a`, first, c.at, turn, starts.slice(0, c.split)),
          line(`${c.at}b`, second, turn, c.to, starts.slice(c.split).map((s) => s - (turn - c.at))),
        ];
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
