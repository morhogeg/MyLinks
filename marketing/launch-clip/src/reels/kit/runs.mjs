/**
 * Frame runs: which captured frame of which take is on the phone at each
 * output frame. THE APP STORE PREVIEW's edit model (clips/preview-timeline.mjs,
 * round 7 on), made a kit part for every video built from simulator takes
 * (LATER NEVER COMES is the first). The preview keeps its own original copy;
 * this one is the same logic, written once for the videos after it.
 *
 * Plain JS: the timeline, the frame extractor, the score and the gates all
 * read it, as well as the picture.
 *
 * A RUN shows a take from output frame `at`: take frame `from` advancing
 * `step` a frame (2 = real time for a 60fps master on a 30fps cut; 0 = held),
 * never past `to`; or an explicit `frames` list, each shown `hold` frames,
 * the last held (`blend`: each one dissolves into the next across its hold,
 * so typed characters fade in instead of popping; `wrap`: from step `at` on,
 * the screen above `above` points is kept from frame `keep`, for when the
 * app nudges a still layout as a field grows). The last run that has started
 * is on screen.
 */

export const run = (at, take, from, step = 2, to = Infinity) => ({ at, take, from, step, to });

/** the source frame of a run list at an output frame (with the next one and how far into it, for a blended run) */
export const runAt = (runs, f) => {
  let r = runs[0];
  for (const x of runs) if (x.at <= f) r = x;
  const k = Math.max(0, Math.floor(f) - r.at);
  const base = { take: r.take, box: r.box, dy: r.dy ?? 0, next: null, mix: 0, top: null };
  if (r.frames) {
    const hold = r.hold ?? 1;
    const j = Math.min(r.frames.length - 1, Math.floor(k / hold));
    const blend = r.blend && j + 1 < r.frames.length && !(r.wrap && j + 1 === r.wrap.at);
    const top = r.wrap && j >= r.wrap.at ? { i: r.wrap.keep, above: r.wrap.above } : null;
    return { ...base, i: r.frames[j], next: blend ? r.frames[j + 1] : null, mix: blend ? (k % hold) / hold : 0, top };
  }
  // a take not measured yet has no frames (not frame 0: Math.min reads null as 0)
  if (r.from == null) return { ...base, i: null };
  return { ...base, i: Math.min(r.to, r.from + r.step * k) };
};

/**
 * Every change of screen dissolves on the one phone (never two phones): the
 * screen before stays under, the one after comes up over it across `len`
 * frames. With `blur` (frame px) it is a cross-blur: the one going softens
 * before the one coming is half up, and the one coming sharpens only once
 * the other has all but gone, so the two never overlap in focus. `blur` 0 is
 * a plain crossfade for the app's small changes; `grow` a breath of depth.
 */
export const fadeAt = (fades, layer, f) => fades.find((x) => x.layer === layer && f >= x.at && f < x.at + x.len);

/**
 * Every source frame a cut uses, per take: each layer's runs over its span,
 * the frame under each fade, the frames a `wrap` keeps. `layers` maps a fade
 * layer name to { runs, span: [from, to) }.
 */
export const usedFrames = ({ total, layers, fades }) => {
  const out = {};
  const add = (s) => {
    if (s.i == null) return;
    (out[s.take] ??= new Set()).add(s.i);
    if (s.next != null) out[s.take].add(s.next);
    if (s.top) out[s.take].add(s.top.i);
  };
  for (const { runs, span } of Object.values(layers)) {
    const [a, b] = span ?? [0, total];
    for (let f = a; f < b; f++) add(runAt(runs, f));
  }
  for (const x of fades) add(runAt(layers[x.layer].runs, x.at - 1));
  return Object.fromEntries(Object.entries(out).map(([take, s]) => [take, [...s].sort((p, q) => p - q)]));
};
