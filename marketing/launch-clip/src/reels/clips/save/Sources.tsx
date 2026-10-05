import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HITS, SOURCES } from '../../../../clips/save-timeline.mjs';
import { AppShot, Lift, Tap } from '../../kit/AppShot';
import { camAt, camVelocity, type Key } from '../../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../../kit/curves';
import { at, center, rectOf, takeOf, type Rect } from '../../kit/takes';
import { SAVE_OPEN_CAM } from '../../scenes/handoff';

/**
 * The source tour (take "sources", capture/shoot.mjs): what each kind of save
 * becomes, in the real app. The app irises open around the + the mark's point
 * became; then, a card at a time, a save lands at the top of the feed, is
 * tapped open (the app's own open), and is read:
 *
 *  YOUTUBE    the Key moments, each timestamp lifted in turn
 *  X          a long-form X Article's Key Points
 *  INSTAGRAM  the post's photo (read along with its caption), lifted
 *  ARTICLE    read down to its Key Points and its "Do this", lifted
 *  NOTE       the note, verbatim; "Summarize with Machina" tapped; Machina's
 *             read opens under it and is read down
 *
 * Each card cuts on the beat from its detail to the next landing. Stepped
 * scrolls (the article, the note's read) never hop: the camera takes up each
 * captured step's rounding (the reel's round-13 fix). OUTPUT frames; rolls
 * were captured at 60fps and play one frame per output frame.
 */

const T = 'sources';
const linear = (t: number) => t;
type K = 'youtube' | 'x' | 'instagram' | 'article' | 'note';
const beatOf = (key: K) => (SOURCES as { key: K; at: number; len: number }[]).find((s) => s.key === key)!;
/** the touch that opens each card, relative to its beat (the app responds on it) */
const OPEN = 40;
const LAND = 36;
const OPEN_N = 40;

/** the next mark after `mark` (or the take's end): where its frames stop */
const markEnd = (mark: string) => {
  const t = takeOf(T);
  const m = t.marks[mark];
  const after = Object.values(t.marks).filter((v) => v > m);
  return after.length ? Math.min(...after) : t.count;
};

/** a stepped scroll: the frame before it, then one captured frame per step */
const stepsOf = (base: number, mark: string) => {
  const first = at(T, mark);
  const last = markEnd(mark) - 1; // the roll's final snap, at the last step
  const out = [base];
  for (let i = first; i < last; i++) out.push(i);
  return out;
};
const ARTICLE_STEPS = stepsOf(at(T, 'articleOpen', OPEN_N - 1), 'articleScroll');
const READ_STEPS = stepsOf(at(T, 'noteRead', 47), 'noteReadScroll');

/** where a stepped scroll is at output frame f: s in steps (fractional) */
const scrollS = (f: number, a: number, b: number, n: number) => prog(f, a, b, EASE_IN_OUT) * (n - 1);
const refY = (frames: number[], ref: string, k: number) => rectOf(T, frames[k], ref)[1];
const wantY = (frames: number[], ref: string, s: number) => {
  const k = Math.min(frames.length - 2, Math.floor(s));
  return mix(refY(frames, ref, k), refY(frames, ref, k + 1), s - k);
};

const YT = beatOf('youtube');
const XX = beatOf('x');
const IG = beatOf('instagram');
const AR = beatOf('article');
const NO = beatOf('note');
/** the article's read-down, and the note's read, in output frames */
const AR_SCROLL: [number, number] = [AR.at + 88, AR.at + 128];
const NOTE_BUSY = 30; // the "Reading your text…" roll
const READ_N = 48; // Machina's read opening
const NO_SCROLL: [number, number] = [NO.at + 176, NO.at + 216];

/** the capture frame on screen at output frame f, and its stepped scroll (if any) */
const frameAt = (f: number): { i: number; steps?: { frames: number[]; ref: string; s: number } } => {
  if (f < YT.at) return { i: at(T, 'home') };
  const b = [...SOURCES].reverse().find((s) => f >= s.at) as { key: K; at: number };
  const r = f - b.at;
  const key = b.key;
  if (r < LAND) return { i: at(T, `${key}Land`, r) };
  if (r < OPEN) return { i: at(T, `${key}Landed`) };
  if (r < OPEN + OPEN_N) return { i: at(T, `${key}Open`, r - OPEN) };
  const held = at(T, `${key}Open`, OPEN_N - 1);
  if (key === 'article') {
    const s = scrollS(f, AR_SCROLL[0], AR_SCROLL[1], ARTICLE_STEPS.length);
    return f < AR_SCROLL[0] ? { i: held } : { i: ARTICLE_STEPS[Math.round(s)], steps: { frames: ARTICLE_STEPS, ref: 'keyPoints', s } };
  }
  if (key === 'note') {
    if (f < HITS.summarizeTap) return { i: held };
    if (f < HITS.noteRead) return { i: at(T, 'noteTap', Math.min(NOTE_BUSY - 1, f - HITS.summarizeTap)) };
    if (f < NO_SCROLL[0]) return { i: at(T, 'noteRead', Math.min(READ_N - 1, f - HITS.noteRead)) };
    const s = scrollS(f, NO_SCROLL[0], NO_SCROLL[1], READ_STEPS.length);
    return { i: READ_STEPS[Math.round(s)], steps: { frames: READ_STEPS, ref: 'read', s } };
  }
  return { i: held };
};

// ── the camera
const FEED_Z = 2.2;
const feedCam = (key: K) => {
  const r = rectOf(T, at(T, `${key}Landed`), 'firstCard');
  return { cx: 196.5, cy: r[1] + r[3] / 2, z: FEED_Z, fx: 540, fy: 1250 };
};
/** each card's read, framed below the caption band */
const DETAIL: Record<K, { cy: number; z: number }> = {
  youtube: { cy: 330, z: 2.35 }, // the Key moments box
  x: { cy: 540, z: 2.2 }, // Key Points and the "Do this"
  instagram: { cy: 450, z: 1.8 }, // the photo, the title, the read of both
  article: { cy: 500, z: 2.15 }, // (after the read-down) Key Points and the "Do this"
  note: { cy: 520, z: 1.95 }, // the note and the Summarize row
};
const detailCam = (key: K, over: Partial<{ cy: number; z: number }> = {}) => ({ cx: 196.5, fx: 540, fy: 1250, ...DETAIL[key], ...over });

const keys: Key[] = (() => {
  const k: Key[] = [
    // the + button, exactly where the mark's point lands (the match cut)
    { f: HITS.toApp, ...SAVE_OPEN_CAM, rx: 9 },
    { f: HITS.toApp + 14, z: 1.56, rx: 0, ease: EASE_MODAL },
    { f: YT.at + 6, z: 1.58, ease: linear },
    // onto the first save landing at the top of the feed
    { f: YT.at + 34, ...feedCam('youtube'), ease: EASE_IN_OUT },
  ];
  (SOURCES as { key: K; at: number; len: number }[]).forEach((b, n) => {
    const fc = feedCam(b.key);
    // a cut on the beat from the last card's read to this landing
    if (n > 0) k.push({ f: b.at, ...fc });
    k.push({ f: b.at + OPEN, ...fc, z: FEED_Z + 0.03, ease: linear });
    if (b.key === 'note') {
      k.push({ f: b.at + OPEN + 30, ...detailCam('note'), ease: EASE_MODAL });
      k.push({ f: HITS.noteRead, ...detailCam('note', { z: 1.97 }), ease: linear });
      // Machina's read opens below the note: follow it down, then read it
      k.push({ f: NO_SCROLL[0], ...detailCam('note', { cy: 640, z: 2.0 }), ease: EASE_IN_OUT });
      k.push({ f: NO_SCROLL[1], ...detailCam('note', { cy: 600, z: 2.1 }), ease: EASE_IN_OUT });
      k.push({ f: b.at + b.len - 1, ...detailCam('note', { cy: 600, z: 2.12 }), ease: linear });
      return;
    }
    k.push({ f: b.at + OPEN + 30, ...detailCam(b.key), ease: EASE_MODAL });
    k.push({ f: b.at + b.len - 1, ...detailCam(b.key, { z: DETAIL[b.key].z + 0.04 }), ease: linear });
  });
  return k;
})();

// ── lifts
const MOMENTS = ['moment1', 'moment2', 'moment3', 'moment4'];
/** the Instagram photo's box, measured from its pixels (the <img>'s own box is
 *  the poster's intrinsic height, not the framed photo) */
const PHOTO: Rect = [16, 150, 361, 341];

export const Sources: React.FC<{ f: number }> = ({ f }) => {
  if (f < HITS.toApp || f >= HITS.shots) return null;
  const { i, steps } = frameAt(f);
  const cam = camAt(keys, f);
  // a stepped scroll: the step on screen vs where the curve wants it
  const view = steps ? { ...cam, cy: cam.cy + (refY(steps.frames, steps.ref, Math.round(steps.s)) - wantY(steps.frames, steps.ref, steps.s)) } : cam;
  const camV = camVelocity(keys, f, 1);
  let motion = camV;
  if (steps) {
    const prev = frameAt(f - 1).steps;
    const dy = prev ? wantY(steps.frames, steps.ref, steps.s) - wantY(prev.frames, prev.ref, prev.s) : 0;
    motion = { ...camV, y: camV.y + dy * cam.z };
  }

  const iris = f < YT.at + 8 ? { x: 196.5, y: 811, r: mix(20, 980, prog(f, HITS.toApp, YT.at + 8, EASE_IN_OUT)) } : null;
  const b = [...SOURCES].reverse().find((s) => f >= s.at) as { key: K; at: number; len: number } | undefined;

  const cardTap = (key: K, bt: { at: number }) => {
    const r = rectOf(T, at(T, `${key}Landed`), 'firstCard');
    const tap = bt.at + OPEN;
    return <Tap key={`tap-${key}`} x={r[0] + 120} y={r[1] + 40} t={prog(f, tap - 7, tap + 12, linear)} />;
  };

  return (
    <AbsoluteFill>
      <AppShot
        take={T}
        i={i}
        cam={view}
        iris={iris}
        shadow={iris ? 0 : 1}
        motion={motion}
        // the glass sheen crosses once as the app opens (off the slab at 0 and 1)
        sheen={f < YT.at + 16 ? prog(f, HITS.toApp, YT.at + 16, EASE_MODAL) : 0}
      >
        {b && cardTap(b.key, b)}

        {/* YouTube: each Key moment, its timestamp first, lifted in turn */}
        {b?.key === 'youtube' &&
          MOMENTS.map((m, k) => {
            const on = prog(f, HITS.moments[k], HITS.moments[k] + 14, EASE_SPRING);
            return on > 0.01 ? <Lift key={m} take={T} i={i} rect={rectOf(T, i, m)} radius={10} lift={on * 0.35} rise={2} grow={0.012} ring={0.5 * on} /> : null;
          })}

        {/* X: the Article's Key Points */}
        {b?.key === 'x' &&
          (() => {
            const on = prog(f, HITS.xPoints, HITS.xPoints + 16, EASE_SPRING);
            const p = rectOf(T, i, 'points');
            return on > 0.01 ? <Lift take={T} i={i} rect={[p[0] - 6, p[1] - 6, p[2] + 12, p[3] + 12]} radius={12} lift={on * 0.35} rise={2} grow={0.01} ring={0.5 * on} /> : null;
          })()}

        {/* Instagram: the photo it read along with the caption */}
        {b?.key === 'instagram' &&
          (() => {
            const on = prog(f, HITS.photo, HITS.photo + 16, EASE_SPRING);
            return on > 0.01 ? <Lift take={T} i={i} rect={PHOTO} radius={16} lift={on * 0.35} rise={2} grow={0.01} ring={0.5 * on} /> : null;
          })()}

        {/* the article: its "Do this", once the read-down has settled */}
        {b?.key === 'article' &&
          (() => {
            const on = prog(f, HITS.articleDo, HITS.articleDo + 16, EASE_SPRING);
            const r = rectOf(T, i, 'takeaway');
            return on > 0.01 ? <Lift take={T} i={i} rect={[r[0] - 6, r[1] - 4, r[2] + 12, r[3] + 8]} radius={12} lift={on * 0.35} rise={2} grow={0.012} ring={0.5 * on} /> : null;
          })()}

        {/* the note: "Summarize with Machina", tapped */}
        {b?.key === 'note' &&
          (() => {
            const c = center(rectOf(T, at(T, 'noteScroll'), 'summarize'));
            return <Tap x={c.x} y={c.y} t={prog(f, HITS.summarizeTap - 7, HITS.summarizeTap + 12, linear)} />;
          })()}
      </AppShot>
    </AbsoluteFill>
  );
};
