/**
 * The edit of the real app: which captured frame the screen shows at each
 * moment of the film. A sequence is a list of segments laid end to end:
 *
 *   play(label, from, to, { fps })   frames [from, to) at their capture rate
 *                                    (30 for app states, 60 for rolls shot at
 *                                    60fps), or slower with `fps`
 *   hold(label, frame, seconds)      one frame held
 *   glide(label, from, to, seconds, ease)
 *                                    frames [from, to] on a curve (a scroll
 *                                    recorded step by step, played eased)
 *
 * `from` / `to` are mark names from the capture (or indices; a mark plus an
 * offset as ['mark', -1]). Labels become cue times for everything else
 * (camera keys, lifts, captions), so retiming one segment moves the rest.
 */

import { INOUT } from '../engine/ease.js';

export function makeSeq(take, items) {
  const resolve = (f) => {
    if (typeof f === 'number') return f;
    if (Array.isArray(f)) return resolve(f[0]) + f[1];
    const v = take.marks[f];
    if (v === undefined) throw new Error(`no mark "${f}" in take`);
    return v;
  };
  const segs = [];
  const at = {};
  let t = 0;
  for (const it of items) {
    const seg = it(resolve);
    seg.t0 = t;
    seg.t1 = t + seg.dur;
    if (seg.label) at[seg.label] = t;
    segs.push(seg);
    t += seg.dur;
  }
  const frameAt = (time) => {
    let s = segs[segs.length - 1];
    for (const x of segs) {
      if (time < x.t1) {
        s = x;
        break;
      }
    }
    return Math.max(0, Math.min(take.count - 1, s.frame(Math.max(0, time - s.t0))));
  };
  return { segs, at, dur: t, frameAt };
}

export const play = (label, from, to, { fps = 30, skip = [] } = {}) => (resolve) => {
  const f0 = resolve(from);
  const f1 = resolve(to);
  const n = f1 - f0;
  const skipSet = new Set(skip.map(resolve));
  return {
    label,
    dur: n / fps,
    frame: (lt) => {
      let f = f0 + Math.min(n - 1, Math.floor(lt * fps + 1e-6));
      while (skipSet.has(f) && f > f0) f--;
      return f;
    },
  };
};

export const hold = (label, frame, dur) => (resolve) => {
  const f = resolve(frame);
  return { label, dur, frame: () => f };
};

export const glide = (label, from, to, dur, ease = INOUT) => (resolve) => {
  const f0 = resolve(from);
  const f1 = resolve(to);
  return { label, dur, frame: (lt) => Math.round(f0 + (f1 - f0) * ease(Math.min(1, lt / dur))) };
};
