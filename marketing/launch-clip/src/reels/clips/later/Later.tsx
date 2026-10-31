import React from 'react';
import { AbsoluteFill, Audio, Freeze, staticFile, useCurrentFrame } from 'remotion';
import {
  CAPTIONS,
  CAPTURE,
  EASE_IN,
  ENDINGS,
  FOCUS,
  FPS,
  HITS,
  LIFTS,
  PINGS,
  SCREEN,
  SCREEN_PATCHES,
  SCREEN_RADIUS,
  SCREEN_RUNS,
  SHOTS,
  SIGNATURE_AT,
  SPRING,
  TAPS,
  TOTAL_FRAMES,
  fadeAt,
  frameFile,
  runAt,
} from '../../../../clips/later-timeline.mjs';
import { Ping, Tap } from '../../kit/AppShot';
import { BandScrim, HOUSE_BAND } from '../../kit/Captions';
import { EASE_IN_OUT, EASE_SPRING, prog } from '../../kit/curves';
import { HookTitle } from '../../kit/Hook';
import { Paper } from '../../kit/Paper';
import { Glass, Lifted, PhoneCamera, Picture, Points, along, camOn, exposureOf, follow, instant, shutterPlan, soften } from '../../kit/phone';
import type { Box, Fade, Patch, Phone, Target } from '../../kit/phone';
import { Signature } from '../../kit/Signature';
import { SIGNATURE } from '../../kit/signature.mjs';
import { TOKENS } from '../../kit/tokens';
import { HEAD_LEAD, KineticLine } from '../../kit/Type';
import VO from './later-vo.json';

/**
 * LATER NEVER COMES: the Instagram Reel on THE APP STORE PREVIEW. 25.0s,
 * 1080 × 1920 (clips/later-timeline.mjs).
 *
 * The preview's one-phone system (kit/phone.tsx): real simulator frames on
 * one phone on the house paper, a spring camera that never jolts, every
 * change of screen a cross-blur on that phone, the whole phone's width in
 * frame at every hold. Over the pixels: the narrated line in the house band
 * (the hook big on the cover, its punchline rising on its word), a tap mark
 * where the take tapped, a lift and an ink ring off what a line names, and
 * the kit's Signature with the footer of the day.
 *
 * Motion blur is a real shutter, as the preview's: MachinaLaterShutter
 * renders every exposure, scripts/shutter-render.mjs averages them in
 * floating point. A still frame is never blurred.
 */

type Src = { take: string; i: number | null; next: number | null; mix: number; top: { i: number; above: number } | null };

const PHONE: Phone = { capture: CAPTURE, screen: SCREEN, radius: SCREEN_RADIUS };
const src = (take: string, i: number) => staticFile(frameFile(take, i));
const fadeOf = (layer: string, f: number) => fadeAt(layer, f) as Fade | undefined;

// ── the camera and its shutter ───────────────────────────────────────────

const SHOT_PATHS = (SHOTS as unknown as { from: number; to: number; targets: Target[] }[]).map((s) => follow(s.targets, s.from, s.to, SPRING, EASE_IN));
/** the phone's shot at frame f (the last that has started) */
const shotAt = (f: number) => {
  let k = 0;
  SHOT_PATHS.forEach((p, j) => {
    if (p.from <= f) k = j;
  });
  return k;
};
/** frame points the picture's travel is measured at: the corners of the frame below the band, and its centre */
const PROBES: [number, number][] = [
  [60, 600],
  [1020, 600],
  [60, 1860],
  [1020, 1860],
  [540, 1200],
];
/** every frame's exposure count and where each starts in MachinaLaterShutter */
export const LATER_SHUTTER = shutterPlan(TOTAL_FRAMES, (f: number) => [SHOT_PATHS[shotAt(f)]], FOCUS, PROBES);

// ── the phone ────────────────────────────────────────────────────────────

/** what is painted out of a frame (the screen's own colours) */
const patchesOf = (s: Src): Patch[] =>
  (SCREEN_PATCHES as unknown as { take: string; from: number; to: number; rect: Box; tone: keyof typeof TOKENS; radius?: number }[])
    .filter((p) => p.take === s.take && s.i != null && s.i >= p.from && s.i < p.to)
    .map((p) => ({ rect: p.rect, tone: TOKENS[p.tone] as string, radius: p.radius }));

/** a list's marks live at frame f */
const live = <T extends { at: number }>(list: readonly T[], f: number, life: number) => list.filter((m) => f >= m.at && f < m.at + life);
type TapMark = { at: number; x: number | null; y: number | null; tone?: string };
const Taps: React.FC<{ f: number }> = ({ f }) => (
  <>
    {live(TAPS as unknown as TapMark[], f, 12)
      .filter((t) => t.x != null && t.y != null)
      .map((t) => (
        <Tap key={t.at} x={t.x as number} y={t.y as number} t={(f - t.at) / 12} tone={t.tone === 'light' ? 'light' : 'dark'} />
      ))}
  </>
);

/** one frame of a take as a picture on the phone (nothing while its take is unmeasured) */
const Frame: React.FC<{ s: Src; z: number; opacity?: number; blur?: number; grow?: number; about?: [number, number] }> = ({ s, z, opacity, blur, grow, about }) =>
  s.i == null ? null : (
    <Picture
      src={src(s.take, s.i)}
      phone={PHONE}
      z={z}
      opacity={opacity}
      blur={blur}
      grow={grow}
      about={about}
      top={s.top ? { src: src(s.take, s.top.i), above: s.top.above } : null}
      patches={patchesOf(s)}
    />
  );

/** the phone's screen at frame f, under `cam` */
const Screen: React.FC<{ f: number; cam: ReturnType<typeof camOn> }> = ({ f, cam }) => {
  const now = runAt(SCREEN_RUNS, f) as Src;
  const fade = fadeOf('screen', f);
  const a = fade ? along(fade, f) : 1;
  const before = fade ? (runAt(SCREEN_RUNS, fade.at - 1) as Src) : null;
  // under the Signature's paper, it softens as it settles back
  const soft = 8 * prog(f, HITS.out, SIGNATURE_AT + SIGNATURE.paperIn, EASE_IN_OUT);
  const B = fade?.blur ?? 0;
  const focus = soften(a);
  const grow = fade?.grow ? 1 + fade.grow * (1 - a) : 1;
  const image = now.i == null ? null : src(now.take, now.i);

  const marks = (
    <Points phone={PHONE}>
      {image &&
        (LIFTS as unknown as { at: number; until: number; rect: Box; radius: number }[])
          .filter((l) => f >= l.at - 1 && f < l.until)
          .map((l) => (
            <Lifted
              key={l.at}
              image={image}
              phone={PHONE}
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
      <Taps f={f} />
    </Points>
  );

  return (
    <PhoneCamera cam={cam} phone={PHONE}>
      <Glass phone={PHONE}>
        {before && <Frame s={before} z={cam.z} blur={soft + B * focus.going} />}
        <Frame s={now} z={cam.z} opacity={before ? a : 1} blur={soft + (before ? B * focus.coming : 0)} grow={grow} about={[220, 610]} />
        {now.next != null && <Frame s={{ ...now, i: now.next, next: null }} z={cam.z} opacity={now.mix} blur={soft} />}
      </Glass>
      {marks}
    </PhoneCamera>
  );
};

// ── the words ────────────────────────────────────────────────────────────

type Caption = { at: number; to: number; text: string; place?: string; cues: number[] };
type Timing = { frame: number | null; words: number[] };

/** the frame (relative to the line's start) each word of a caption's voice starts on */
const wordAt = (c: Caption, k: number) => {
  const t = (VO as Timing[]).find((v) => v.frame === c.at);
  return Math.round((t?.words[k] ?? 0) * FPS);
};

/** each narrated line on screen, its rows arriving as the voice reaches them */
const Lines: React.FC<{ f: number }> = ({ f }) => (
  <>
    {(CAPTIONS as unknown as Caption[]).map((c) => {
      const lines = c.text.split('\n');
      if (c.place === 'hook') {
        // the cover: the question from frame 0, the punchline rising on its word
        const starts = lines.map((_, j) => (j === 0 ? 0 : c.at + wordAt(c, c.cues[j])));
        return <HookTitle key={c.at} lines={lines} frame={f} to={c.to} starts={starts} />;
      }
      const starts = lines.flatMap((line, j) => {
        const cue = c.cues[j];
        const s = cue === undefined ? -(HEAD_LEAD + 12) : wordAt(c, cue);
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

// ── the reel ─────────────────────────────────────────────────────────────

type Ending = keyof typeof ENDINGS;

export const Later: React.FC<{
  withAudio?: boolean;
  withCaptions?: boolean;
  ending?: Ending;
  exposure?: { j: number; n: number };
  /** false: the paper, the words and the ending only (a sound and timing check, never a deliverable) */
  withPhone?: boolean;
}> = ({ withAudio = true, withCaptions = true, ending = 'soon', exposure = { j: 0, n: 1 }, withPhone = true }) => {
  const f = useCurrentFrame();
  // the phone is under the Signature's paper from here on
  const end = SIGNATURE_AT + SIGNATURE.paperIn + 2;
  const shot = SHOT_PATHS[shotAt(f)];
  const cam = camOn(shot, instant(f, shot, exposure.j, exposure.n), FOCUS);
  return (
    <AbsoluteFill style={{ background: TOKENS.paper }}>
      <Paper drift={f / 900} />
      {withPhone && f < end && <Screen f={f} cam={cam} />}
      {/* the paper band the type sits on: always there, so the screen slides under it */}
      <BandScrim tone={TOKENS.paper} band={HOUSE_BAND} />
      {withCaptions && <Lines f={f} />}
      <Signature from={SIGNATURE_AT} footer={ENDINGS[ending]} />
      {withAudio && <Audio src={staticFile('clips/later/score-vo.wav')} />}
    </AbsoluteFill>
  );
};

/**
 * Every exposure of every frame, one after another (LATER_SHUTTER.counts[f]
 * of them for frame f): scripts/shutter-render.mjs renders this and
 * averages each frame's exposures into the picture.
 */
export const LaterShutter: React.FC<{ ending?: Ending }> = ({ ending = 'soon' }) => {
  const { f, j } = exposureOf(LATER_SHUTTER.starts, useCurrentFrame());
  return (
    <Freeze frame={f}>
      <Later withAudio={false} ending={ending} exposure={{ j, n: LATER_SHUTTER.counts[f] }} />
    </Freeze>
  );
};
