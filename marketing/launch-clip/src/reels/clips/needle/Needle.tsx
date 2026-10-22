import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { CAPTIONS, FPS, HITS, TOTAL_FRAMES } from '../../../../clips/needle-timeline.mjs';
import { sans } from '../../../fonts';
import { clearOf } from '../../kit/Captions';
import { CLOCK } from '../../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, EASE_SPRING, prog } from '../../kit/curves';
import { Lens } from '../../kit/Paper';
import { INK, KineticLine } from '../../kit/Type';
import { App } from './App';
import { EndCard, GatherMark, signOffPaper } from './Brand';
import { FIELD_BG, MotionField, type FieldState } from './Field';
import { BURST, FOCAL, FRAME, READS, cameraA, cameraB, fieldA, fieldB, fieldBurst, focusA, focusB, geom, targetAt, TARGET, WARP } from './field';
import VO from './needle-vo.json';

/**
 * FIND THE BOOK: the needle reel. 28s, 1080 × 1920, loops.
 *
 * The dare on frame 0 ("Find the book Sam told you to read.") over a field
 * of the account's real saves, with the needle in it; the search; "Give
 * up?"; the field gathered into the mark, which is Ask's mark; the question;
 * the tunnel at speed onto the needle (the payoff); the real answer, cited;
 * the sign-off; "P.S. It was in the first frame." as the field flies back to
 * frame 0. Every app pixel is the shipped app (capture/shoot.mjs
 * `needleCards`, `needleClip`); the rest is this reel's own motion, in the
 * house grade (ink on paper).
 */

const TONE = '#F8F9FB';
const linear = (t: number) => t;

/** how many shutter samples a frame needs: more the faster things move */
const samplesA = (f: number) => {
  if (f >= HITS.gather && f < HITS.markStrike) return 5;
  const v = Math.abs(cameraA(f + 0.5).z - cameraA(f - 0.5).z) + Math.abs(cameraA(f + 0.5).x - cameraA(f - 0.5).x);
  return Math.min(7, Math.max(1, Math.round(v / 16)));
};
const samplesB = (f: number) => {
  if (f >= HITS.dive) return 6;
  const v = Math.abs(cameraB(f + 0.5).z - cameraB(f - 0.5).z);
  return Math.min(7, Math.max(1, Math.round(v / 26)));
};

// each named save pops as it is said (the app's spring), then lets go
const readRing = (f: number, from: number, to: number) => prog(f, from, from + 9, EASE_SPRING) * (1 - prog(f, to - 8, to, EASE_IN_OUT));

const stateA = (t: number): FieldState => {
  const { cam, insts } = fieldA(t);
  const rings: Record<string, number> = {};
  for (const r of READS) rings[`a-${r.id}`] = readRing(t, r.from, r.to);
  const read = READS.find((r) => t >= r.from - 20 && t <= r.to + 4);
  return { cam, insts, focus: focusA(t), aperture: 5.5, rings, subject: read ? `a-${read.id}` : undefined };
};
const stateB = (t: number): FieldState => {
  const { cam, insts } = fieldB(t);
  return {
    cam,
    insts,
    focus: focusB(t),
    aperture: t < WARP.cruiseTo ? 3.5 : t < HITS.found - 6 ? 7 : 12,
    fog: [3600, 9400],
    subject: t >= WARP.cruiseTo ? 'target' : undefined,
    rings: { target: prog(t, HITS.found, HITS.found + 9, EASE_SPRING) },
    near: ['target'],
    dimOthers: prog(t, HITS.found - 4, HITS.found + 8, EASE_MODAL),
  };
};
const stateBurst = (t: number): FieldState => ({ ...fieldBurst(t), focus: focusA(0) });

/**
 * The find: on the hit, two ink rings leave the needle's edge and grow out
 * across the field (the kit's Ping, in screen space, around the card as the
 * camera sees it), the emphasis the citation gets in the answer, bigger.
 */
const FindPing: React.FC<{ f: number }> = ({ f }) => {
  if (f < HITS.found || f >= HITS.dive + 4) return null;
  const cam = cameraB(f);
  const tgt = targetAt(f);
  const g = geom(TARGET.id);
  const s = FOCAL / (cam.z - TARGET.z);
  const cx = FRAME.cx + (tgt.x - cam.x) * s + (g.rect.x + g.rect.w / 2 - g.imgW / 2) * s;
  const cy = FRAME.cy + (tgt.y - cam.y) * s + (g.rect.y + g.rect.h / 2 - g.imgH / 2) * s;
  // the card's own lift on the find (Field.tsx: 1 + 0.06 × its ring)
  const lift = 1 + 0.06 * EASE_SPRING(Math.min(1, Math.max(0, (f - HITS.found) / 9)));
  const w = g.rect.w * s * lift;
  const h = g.rect.h * s * lift;
  const ring = (t0: number, life: number, reach: number, width: number, alpha: number) => {
    const t = (f - t0) / life;
    if (t <= 0 || t >= 1) return null;
    const out = 1 - Math.pow(1 - t, 3);
    const d = reach * out;
    return (
      <div
        style={{
          position: 'absolute',
          left: cx - w / 2 - d,
          top: cy - h / 2 - d,
          width: w + 2 * d,
          height: h + 2 * d,
          borderRadius: g.radius * s + d,
          boxShadow: `0 0 0 ${(width * (1 - 0.5 * out)).toFixed(2)}px rgba(20,20,27,${(alpha * Math.pow(1 - t, 1.5)).toFixed(3)})`,
        }}
      />
    );
  };
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', transform: cam.roll ? `rotate(${cam.roll}deg)` : undefined }}>
      {ring(HITS.found + 1, 14, 130, 6, 0.5)}
      {ring(HITS.found + 4, 20, 280, 3.5, 0.3)}
      {ring(HITS.found + 8, 26, 440, 2, 0.16)}
    </AbsoluteFill>
  );
};

/** the dare, set big over the field on frame 0; it rolls out as the search starts */
const HOOK = CAPTIONS[0];
const Hook: React.FC<{ f: number }> = ({ f }) => {
  if (f >= HOOK.to + 1) return null;
  const lines = HOOK.text.split('\n');
  const out = prog(f, HOOK.to - 7, HOOK.to, (t) => t * t * t);
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, top: 262, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      {lines.map((l, k) => (
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
              transform: `translateY(${Math.round(-out * 108 - k * 0)}%)`,
            }}
          >
            {l}
          </div>
        </div>
      ))}
    </div>
  );
};

/** the narrated lines, word-timed to the takes, in the band */
const Lines: React.FC<{ f: number }> = ({ f }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    {CAPTIONS.filter((c) => c.place !== 'scene').map((c) => {
      const t = VO.find((v) => v.frame === c.at);
      const starts = t?.words.map((s) => Math.round(s * FPS));
      return (
        <div key={c.at} style={{ position: 'absolute', left: 0, right: 0, top: 330, display: 'flex', justifyContent: 'center' }}>
          <KineticLine text={c.text} frame={f} from={c.at} to={c.to} starts={starts} size={68} weight={650} width={1000} />
        </div>
      );
    })}
  </AbsoluteFill>
);

/**
 * Type never sits on busy picture: a paper scrim rises behind the band
 * whenever a line is up (and behind the dare, deeper), and falls away when
 * nothing is said (the search breathes, the answer reads).
 */
const scrimAt = (f: number) => {
  // [solid until, clear by, opacity]
  if (f < HOOK.to + 4) return { solid: 600, clear: 860, o: 1 };
  if (f >= HITS.typing - 2 && f < HITS.send) return { solid: 280, clear: 520, o: 1 };
  if (f >= HITS.answer && f < HITS.lockup) return { solid: 470, clear: 610, o: 1 - prog(f, HITS.lockup - 15, HITS.lockup - 3, EASE_IN_OUT) };
  if (f >= HITS.lockup && f < HITS.ps - 2) return { solid: 510, clear: 720, o: 0 };
  // the P.S. sits in the dare's own scrim, so the loop's seam is invisible
  if (f >= HITS.ps - 2) return { solid: 600, clear: 860, o: 1 };
  const on = CAPTIONS.some((c) => c.place !== 'scene' && f >= c.at - 8 && f <= c.to + 4);
  return { solid: 510, clear: 720, o: on ? 1 : 0.0 };
};

export const Needle: React.FC<{ withAudio?: boolean; withCaptions?: boolean }> = ({ withAudio = true, withCaptions = true }) => {
  const f = useCurrentFrame();
  CLOCK.perFrame = 1;
  const sc = scrimAt(f);
  // the scrim eases between states instead of popping: blend toward the
  // previous frames' opacity
  const o = [0, 1, 2, 3, 4, 5].reduce((acc, k) => acc + scrimAt(f - k).o, 0) / 6;
  const paper = signOffPaper(f);
  return (
    <AbsoluteFill style={{ fontFamily: sans, background: FIELD_BG }}>
      {withAudio && <Audio src={staticFile('clips/needle/score-vo.wav')} />}
      {/* the field: the dare, the search, the gather */}
      {f < HITS.ask && <MotionField frame={f} samples={samplesA(f)} at={stateA} />}
      {/* the tunnel, onto the needle, and the dive */}
      {f >= HITS.send && f < HITS.answer && <MotionField frame={f} samples={samplesB(f)} shutter={f < HITS.brake ? 0.3 : f < HITS.found ? 0.38 : 0.5} at={stateB} />}
      <FindPing f={f} />
      {/* the real app: Ask, the question; the answer */}
      <App f={f} />
      <GatherMark f={f} />
      {/* the sign-off's paper, then the field flying back to frame 0 */}
      {paper > 0 && <AbsoluteFill style={{ background: FIELD_BG, opacity: paper }} />}
      {f >= BURST.from && <MotionField frame={f} samples={f < BURST.from + 18 ? 5 : f < BURST.to ? 3 : 1} at={stateBurst} />}
      <EndCard f={f} show={withCaptions} />
      {withCaptions && (
        <AbsoluteFill
          style={{
            pointerEvents: 'none',
            opacity: o,
            background: `linear-gradient(180deg, ${TONE} 0px, ${TONE} ${sc.solid}px, ${clearOf(TONE)} ${sc.clear}px)`,
          }}
        />
      )}
      {withCaptions && <Hook f={f} />}
      {withCaptions && <Lines f={f} />}
      <Lens vignette={0.35} grain={0.035} />
    </AbsoluteFill>
  );
};

export { TARGET, TOTAL_FRAMES };
