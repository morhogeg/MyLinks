import React from 'react';
import { AbsoluteFill } from 'remotion';
import { KineticLine } from '../../kit/Type';
import type { WordTiming } from '../../kit/Captions';
import { useAdFrame } from './format';

type AdCaption = { at: number; to: number; text: string; pre?: boolean; split?: number; splits?: number[]; hidden?: boolean; place?: string };

/**
 * The narrated lines, the kit's KineticLine in the kit's type (56px, Geist
 * 600), at the shape's line position (format.ts). Two additions for the ad:
 * a `pre` line is on screen, whole, from frame 0 (the poster has to say the
 * hook with the sound off; the narrator still starts it at `at`), and a
 * `split: n` line is spoken whole but shown as two captions, the first
 * leaving as the voice reaches word n and the second arriving on it, so no
 * more than 8 words are ever up at once.
 */
/** a chunk longer than one comfortable line breaks into two balanced rows
 *  (by characters), so no row runs to the frame's edge and no word is left
 *  alone on the second row */
const balanced = (words: string[]) => {
  const text = words.join(' ');
  if (text.length <= 28 || words.length < 4) return text;
  let best = 1;
  let bestDiff = Infinity;
  for (let k = 1; k < words.length; k++) {
    const d = Math.abs(words.slice(0, k).join(' ').length - words.slice(k).join(' ').length);
    if (d < bestDiff) {
      bestDiff = d;
      best = k;
    }
  }
  return `${words.slice(0, best).join(' ')}\n${words.slice(best).join(' ')}`;
};

export const AdCaptions: React.FC<{ frame: number; fps: number; captions: AdCaption[]; timing: WordTiming }> = ({ frame, fps, captions, timing }) => {
  const L = useAdFrame();
  const line = (key: string, text: string, from: number, to: number, starts?: number[]) => (
    <div key={key} style={{ position: 'absolute', left: 0, right: 0, top: L.lineTop, display: 'flex', justifyContent: 'center' }}>
      <KineticLine text={text} frame={frame} from={from} to={to} starts={starts} size={56} width={940} />
    </div>
  );
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {captions.flatMap((c) => {
        // (`hidden`: said, never shown; owner's call for the call to action)
        if (c.place === 'lockup' || c.hidden) return [];
        const t = timing.find((x) => x.frame === c.at);
        const words = c.text.split(/\s+/).filter(Boolean);
        // a `pre` line's words have all landed before frame 0
        if (c.pre && !c.splits?.length && !c.split) return [line(`${c.at}`, c.text, -24, c.to, words.map(() => 0))];
        const starts = t?.words.map((s) => Math.round(s * fps)) ?? [];
        const cuts = c.splits ?? (c.split ? [c.split] : []);
        if (!cuts.length) return [line(`${c.at}`, c.text, c.at, c.to, starts)];
        // consecutive captions: each arrives with its first word and leaves as
        // the next arrives (the last on the line's own `to`); a `pre` line's
        // first caption is up, whole, from frame 0
        const bounds = [0, ...cuts, words.length];
        return bounds.slice(0, -1).map((w0, k) => {
          const w1 = bounds[k + 1];
          const from = c.pre && k === 0 ? -24 : c.at + (starts[w0] ?? 0);
          const to = k < bounds.length - 2 ? c.at + (starts[w1] ?? 0) : c.to;
          const chunkStarts = c.pre && k === 0 ? words.slice(w0, w1).map(() => 0) : starts.slice(w0, w1).map((s) => s - (from - c.at));
          return line(`${c.at}-${k}`, balanced(words.slice(w0, w1)), from, to, chunkStarts);
        });
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
