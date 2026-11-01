import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { Share } from 'lucide-react';
import { CAPTIONS, ENDINGS, FPS, HITS, SIGNATURE_AT, rollAt } from '../../../../clips/shots-timeline.mjs';
import { AppShot, Lift, Ping, SCREEN_RADIUS, Tap } from '../../kit/AppShot';
import { MarkAssembly } from '../../kit/Brand';
import type { Cam } from '../../kit/camera';
import { BandScrim, HOUSE_BAND } from '../../kit/Captions';
import { EASE_GATHER, EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../../kit/curves';
import { HookTitle } from '../../kit/Hook';
import { Lens, Paper } from '../../kit/Paper';
import { Signature } from '../../kit/Signature';
import { addTakes, type Rect } from '../../kit/takes';
import { TOKENS, uiText } from '../../kit/tokens';
import { HEAD_LEAD, KineticLine } from '../../kit/Type';
import { MAX_Y, Roll, heroIndex, tileRect } from './Roll';
import { HeroImg, SHOT, type HeroId } from './Screens';
import TAKES_JSON from './takes.json';
import VO from './shots-vo.json';

addTakes(TAKES_JSON);

/**
 * SAME SCREENSHOTS. 20.5s, 1080 × 1920 (clips/shots-timeline.mjs).
 *
 * The hook: two screens, the camera roll flicked into a blur on the left,
 * Machina's three cards still on the right. BEFORE: the roll takes the frame
 * and its one long flick lands on the last row, the three screenshots and
 * "2,847 Screenshots"; the first is tapped open and swiped through, no idea
 * why any of them was taken. AFTER: the three line up and each is shared,
 * pulled into the mark (one share, one card); the mark's point opens into
 * the real app and the feed reads down the three cards; then Find, in your
 * own words, lands the one it means. The kit's Signature closes it.
 *
 * Machina's pixels are the shipped app, captured (`clips/shots/app`); the
 * roll and the opened screenshots are the reel's own (Roll.tsx,
 * Screens.tsx). Colours, type and curves from the kit only
 * (audio/house-verify.mjs).
 */

type Ending = keyof typeof ENDINGS;
const TAKE = 'clips/shots/app';
const HEROES: HeroId[] = ['camera', 'seneca', 'viewpoint'];

/** ── a screen that is not the app: a slab of its own ──────────────────── */

/** where a slab's screen sits: screen point (196.5, 426) at frame (fx, fy), z px a point */
type Place = { z: number; fx: number; fy: number };
const lerpPlace = (a: Place, b: Place, t: number): Place => ({
  z: Math.exp(mix(Math.log(a.z), Math.log(b.z), t)),
  fx: mix(a.fx, b.fx, t),
  fy: mix(a.fy, b.fy, t),
});
/** a screen point → frame point, on a slab placed at `p` */
const toFrame = (p: Place, x: number, y: number) => ({ x: p.fx + (x - SHOT.w / 2) * p.z, y: p.fy + (y - SHOT.h / 2) * p.z });

const Slab: React.FC<{ place: Place; children: React.ReactNode; opacity?: number; filter?: string; shadow?: number }> = ({ place, children, opacity = 1, filter, shadow = 1 }) => {
  const { z } = place;
  const left = place.fx - (SHOT.w / 2) * z;
  const top = place.fy - (SHOT.h / 2) * z;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: SHOT.w * z,
        height: SHOT.h * z,
        transform: `translate(${left.toFixed(2)}px, ${top.toFixed(2)}px)`,
        borderRadius: SCREEN_RADIUS * z,
        overflow: 'hidden',
        boxShadow: shadow > 0 ? TOKENS.shadow : undefined,
        opacity,
        filter,
      }}
    >
      <div style={{ width: SHOT.w, height: SHOT.h, transform: `scale(${z.toFixed(4)})`, transformOrigin: '0 0', position: 'relative' }}>{children}</div>
    </div>
  );
};

/** (round 5) the cover's labels: BEFORE over the camera roll, AFTER over
 *  Machina, centred over each screen just above its top edge, in the kit's
 *  chapter-label manner (uppercase, letterspaced). On from frame 0 (the
 *  cover); they leave as the roll takes the frame, AFTER with its screen */
const ScreenLabel: React.FC<{ text: string; place: Place; dx: number; opacity: number }> = ({ text, place, dx, opacity }) => {
  if (opacity <= 0) return null;
  const top = place.fy - (SHOT.h / 2) * place.z - 62;
  return (
    <div style={{ position: 'absolute', left: 0, top, width: 1080, transform: `translateX(${Math.round(place.fx - 540 + dx)}px)`, display: 'flex', justifyContent: 'center', opacity }}>
      {/* the trailing tracking balanced on the left, so the word sits centred */}
      <div style={{ ...uiText(32, 700), letterSpacing: '0.32em', paddingLeft: '0.32em', textTransform: 'uppercase', lineHeight: 1 }}>{text}</div>
    </div>
  );
};

/** ── the roll: its place, its flick ───────────────────────────────────── */

// (round 2) larger: the two screens fill the frame under the hook instead of
// leaving its lower fifth empty; their text still 19px inside Meta's margins
const HOOK_LEFT: Place = { z: 1.2, fx: 286, fy: 1094 };
const HOOK_RIGHT: Place = { z: 1.2, fx: 794, fy: 1094 };
/** BEFORE: the roll's screen fills the frame's width, its last row in the safe area */
const ROLL_FULL: Place = { z: 2.5, fx: 540, fy: 330 };

const rollPlace = (f: number) => lerpPlace(HOOK_LEFT, ROLL_FULL, prog(f, HITS.grow, HITS.grow + 14, EASE_IN_OUT));
/** (round 2) a steady, readable scroll under the hook (the left screen was a
 *  grey smear for three seconds), then one long flick to rest on the last
 *  row: the timeline's curve, which the score's ratchet also follows */
const rollY = (f: number) => rollAt(f, MAX_Y);

/** ── the opened screenshot: a viewer, swiped through ─────────────────── */

/** the viewer's box (frame px): the screenshot as a slab under the band */
const VIEW_Z = 1.75;
const VIEW = { w: SHOT.w * VIEW_Z, h: SHOT.h * VIEW_Z, x: 540 - (SHOT.w * VIEW_Z) / 2, y: 598 };
const VIEW_GAP = 240; // the next one wholly out of frame until it is swiped in
/** the row the three line up in for the share */
const ROW_Z = 0.62; // (round 2) larger: each screenshot still reads as itself in the row
const ROW = { w: SHOT.w * ROW_Z, h: SHOT.h * ROW_Z, y: 568, xs: [236, 540, 844] };
/** where the mark sits under the row: the point every share is pulled into */
const MARK = { x: 540, y: 1196, w: 160 };

type Box = { x: number; y: number; w: number; h: number; r: number };
const lerpBox = (a: Box, b: Box, t: number): Box => ({ x: mix(a.x, b.x, t), y: mix(a.y, b.y, t), w: mix(a.w, b.w, t), h: mix(a.h, b.h, t), r: mix(a.r, b.r, t) });

/** the hero tile's box on the roll's full-frame slab */
const tileBox = (k: number): Box => {
  const [x, y, w] = tileRect(heroIndex(k), MAX_Y);
  const a = toFrame(ROLL_FULL, x, y);
  return { x: a.x, y: a.y, w: w * ROLL_FULL.z, h: w * ROLL_FULL.z, r: 0 };
};
/** how far the viewer has been swiped (0: the first, 2: the third) */
const swiped = (f: number) => prog(f, HITS.swipe1, HITS.swipe1 + 10, EASE_IN_OUT) + prog(f, HITS.swipe2, HITS.swipe2 + 10, EASE_IN_OUT);
const viewBox = (k: number, f: number): Box => ({ ...VIEW, x: VIEW.x + (k - swiped(f)) * (VIEW.w + VIEW_GAP), r: SCREEN_RADIUS * VIEW_Z });
const rowBox = (k: number): Box => ({ x: ROW.xs[k] - ROW.w / 2, y: ROW.y, w: ROW.w, h: ROW.h, r: SCREEN_RADIUS * ROW_Z });

/** each share: the tap on its Share button, then the pull into the mark */
const SHARE = [
  { tap: HITS.share1, land: HITS.land1 },
  { tap: HITS.share2, land: HITS.land2 },
  { tap: HITS.share3, land: HITS.land3 },
];
const TAP_LEAD = 4; // the pad lands 35% into the Tap's 12 frames

/** a screenshot's box at frame f, from tile → viewer → row → the mark */
const heroBox = (k: number, f: number): Box | null => {
  const open = prog(f, HITS.tap, HITS.tap + 12, EASE_MODAL);
  const toRow = prog(f, HITS.row, HITS.row + 16, EASE_MODAL);
  // in the viewer: the first opens out of its tile; the others are beside it
  if (f < HITS.tap) return null;
  let b = k === 0 ? lerpBox(tileBox(0), viewBox(0, f), open) : viewBox(k, f);
  b = lerpBox(b, rowBox(k), toRow);
  const s = SHARE[k];
  const pull = prog(f, s.tap + 2, s.land, EASE_GATHER);
  if (pull >= 1) return null;
  if (pull > 0) {
    const cx = mix(b.x + b.w / 2, MARK.x, pull);
    const cy = mix(b.y + b.h / 2, MARK.y, pull);
    const k2 = 1 - 0.94 * pull;
    b = { x: cx - (b.w * k2) / 2, y: cy - (b.h * k2) / 2, w: b.w * k2, h: b.h * k2, r: b.r * k2 };
  }
  return b;
};

/** the image inside a box, cropped to cover it from the middle (a grid's crop → the whole screen) */
const Opened: React.FC<{ id: HeroId; box: Box; opacity?: number; blurX?: number; fid: string }> = ({ id, box, opacity = 1, blurX = 0, fid }) => {
  const s = Math.max(box.w / SHOT.w, box.h / SHOT.h);
  const iw = SHOT.w * s;
  const ih = SHOT.h * s;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: box.w,
        height: box.h,
        transform: `translate(${box.x.toFixed(2)}px, ${box.y.toFixed(2)}px)`,
        borderRadius: box.r,
        overflow: 'hidden',
        boxShadow: TOKENS.shadow,
        opacity,
        filter: blurX > 0.4 ? `url(#${fid})` : undefined,
      }}
    >
      {blurX > 0.4 && (
        <svg width={0} height={0} style={{ position: 'absolute' }}>
          <filter id={fid} x="-10%" y="0" width="120%" height="100%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation={`${blurX.toFixed(2)} 0`} edgeMode="duplicate" />
          </filter>
        </svg>
      )}
      <div style={{ position: 'absolute', left: (box.w - iw) / 2, top: (box.h - ih) / 2, transform: `scale(${s.toFixed(4)})`, transformOrigin: '0 0' }}>
        <HeroImg id={id} />
      </div>
    </div>
  );
};

/** the Share button each screenshot shows in the row (a gesture, not iOS's sheet) */
const ShareButton: React.FC<{ k: number; f: number }> = ({ k, f }) => {
  const box = heroBox(k, f);
  if (!box) return null;
  const pop = EASE_SPRING(prog(f, HITS.row + 10 + 3 * k, HITS.row + 18 + 3 * k, (t) => t));
  const pull = prog(f, SHARE[k].tap + 2, SHARE[k].land, EASE_GATHER);
  const press = 1 - 0.12 * Math.sin(Math.PI * prog(f, SHARE[k].tap - TAP_LEAD, SHARE[k].tap + 4, (t) => t));
  const size = 76 * (1 - 0.94 * pull);
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h - 6 * (1 - pull);
  if (pop <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: cx - size / 2,
        top: cy - size / 2,
        width: size,
        height: size,
        borderRadius: size,
        background: TOKENS.card,
        boxShadow: TOKENS.shadowSoft,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: TOKENS.ink,
        transform: `scale(${(pop * press).toFixed(3)})`,
        opacity: 1 - prog(f, SHARE[k].land - 3, SHARE[k].land, (t) => t),
      }}
    >
      <Share size={size * 0.42} strokeWidth={2.2} />
    </div>
  );
};

/** ── the app: the feed, read down; then Find ─────────────────────────── */

/** the feed: the newest card where the iris opens; held, read down a card, held… */
const FEED_CAM: Cam = { cx: SHOT.w / 2, cy: 355, z: 2.1, fx: 540, fy: 944, rx: 0, ry: 0, rz: 0 };
/** (round 3) one read down the feed, past all three cards, to rest on the
 *  camera card (the capture's scroll: 764 points in 255 steps), so every
 *  screenshot is seen as a card before the line names what was done to it */
const STEP = 764 / 255;
const feedScroll = (f: number) => 764 * prog(f, HITS.cards, HITS.cards + 22, EASE_IN_OUT);
const feedFrame = (f: number) => Math.min(256, Math.round(feedScroll(f) / STEP));
/** a slow push under the hold (linear: the one job linear has) */
const feedCam = (f: number): Cam => ({ ...FEED_CAM, z: FEED_CAM.z + 0.03 * prog(f, HITS.cards + 22, HITS.find, (t) => t) });
/** the camera card's parts, where the feed comes to rest, each rung as the
 *  line names it: [box, corner radius]. The summary is two paragraphs and
 *  the tags two chips: each pair rung as one, a little room around it */
const unite = (a: Rect, b: Rect, pad = 0): Rect => {
  const x0 = Math.min(a[0], b[0]) - pad;
  const y0 = Math.min(a[1], b[1]) - pad;
  return [x0, y0, Math.max(a[0] + a[2], b[0] + b[2]) + pad - x0, Math.max(a[1] + a[3], b[1] + b[3]) + pad - y0];
};
/** the iris opens out of the mark's point (its place in screen points) */
const IRIS_AT = { x: FEED_CAM.cx + (MARK.x - FEED_CAM.fx) / FEED_CAM.z, y: FEED_CAM.cy + (MARK.y - FEED_CAM.fy) / FEED_CAM.z };

/** Find: the field focuses (the app's 8 frames), the query typed two
 *  characters a frame, then the app's own arrival of the one card */
const FIND_CAM: Cam = { cx: SHOT.w / 2, cy: 330, z: 2.3, fx: 540, fy: 1028, rx: 0, ry: 0, rz: 0 };
const T = TAKES_JSON[TAKE as keyof typeof TAKES_JSON] as unknown as { marks: Record<string, number>; count: number; frames: { r: Record<string, Rect> }[] };
/** the typed frames shown, two characters a frame: from "quo" (the first
 *  character's frame flashes a card the app matched on "q"), skipping the
 *  two where the app's live "Close matches" flash cards under the field */
const TYPED = [2, 4, 6, 8, 10, 16, 18, 20, 22];
const findFrame = (f: number) => {
  const m = T.marks;
  if (f < HITS.find + 8) return m.focus + (f - HITS.find);
  if (f < HITS.result) return m.typing + TYPED[Math.min(TYPED.length - 1, f - HITS.find - 8)];
  return Math.min(T.count - 1, m.result + (f - HITS.result));
};
const SENECA_RECT = T.frames[T.marks.result].r.seneca;
const REST = T.frames[T.marks.read].r;
const PARTS: [Rect, number][] = [
  [REST.camShot, 19],
  [REST.camCategory, 7],
  [unite(REST.camSum1, REST.camSum2, 5), 10],
  [unite(REST.camTag1, REST.camTag2, 3), 9],
];
/** how strongly part k is rung at frame f: in on its word, out as the next arrives */
const partRing = (k: number, f: number) => {
  const at = HITS.parts[k];
  const next = HITS.parts[k + 1];
  return prog(f, at, at + 8, EASE_MODAL) * (next === undefined ? 1 : 1 - prog(f, next, next + 8, EASE_IN_OUT));
};

/** ── the narration on screen ──────────────────────────────────────────── */
const Lines: React.FC<{ f: number }> = ({ f }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    {CAPTIONS.map((c) => {
      const t = VO.find((v) => v.frame === c.at);
      const lines = c.text.split('\n');
      const starts = lines.flatMap((line, k) => {
        const cue = c.cues[k];
        const s = Math.round((t?.words[cue] ?? 0) * FPS);
        return line.split(' ').map(() => s);
      });
      if (c.place === 'hook') {
        // the cover (round 5): two big rows, no kicker ("My screenshots, /
        // before and after."); the labels over the screens map the sides
        return <HookTitle key={c.at} lines={lines} frame={f} to={c.to} />;
      }
      return (
        <div key={c.at} style={{ position: 'absolute', left: 0, right: 0, top: HOUSE_BAND.top, display: 'flex', justifyContent: 'center' }}>
          <KineticLine text={c.text} frame={f} from={c.at} to={c.to} starts={starts} size={HOUSE_BAND.size} weight={HOUSE_BAND.weight} width={HOUSE_BAND.width} />
        </div>
      );
    })}
  </AbsoluteFill>
);

/** ── the reel ─────────────────────────────────────────────────────────── */

export const Shots: React.FC<{ withAudio?: boolean; withCaptions?: boolean; ending?: Ending }> = ({ withAudio = true, withCaptions = true, ending = 'soon' }) => {
  const f = useCurrentFrame();

  // the roll: on screen until the three line up, pushed back while one is open
  const rp = rollPlace(f);
  const ry = rollY(f);
  const rv = (ry - rollY(f - 1)) * rp.z; // px a frame
  const rollBlur = Math.min(60, 0.12 * Math.abs(rv)) / rp.z;
  const back = prog(f, HITS.tap, HITS.tap + 12, EASE_MODAL);
  const gone = prog(f, HITS.row, HITS.row + 12, EASE_IN_OUT);
  const showRoll = f < HITS.row + 12;

  // the hook's right screen slides away as the roll takes the frame
  const away = prog(f, HITS.grow, HITS.grow + 14, EASE_IN_OUT);

  // the three: open, swiped, in a row, shared
  const sw = (swiped(f) - swiped(f - 1)) * (VIEW.w + VIEW_GAP);
  const viewerOn = f >= HITS.tap && f < HITS.land3;
  const hideTiles = f >= HITS.tap ? [0, 1, 2] : [];

  // the mark under the row, then its point opens into the app
  const close = EASE_SPRING(prog(f, HITS.row + 4, HITS.row + 18, (t) => t));
  const landed = SHARE.filter((s) => f >= s.land).length;
  const lastLand = SHARE.map((s) => s.land).filter((l) => l <= f).pop() ?? -99;
  const pulse = 1 + 0.16 * Math.exp(-(f - lastLand) / 4) * (f >= lastLand ? 1 : 0);
  const dot = (0.35 + 0.65 * (landed / 3)) * prog(f, HITS.row + 10, HITS.row + 20, EASE_SPRING) * pulse;
  const markOut = prog(f, HITS.iris, HITS.iris + 7, EASE_IN_OUT);
  const showMark = f >= HITS.row && f < HITS.iris + 8;

  // the app
  // (the radius ends where the circle has just cleared the screen's visible
  // corners: a larger one finished the reveal in two frames of its middle)
  const iris = prog(f, HITS.iris, HITS.iris + 16, EASE_IN_OUT);
  const inFeed = f >= HITS.iris && f < HITS.find;
  const ds = (feedScroll(f) - feedScroll(f - 1)) * FEED_CAM.z;
  const inFind = f >= HITS.find;
  const fi = findFrame(f);
  const rack = 14 * (1 - prog(f, HITS.result - 2, HITS.result + 5, EASE_MODAL));
  const ring = prog(f, HITS.ring, HITS.ring + 9, EASE_MODAL);

  // the paper band over anything that rises into the type
  const scrim = prog(f, HITS.grow, HITS.grow + 12, EASE_IN_OUT);

  return (
    <AbsoluteFill style={{ background: TOKENS.paper }}>
      <Paper drift={f / 900} />

      {/* the cover's labels: which side is which */}
      <ScreenLabel text="Before" place={HOOK_LEFT} dx={0} opacity={1 - prog(f, HITS.grow - 4, HITS.grow + 6, EASE_IN_OUT)} />
      <ScreenLabel text="After" place={HOOK_RIGHT} dx={700 * away} opacity={1 - prog(f, HITS.grow - 4, HITS.grow + 6, EASE_IN_OUT)} />

      {/* the hook's right screen: Machina, still */}
      {f < HITS.grow + 15 && (
        <AppShot take={TAKE} i={0} cam={{ ...FEED_CAM, cx: SHOT.w / 2, cy: SHOT.h / 2, z: HOOK_RIGHT.z, fx: HOOK_RIGHT.fx + 700 * away, fy: HOOK_RIGHT.fy }} opacity={1 - away} />
      )}

      {/* the roll */}
      {showRoll && (
        <Slab
          place={rp}
          opacity={(1 - gone) * (1 - 0.35 * back)}
          filter={back > 0.01 || gone > 0.01 ? `blur(${(12 * back + 8 * gone).toFixed(2)}px) brightness(${(1 - 0.04 * back).toFixed(3)})` : undefined}
        >
          <Roll y={ry} blur={rollBlur} id="roll" hide={hideTiles} />
          <Tap {...(() => {
            const [x, y, w] = tileRect(heroIndex(0), MAX_Y);
            return { x: x + w / 2, y: y + w / 2 };
          })()} t={(f - (HITS.tap - TAP_LEAD)) / 12} />
        </Slab>
      )}

      {/* the three screenshots: opened, swiped, lined up, shared */}
      {viewerOn &&
        HEROES.map((id, k) => {
          const box = heroBox(k, f);
          if (!box || box.x > 1300 || box.x + box.w < -200) return null;
          return <Opened key={id} id={id} box={box} fid={`sw${k}`} blurX={f < HITS.row ? Math.min(28, 0.12 * Math.abs(sw)) : 0} />;
        })}
      {f >= HITS.row && f < HITS.land3 && HEROES.map((id, k) => <ShareButton key={id} k={k} f={f} />)}
      {f >= HITS.row &&
        f < HITS.land3 + 2 &&
        SHARE.map((s, k) => (
          <Tap key={k} x={ROW.xs[k]} y={ROW.y + ROW.h - 6} t={(f - (s.tap - TAP_LEAD)) / 12} size={60} />
        ))}

      {/* the mark: each share lands in its point */}
      {showMark && (
        <div style={{ position: 'absolute', left: MARK.x - MARK.w / 2, top: MARK.y - MARK.w * 0.39, opacity: 1 - markOut, transform: `scale(${(1 + 0.25 * markOut).toFixed(3)})` }}>
          <MarkAssembly close={close} dot={Math.min(1.2, dot)} width={MARK.w} color={TOKENS.ink} />
        </div>
      )}
      {SHARE.map((s, k) => (
        <Ping key={k} rect={[MARK.x - 60, MARK.y - 40, 120, 80]} t={(f - s.land) / 16} radius={40} reach={70} width={2.4} alpha={0.42} />
      ))}

      {/* the app: the feed, out of the mark's point */}
      {inFeed && (
        <AppShot take={TAKE} i={feedFrame(f)} cam={feedCam(f)} iris={iris < 1 ? { x: IRIS_AT.x, y: IRIS_AT.y, r: 500 * iris } : null} motion={{ x: 0, y: ds }}>
          {/* the parts: each Lift mounted from the frame the feed comes to
              rest (a frame that changes anyway) until the cut, never on a
              still one; the ring and a small rise in on its word */}
          {f >= HITS.cards + 22 &&
            PARTS.map(([rect, radius], k) => {
              const r = partRing(k, f);
              return (
                <React.Fragment key={k}>
                  <Ping rect={rect} t={(f - HITS.parts[k]) / 16} radius={radius} reach={10} width={1.4} alpha={0.4} />
                  <Lift take={TAKE} i={feedFrame(f)} rect={rect} radius={radius} lift={Math.max(0.002, 0.55 * r)} ring={r} rise={3} grow={k === 0 ? 0.012 : 0.03} />
                </React.Fragment>
              );
            })}
        </AppShot>
      )}
      {inFind && (
        <AppShot take={TAKE} i={fi} cam={FIND_CAM} blur={rack > 0.2 ? rack : 0} dim={rack > 0.2 ? 0.08 * (rack / 14) : 0} focus={rack > 0.2 ? { y0: 110, y1: 176, blur: rack } : undefined}>
          {/* the Lift is its own raster: mounted on the frame the card
              arrives (a frame that changes anyway), never on a still one */}
          {f >= HITS.result && (
            <>
              <Ping rect={SENECA_RECT} t={(f - HITS.ring) / 18} radius={20} reach={16} />
              <Lift take={TAKE} i={fi} rect={SENECA_RECT} radius={20} lift={Math.max(0.002, 0.5 * ring)} ring={ring} rise={4} grow={0.02} />
            </>
          )}
        </AppShot>
      )}

      {scrim > 0 && f < SIGNATURE_AT + 14 && <BandScrim opacity={scrim} tone={TOKENS.paper} band={HOUSE_BAND} />}
      {withCaptions && <Lines f={f} />}
      <Lens vignette={0.35} grain={0.035} />
      <Signature from={SIGNATURE_AT} footer={ENDINGS[ending]} />
      {withAudio && <Audio src={staticFile('clips/shots/score-vo.wav')} />}
    </AbsoluteFill>
  );
};

/** the head lead, re-exported for the gates (the eye a few frames ahead of the ear) */
export const SHOTS_HEAD_LEAD = HEAD_LEAD;
