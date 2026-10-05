import React from 'react';
import { Bookmark, Image as ImageIcon } from 'lucide-react';
import { sans } from '../../fonts';
import { AnimatedMark, CitationGlyph, MARK_LAUNCH_FRAMES, Wordmark } from '../../ui/Brand';
import { PLATFORM_INK, PlatformMark } from '../../ui/app';
import { EASE_MODAL, mix, prog } from './curves';
import { INK, INK_SOFT } from './Type';
import { NIGHT, typeGlow } from '../../look';

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
 * a web save wears a bookmark, a screenshot the image glyph. On the night
 * set it is dark glass: the app's card tone, a hairline of light on its top
 * edge, a deep shadow.
 */
export const SaveChip: React.FC<{ kind: SaveKind; title: string; style?: React.CSSProperties }> = ({
  kind,
  title,
  style,
}) => {
  const platform = kind === 'youtube' || kind === 'instagram' || kind === 'x';
  const hue = platform ? PLATFORM_INK[kind] : 'rgb(196,202,216)';
  return (
    <div
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 16,
        height: 78,
        padding: '0 28px 0 13px',
        borderRadius: 22,
        background: 'linear-gradient(180deg, #1D1D21 0%, #141417 100%)',
        border: `1px solid ${NIGHT.cardEdge}`,
        boxShadow:
          'inset 0 1px 0 rgba(255,255,255,0.07), 0 1px 2px rgba(0,0,0,0.5), 0 16px 38px -12px rgba(0,0,0,0.8), 0 34px 64px -30px rgba(0,0,0,0.7)',
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
          background: platform ? hue.replace('rgb(', 'rgba(').replace(')', ', 0.16)') : 'rgba(255,255,255,0.07)',
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
  color = NIGHT.ink,
}) => (
  <div style={{ width, color, lineHeight: 0, filter: typeGlow(1.2) }}>
    <CitationGlyph assembly={close} dot={dot} style={{ width: '100%', height: 'auto', overflow: 'visible' }} />
  </div>
);

/**
 * The reel's closing lockup: the mark ARRIVES with the app's own launch
 * motion (AnimatedMark: arms draw, brackets close, the point strikes last),
 * the drawn wordmark wipes in under it, then the line. `strike` is the
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
  /** the statement's size in px (default 60); a clip that keeps the tagline
   *  on ONE row sets it smaller so the row fits the frame */
  lineSize?: number;
}> = ({ frame, strike, line, lineStarts, markWidth = 262, wordWidth = 660, showLine = true, wordAt, lineStyle = 'label', lineSize = 60 }) => {
  // AnimatedMark's point strikes at u ≈ 0.56 of its launch, which runs at the
  // app's own pace (LAUNCH_MS 1300 = 39 frames)
  const LAUNCH = MARK_LAUNCH_FRAMES;
  const start = strike - LAUNCH * 0.56;
  const u = prog(frame, start, start + LAUNCH, (t) => t);
  const bloom = Math.max(0, 1 - Math.max(0, frame - strike) / 30);
  const word = prog(frame, wordAt ?? strike + 2, (wordAt ?? strike + 2) + 14, EASE_MODAL);
  const big = lineStyle === 'statement';
  const sub = prog(frame, strike + 20, strike + 40, EASE_MODAL);
  // the strike's light: a burst behind the mark, out and gone in a second
  const burst = prog(frame, strike - 1, strike + 26, (t) => t);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
      {frame >= strike - 1 && burst < 1 && (
        <div
          style={{
            position: 'absolute',
            left: '50%',
            top: markWidth * 0.43,
            width: markWidth * 5,
            height: markWidth * 5,
            transform: `translate(-50%, -50%) scale(${(0.35 + 0.9 * Math.sqrt(burst)).toFixed(4)})`,
            borderRadius: '50%',
            background: `radial-gradient(circle, rgba(225,232,255,${(0.55 * (1 - burst) ** 1.6).toFixed(4)}) 0%, rgba(${NIGHT.glow},${(0.22 * (1 - burst) ** 1.6).toFixed(4)}) 28%, rgba(${NIGHT.glow},0) 62%)`,
            pointerEvents: 'none',
          }}
        />
      )}
      <div
        style={{
          width: markWidth,
          color: NIGHT.ink,
          lineHeight: 0,
          filter: `drop-shadow(0 0 ${22 + bloom * 34}px rgba(${NIGHT.glow},${(0.32 + bloom * 0.4).toFixed(3)}))`,
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
          color: NIGHT.ink,
          lineHeight: 0,
          clipPath: `inset(-10% ${(1 - word) * 100}% -10% 0)`,
          transform: `translateY(${Math.round((1 - word) * 12)}px)`,
          filter: typeGlow(1.1),
        }}
      >
        <Wordmark style={{ width: '100%', height: 'auto' }} />
      </div>
      {showLine &&
        // a "\n" in `line` starts a new row (the tagline breaks at its comma:
        // "Everything you save," / "finally useful."); words keep one running
        // index across rows, so `lineStarts` still lines up with the voice
        line.split('\n').map((row, r, rows) => {
          const first = rows.slice(0, r).reduce((n, x) => n + x.split(' ').length, 0);
          return (
        <div
          key={r}
          style={{
            marginTop: r > 0 ? (big ? 4 : 10) : big ? 58 : 46,
            display: 'flex',
            justifyContent: 'center',
            // a word gap has to out-shout the tracking (0.36em between letters)
            columnGap: big ? '0.25em' : '0.95em',
            // the statement is set in the reel's one voice, Geist, a touch
            // bigger than the lines (round 15: the display serif was the only
            // other face in 81 seconds and read as a font change, not as
            // emphasis; the end card's size and isolation are the emphasis)
            fontFamily: sans,
            fontSize: big ? lineSize : 25,
            fontWeight: 600,
            letterSpacing: big ? '-0.028em' : '0.36em',
            textTransform: big ? undefined : 'uppercase',
            color: big ? INK : INK_SOFT,
            whiteSpace: 'nowrap',
            filter: big ? typeGlow(1) : undefined,
          }}
        >
          {row
            .replace(big || r < rows.length - 1 ? /$^/ : /[.]$/, '')
            .split(' ')
            .map((w, j) => {
              const k = first + j;
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
          );
        })}
    </div>
  );
};
