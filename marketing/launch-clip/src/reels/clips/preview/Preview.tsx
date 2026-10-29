import React from 'react';
import { AbsoluteFill, Audio, OffthreadVideo, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { CAMERA, CAPTIONS, CLIPS, DISSOLVE, HEIGHT, PINGS, SCREEN, SIGNATURE_AT, SLAB, TAPS, WHIP, WIDTH } from '../../../../clips/preview-timeline.mjs';
import { Ping, Tap } from '../../kit/AppShot';
import { BandScrim, HOUSE_BAND } from '../../kit/Captions';
import { EASE_IN_OUT, prog } from '../../kit/curves';
import { HookTitle } from '../../kit/Hook';
import { Paper } from '../../kit/Paper';
import { Signature } from '../../kit/Signature';
import { SIGNATURE } from '../../kit/signature.mjs';
import { TOKENS } from '../../kit/tokens';
import { KineticLine } from '../../kit/Type';

/**
 * THE APP STORE PREVIEW, round 3. 25s, 1080 × 2340 here, 886 × 1920
 * delivered (clips/preview-timeline.mjs).
 *
 * The real app's screen recordings, as a slab on the house paper, under a
 * camera that glides to whatever the caption names. Over the pixels, only
 * what Apple's rules allow: captions in the house band, a tap mark where the
 * take tapped, a ring off the thing being named, dissolves, one whip. Then
 * the kit's Signature.
 */

type Key = readonly [number, number, number, number];
type ClipName = keyof typeof CLIPS;

/** the layout the slab is drawn at (the clip's own pixels: 1080 wide); the
 *  camera's scale is a transform on it, never a resize (no pixel snapping) */
const LAYOUT = 1080 / SCREEN.w;
const RADIUS = 55;
/** the frame point the camera holds its screen point at */
const FOCUS = { x: WIDTH / 2, y: SLAB.top + (SCREEN.h / 2) * SLAB.k };

/**
 * The camera path: a monotone cubic through the keys, per axis (Fritsch and
 * Carlson). It passes through every key with a continuous velocity, so a
 * move never stops dead at a key or starts with a jolt (round 2's eased
 * key-to-key moves did both: the "jitter" the owner saw), and it never
 * overshoots, so a held value stays held.
 */
const monotone = (xs: number[], ys: number[]) => {
  const n = xs.length;
  const d = xs.slice(1).map((x, i) => (ys[i + 1] - ys[i]) / (x - xs[i]));
  const m = xs.map((_, i) => (i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2));
  // ease in from rest and out to rest at the ends of the track
  m[0] = 0;
  m[n - 1] = 0;
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const s = a * a + b * b;
    if (s > 9) {
      const t = 3 / Math.sqrt(s);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  return (x: number) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const h = xs[i + 1] - xs[i];
    const t = (x - xs[i]) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * m[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * m[i + 1];
  };
};

const PATHS = Object.fromEntries(
  (Object.keys(CAMERA) as ClipName[]).map((name) => {
    const keys = CAMERA[name] as unknown as Key[];
    const xs = keys.map((k) => k[0]);
    return [name, [1, 2, 3].map((axis) => monotone(xs, keys.map((k) => k[axis])))];
  }),
) as Record<ClipName, ((f: number) => number)[]>;

/** the whip's vertical blur, layout px, peaking on the join */
const whipBlur = (f: number) => {
  const d = Math.abs(f - WHIP.at);
  return d > WHIP.half ? 0 : 22 * Math.sin((Math.PI / 2) * (1 - d / WHIP.half)) ** 2;
};

const Slab: React.FC<{ name: ClipName; f: number; opacity: number }> = ({ name, f, opacity }) => {
  const c = CLIPS[name];
  const [cx, cy, z] = PATHS[name].map((p) => p(f));
  const k = SLAB.k * z;
  const blur = name === 'save' ? whipBlur(f) : 0;
  const id = `whip-${name}`;
  const mine = <T extends { at: number }>(list: readonly T[]) => list.filter((m) => m.at >= c.at && m.at < c.at + c.frames);
  return (
    <AbsoluteFill style={{ opacity }}>
      {blur > 0.2 && (
        <svg width="0" height="0" style={{ position: 'absolute' }}>
          <filter id={id} x="0" y="-5%" width="100%" height="110%">
            <feGaussianBlur stdDeviation={`0 ${blur.toFixed(2)}`} />
          </filter>
        </svg>
      )}
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: SCREEN.w * LAYOUT,
          height: SCREEN.h * LAYOUT,
          transform: `translate(${FOCUS.x - cx * k}px, ${FOCUS.y - cy * k}px) scale(${k / LAYOUT})`,
          transformOrigin: '0 0',
          borderRadius: RADIUS * LAYOUT,
          overflow: 'hidden',
          background: TOKENS.card,
          boxShadow: TOKENS.shadow,
          filter: blur > 0.2 ? `url(#${id})` : undefined,
        }}
      >
        <Sequence from={c.at} durationInFrames={c.frames} name={name} layout="none">
          <OffthreadVideo src={staticFile(c.file)} muted style={{ position: 'absolute', left: 0, top: 0, width: SCREEN.w * LAYOUT, height: SCREEN.h * LAYOUT }} />
        </Sequence>
        {/* marks, in screen points, riding the same camera */}
        <div style={{ position: 'absolute', left: 0, top: 0, width: SCREEN.w, height: SCREEN.h, transform: `scale(${LAYOUT})`, transformOrigin: '0 0' }}>
          {mine(PINGS).map((p) => (
            <Ping key={p.at} rect={p.rect as [number, number, number, number]} radius={p.radius} t={(f - p.at) / 20} reach={10} width={2} alpha={0.55} />
          ))}
          {mine(TAPS).map((t) => (
            <Tap key={t.at} x={t.x} y={t.y} t={(f - t.at) / 12} tone={t.tone === 'light' ? 'light' : 'dark'} />
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Lines: React.FC<{ f: number }> = ({ f }) => (
  <>
    {CAPTIONS.map((c) => {
      if (c.place === 'hook') return <HookTitle key={c.at} lines={c.text.split('\n')} frame={f} to={c.to} />;
      return (
        <div key={c.at} style={{ position: 'absolute', left: 0, right: 0, top: HOUSE_BAND.top, display: 'flex', justifyContent: 'center' }}>
          <KineticLine text={c.text} frame={f} from={c.at} to={c.to} size={HOUSE_BAND.size} weight={HOUSE_BAND.weight} width={HOUSE_BAND.width} />
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

export const AppPreview: React.FC<{ withAudio?: boolean; withCaptions?: boolean }> = ({ withAudio = true, withCaptions = true }) => {
  const f = useCurrentFrame();
  const fadeIn = (name: ClipName) => prog(f, CLIPS[name].at, CLIPS[name].at + DISSOLVE, EASE_IN_OUT);
  const on = (name: ClipName) => f >= CLIPS[name].at && f < Math.min(CLIPS[name].at + CLIPS[name].frames, SIGNATURE_AT + SIGNATURE.paperIn + 2);
  return (
    <AbsoluteFill style={{ background: TOKENS.paper }}>
      <Paper drift={f / 900} />
      {on('save') && <Slab name="save" f={f} opacity={1} />}
      {on('ask') && <Slab name="ask" f={f} opacity={fadeIn('ask')} />}
      {on('graph') && <Slab name="graph" f={f} opacity={fadeIn('graph')} />}
      {/* the paper band the type sits on: always there, so the slab slides under it */}
      <BandScrim tone={TOKENS.paper} band={HOUSE_BAND} />
      {withCaptions && <Lines f={f} />}
      <SignatureCentred />
      {withAudio && <Audio src={staticFile('clips/preview/score-vo.wav')} />}
    </AbsoluteFill>
  );
};
