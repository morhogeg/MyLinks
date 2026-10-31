import React from 'react';
import { AbsoluteFill, Audio, Freeze, Img, staticFile, useCurrentFrame } from 'remotion';
import {
  CAPTIONS,
  CAPTURE,
  DIALOG_RADIUS,
  DIALOG_RUNS,
  DIALOG_SPAN,
  DIALOG_TARGETS,
  EASE_IN,
  FOCUS,
  FPS,
  HEIGHT,
  HITS,
  LIFTS,
  PATCHES,
  PINGS,
  SCREEN,
  SCREEN_PATCHES,
  SCREEN_RUNS,
  SHOTS,
  SIGNATURE_AT,
  SPRING,
  TAPS,
  TOTAL_FRAMES,
  WIDTH,
  fadeAt,
  frameFile,
  runAt,
} from '../../../../clips/preview-timeline.mjs';
import { Ping, Tap } from '../../kit/AppShot';
import { BandScrim, HOUSE_BAND } from '../../kit/Captions';
import type { Cam } from '../../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, EASE_SPRING, prog } from '../../kit/curves';
import { HookTitle } from '../../kit/Hook';
import { Paper } from '../../kit/Paper';
import { Signature } from '../../kit/Signature';
import { SIGNATURE } from '../../kit/signature.mjs';
import { TOKENS } from '../../kit/tokens';
import { HEAD_LEAD, KineticLine } from '../../kit/Type';
import VO from './preview-vo.json';

/**
 * THE APP STORE PREVIEW, round 9. 27.6s, 1080 × 2340 here, 886 × 1920
 * delivered (clips/preview-timeline.mjs).
 *
 * The real app's screen recordings as one phone on the house paper. The
 * camera follows its framings with a critically damped spring, so it never
 * starts with a jolt or stops dead; every change of screen dissolves on the
 * one phone (a change of screen through a soft focus); the Add dialog is
 * lifted off a receding feed and settles back into it; the whole phone's
 * width is in frame at every hold, so no word is ever cut. Over the
 * pixels, only what Apple's rules allow: the narrated line in the house
 * band, a tap mark where the take tapped, a ring off the thing the line
 * names.
 *
 * Motion blur is a real shutter: where the camera moves, the frame is
 * rendered at several instants across half a frame (a 180° shutter), and
 * scripts/preview-render.mjs averages those exposures in floating point
 * (MachinaAppPreviewShutter renders one exposure a frame). A still frame is
 * never blurred. (Summing the exposures inside the browser was tried: it
 * rounds to 8 bits at every exposure, which shifted text tones by up to 4
 * levels at 8.)
 */

type Box = [number, number, number, number];
type Src = { take: string; i: number; box: Box; dy: number; next: number | null; mix: number; top: { i: number; above: number } | null };
type Fade = { layer: string; at: number; len: number; blur: number; grow?: number };
type Target = { f: number; cx: number; cy: number; z: number; w?: number };

/** capture pixels a point */
const PX = CAPTURE.dpr;
/** the iPhone's display corner, points */
const SCREEN_RADIUS = 55;

const src = (s: { take: string; i: number }) => staticFile(frameFile(s.take, s.i));
const fadeOf = (layer: string, f: number) => fadeAt(layer, f) as Fade | undefined;
/** how far a fade has come at frame f: under way on its first frame, all but done on its last */
const along = (x: Fade, f: number) => EASE_IN_OUT((f - x.at + 1) / (x.len + 1));
/**
 * The soft focus of a fade at `a` (0–1 of the way), for the screen going
 * and the one coming: the one going is out of focus before the one coming
 * is half up, and the one coming stays soft until the one going has all
 * but gone, so the two only ever overlap out of focus (never text on text).
 */
const soften = (a: number) => {
  const ramp = (x: number) => EASE_IN_OUT(Math.min(1, Math.max(0, x)));
  return { going: ramp(a / 0.6), coming: 1 - ramp((a - 0.4) / 0.6) };
};

// ── the camera: a critically damped spring after its targets ─────────────

/** samples a frame (the shutter samples between frames) */
const STEP = 8;
type Path = { from: number; to: number; cx: Float64Array; cy: Float64Array; lz: Float64Array };

/**
 * The camera a shot's targets give: each axis (zoom in log space) is a
 * critically damped spring pulled toward the target path, which runs in
 * straight lines between the keys and is read through a trailing EASE_IN
 * frame average (a new framing arrives as a ramp, so the spring starts
 * without a kick, and never before the moment it answers); `w` (per frame)
 * is the spring's rate from that key on. Solved exactly over each eighth of
 * a frame, so it never rings and the shutter can sample it between frames.
 */
const follow = (targets: readonly Target[], from: number, to: number): Path => {
  const n = Math.ceil((to - from) * STEP) + 2;
  const path: Path = { from, to, cx: new Float64Array(n), cy: new Float64Array(n), lz: new Float64Array(n) };
  const raw = (t: number) => {
    let i = 0;
    while (i + 1 < targets.length && targets[i + 1].f <= t) i++;
    const a = targets[i];
    const b = targets[i + 1];
    const u = b && t > a.f ? Math.min(1, (t - a.f) / (b.f - a.f)) : 0;
    return {
      cx: a.cx + (b ? (b.cx - a.cx) * u : 0),
      cy: a.cy + (b ? (b.cy - a.cy) * u : 0),
      lz: Math.log(a.z) + (b ? (Math.log(b.z) - Math.log(a.z)) * u : 0),
      w: a.w || SPRING,
    };
  };
  const target = (t: number) => {
    const m = 13;
    const o = { cx: 0, cy: 0, lz: 0, w: raw(t).w };
    for (let k = 0; k < m; k++) {
      const r = raw(Math.max(from, t - (EASE_IN * k) / (m - 1)));
      o.cx += r.cx / m;
      o.cy += r.cy / m;
      o.lz += r.lz / m;
    }
    return o;
  };
  const start = raw(from);
  const x = { cx: start.cx, cy: start.cy, lz: start.lz };
  const v = { cx: 0, cy: 0, lz: 0 };
  const dt = 1 / STEP;
  for (let k = 0; k < n; k++) {
    path.cx[k] = x.cx;
    path.cy[k] = x.cy;
    path.lz[k] = x.lz;
    const T = target(from + (k + 0.5) * dt);
    const e = Math.exp(-T.w * dt);
    for (const key of ['cx', 'cy', 'lz'] as const) {
      const A = x[key] - T[key];
      const B = v[key] + T.w * A;
      x[key] = T[key] + (A + B * dt) * e;
      v[key] = (B - T.w * (A + B * dt)) * e;
    }
  }
  return path;
};

/** where a path's camera is at instant t (inside its span) */
const camOn = (p: Path, t: number): Cam => {
  const u = Math.min(p.cx.length - 1.0001, (Math.min(Math.max(t, p.from), p.to) - p.from) * STEP);
  const i = Math.floor(u);
  const r = u - i;
  const at = (a: Float64Array) => a[i] + (a[i + 1] - a[i]) * r;
  return { cx: at(p.cx), cy: at(p.cy), z: Math.exp(at(p.lz)), fx: FOCUS.x, fy: FOCUS.y, rx: 0, ry: 0, rz: 0 };
};

const SHOT_PATHS = (SHOTS as unknown as { from: number; to: number; targets: Target[] }[]).map((s) => follow(s.targets, s.from, s.to));
const DIALOG_PATH = follow(DIALOG_TARGETS as unknown as Target[], DIALOG_SPAN[0], DIALOG_SPAN[1]);
/** the phone's shot at frame f (the last that has started) */
const shotAt = (f: number) => {
  let k = 0;
  SHOT_PATHS.forEach((p, j) => {
    if (p.from <= f) k = j;
  });
  return k;
};

// ── the shutter ──────────────────────────────────────────────────────────

/** frame points the picture's travel is measured at (corners of the frame below the band, and its centre) */
const PROBES: [number, number][] = [
  [60, 760],
  [1020, 760],
  [60, 2280],
  [1020, 2280],
  [540, 1500],
];
/** how far the picture under camera `a` has moved under camera `b`, at its worst point (px) */
const travel = (a: Cam, b: Cam) =>
  Math.max(
    ...PROBES.map(([x, y]) => {
      const sx = a.cx + (x - a.fx) / a.z;
      const sy = a.cy + (y - a.fy) / a.z;
      return Math.hypot(b.fx + (sx - b.cx) * b.z - x, b.fy + (sy - b.cy) * b.z - y);
    }),
  );

/** the 180° shutter around frame f, inside a path's span */
const shutterWindow = (f: number, p: Path) => [Math.max(p.from, f - 0.25), Math.min(p.to, f + 0.25)] as const;
/** exposure j of n: the instant a path's camera is sampled at */
const instant = (f: number, p: Path, j: number, n: number) => {
  const [t0, t1] = shutterWindow(f, p);
  return t0 + ((t1 - t0) * (j + 0.5)) / n;
};

/** the paths on screen at frame f: the phone's shot, and the dialog's */
const pathsAt = (f: number) => {
  const k = shotAt(f);
  const paths = [SHOT_PATHS[k]];
  if (f >= DIALOG_SPAN[0] && f < DIALOG_SPAN[1]) paths.push(DIALOG_PATH);
  return paths;
};

/**
 * How many exposures frame f takes: one when nothing moves, else one for
 * every ~1.5px the picture travels while the shutter is open (so the smear
 * is smooth, not stepped), at most 48.
 */
const exposuresAt = (f: number) => {
  const need = (p: Path) => {
    const [t0, t1] = shutterWindow(f, p);
    return Math.ceil(travel(camOn(p, t0), camOn(p, t1)) / 1.5);
  };
  return Math.max(1, Math.min(48, ...pathsAt(f).map(need)));
};

/** every frame's exposure count, and where each frame's exposures start in MachinaAppPreviewShutter */
export const SHUTTER_COUNTS = Array.from({ length: TOTAL_FRAMES }, (_, f) => exposuresAt(f));
const STARTS = SHUTTER_COUNTS.reduce<number[]>((acc, n, f) => [...acc, (acc[f] ?? 0) + n], [0]);
export const SHUTTER_TOTAL = STARTS[TOTAL_FRAMES];

// ── the phone ────────────────────────────────────────────────────────────

/** a capture laid out at its own pixels (3 a point), brought to the camera by a transform (never resized: no pixel snapping) */
const Camera: React.FC<{ cam: Cam; children: React.ReactNode }> = ({ cam, children }) => (
  <AbsoluteFill>
    <div
      style={{
        position: 'absolute',
        left: 0,
        top: 0,
        width: CAPTURE.w,
        height: CAPTURE.h,
        transform: `translate(${cam.fx - cam.cx * PX}px, ${cam.fy - cam.cy * PX}px) scale(${cam.z / PX})`,
        transformOrigin: `${cam.cx * PX}px ${cam.cy * PX}px`,
      }}
    >
      {children}
    </div>
  </AbsoluteFill>
);

/** overlays in screen points, riding the camera */
const Points: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, width: SCREEN.w, height: SCREEN.h, transform: `scale(${PX})`, transformOrigin: '0 0' }}>
    {children}
  </div>
);

/** one captured frame filling the screen, with a soft focus (frame px), a dim and a breath of scale about a point (`top`: another frame of the take kept above a line, points) */
const Picture: React.FC<{
  s: { take: string; i: number; top?: { i: number; above: number } | null };
  z: number;
  opacity?: number;
  blur?: number;
  dim?: number;
  grow?: number;
  about?: [number, number];
}> = ({
  s,
  z,
  opacity = 1,
  blur = 0,
  dim = 0,
  grow = 1,
  about = [220, 478],
}) => {
  const filter = [blur > 0.05 ? `blur(${((blur * PX) / z).toFixed(3)}px)` : '', dim > 0.002 ? `brightness(${1 - dim})` : ''].filter(Boolean).join(' ');
  const style: React.CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%' };
  // the keyboard bar painted out (SCREEN_PATCHES), inside the picture so it
  // softens and fades with it
  const patched = (SCREEN_PATCHES as unknown as { take: string; from: number; to: number; rect: Box }[]).filter((p) => p.take === s.take && s.i >= p.from && s.i < p.to);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        opacity,
        filter: filter || undefined,
        transform: grow !== 1 ? `scale(${grow})` : undefined,
        transformOrigin: `${about[0] * PX}px ${about[1] * PX}px`,
      }}
    >
      <Img src={src(s)} style={style} />
      {s.top && <Img src={src({ take: s.take, i: s.top.i })} style={{ ...style, clipPath: `inset(0 0 ${CAPTURE.h - s.top.above * PX}px 0)` }} />}
      {patched.map((p) => (
        <div
          key={p.from}
          style={{ position: 'absolute', left: p.rect[0] * PX, top: p.rect[1] * PX, width: p.rect[2] * PX, height: p.rect[3] * PX, background: TOKENS.capturePage }}
        />
      ))}
    </div>
  );
};

/** a real element lifted off its own screen: the same pixels cut to its box, risen, with a shadow under it */
const Lifted: React.FC<{ image: string; rect: Box; radius: number; lift: number }> = ({ image, rect, radius, lift }) => {
  const [x, y, w, h] = rect;
  return (
    <div
      style={{
        position: 'absolute',
        left: x,
        top: y,
        width: w,
        height: h,
        transform: `translateY(${-4 * lift}px) scale(${1 + 0.02 * lift})`,
        transformOrigin: 'center center',
      }}
    >
      <div style={{ position: 'absolute', inset: 0, borderRadius: radius, boxShadow: TOKENS.shadow, opacity: Math.min(1, lift * 1.4) }} />
      <div style={{ position: 'absolute', inset: 0, borderRadius: radius, overflow: 'hidden' }}>
        <Img src={image} style={{ position: 'absolute', left: -x, top: -y, width: SCREEN.w, height: SCREEN.h, maxWidth: 'none' }} />
      </div>
    </div>
  );
};

/** a list's marks live at frame f */
const live = <T extends { at: number }>(list: readonly T[], f: number, life: number) => list.filter((m) => f >= m.at && f < m.at + life);
type TapMark = { at: number; x: number; y: number; tone?: string; layer: string };
const Taps: React.FC<{ f: number; layer: string }> = ({ f, layer }) => (
  <>
    {live(TAPS as unknown as TapMark[], f, 12)
      .filter((t) => t.layer === layer)
      .map((t) => (
        <Tap key={t.at} x={t.x} y={t.y} t={(f - t.at) / 12} tone={t.tone === 'light' ? 'light' : 'dark'} />
      ))}
  </>
);

/** the phone's glass: its shadow, and the screen clipped to the display's corner */
const Glass: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <>
    <div style={{ position: 'absolute', inset: 0, borderRadius: SCREEN_RADIUS * PX, boxShadow: TOKENS.shadow }} />
    <div style={{ position: 'absolute', inset: 0, borderRadius: SCREEN_RADIUS * PX, overflow: 'hidden', background: TOKENS.card }}>{children}</div>
  </>
);

/** the phone's screen at frame f, under `cam` */
const Screen: React.FC<{ f: number; cam: Cam }> = ({ f, cam }) => {
  const now = runAt(SCREEN_RUNS, f) as Src;
  const fade = fadeOf('screen', f);
  const a = fade ? along(fade, f) : 1;
  const before = fade ? (runAt(SCREEN_RUNS, fade.at - 1) as Src) : null;
  // LIFT → DROP: out of focus behind the dialog, back into focus as it settles
  // (the feed is soft before the dialog is half up, so its text never shows
  // through the rising glass)
  const back = prog(f, HITS.lift, HITS.lift + 10, EASE_IN_OUT) * (1 - prog(f, HITS.drop + 4, HITS.drop + 22, EASE_IN_OUT));
  // under the Signature's paper, it softens as it settles back
  const out = prog(f, HITS.out, SIGNATURE_AT + SIGNATURE.paperIn, EASE_IN_OUT);
  const soft = 14 * back + 8 * out;
  const dim = 0.08 * back;
  const B = fade?.blur ?? 0;
  const focus = soften(a);
  const image = src(now);
  const grow = fade?.grow ? 1 + fade.grow * (1 - a) : 1;

  const marks = (
    <Points>
      {(LIFTS as unknown as { at: number; until: number; rect: Box; radius: number }[])
        .filter((l) => f >= l.at - 1 && f < l.until)
        .map((l) => (
          <Lifted
            key={l.at}
            image={image}
            rect={l.rect}
            radius={l.radius}
            // up on its beat, then settling to a breath above the page (a
            // Lift stays mounted until its screen changes: removing it
            // re-rasters the element on a still frame)
            lift={Math.max(0.002, prog(f, l.at - 1, l.at + 6, EASE_SPRING) * (1 - prog(f, l.at + 10, l.at + 34, EASE_IN_OUT)))}
          />
        ))}
      {[
        ...(PINGS as unknown as { at: number; rect: Box; radius: number }[]),
        ...(LIFTS as unknown as { at: number; rect: Box; radius: number }[]),
      ]
        .filter((p) => f >= p.at && f < p.at + 24)
        .map((p) => (
          <Ping key={`${p.at}`} rect={p.rect} radius={p.radius} t={(f - p.at) / 24} reach={10} width={2} alpha={0.5} />
        ))}
      <Taps f={f} layer="screen" />
    </Points>
  );

  return (
    <Camera cam={cam}>
      <Glass>
        {before && <Picture s={before} z={cam.z} blur={soft + B * focus.going} dim={dim} />}
        <Picture
          s={now}
          z={cam.z}
          opacity={before ? a : 1}
          blur={soft + (before ? B * focus.coming : 0)}
          dim={dim}
          grow={grow}
          about={[220, 610]}
        />
        {now.next && <Picture s={{ take: now.take, i: now.next, top: now.top }} z={cam.z} opacity={now.mix} blur={soft} />}
      </Glass>
      {marks}
    </Camera>
  );
};

/** a dialog frame clipped to `box` (its outline in the layer), moved by its own `dy` */
const Face: React.FC<{ s: Src; box: Box; opacity?: number }> = ({ s, box, opacity = 1 }) => {
  const [x, y, w, h] = box;
  const R = DIALOG_RADIUS * PX;
  const patched = PATCHES.filter((p) => p.take === s.take && s.i >= p.from && s.i < p.to);
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        opacity,
        clipPath: `inset(${y * PX}px ${CAPTURE.w - (x + w) * PX}px ${CAPTURE.h - (y + h) * PX}px ${x * PX}px round ${R}px)`,
      }}
    >
      <div style={{ position: 'absolute', inset: 0, transform: `translateY(${s.dy * PX}px)` }}>
        <Img src={src(s)} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }} />
        <Points>
          {/* the one painted-out detail (PATCHES), in the sheet's own white */}
          {patched.map((p) => {
            const [px, py, pw, ph] = p.rect as Box;
            return <div key={p.from} style={{ position: 'absolute', left: px, top: py, width: pw, height: ph, background: TOKENS.captureWhite }} />;
          })}
        </Points>
      </div>
    </div>
  );
};

/** Add to Machina, lifted off the screen */
const Dialog: React.FC<{ f: number; cam: Cam }> = ({ f, cam }) => {
  const now = runAt(DIALOG_RUNS, f) as Src;
  const fade = fadeOf('dialog', f);
  const a = fade ? along(fade, f) : 1;
  const before = fade ? (runAt(DIALOG_RUNS, fade.at - 1) as Src) : null;
  // the outline in the layer (its top held still), its height easing from the one before
  const inLayer = (s: Src): Box => [s.box[0], s.box[1] + s.dy, s.box[2], s.box[3]];
  const nb = inLayer(now);
  const ob = before ? inLayer(before) : nb;
  const outline: Box = [nb[0], nb[1], nb[2], ob[3] + (nb[3] - ob[3]) * a];
  const within = (b: Box): Box => [b[0], b[1], b[2], Math.min(b[3], outline[3])];
  // it floats up into place and, saved, settles back toward the feed
  const shown = prog(f, HITS.lift + 3, HITS.lift + 13, EASE_IN_OUT) * (1 - prog(f, HITS.drop, HITS.drop + 12, EASE_IN_OUT));
  const up = prog(f, HITS.lift, HITS.lift + 18, EASE_MODAL);
  const away = prog(f, HITS.drop, HITS.drop + 14, EASE_IN_OUT);
  const rise = 36 * (1 - up) + 14 * away;
  const scale = (0.965 + 0.035 * up) * (1 - 0.05 * away);
  const [x, y, w, h] = outline;
  const R = DIALOG_RADIUS * PX;
  return (
    <Camera cam={cam}>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: shown,
          transform: `translateY(${rise * PX}px) scale(${scale})`,
          transformOrigin: `${(x + w / 2) * PX}px ${(y + h / 2) * PX}px`,
        }}
      >
        {/* its shadow and its white: one shape, easing between the two outlines */}
        <div style={{ position: 'absolute', left: x * PX, top: y * PX, width: w * PX, height: h * PX, borderRadius: R, background: TOKENS.captureWhite, boxShadow: TOKENS.shadowLift }} />
        {before && <Face s={before} box={within(ob)} />}
        <Face s={now} box={within(nb)} opacity={before ? a : 1} />
        <Points>
          <Taps f={f} layer="dialog" />
        </Points>
      </div>
    </Camera>
  );
};

/** each narrated line on screen, a line of type arriving on its cue word */
const Lines: React.FC<{ f: number }> = ({ f }) => (
  <>
    {CAPTIONS.map((c) => {
      const lines = c.text.split('\n');
      if (c.place === 'hook') return <HookTitle key={c.at} lines={lines} frame={f} to={c.to} />;
      const t = VO.find((v) => v.frame === c.at);
      const starts = lines.flatMap((line, j) => {
        const cue = c.cues[j];
        const s = cue === undefined ? -(HEAD_LEAD + 12) : Math.round((t?.words[cue] ?? 0) * FPS);
        return line.split(' ').map(() => s);
      });
      return (
        <div key={c.at} style={{ position: 'absolute', left: 0, right: 0, top: HOUSE_BAND.top, display: 'flex', justifyContent: 'center' }}>
          <KineticLine text={c.text} frame={f} from={c.at} to={c.to} starts={starts} size={HOUSE_BAND.size} weight={HOUSE_BAND.weight} width={HOUSE_BAND.width} />
        </div>
      );
    })}
  </>
);

/**
 * The Signature is laid out for a 1080 × 1920 frame; this one is 420px
 * taller. It is placed unchanged, 210px down (so it is centred), and the
 * same paper, rising on the same curve, fills the strip above it and
 * melts into its own before anything of the mark could reach it.
 */
const SIG_DY = (HEIGHT - 1920) / 2;
const SignatureCentred: React.FC = () => {
  const f = useCurrentFrame() - SIGNATURE_AT;
  const paper = prog(f, 0, SIGNATURE.paperIn, EASE_IN_OUT);
  return (
    <>
      <div style={{ position: 'absolute', left: 0, top: SIG_DY, width: WIDTH, height: HEIGHT - SIG_DY }}>
        <Signature from={SIGNATURE_AT} />
      </div>
      {f >= 0 && (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            width: WIDTH,
            height: SIG_DY + 420,
            opacity: paper,
            WebkitMaskImage: `linear-gradient(to bottom, black 0px, black ${SIG_DY}px, transparent ${SIG_DY + 420}px)`,
            maskImage: `linear-gradient(to bottom, black 0px, black ${SIG_DY}px, transparent ${SIG_DY + 420}px)`,
          }}
        >
          <Paper />
        </div>
      )}
    </>
  );
};

export const AppPreview: React.FC<{ withAudio?: boolean; withCaptions?: boolean; exposure?: { j: number; n: number } }> = ({
  withAudio = true,
  withCaptions = true,
  exposure = { j: 0, n: 1 },
}) => {
  const f = useCurrentFrame();
  // the phone is under the Signature's paper from here on
  const end = SIGNATURE_AT + SIGNATURE.paperIn + 2;
  const { j, n } = exposure;
  const k = shotAt(f);
  const shot = SHOT_PATHS[k];
  const cam = camOn(shot, instant(f, shot, j, n));
  return (
    <AbsoluteFill style={{ background: TOKENS.paper }}>
      <Paper drift={f / 900} />
      {f < end && <Screen f={f} cam={cam} />}
      {f >= DIALOG_SPAN[0] && f < DIALOG_SPAN[1] && <Dialog f={f} cam={camOn(DIALOG_PATH, instant(f, DIALOG_PATH, j, n))} />}
      {/* the paper band the type sits on: always there, so the screen slides under it */}
      <BandScrim tone={TOKENS.paper} band={HOUSE_BAND} />
      {withCaptions && <Lines f={f} />}
      <SignatureCentred />
      {withAudio && <Audio src={staticFile('clips/preview/score-vo.wav')} />}
    </AbsoluteFill>
  );
};

/**
 * Every exposure of every frame, one after another (SHUTTER_COUNTS[f] of
 * them for frame f): scripts/preview-render.mjs renders this and averages
 * each frame's exposures into the picture.
 */
export const AppPreviewShutter: React.FC = () => {
  const k = useCurrentFrame();
  let f = 0;
  while (STARTS[f + 1] <= k) f++;
  return (
    <Freeze frame={f}>
      <AppPreview withAudio={false} exposure={{ j: k - STARTS[f], n: SHUTTER_COUNTS[f] }} />
    </Freeze>
  );
};
