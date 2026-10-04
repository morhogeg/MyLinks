import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HEAD_LEAD, KineticLine, Kicker } from '../../kit/Type';
import { useAdFrame } from './format';

/**
 * The narration on screen, in the ad's caption band (the kit's Captions with
 * the slot read from the shape: 346px in 9:16, inside Meta's top 270px limit).
 *
 * Round 5: each spoken line is shown as short CHUNKS (`|` in its text, at
 * most 8 words each), the way a person's sentence lands on screen: a chunk
 * arrives with its first spoken word (the narrator's measured timing) and
 * leaves as the next one arrives; the line's last chunk leaves on the line's
 * `to`. A `poster` line's first chunk is already set on frame 0, so the first
 * frame reads with the sound off. A kicker rides one chunk (`kickerChunk`).
 *
 * Round 11 (owner, 2026-10-04, every video): the full narration stays, in the
 * kit's new motion (KineticLine: each row rises out of its own mask just
 * before its first word, no blur, and rolls up out before it leaves).
 */
export type AdCaption = {
  at: number;
  to: number;
  text: string;
  size?: number;
  poster?: boolean;
  place?: 'lockup' | 'voice';
  kicker?: string;
  kickerChunk?: number;
};

/** the kicker sits one label above the line (the kit's 290 over 346) */
const KICKER_ABOVE = 56;
/** a chunk is gone this many frames before the next one's first word: the
 *  kit's KineticLine rises HEAD_LEAD frames before its word, so the old one
 *  must have rolled out by then (round 11: never two captions at once) */
const HANDOFF = HEAD_LEAD + 1;

export type Chunk = { from: number; to: number; text: string; starts: number[]; kicker?: string; poster?: boolean };

/** the line's chunks, each timed from the narrator's words */
export const chunksOf = (c: AdCaption, timing: { frame: number | null; words: number[] }[], fps: number): Chunk[] => {
  const t = timing.find((x) => x.frame === c.at);
  const words = (t?.words ?? []).map((s) => c.at + Math.round(s * fps));
  const parts = c.text.split('|').map((p) => p.trim());
  let w = 0;
  const raw = parts.map((p, k) => {
    const n = p.split(/\s+/).filter(Boolean).length;
    const first = w;
    w += n;
    return { k, text: p, first, n };
  });
  return raw.map(({ k, text, first, n }) => {
    const from = k === 0 && c.poster ? c.at - 40 : words[first] ?? c.at;
    const next = raw[k + 1];
    const to = next ? (words[next.first] ?? c.to) - HANDOFF : c.to;
    // each word of the chunk arrives on its own spoken time, relative to the chunk
    const starts = k === 0 && c.poster ? Array(n).fill(0) : Array.from({ length: n }, (_, j) => Math.max(0, (words[first + j] ?? from) - from));
    return { from, to, text, starts, kicker: c.kickerChunk === k ? c.kicker : undefined, poster: k === 0 && c.poster };
  });
};

/** every shown chunk in order, each gone before the next one's first word
 *  (also across lines: a line's last chunk never overlaps the next line's) */
export const allChunks = (captions: AdCaption[], timing: { frame: number | null; words: number[] }[], fps: number) => {
  // the lockup draws its own line; a 'voice' line is said, not shown
  const all = captions.filter((c) => !c.place).flatMap((c) => chunksOf(c, timing, fps).map((ch) => ({ ...ch, size: c.size })));
  all.sort((a, b) => a.from - b.from);
  return all.map((ch, i) => {
    const next = all[i + 1];
    return next ? { ...ch, to: Math.min(ch.to, next.from + (next.starts[0] ?? 0) - HANDOFF) } : ch;
  });
};

export const AdCaptions: React.FC<{ frame: number; fps: number; captions: AdCaption[]; timing: { frame: number | null; words: number[] }[] }> = ({ frame, fps, captions, timing }) => {
  const { line } = useAdFrame();
  return (
    // over every scene's own stacking (the hook's focused list sits at zIndex
    // 2 and greyed "the screenshot you…" through its frosted card, round 8)
    <AbsoluteFill style={{ pointerEvents: 'none', zIndex: 10 }}>
      {allChunks(captions, timing, fps).map((ch) => (
          <React.Fragment key={ch.from}>
            {ch.kicker && (
              <div style={{ position: 'absolute', left: 0, right: 0, top: line - KICKER_ABOVE }}>
                <Kicker text={ch.kicker} frame={frame} from={ch.from - 4} to={ch.to} />
              </div>
            )}
            <div style={{ position: 'absolute', left: 0, right: 0, top: line, display: 'flex', justifyContent: 'center' }}>
              <KineticLine text={ch.text} frame={frame} from={ch.from} to={ch.to} starts={ch.starts} size={ch.size ?? 62} width={1000} />
            </div>
          </React.Fragment>
      ))}
    </AbsoluteFill>
  );
};
