import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HEAD_LEAD, Headline, Kicker } from '../../kit/Type';
import { useAdFrame } from './format';

/**
 * The captions as HEADLINES, in the ad's caption band (346px in 9:16, inside
 * Meta's top 270px limit).
 *
 * Round 10 (owner, 2026-10-04): headline captions instead of the full
 * narration, and the word-by-word blur reveal replaced ("dated and laggy").
 * The narrator says every word; the screen shows each line's point (`heads`:
 * [the spoken word it lands on, the headline]) with the kit's `Headline`
 * (Meta ad 3's motion). A headline arrives `HEAD_LEAD` frames before its
 * word and stays until the next one arrives (one clean roll, never two at
 * once); the last of a line before a line with none (the name beat, the
 * lockup) leaves on its line's `to`. A `poster` line's first headline is in
 * place on frame 0. A kicker rides one headline (`kickerChunk`).
 */
export type AdCaption = {
  at: number;
  to: number;
  text: string;
  heads?: [number, string][];
  poster?: boolean;
  place?: 'lockup' | 'voice';
  kicker?: string;
  kickerChunk?: number;
};

type Timing = { frame: number | null; words: number[] };

/** the kicker sits one label above the line (the kit's 290 over 346) */
const KICKER_ABOVE = 56;

/** every headline, with its frames (absolute) */
export const headlinesOf = (captions: AdCaption[], timing: Timing[], fps: number) => {
  const lines = [...captions].sort((a, b) => a.at - b.at);
  const starts = lines.flatMap((c, li) => {
    const t = timing.find((x) => x.frame === c.at);
    return (c.heads ?? []).map(([word, text], k) => ({
      li,
      from: c.poster && k === 0 ? 0 : c.at + Math.round((t?.words[word] ?? 0) * fps) - HEAD_LEAD,
      text,
      poster: !!c.poster && k === 0,
      kicker: c.kickerChunk === k ? c.kicker : undefined,
      lineTo: c.to,
    }));
  });
  return starts.map((h, i) => {
    const next = starts[i + 1];
    // hand over to the next headline when it belongs to this line or the very
    // next one; before a line with no headline, leave with this line
    const to = next && next.li <= h.li + 1 ? next.from : h.lineTo;
    return { ...h, to };
  });
};

export const AdCaptions: React.FC<{ frame: number; fps: number; captions: AdCaption[]; timing: Timing[] }> = ({ frame, fps, captions, timing }) => {
  const { line } = useAdFrame();
  return (
    // over every scene's own stacking (the hook's focused list sits at zIndex 2)
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 10 }}>
      {headlinesOf(captions, timing, fps).map((h) =>
        frame >= h.from - 4 && frame <= h.to + 1 ? (
          <React.Fragment key={h.from}>
            {h.kicker && (
              <div style={{ position: 'absolute', left: 0, right: 0, top: line - KICKER_ABOVE }}>
                <Kicker text={h.kicker} frame={frame} from={h.from - 4} to={h.to} />
              </div>
            )}
            <div style={{ position: 'absolute', left: 0, right: 0, top: line, display: 'flex', justifyContent: 'center' }}>
              <Headline text={h.text} frame={frame} from={h.from} to={h.to} poster={h.poster} />
            </div>
          </React.Fragment>
        ) : null,
      )}
    </AbsoluteFill>
  );
};
