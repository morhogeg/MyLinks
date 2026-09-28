import React from 'react';
import { Bookmark, Image as ImageIcon } from 'lucide-react';
import { sans } from '../../fonts';
import { AnimatedMark, CitationGlyph, MARK_LAUNCH_FRAMES, Wordmark } from '../../ui/Brand';
import { PLATFORM_INK, PlatformMark } from '../../ui/app';
import { EASE_MODAL, mix, prog } from './curves';
import { INK, INK_SOFT } from './Type';

/**
 * Brand pieces for reels. The mark and the wordmark are the app's own
 * components (ui/Brand.tsx carries the shipped path data, ported verbatim);
 * nothing here redraws the identity.
 */

export type SaveKind = 'youtube' | 'instagram' | 'x' | 'web' | 'screenshot';

/**
 * A save, BEFORE Machina: a thing someone kept in some app. The pill mirrors
 * the app's citation chip (a leading mark, a title) on purpose: the same
 * saves come back as citation chips in the Ask beat. Platform marks are the
 * app's own (lucide, as the film uses them), in the app's PLATFORM_RGB hues;
 * a web save wears a bookmark, a screenshot the image glyph.
 */
export const SaveChip: React.FC<{ kind: SaveKind; title: string; style?: React.CSSProperties }> = ({
  kind,
  title,
  style,
}) => {
  const platform = kind === 'youtube' || kind === 'instagram' || kind === 'x';
  const hue = platform ? PLATFORM_INK[kind] : 'rgb(75,85,99)';
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 16,
        height: 78,
        padding: '0 28px 0 13px',
        borderRadius: 22,
        background: '#FFFFFF',
        border: '1px solid rgba(16,24,40,0.07)',
        boxShadow:
          '0 1px 2px rgba(16,24,40,0.06), 0 14px 34px -12px rgba(24,32,48,0.28), 0 30px 60px -30px rgba(24,32,48,0.2)',
        fontFamily: sans,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      <span
        style={{
          width: 52,
          height: 52,
          borderRadius: 15,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: hue,
          background: platform ? hue.replace('rgb(', 'rgba(').replace(')', ', 0.11)') : 'rgba(20,20,27,0.06)',
        }}
      >
        {platform ? (
          <PlatformMark kind={kind} size={27} />
        ) : kind === 'screenshot' ? (
          <ImageIcon size={25} strokeWidth={2} />
        ) : (
          <Bookmark size={25} strokeWidth={2} />
        )}
      </span>
      <span style={{ fontSize: 27, fontWeight: 560, letterSpacing: '-0.012em', color: INK }}>{title}</span>
    </div>
  );
};

/**
 * The Citation mark assembling around a point: `close` 0→1 brings the
 * brackets in from wide (values past 1 overshoot inward, which is how the
 * app's spring snap reads), `dot` 0→1 grows the point.
 */
export const MarkAssembly: React.FC<{ close: number; dot: number; width: number; color?: string }> = ({
  close,
  dot,
  width,
  color = '#14141B',
}) => (
  <div style={{ width, color, lineHeight: 0 }}>
    <CitationGlyph assembly={close} dot={dot} style={{ width: '100%', height: 'auto', overflow: 'visible' }} />
  </div>
);

/**
 * The reel's closing lockup: the mark ARRIVES with the app's own launch
 * motion (AnimatedMark: arms draw, brackets close, the point strikes last),
 * the drawn wordmark wipes in under it, then the subtitle. `strike` is the
 * frame the point should land on (the score's impact); everything is timed
 * back from it.
 */
export const Lockup: React.FC<{
  frame: number;
  strike: number;
  line: string;
  /** absolute frames at which each word of `line` arrives (the narrator's
   *  timing, when the voice speaks the line); default: after the wordmark */
  lineStarts?: number[];
  markWidth?: number;
  wordWidth?: number;
  showLine?: boolean;
  /** the frame the wordmark starts its wipe (default: just after the strike);
   *  pass the frame the narrator says the name */
  wordAt?: number;
  /** 'label': the small letterspaced subtitle; 'statement': the line set
   *  big enough to read as the last thing the reel says (owner, round 4) */
  lineStyle?: 'label' | 'statement';
}> = ({ frame, strike, line, lineStarts, markWidth = 262, wordWidth = 660, showLine = true, wordAt, lineStyle = 'label' }) => {
  // AnimatedMark's point strikes at u ≈ 0.56 of its launch, which runs at the
  // app's own pace (LAUNCH_MS 1300 = 39 frames)
  const LAUNCH = MARK_LAUNCH_FRAMES;
  const start = strike - LAUNCH * 0.56;
  const u = prog(frame, start, start + LAUNCH, (t) => t);
  const bloom = Math.max(0, 1 - Math.max(0, frame - strike) / 30);
  const word = prog(frame, wordAt ?? strike + 2, (wordAt ?? strike + 2) + 14, EASE_MODAL);
  const big = lineStyle === 'statement';
  const sub = prog(frame, strike + 20, strike + 40, EASE_MODAL);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div
        style={{
          width: markWidth,
          color: '#14141B',
          lineHeight: 0,
          filter: `drop-shadow(0 ${10 + bloom * 10}px ${34 + bloom * 40}px rgba(24,32,48,${0.2 + bloom * 0.18}))`,
          transform: `scale(${mix(0.96, 1, prog(frame, start, strike + 10))})`,
          // nothing waits on screen: the mark's first state (four corner
          // ticks) appears only as its launch begins (round 11)
          opacity: prog(frame, start - 6, start, EASE_MODAL),
        }}
      >
        <AnimatedMark id="reel-end" u={u} style={{ width: '100%', height: 'auto' }} />
      </div>
      <div
        style={{
          width: wordWidth,
          marginTop: 70,
          color: '#14141B',
          lineHeight: 0,
          clipPath: `inset(-10% ${(1 - word) * 100}% -10% 0)`,
          transform: `translateY(${Math.round((1 - word) * 12)}px)`,
          filter: 'drop-shadow(0 4px 26px rgba(24,32,48,0.14))',
        }}
      >
        <Wordmark style={{ width: '100%', height: 'auto' }} />
      </div>
      {showLine && (
        <div
          style={{
            marginTop: big ? 58 : 46,
            display: 'flex',
            justifyContent: 'center',
            // a word gap has to out-shout the tracking (0.36em between letters)
            columnGap: big ? '0.25em' : '0.95em',
            // the statement is set in the reel's one voice, Geist, a touch
            // bigger than the lines (round 15: the display serif was the only
            // other face in 81 seconds and read as a font change, not as
            // emphasis; the end card's size and isolation are the emphasis)
            fontFamily: sans,
            // (52: the tagline, 36 characters, fits the 1080 frame with air)
            fontSize: big ? 52 : 25,
            fontWeight: 600,
            letterSpacing: big ? '-0.028em' : '0.36em',
            textTransform: big ? undefined : 'uppercase',
            color: big ? INK : INK_SOFT,
            whiteSpace: 'nowrap',
          }}
        >
          {line
            .replace(big ? /$^/ : /[.]$/, '')
            .split(' ')
            .map((w, k) => {
              const s0 = lineStarts?.[k] ?? strike + 20 + k * 3;
              const t = prog(frame, s0, s0 + (big ? 8 : 10), EASE_MODAL);
              return (
                <span
                  key={k}
                  style={{
                    display: 'inline-block',
                    opacity: big ? Math.min(1, t * 1.6) : t,
                    transform: `translateY(${Math.round((1 - t) * 12)}px)`,
                    filter: big && t < 0.999 ? `blur(${((1 - t) * 12).toFixed(2)}px)` : undefined,
                    marginRight: big ? 0 : '-0.36em',
                  }}
                >
                  {w}
                </span>
              );
            })}
        </div>
      )}
    </div>
  );
};
