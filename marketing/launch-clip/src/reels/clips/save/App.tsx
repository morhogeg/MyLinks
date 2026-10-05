import React from 'react';
import { AbsoluteFill } from 'remotion';
import { HITS, PLAY, SCROLLS, THROW_LEN } from '../../../../clips/save-timeline.mjs';
import { AppShot, Lift, Tap } from '../../kit/AppShot';
import { camAt, camVelocity, type Key } from '../../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../../kit/curves';
import { at, center, rectOf, takeOf, type Rect } from '../../kit/takes';
import { SAVE_OPEN_CAM } from '../../scenes/handoff';

/**
 * The feature in the real app (take "saveclip", capture/shoot.mjs), from the
 * cut to the feed after the source tour (Sources.tsx) to the throw into the
 * lockup:
 *
 *  SCREENSHOTS  Add to Machina, lifted off its screen (the app darkens the
 *               screen behind it; the reel's grade never flips): the Image
 *               tab tapped, three screens of one post picked ("Screens of one
 *               post, read in this order."), Save tapped; the dialog drops
 *               away into the feed.
 *  KEY POINTS   the feed's own working card, "Reading 3 screenshots…", with
 *               the app's banner reading the text; the card it becomes; the
 *               card opened (its screenshots, the gist) and read down to its
 *               Key Points, lifted.
 *  TAGS & LINKS read on down to the "Do this", the tags and the Related cards,
 *               each lifted on a beat.
 *
 * Every pixel of the app is the capture; the added things are the camera,
 * the taps and the lifts (the reel kit). OUTPUT frames; rolls were captured at
 * 60fps and play one frame per output frame.
 */

const T = 'saveclip';
const linear = (t: number) => t;
type Seg = keyof typeof PLAY;
const seg = (mark: Seg, f: number) => at(T, mark, Math.min(PLAY[mark].n - 1, Math.max(0, f - PLAY[mark].at)));

// ── the read-down: the capture scrolls the detail view in 5pt steps; step 0
// is the opened view. The camera takes up each step's rounding (the reel's
// round-13 fix), measured on the Key Points list, which every step measures.
const STEPS = takeOf(T).count - at(T, 'detailScroll');
const stepFrame = (k: number) => (k <= 0 ? at(T, 'detail', PLAY.detail.n - 1) : at(T, 'detailScroll', k - 1));
const refY = (k: number) => rectOf(T, stepFrame(k), 'points')[1];
/** the step that puts the Key Points heading at 250pt, under the caption band */
const KP_STEP = (() => {
  let best = 0;
  for (let k = 0; k <= STEPS; k++) if (Math.abs(rectOf(T, stepFrame(k), 'keyPoints')[1] - 250) < Math.abs(rectOf(T, stepFrame(best), 'keyPoints')[1] - 250)) best = k;
  return best;
})();
const TARGET: Record<string, number> = { keyPoints: KP_STEP, end: STEPS };
const scrollAt = (f: number) => {
  let s = 0;
  for (const [a, b, to] of SCROLLS as [number, number, string][]) if (f >= a) s = mix(s, TARGET[to], prog(f, a, b, EASE_IN_OUT));
  return s;
};
const wantY = (s: number) => {
  const k = Math.min(STEPS - 1, Math.floor(s));
  return mix(refY(k), refY(k + 1), s - k);
};

const [S1a, S1b] = SCROLLS[0] as [number, number, string];
const [S2a, S2b] = SCROLLS[1] as [number, number, string];

/** the capture frame on the screen behind (or, once saved, the screen) */
const screenFrame = (f: number) => {
  if (f < PLAY.saving.at) return at(T, 'home');
  if (f < PLAY.reading.at) return seg('saving', f);
  if (f < PLAY.done.at) return seg('reading', f);
  if (f < PLAY.detail.at) return seg('done', f);
  if (f < S1a) return seg('detail', f);
  return stepFrame(Math.round(scrollAt(f)));
};
/** the capture frame the lifted dialog shows */
const dialogFrame = (f: number) =>
  f < PLAY.modeImage.at ? at(T, 'dialogOpen', PLAY.dialogOpen.n - 1) : f < PLAY.picked.at ? seg('modeImage', f) : seg('picked', f);

// ── the screen's camera
const keys: Key[] = [
  // a cut on the beat from the source tour to the feed, framed on the +
  // (the framing the iris opened on)
  { f: HITS.shots, ...SAVE_OPEN_CAM, z: 1.56, rx: 0 },
  { f: HITS.plusTap, z: 1.54, ease: linear },
  // pushed back behind the lifted dialog, answering the + tap
  { f: HITS.dialog + 8, cx: 196.5, cy: 430, z: 1.38, fx: 540, fy: 1190, ease: EASE_IN_OUT },
  { f: HITS.saveTap + 6, z: 1.42, ease: linear },
  // the feed: the working card and the app's banner, once the dialog has gone
  { f: HITS.saveTap + 23, cy: 451, z: 2.0, fy: 1300, ease: EASE_IN_OUT },
  { f: HITS.cardTap, cy: 448, z: 2.04, ease: linear },
  // opened: the screenshots, the title, the gist
  { f: HITS.cardTap + 28, cy: 395, z: 2.1, fy: 1290, ease: EASE_MODAL },
  { f: S1a, cy: 396, z: 2.12, ease: linear },
  // down to the Key Points, with the scroll
  { f: S1b, cy: 400, z: 2.3, fy: 1310, ease: EASE_IN_OUT },
  { f: S2a, cy: 402, z: 2.32, ease: linear },
  // on down to the tags and the Related cards
  { f: S2b, cy: 552, z: 2.2, fy: 1304, ease: EASE_IN_OUT },
  { f: HITS.throw, cy: 556, z: 2.25, ease: linear },
  // thrown out of frame, into the lockup
  { f: HITS.throw + THROW_LEN, fx: -760, z: 2.3, ease: EASE_IN_OUT },
];

// ── the lifted dialog's camera: framed whole, then onto the screens picked,
// then dropped away into the feed as Save is answered
const dKeys: Key[] = [
  // it rises into place (the app's arrival curve) over the screen racking out
  { f: HITS.dialog, cx: 196.5, cy: 426, z: 2.25, fx: 540, fy: 1420 },
  { f: HITS.dialog + 14, z: 2.4, fy: 1300, ease: EASE_MODAL },
  { f: HITS.imageTap + 16, cy: 427, z: 2.42, ease: linear },
  // onto the drop zone BEFORE the pick, so the screens land on a still frame
  { f: HITS.pick - 4, cy: 520, z: 2.8, fy: 1300, ease: EASE_IN_OUT },
  { f: HITS.saveTap + 2, cy: 522, z: 2.86, ease: linear },
  // Save answered: it settles away and is gone while the screen behind is
  // still soft, so the two never show at once
  { f: HITS.saveTap + 10, z: 2.76, fy: 1360, ease: EASE_IN_OUT },
];

/** the tag pills on the read-down's last step (measured from its pixels: the
 *  capture's "tags" box is the row's container, far wider than the pills) */
const TAG_PILLS: Rect = [12, 308, 305, 34];

/** the two Related cards, whole (the capture measures their titles; the card
 *  runs 13pt above the title, 82pt and 87pt tall) */
const relatedBox = (i: number, k: 1 | 2): Rect => {
  const r = rectOf(T, i, `related${k}`);
  return k === 1 ? [16, r[1] - 13, 361, 82] : [16, r[1] - 12.5, 361, 87];
};

export const App: React.FC<{ f: number }> = ({ f }) => {
  if (f < HITS.shots || f > HITS.throw + THROW_LEN) return null;

  const i = screenFrame(f);
  const s = scrollAt(f);
  const scrolling = f >= S1a;
  const cam = camAt(keys, f);
  const step = Math.round(s);
  // the step on screen vs where the scroll curve wants it (points)
  const view = scrolling ? { ...cam, cy: cam.cy + (refY(step) - wantY(s)) } : cam;
  const camV = camVelocity(keys, f, 1);
  const motion = scrolling ? { x: camV.x, y: camV.y + (wantY(s) - wantY(scrollAt(f - 1))) * cam.z } : camV;

  // behind the dialog: out of focus, racking into focus as it drops away
  // (it racks out ahead of the dialog, so the dialog never fades in over sharp type)
  const behind = prog(f, HITS.plusTap + 1, HITS.dialog + 4, EASE_IN_OUT) * (1 - prog(f, HITS.saveTap + 8, HITS.saveTap + 20, EASE_IN_OUT));

  // the dialog, lifted
  const di = dialogFrame(f);
  const dRect = rectOf(T, di, 'dialog');
  const dIn = prog(f, HITS.dialog, HITS.dialog + 6, EASE_IN_OUT);
  const dOut = prog(f, HITS.saveTap + 2, HITS.saveTap + 9, EASE_IN_OUT);

  const plus = center(rectOf(T, 0, 'plus'));
  const tabImage = rectOf(T, at(T, 'modeImage', 23), 'tabImage');
  const dropzone = center(rectOf(T, at(T, 'modeImage', 23), 'dropzone'));
  const strip = rectOf(T, at(T, 'picked', 23), 'strip');
  const save = center(rectOf(T, at(T, 'picked', 23), 'save'));
  const card = rectOf(T, at(T, 'landed'), 'firstCard');

  // lifts, each on its beat, each gone before its screen moves fast
  const tabRing = prog(f, HITS.imageTap + 1, HITS.imageTap + 7, EASE_SPRING) * (1 - prog(f, HITS.imageTap + 8, HITS.imageTap + 16, EASE_IN_OUT));
  const stripIn = prog(f, HITS.pick + 8, HITS.pick + 20, EASE_SPRING);
  const stripOut = prog(f, HITS.saveTap - 14, HITS.saveTap - 4, EASE_IN_OUT);
  const landIn = prog(f, HITS.cardDone + 8, HITS.cardDone + 20, EASE_SPRING);
  const landOut = prog(f, HITS.cardTap - 14, HITS.cardTap - 4, EASE_IN_OUT);
  const kpIn = prog(f, HITS.keyPoints, HITS.keyPoints + 16, EASE_SPRING);
  const kpOut = prog(f, S2a - 14, S2a - 2, EASE_IN_OUT);
  const tagIn = prog(f, HITS.tags, HITS.tags + 16, EASE_SPRING);
  const relIn = HITS.related.map((h) => prog(f, h, h + 16, EASE_SPRING));
  const relOut = prog(f, HITS.throw - 14, HITS.throw - 2, EASE_IN_OUT);

  return (
    <AbsoluteFill>
      {/* the screen */}
      <AppShot
        take={T}
        i={i}
        cam={view}
        blur={16 * behind}
        dim={0.12 * behind}
        motion={motion}
      >
        <Tap x={plus.x} y={plus.y} t={prog(f, HITS.plusTap - 5, HITS.plusTap + 9, linear)} />
        <Tap x={card[0] + 120} y={card[1] + 60} t={prog(f, HITS.cardTap - 12, HITS.cardTap + 22, linear)} />
        {landIn > 0.01 && landOut < 1 && f < HITS.cardTap && (
          // on the card's settled box: the app's arrival spring moves the
          // measured box by half points, and a lift that follows it hops a pixel a frame
          <Lift take={T} i={i} rect={card} radius={20} lift={landIn * 0.5} rise={3} grow={0.01} ring={0.55 * landIn} opacity={1 - landOut} />
        )}
        {scrolling && kpIn > 0.01 && kpOut < 1 && (() => {
          const kp = rectOf(T, i, 'points');
          return <Lift take={T} i={i} rect={[kp[0] - 6, kp[1] - 6, kp[2] + 12, kp[3] + 12]} radius={12} lift={kpIn * 0.35} rise={2} grow={0.01} ring={0.55 * kpIn} opacity={1 - kpOut} />;
        })()}
        {f >= HITS.tags && tagIn > 0.01 && relOut < 1 && (
          <Lift take={T} i={i} rect={TAG_PILLS} radius={12} lift={tagIn * 0.35} rise={2} grow={0.015} ring={0.5 * tagIn} opacity={1 - relOut} />
        )}
        {scrolling &&
          ([1, 2] as const).map((k) =>
            relIn[k - 1] > 0.01 && relOut < 1 ? (
              <Lift key={k} take={T} i={i} rect={relatedBox(i, k)} radius={14} lift={relIn[k - 1] * 0.35} rise={2} grow={0.01} ring={0.55 * relIn[k - 1]} opacity={1 - relOut} />
            ) : null,
          )}
      </AppShot>

      {/* the dialog, lifted off its screen */}
      {f >= HITS.dialog && dOut < 1 && (
        <AppShot take={T} i={di} cam={camAt(dKeys, f)} motion={camVelocity(dKeys, f, 1)} crop={dRect} cropRadius={24} opacity={dIn * (1 - dOut)}>
          <Tap x={center(tabImage).x} y={center(tabImage).y} t={prog(f, HITS.imageTap - 7, HITS.imageTap + 12, linear)} />
          {tabRing > 0.01 && <Lift take={T} i={di} rect={tabImage} radius={9} lift={tabRing * 0.4} rise={1} grow={0.04} ring={0.5 * tabRing} />}
          <Tap x={dropzone.x} y={dropzone.y} t={prog(f, HITS.pick - 7, HITS.pick + 12, linear)} />
          {f >= HITS.pick && stripIn > 0.01 && stripOut < 1 && (
            <Lift take={T} i={di} rect={[strip[0] - 4, strip[1] - 4, strip[2] + 8, strip[3] + 8]} radius={14} lift={stripIn * 0.35} rise={2} grow={0.015} ring={0.5 * stripIn} opacity={1 - stripOut} />
          )}
          <Tap x={save.x} y={save.y} tone="dark" t={prog(f, HITS.saveTap - 5, HITS.saveTap + 9, linear)} />
        </AppShot>
      )}
    </AbsoluteFill>
  );
};
