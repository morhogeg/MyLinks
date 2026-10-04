import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { SUBTITLES, BAR, BAR_FRAMES, FPS } from '../../timeline.mjs';
import VO from './vo.json';
import { HEAD_LEAD, Headline } from './Headline';

/**
 * The spoken editions' captions as HEADLINES (2026-10-04, owner, for every
 * video): the narrator says every word, the screen shows each line's point
 * (`heads` on SUBTITLES: [the spoken word it lands on, the headline]). Same
 * rules as Meta ad 3 (claude/ad-todo, Chunks.tsx): a headline arrives
 * `HEAD_LEAD` frames before its word (word times from src/film/vo.json,
 * estimated from the voice by audio/synth-vo.py) and stays until the next one
 * arrives, which it hands over to with no overlap; the last one before the
 * endcard leaves with its caption. The endcard keeps its own lockup.
 *
 * Placement follows the film's layouts (Subtitles.tsx): landscape product
 * beats in the left column, device-less beats centred low over the set-tone
 * scrim; the vertical edition puts product beats in the top band. One line
 * everywhere.
 */
type Head = [number, string];
type Cue = { bar: number; bars: number; place: string; heads?: Head[] };
type Timing = { bar: number; words: number[] };

const LEFT_X = 128;

const starts = (SUBTITLES as unknown as Cue[])
  .filter((c) => c.heads)
  .flatMap((c) => {
    const timing = (VO as Timing[]).find((v) => v.bar === c.bar);
    return c.heads!.map(([word, text]) => ({
      from: Math.round((c.bar * BAR + (timing?.words[word] ?? 0)) * FPS) - HEAD_LEAD,
      text,
      place: c.place,
      lineTo: Math.round((c.bar + c.bars) * BAR_FRAMES),
    }));
  });

/** every headline, with its frames (absolute) */
export const HEADLINES = starts.map((h, i) => ({
  ...h,
  to: i + 1 < starts.length ? starts[i + 1].from : h.lineTo,
}));

export const Headlines: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const vertical = height > width;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {HEADLINES.map((h) => {
        if (frame < h.from - 1 || frame > h.to + 1) return null;
        const head = <Headline text={h.text} frame={frame} from={h.from} to={h.to} {...SIZE(h.place, vertical)} />;
        if (h.place === 'left' && vertical) {
          return (
            <div key={h.from} style={{ position: 'absolute', left: 0, right: 0, top: Math.round(height * 0.075), display: 'flex', justifyContent: 'center' }}>
              {head}
            </div>
          );
        }
        if (h.place === 'left') {
          return (
            <div key={h.from} style={{ position: 'absolute', left: LEFT_X, top: '50%', transform: 'translateY(-50%)' }}>
              {head}
            </div>
          );
        }
        // a centred, device-less beat: the set tone rises to hold the type,
        // never a dark band on paper (as the full captions had)
        const fade = Math.min(1, (frame - h.from) / 6, (h.to - frame) / 6);
        return (
          <React.Fragment key={h.from}>
            <AbsoluteFill
              style={{
                background:
                  'linear-gradient(180deg, rgba(238,240,244,0) 64%, rgba(238,240,244,0.5) 84%, rgba(238,240,244,0.85) 100%)',
                opacity: Math.max(0, fade),
              }}
            />
            <div style={{ position: 'absolute', left: 0, right: 0, bottom: vertical ? 210 : 92, display: 'flex', justifyContent: 'center' }}>
              {head}
            </div>
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};

/** type size and measure per layout: one line, inside the safe area */
const SIZE = (place: string, vertical: boolean) =>
  vertical
    ? { size: 64, width: 960, align: 'center' as const }
    : place === 'left'
      ? { size: 58, width: 760, align: 'left' as const }
      : { size: 66, width: 1300, align: 'center' as const };
