import React from 'react';
import { sans } from '../../fonts';
import { EASE_IN_OUT, EASE_MODAL, mix, prog } from './curves';
import { NIGHT, typeGlow } from '../../look';

/**
 * Kinetic type. Two voices, one family (Geist, the brand face):
 *
 *  - the LINE: what the narrator says, set big and revealed word by word on
 *    the voice's own timing (src/reels/data/reel-vo.json, measured from the
 *    synthesized audio). Each word rises out of a mask with EASE_MODAL and
 *    leaves the same way, upward, a hair apart. Two lines at most.
 *  - the KICKER: the pillar word (SAVE / FIND / ASK / CONNECT / REVISIT), a
 *    small letterspaced label above the line that names the chapter.
 *
 * Type rules (README "Motion language"): white on the night set, never colour; the line
 * is 56px/1.12 weight 600, tracking -0.028em, two lines at most in a 980px
 * measure (about 10 words);
 * nothing moves sub-pixel on a hold (whole-pixel rounding, the film's
 * shimmer lesson).
 */

/** (the night look, 2026-10-05: white on the night set; the names are the
 *  light grade's, kept so every scene picks the new type up unchanged) */
export const INK = NIGHT.ink;
export const INK_SOFT = NIGHT.inkSoft;

/** frames the whole line takes to leave, and its curve: eased in AND out
 *  (round 13: on EASE_MODAL half the fade happened on the first frame, so a
 *  line blinked out instead of leaving) */
const LINE_OUT = 8;
const EXIT = EASE_IN_OUT;

/**
 * One narrated line, LINE BY LINE (round 6, owner: the word-by-word mask
 * rise read "dated and sluggish"). Each line arrives when the narrator
 * reaches its first word (`starts`, frames relative to `from`, one per
 * word); its words then cascade in 1.5 frames apart, each coming into focus
 * (blur → sharp) with a small lift: the line lands as one gesture, centred,
 * and never sits half-built at the left edge. It leaves the same way,
 * together, in 6 frames, finishing on `to`. A "\n" is a hard break; `sizes`
 * sets a size per line (a name over its promise), else every line is `size`.
 */
export const KineticLine: React.FC<{
  text: string;
  frame: number;
  from: number;
  to: number;
  starts?: number[];
  size?: number;
  sizes?: number[];
  width?: number;
  align?: 'center' | 'left';
  color?: string;
  weight?: number;
  font?: string;
  tracking?: string;
  /** already set on frame 0 (a video's opening line: the frame a feed shows
   *  before it plays is the poster); it still leaves in its own motion */
  poster?: boolean;
}> = ({ text, frame, from, to, starts, size = 64, sizes, width = 940, align = 'center', color = INK, weight = 600, font = sans, tracking = '-0.028em', poster = false }) => {
  // (2026-10-04, owner: the word-by-word blur reveal read "dated and laggy";
  // the full captions stay, in the Headline motion) each LINE rises out of
  // its own mask in one decisive move (HEAD_IN frames, ease-out quint, no
  // blur), HEAD_LEAD frames before its first word is said, and rolls up out
  // of the same mask in the HEAD_OUT frames before `to`. Same props as ever.
  const first = starts?.[0] ?? 0;
  if ((!poster && frame < from + Math.min(0, first) - HEAD_LEAD - 1) || frame > to + 1) return null;
  const local = frame - from;
  const lines = text.split('\n').map((l) => l.split(' ').filter(Boolean));
  const outStart = to - from - HEAD_OUT;
  let w = -1;
  return (
    <div style={{ width, display: 'flex', flexDirection: 'column', alignItems: align === 'center' ? 'center' : 'flex-start', gap: 2, filter: typeGlow(0.8) }}>
      {lines.map((words, li) => {
        const firstWord = w + 1;
        w += words.length;
        const lineStart = starts?.[firstWord] ?? li * HEAD_STAGGER;
        const tin = poster ? 1 : OUT_QUINT(Math.min(1, Math.max(0, (local - lineStart + HEAD_LEAD) / HEAD_IN)));
        const tout = IN_CUBIC(Math.min(1, Math.max(0, (local - outStart - li) / HEAD_OUT)));
        const y = (1 - tin) * 108 - tout * 108;
        return (
          // the mask: a little taller than the line, so descenders never clip
          <div key={li} style={{ overflow: 'hidden', padding: '0.06em 0.1em 0.14em', margin: '-0.06em 0 -0.14em' }}>
            <div
              style={{
                transform: `translateY(${Math.round(y)}%)`,
                fontFamily: font,
                fontSize: sizes?.[li] ?? size,
                fontWeight: weight,
                lineHeight: 1.12,
                letterSpacing: tracking,
                color,
                textAlign: align,
              }}
            >
              {words.join(' ')}
            </div>
          </div>
        );
      })}
    </div>
  );
};

/**
 * The pillar word (SAVE / FIND / ASK / CONNECT / REVISIT): a small
 * letterspaced label above the line. It arrives on the scene's first beat,
 * letter by letter coming into focus (0.8 frames apart), while its tracking
 * settles; it leaves with its line, in the line's own gesture. Restraint is the point: the energy of a
 * cut belongs to the picture, the label only names the chapter.
 */
export const Kicker: React.FC<{ text: string; frame: number; from: number; to: number }> = ({ text, frame, from, to }) => {
  if (frame < from || frame > to) return null;
  const local = frame - from;
  // leaves WITH its line (round 11): the same blur-and-rise, ending on the
  // same frame, so label and line go as one
  const out = prog(frame, to - LINE_OUT, to, EXIT);
  const track = mix(0.62, 0.44, prog(local, 0, 14, EASE_MODAL));
  const letters = text.toUpperCase().split('');
  // the word alone, no rule beside it (owner, round 10)
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        opacity: 1 - out,
        filter: out > 0.01 ? `blur(${(out * 8).toFixed(2)}px)` : undefined,
        transform: `translateY(${Math.round(-out * 10)}px)`,
      }}
    >
      <div style={{ display: 'flex' }}>
        {letters.map((ch, k) => {
          const t = prog(local, k * 0.8, k * 0.8 + 7, EASE_MODAL);
          return (
            <span
              key={k}
              style={{
                display: 'inline-block',
                fontFamily: sans,
                fontSize: 25,
                fontWeight: 650,
                // no tracking after the last letter, so the word sits centred
                letterSpacing: k === letters.length - 1 ? 0 : `${track}em`,
                color: INK_SOFT,
                opacity: Math.min(1, t * 1.6),
                filter: t < 0.999 ? `blur(${((1 - t) * 6).toFixed(2)}px)` : undefined,
              }}
            >
              {ch}
            </span>
          );
        })}
      </div>
    </div>
  );
};

/** a quick, decisive ease-out (quint): fast off the mark, long soft landing */
const OUT_QUINT = (t: number) => 1 - Math.pow(1 - t, 5);
const IN_CUBIC = (t: number) => t * t * t;
/** frames a headline line takes to rise in; between lines; to roll out */
const HEAD_IN = 9;
const HEAD_STAGGER = 2;
const HEAD_OUT = 5;
/** a headline arrives this many frames BEFORE its anchor word: the eye leads
 *  the ear (word times are estimated, and late text reads as lag) */
export const HEAD_LEAD = 3;

/**
 * A HEADLINE (2026-10-04, owner: headline captions instead of the full
 * narration; the word-by-word blur reveal read "dated and laggy"). The voice
 * says the whole line; the screen carries its point in 2–5 words, so a muted
 * viewer still follows the story and the app keeps the frame.
 *
 * Motion: each line rises out of its own mask in one decisive move
 * (`HEAD_IN` frames, ease-out quint, lines `HEAD_STAGGER` apart), no blur;
 * it leaves by rolling up out of the same mask (`HEAD_OUT` frames) just
 * before the next one rises: one clean roll, never two headlines at once.
 * (A `*phrase*` mark is ignored: the owner rejected the highlighter.) `poster`: already in place on its first frame
 * (frame 0 of a feed ad). Ink on paper; whole-pixel moves on the hold.
 */
export const Headline: React.FC<{
  text: string;
  frame: number;
  from: number;
  to: number;
  poster?: boolean;
  size?: number;
  width?: number;
  color?: string;
}> = ({ text, frame, from, to, poster = false, size = 66, width = 980, color = INK }) => {
  if (frame < from - 1 || frame > to + 1) return null;
  const local = frame - from;
  const lines = text.split('\n');
  const outStart = to - from - HEAD_OUT;
  return (
    <div style={{ width, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      {lines.map((line, li) => {
        const tin = poster ? 1 : OUT_QUINT(Math.min(1, Math.max(0, (local - li * HEAD_STAGGER) / HEAD_IN)));
        const tout = IN_CUBIC(Math.min(1, Math.max(0, (local - outStart - li) / HEAD_OUT)));
        const y = (1 - tin) * 108 - tout * 108;
        const parts = line.split('*');
        return (
          // the mask: a little taller than the line, so descenders never clip
          <div key={li} style={{ overflow: 'hidden', padding: '0.06em 0.1em 0.14em', margin: '-0.06em 0 -0.14em' }}>
            <div
              style={{
                transform: `translateY(${Math.round(y)}%)`,
                fontFamily: sans,
                fontSize: size,
                fontWeight: 700,
                lineHeight: 1.08,
                letterSpacing: '-0.034em',
                color,
                textAlign: 'center',
                whiteSpace: 'nowrap',
              }}
            >
              {/* (owner, 2026-10-04: the grey highlight was "terrible": `*…*` now reads as plain text) */}
              {parts.join('')}
            </div>
          </div>
        );
      })}
    </div>
  );
};
