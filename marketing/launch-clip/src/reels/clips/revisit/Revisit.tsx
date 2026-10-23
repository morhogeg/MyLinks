import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { CAPTIONS, FPS, HITS, TOTAL_FRAMES } from '../../../../clips/revisit-timeline.mjs';
import { sans } from '../../../fonts';
import { clearOf } from '../../kit/Captions';
import { CLOCK } from '../../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, EASE_SPRING, prog } from '../../kit/curves';
import { Dither, Lens } from '../../kit/Paper';
import { rectOf } from '../../kit/takes';
import { INK, KineticLine } from '../../kit/Type';
import { App, LIST, T, frameAt, rowAt, toFrame } from './App';
import { EndCard, signOffPaper } from './Brand';
import { InkList, InkRow, SHEET, SHEET_BG, listGeo, type RowGeo } from './Ink';
import { ACTS, ITEMS, L, LIST_H, STOP_Y, TOPS, VIDEO, heightOf, linesOf, scrollAt, speedAt, type Item } from './list';
import { Sheet, landAt, tearAt, type SheetPose } from './Sheet';
import VO from './revisit-vo.json';

/**
 * TICK IT OFF: the revisit reel. 28s, 1080 × 1920, loops.
 *
 * "Your saves are a to-do list." over an ink list of this account's real
 * saves; "Watch later. Read later. Try later." ratchets it on; it spins like
 * a slot reel and stops on Mark Manson's video on procrastination; "Relax.
 * Machina watched it.": the sheet tears off and under it is the real app,
 * that save's card, summed up; this week's synthesis, tapped open; the list
 * comes back on a new sheet and the five saves that call for an action are
 * pulled out of it onto the real "Do this" rows, each "Watch …" rewritten as
 * the thing to do; "Even the procrastination one.": the video's line is
 * ticked, the rest follow on the beat, the list folds away to "All done.";
 * the tab; the sign-off, held on the logo and the tagline to the last frame
 * (round 2); the loop cuts from the logo back to the hook.
 * Every app pixel is the shipped app (capture/shoot.mjs `revisitClip`); the
 * ink list, the sheets and the camera are this reel's, in the house grade.
 */

const SET_BG = 'linear-gradient(180deg, #F8F9FB 0%, #F1F3F6 58%, #ECEEF2 100%)';
const TONE = '#F8F9FB';
const linear = (t: number) => t;
type VoLine = { frame: number; words: number[] };
const LINES = VO as VoLine[];

// ─────────────────────────────────────────────────────────── the hook's type

const HOOK = CAPTIONS[0];
/** the hook, set big over the list on frame 0; it rolls out as the list
 *  starts to move */
const HookType: React.FC<{ out?: number }> = ({ out = 0 }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, top: 262, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
    {HOOK.text.split('\n').map((l, k) => (
      <div key={k} style={{ overflow: 'hidden', padding: '0.04em 0.12em 0.12em', margin: '-0.04em 0 -0.12em' }}>
        <div
          style={{
            fontFamily: sans,
            fontSize: 118,
            fontWeight: 720,
            letterSpacing: '-0.042em',
            lineHeight: 1.02,
            color: INK,
            whiteSpace: 'nowrap',
            transform: `translateY(${Math.round(-Math.min(1, out * 1.15 - k * 0.15) * 108)}%)`,
          }}
        >
          {l}
        </div>
      </div>
    ))}
  </div>
);

// ─────────────────────────────────────────────────────────── act one: the list

/** the push on frame 0's hold, about the list's middle; then, once the spin
 *  has stopped, a slow push in on the video */
const zoomAt = (t: number) => {
  const hook = 1 + 0.022 * prog(t, 0, HITS.hookOut, linear) * (1 - prog(t, HITS.hookOut, HITS.hookOut + 16, EASE_IN_OUT));
  const stop = 1 + 0.045 * prog(t, HITS.stop + 8, HITS.tear + 12, EASE_IN_OUT);
  return { z: hook * stop, zy: t < HITS.spin ? 1100 : STOP_Y };
};

/** after the stop: the others step back, the video stays in ink */
const dimAt = (t: number) => (k: number) => (k === VIDEO ? 1 : 1 - 0.8 * prog(t, HITS.stop - 2, HITS.stop + 8, EASE_MODAL));
const ringAt = (t: number) => (k: number) => (k === VIDEO ? EASE_SPRING(Math.min(1, Math.max(0, (t - HITS.stop) / 10))) : 0);

/** the sheet's list at a moment (for the shutter's samples) */
const ListAt: React.FC<{ t: number }> = ({ t }) => {
  const { z, zy } = zoomAt(t);
  return (
    <AbsoluteFill style={{ background: SHEET_BG }}>
      <Dither />
      <InkList scroll={scrollAt(t)} z={z} zy={zy} dim={dimAt(t)} ring={ringAt(t)} />
    </AbsoluteFill>
  );
};

/**
 * Motion blur is real: during the spin the list is drawn at up to nine
 * moments inside a 180° shutter and averaged (sample k laid over the first k
 * at 1/k, exactly their mean); a still frame is drawn once.
 */
const MotionList: React.FC<{ f: number }> = ({ f }) => {
  const n = Math.min(9, Math.max(1, Math.round(speedAt(f) / 10)));
  if (n === 1) return <ListAt t={f} />;
  return (
    <AbsoluteFill>
      {Array.from({ length: n }, (_, k) => (
        <AbsoluteFill key={k} style={{ opacity: 1 / (k + 1) }}>
          <ListAt t={f + (k / (n - 1) - 0.5) * 0.5} />
        </AbsoluteFill>
      ))}
    </AbsoluteFill>
  );
};

/** the stop's emphasis: two ink rings leave the video's row (the find) */
const StopPing: React.FC<{ f: number }> = ({ f }) => {
  if (f < HITS.stop || f > HITS.stop + 30) return null;
  const { z, zy } = zoomAt(f);
  const y = zy + (L.top0 + TOPS[VIDEO] - scrollAt(f) - zy) * z;
  const g = listGeo(y, z, 540 - 540 * z);
  const pad = 22 * z;
  const x0 = g.cx - g.d / 2 - pad;
  const y0 = g.ty - pad * 0.8;
  const w = g.tx - (g.cx - g.d / 2) + L.textW * z * 0.92 + 2 * pad;
  const h = (2 * L.lineH + L.metaGap + L.metaH) * z + 1.6 * pad;
  const ring = (t0: number, life: number, reach: number, width: number, alpha: number) => {
    const t = (f - t0) / life;
    if (t <= 0 || t >= 1) return null;
    const out = 1 - Math.pow(1 - t, 3);
    const d = reach * out;
    return (
      <div
        style={{
          position: 'absolute',
          left: x0 - d,
          top: y0 - d,
          width: w + 2 * d,
          height: h + 2 * d,
          borderRadius: 26 * z + d,
          boxShadow: `0 0 0 ${(width * (1 - 0.5 * out)).toFixed(2)}px rgba(20,20,27,${(alpha * Math.pow(1 - t, 1.5)).toFixed(3)})`,
        }}
      />
    );
  };
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {ring(HITS.stop + 1, 14, 70, 5, 0.45)}
      {ring(HITS.stop + 5, 22, 170, 3, 0.26)}
    </AbsoluteFill>
  );
};

// ─────────────────────────────────────────────────────────── the band

const BAND = CAPTIONS.filter((c) => c.place !== 'scene');
const lineUp = (f: number) => BAND.some((c) => f >= c.at - 8 && f <= c.to + 4);
/** a scrim's opacity eases between states instead of popping */
const eased = (f: number, at: (f: number) => number) => [0, 1, 2, 3, 4, 5].reduce((acc, k) => acc + at(f - k), 0) / 6;

const Scrim: React.FC<{ tone: string; solid: number; clear: number; o: number }> = ({ tone, solid, clear, o }) =>
  o <= 0.001 ? null : (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: o, background: `linear-gradient(180deg, ${tone} 0px, ${tone} ${solid}px, ${clearOf(tone)} ${clear}px)` }} />
  );

/** act one's scrim is drawn ON the sheet (it leaves with it when it tears) */
const sheetScrimAt = (f: number) => (f < HITS.hookOut ? 0 : 1);
/** the app's: short, since the picture starts right under the band */
const appScrimAt = (f: number) => (f >= HITS.tear - 8 && lineUp(f) ? 1 : 0);

const Lines: React.FC<{ f: number }> = ({ f }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    {BAND.map((c) => {
      const starts = LINES.find((v) => v.frame === c.at)?.words.map((s) => Math.round(s * FPS));
      return (
        <div key={c.at} style={{ position: 'absolute', left: 0, right: 0, top: 330, display: 'flex', justifyContent: 'center' }}>
          <KineticLine text={c.text} frame={f} from={c.at} to={c.to} starts={starts} size={68} weight={650} width={1000} />
        </div>
      );
    })}
  </AbsoluteFill>
);

/** act one's pad: the list, the stop, the hook, the band's scrim */
const PadSheet: React.FC<{ f: number; pose: SheetPose; captions: boolean }> = ({ f, pose, captions }) => (
  <Sheet pose={pose}>
    <MotionList f={f} />
    <StopPing f={f} />
    {captions && <Scrim tone={SHEET} solid={600} clear={700} o={eased(f, sheetScrimAt)} />}
    {captions && f < HITS.hookOut + 12 && <HookType out={prog(f, HITS.hookOut, HITS.hookOut + 8, (t) => t * t * t)} />}
  </Sheet>
);

/**
 * A sheet in motion, with its own shutter: drawn at up to eight moments
 * inside a 180° shutter and averaged (each sample opaque paper, sample k
 * laid over the first k at 1/k), the average softened by about the distance
 * between samples so the copies melt into one smear; at rest, drawn once.
 */
const MotionSheet: React.FC<{ f: number; at: (t: number) => SheetPose; draw: (pose: SheetPose) => React.ReactNode }> = ({ f, at, draw }) => {
  const pose = at(f);
  if (pose.gone) return null;
  const a = at(f - 0.25);
  const b = at(f + 0.25);
  // the shutter's travel, in px, at the frame's middle (the turn moves it too)
  const travel = Math.hypot(b.x - a.x, b.y - a.y) + Math.abs(b.rot - a.rot) * (Math.PI / 180) * 1100;
  const n = Math.min(8, Math.max(1, Math.round(travel / 16)));
  if (n === 1) return <>{draw(pose)}</>;
  // one blur over the averaged samples (a blur per sample cost minutes a
  // frame in the render's software compositor)
  const soft = n < 3 ? 0 : Math.min(9, travel / n / 2.5);
  return (
    <AbsoluteFill style={{ filter: soft > 0.6 ? `blur(${soft.toFixed(1)}px)` : undefined }}>
      {Array.from({ length: n }, (_, k) => {
        const p = at(f + (k / (n - 1) - 0.5) * 0.5);
        return (
          <AbsoluteFill key={k} style={{ opacity: 1 / (k + 1) }}>
            {draw({ ...p, gone: false })}
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};

/** the tear: the pad's sheet, yanked off */
const TornPad: React.FC<{ f: number; captions: boolean }> = ({ f, captions }) => (
  <MotionSheet f={f} at={(t) => tearAt(t, HITS.tear)} draw={(pose) => <PadSheet f={f} pose={pose} captions={captions} />} />
);

// ─────────────────────────────────────────────────── act three: the pull-out

/** the whole list on the landing sheet, in two columns, under the band */
const SPLIT = TOPS.findIndex((t) => t >= LIST_H / 2);
const COL_H = Math.max(TOPS[SPLIT], LIST_H - TOPS[SPLIT]);
const PULL = { y0: 560, z: Math.min(0.42, 1320 / COL_H), ox: [34, 556] };
const pullGeo = (k: number): RowGeo => {
  const col = k < SPLIT ? 0 : 1;
  return listGeo(PULL.y0 + (TOPS[k] - (col ? TOPS[SPLIT] : 0)) * PULL.z, PULL.z, PULL.ox[col]);
};

/** the bold verbs' widths at the list's size (Geist 700, 46px; measured) and the space after */
const VERB_W: Record<string, number> = { Watch: 141, Read: 113, Try: 69, Visit: 100 };
const SPACE_W = 11;

/** where a picked item lands: its circle on the row's circle, its first line
 *  on the line the task will be written on (the app's 14.5pt) */
const landGeo = (f: number, r: number): RowGeo => {
  const { task, tick } = LIST.rows[r];
  const c = toFrame(f, tick[0] + tick[2] / 2, tick[1] + tick[3] / 2);
  const lines = Math.max(1, Math.round(task[3] / 19.9));
  const lh = task[3] / lines;
  const p = toFrame(f, task[0], task[1] + lh / 2);
  const size = 14.5 * p.z;
  return { cx: c.x, cy: c.y, d: 22 * c.z, tx: p.x, ty: p.y - (L.lineH * size) / L.size / 2, size };
};
/** the card's title line, where the save's title settles (the app's 12pt,
 *  after the category dot) */
const cardGeo = (f: number, r: number) => {
  const { card } = LIST.rows[r];
  const p = toFrame(f, card[0] + 12, card[1] + card[3] / 2);
  const size = 12 * p.z;
  return { x: p.x, y: p.y - (L.lineH * size) / L.size / 2, size };
};

const mixGeo = (a: RowGeo, b: RowGeo, t: number): RowGeo => ({
  cx: a.cx + (b.cx - a.cx) * t,
  cy: a.cy + (b.cy - a.cy) * t,
  d: a.d + (b.d - a.d) * t,
  tx: a.tx + (b.tx - a.tx) * t,
  ty: a.ty + (b.ty - a.ty) * t,
  size: Math.exp(Math.log(a.size) + (Math.log(b.size) - Math.log(a.size)) * t),
});

/** the picks, in reading order (down the first column, then the second): a 16th apart */
const PICKS = [...ACTS].sort((a, b) => a.k - b.k);
const pickAt = (k: number) => HITS.pick + 3.75 * PICKS.findIndex((p) => p.k === k);

/**
 * A picked save, from the moment it lands until its line is written: its
 * verb is struck out; its title drops to the card's grey title line and hands
 * over to the real one; its circle hands over to the real circle; then the
 * real task is written in where it stood (App.tsx covers and wipes the real
 * pixels on the same clock, `rowAt`).
 */
const Rewrite: React.FC<{ f: number; it: Item; r: number }> = ({ f, it, r }) => {
  const R0 = rowAt(r);
  if (f > R0 + 16) return null;
  const g = landGeo(f, r);
  const cg = cardGeo(f, r);
  const strike = prog(f, R0, R0 + 5, EASE_IN_OUT);
  const drop = prog(f, R0 + 1, R0 + 9, EASE_IN_OUT);
  const k = g.size / L.size;
  const [l1, l2] = linesOf(it);
  const verbW = ((VERB_W[it.verb] ?? 100) + SPACE_W) * k;
  // the title's own position and size, from beside the verb to the card line
  const size = Math.exp(Math.log(g.size) + (Math.log(cg.size) - Math.log(g.size)) * drop);
  const x = g.tx + verbW + (cg.x - g.tx - verbW) * drop;
  const y = g.ty + (cg.y - g.ty) * drop;
  const col = `rgba(${Math.round(17 + 90 * drop)},${Math.round(24 + 90 * drop)},${Math.round(39 + 89 * drop)},0.96)`;
  const titleO = 1 - prog(f, R0 + 9, R0 + 13, EASE_IN_OUT);
  const circleO = 1 - prog(f, R0, R0 + 4, EASE_IN_OUT);
  const lh = (L.lineH * size) / L.size;
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: g.cx - g.d / 2,
          top: g.cy - g.d / 2,
          width: g.d,
          height: g.d,
          borderRadius: '50%',
          opacity: circleO,
          boxShadow: `inset 0 0 0 ${(1.5 * (g.d / 22)).toFixed(2)}px rgba(17,24,39,0.62)`,
        }}
      />
      {/* the verb, struck out and gone before the task is written there */}
      <div
        style={{
          position: 'absolute',
          left: g.tx,
          top: g.ty,
          fontFamily: sans,
          fontSize: g.size,
          lineHeight: `${(L.lineH * g.size) / L.size}px`,
          fontWeight: 700,
          letterSpacing: '-0.012em',
          color: INK,
          whiteSpace: 'nowrap',
          opacity: 1 - prog(f, R0 + 3, R0 + 7, EASE_IN_OUT),
        }}
      >
        <span style={{ position: 'relative', display: 'inline-block' }}>
          {it.verb}
          <span
            style={{
              position: 'absolute',
              left: -2 * k,
              top: '55%',
              height: Math.max(1.5, 3.4 * k),
              width: `calc(${strike * 100}% + ${4 * k}px)`,
              background: INK,
              borderRadius: 2,
            }}
          />
        </span>
      </div>
      {/* the save's title, settling into the card's title line */}
      <div
        style={{
          position: 'absolute',
          left: x,
          top: y,
          fontFamily: sans,
          fontSize: size,
          lineHeight: `${lh}px`,
          fontWeight: 500 - 100 * drop,
          letterSpacing: '-0.012em',
          color: col,
          whiteSpace: 'nowrap',
          opacity: titleO,
        }}
      >
        <div>{l1}</div>
        {l2 && <div style={{ opacity: 1 - prog(f, R0, R0 + 4, EASE_IN_OUT) }}>{l2}</div>}
      </div>
    </>
  );
};

const PullOut: React.FC<{ f: number }> = ({ f }) => {
  if (f < HITS.land || f > rowAt(4) + 16) return null;
  const pose = landAt(f, HITS.land, 12);
  // the sheet and the saves left on it give way to the real list
  const away = prog(f, HITS.fly, HITS.rewrite - 6, EASE_IN_OUT);
  const picked = (k: number) => PICKS.some((p) => p.k === k);
  const dim = 1 - 0.8 * prog(f, HITS.pick, HITS.pick + 10, EASE_MODAL);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {away < 1 && (
        <AbsoluteFill style={{ opacity: 1 - away }}>
          <MotionSheet
            f={f}
            at={(t) => landAt(t, HITS.land, 12)}
            draw={(p) => (
              <Sheet pose={p}>
                {ITEMS.map((it, k) => (picked(k) && f >= pickAt(k) ? null : <InkRow key={it.id} it={it} g={pullGeo(k)} opacity={picked(k) ? 1 : dim} />))}
              </Sheet>
            )}
          />
        </AbsoluteFill>
      )}
      {/* the five, picked out (a 16th apart) and flown onto their rows */}
      {f < HITS.rewrite &&
        PICKS.map(({ it, k }, j) => {
          if (f < pickAt(k)) return null;
          const lift = EASE_SPRING(Math.min(1, (f - pickAt(k)) / 9));
          const a = pullGeo(k);
          const s = 1 + 0.3 * lift;
          const up = { ...a, size: a.size * s, d: a.d * s, tx: a.cx + (a.tx - a.cx) * s, ty: a.cy - (a.cy - a.ty) * s };
          const t = prog(f, HITS.fly + 1.5 * j, HITS.rewrite, EASE_IN_OUT);
          const g = mixGeo(up, landGeo(f, it.act!), t);
          return <InkRow key={it.id} it={it} g={{ ...g, ty: g.ty + pose.y * (1 - t), cy: g.cy + pose.y * (1 - t) }} ring={lift * (1 - t)} meta={1 - t} />;
        })}
      {f >= HITS.rewrite && PICKS.map(({ it }) => <Rewrite key={it.id} f={f} it={it} r={it.act!} />)}
    </AbsoluteFill>
  );
};

/** the paper over the frame's foot while the list ticks off: it sits between
 *  the list and the app's Undo toasts, which stack up under it */
const footAt = (f: number) => {
  if (f < HITS.tick + 10 || f >= HITS.lockup) return null;
  const i = Math.min(frameAt(f), 328);
  let toastTop = 852;
  try {
    toastTop = rectOf(T, i, 'toast')[1];
  } catch {
    /* none yet */
  }
  let listBottom = LIST.doHead[1] + 30;
  for (const k of ['row4', 'row3', 'row2', 'row1', 'row0', 'allDone']) {
    try {
      const r = rectOf(T, i, k);
      listBottom = Math.max(listBottom, r[1] + r[3] + (k === 'allDone' ? 48 : 6));
      break;
    } catch {
      /* folded away */
    }
  }
  const mid = toFrame(f, 0, Math.min(toastTop - 6, (listBottom + toastTop) / 2)).y;
  return { y: Math.max(900, mid), o: 1 - prog(f, HITS.wide + 6, HITS.wide + 18, EASE_IN_OUT) };
};

export const Revisit: React.FC<{ withAudio?: boolean; withCaptions?: boolean }> = ({ withAudio = true, withCaptions = true }) => {
  const f = useCurrentFrame();
  CLOCK.perFrame = 1;
  const paper = signOffPaper(f);
  const foot = footAt(f);
  const listShot = f >= HITS.land + 13 && f < HITS.push2;
  return (
    <AbsoluteFill style={{ fontFamily: sans, background: SET_BG }}>
      {withAudio && <Audio src={staticFile('clips/revisit/score-vo.wav')} />}
      {/* the set's gradient is drawn in 8 bits: the kit's dither keeps it from banding */}
      <Dither />
      {/* the real app: the card, the synthesis, the list, the ticks, the tab */}
      <App f={f} />
      {foot && (
        <AbsoluteFill
          style={{
            pointerEvents: 'none',
            opacity: foot.o,
            background: `linear-gradient(180deg, ${clearOf(TONE)} ${foot.y - 70}px, ${TONE} ${foot.y + 30}px, ${TONE} 1920px)`,
          }}
        />
      )}
      {withCaptions && <Scrim tone={TONE} solid={listShot ? 492 : 505} clear={listShot ? 522 : 600} o={eased(f, appScrimAt)} />}
      {/* the pull-out: a sheet lands with the list, five saves leave it */}
      <PullOut f={f} />
      {/* the sign-off's paper, the lockup */}
      {paper > 0 && (
        <AbsoluteFill style={{ background: SET_BG, opacity: paper }}>
          <Dither />
        </AbsoluteFill>
      )}
      <EndCard f={f} show={withCaptions} />
      {/* act one: the pad, its list, the spin, the stop; torn off */}
      <TornPad f={f} captions={withCaptions} />
      {withCaptions && <Lines f={f} />}
      <Lens vignette={0.35} grain={0.035} />
    </AbsoluteFill>
  );
};

export { TOTAL_FRAMES, heightOf };
