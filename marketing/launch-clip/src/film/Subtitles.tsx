import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';
import { SUBTITLES, BAR_FRAMES, FPS } from '../../timeline.mjs';
import { sans } from '../fonts';
import VO from './vo.json';

/**
 * Captions, laid out rather than subtitled.
 *
 * Landscape master: product beats put the type in a LEFT COLUMN with the device
 * held right of centre — the editorial two-column setting — and only beats with
 * no device (the scatter, the turn) keep a centred line. A line centred under
 * the device was the wrong place twice over: it sat in the device's shadow, and
 * it made the film look like something with subtitles burned on.
 *
 * Vertical edition: there is no side column, so product-beat lines become a
 * centred block at the TOP of the frame (the device sits lower, leaving that
 * band clear), and device-less lines stay at the bottom.
 *
 * Motion (2026-10-04, owner, for every video: the full captions stay, in the
 * new motion; the old fade-and-slide read "dated and laggy"): each line rises
 * out of its own mask in one decisive move (`IN` frames, ease-out quint, no
 * blur, lines `STAGGER` apart), `LEAD` frames before the narrator's first word
 * (src/film/vo.json), and rolls up out of the same mask in the `OUT` frames
 * before the caption's end. The same as the Meta ad 3 KineticLine
 * (claude/ad-todo 75d129f). The kicker rises with the first line.
 *
 * All motion here lands on WHOLE pixels. Sub-pixel translation forces Chromium
 * to re-rasterize the glyphs every frame, which reads as a shimmer on type this
 * large — one of the two jitters in the Ask beat.
 */

const LEFT_X = 128;
// Narrower than it was: the device now sits further right and much larger, so
// the column gives up width to keep a clean gutter between type and product.
const COLUMN_W = 665;

const OUT_QUINT = (t: number) => 1 - Math.pow(1 - t, 5);
const IN_CUBIC = (t: number) => t * t * t;
const IN = 9;
const STAGGER = 2;
const OUT = 5;
const LEAD = 3;

/** each caption's frames: in `LEAD` before its first spoken word, out on its end */
export const CUE_FRAMES = SUBTITLES.map((s) => {
  const first = (VO as { bar: number; words: number[] }[]).find((v) => v.bar === s.bar)?.words[0] ?? 0;
  return {
    from: Math.round(s.bar * BAR_FRAMES + first * FPS) - LEAD,
    to: Math.round((s.bar + s.bars) * BAR_FRAMES),
  };
});

/** 0 → 1 rising in, 1 → 0 rolling out; and the line's lift in % of its height */
const rise = (local: number, dur: number, k: number) => {
  const tin = OUT_QUINT(Math.min(1, Math.max(0, (local - k * STAGGER) / IN)));
  const tout = IN_CUBIC(Math.min(1, Math.max(0, (local - (dur - OUT) - k) / OUT)));
  return { tin, tout, y: Math.round((1 - tin) * 108 - tout * 108) };
};

/** a block of type, each line in its own mask (taller than the line, so
 *  descenders never clip); `k0` offsets the stagger (a kicker goes first) */
const Masked: React.FC<{ text: string; local: number; dur: number; k0?: number; style: React.CSSProperties; align: 'center' | 'flex-start' }> = ({
  text,
  local,
  dur,
  k0 = 0,
  style,
  align,
}) => (
  <span style={{ display: 'flex', flexDirection: 'column', alignItems: align }}>
    {text.split('\n').map((line, li) => (
      <span key={li} style={{ display: 'block', overflow: 'hidden', padding: '0.06em 0.1em 0.14em', margin: '-0.06em -0.1em -0.14em' }}>
        <span style={{ ...style, display: 'block', transform: `translateY(${rise(local, dur, k0 + li).y}%)` }}>{line}</span>
      </span>
    ))}
  </span>
);

/** the act's kicker: a small letterspaced label */
const KICKER = (size: number): React.CSSProperties => ({
  fontFamily: sans,
  fontSize: size,
  fontWeight: 700,
  letterSpacing: '0.34em',
  textTransform: 'uppercase',
  color: 'rgba(75,85,99,0.72)',
});

export const Subtitles: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height } = useVideoConfig();
  const vertical = height > width;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {SUBTITLES.map((s, i) => {
        const { from, to } = CUE_FRAMES[i];
        const dur = to - from;
        const local = frame - from;
        if (local < 0 || local > dur) return null;
        const k = s.kicker ? 1 : 0; // a kicker rises first, the line just after
        const { tin, tout } = rise(local, dur, 0);
        const o = tin * (1 - tout); // for the rule and the scrim only

        const kicker = (style: React.CSSProperties, align: 'center' | 'flex-start') =>
          s.kicker ? <Masked text={s.kicker} local={local} dur={dur} style={style} align={align} /> : null;
        const line = (style: React.CSSProperties, align: 'center' | 'flex-start') => (
          <Masked text={s.text} local={local} dur={dur} k0={k} style={style} align={align} />
        );

        if (s.place === 'left' && vertical) {
          // the vertical edition's product caption: a centred block at the top
          return (
            <div
              key={s.text}
              style={{
                position: 'absolute',
                left: 60,
                right: 60,
                top: Math.round(height * 0.075),
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 16,
                textAlign: 'center',
              }}
            >
              {kicker(KICKER(17), 'center')}
              <span style={{ maxWidth: 940 }}>
                {line(
                  {
                    fontFamily: sans,
                    fontSize: 56,
                    fontWeight: 500,
                    lineHeight: 1.14,
                    letterSpacing: '-0.026em',
                    color: 'rgba(17,24,39,0.96)',
                    textShadow: '0 1px 2px rgba(255,255,255,0.6), 0 2px 30px rgba(238,240,244,0.9)',
                  },
                  'center',
                )}
              </span>
            </div>
          );
        }

        if (s.place === 'left') {
          return (
            <div
              key={s.text}
              style={{
                position: 'absolute',
                left: LEFT_X,
                top: '50%',
                width: COLUMN_W,
                transform: 'translateY(-50%)',
                display: 'flex',
                gap: 26,
                alignItems: 'stretch',
              }}
            >
              {/* the accent rule grows with the line and leaves with it — the
                  app's own light-mode accent gradient (ink, not chrome) */}
              <div
                style={{
                  width: 3,
                  borderRadius: 2,
                  background: 'linear-gradient(180deg, #34343F, #14141B)',
                  opacity: 0.85,
                  transform: `scaleY(${(tin * (1 - tout)).toFixed(3)})`,
                  transformOrigin: tout > 0 ? 'center bottom' : 'center top',
                }}
              />
              <span style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* The tagline word for this act — CAPTURE / ASK / CONNECT — set
                    as a chapter marker above the line, so a viewer can place each
                    beat inside `Capture. Ask. Connect.` without being told. */}
                {kicker(KICKER(15), 'flex-start')}
                {line(
                  {
                    fontFamily: sans,
                    fontSize: 46,
                    fontWeight: 500,
                    lineHeight: 1.14,
                    letterSpacing: '-0.026em',
                    color: 'rgba(17,24,39,0.96)',
                    textShadow: '0 1px 2px rgba(255,255,255,0.6), 0 2px 30px rgba(238,240,244,0.9)',
                  },
                  'flex-start',
                )}
              </span>
            </div>
          );
        }

        return (
          <React.Fragment key={s.text}>
            {/* a scrim only where a centred line actually needs one — the set
                tone rising to hold the type, never a dark band on paper */}
            <AbsoluteFill
              style={{
                background:
                  'linear-gradient(180deg, rgba(238,240,244,0) 64%, rgba(238,240,244,0.5) 84%, rgba(238,240,244,0.85) 100%)',
                opacity: o,
              }}
            />
            <div
              style={{
                position: 'absolute',
                left: 0,
                right: 0,
                bottom: vertical ? 210 : 92,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 16,
              }}
            >
              {/* centred beats can carry a kicker too — "INTRODUCING" over
                  the turn. Sized as a LINE, not a label (owner note, round
                  13c: it should read as its own line above the name). */}
              {kicker(
                {
                  fontFamily: sans,
                  fontSize: vertical ? 30 : 24,
                  fontWeight: 600,
                  letterSpacing: '0.3em',
                  textTransform: 'uppercase',
                  color: 'rgba(55,63,75,0.8)',
                },
                'center',
              )}
              {/* vertical: a wider measure so a two-sentence line does not
                  orphan its last word onto a third line (the intro, 2026-09-19) */}
              <span style={{ maxWidth: vertical ? 1040 : 1300, padding: vertical ? '0 36px' : '0 60px', textAlign: 'center' }}>
                {line(
                  {
                    fontFamily: sans,
                    fontSize: vertical ? 54 : 44,
                    fontWeight: 500,
                    letterSpacing: '-0.024em',
                    color: 'rgba(17,24,39,0.96)',
                    textShadow: '0 1px 2px rgba(255,255,255,0.6), 0 8px 34px rgba(238,240,244,0.9)',
                    textAlign: 'center',
                  },
                  'center',
                )}
              </span>
            </div>
          </React.Fragment>
        );
      })}
    </AbsoluteFill>
  );
};
