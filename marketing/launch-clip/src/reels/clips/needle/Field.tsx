import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { Dither } from '../../kit/Paper';
import { FOCAL, FRAME, geom, type Cam, type Inst } from './field';

/**
 * The field, drawn: every card is the app's own rendering of a save (a PNG
 * the capture shot), hung in true perspective (CSS 3D, perspective = the
 * camera's focal length, so a card at depth d is drawn FOCAL/d its size and
 * its tilt foreshortens), painted far to near.
 *
 *  - depth of field: a card's blur grows with how far it sits from the focal
 *    plane (a thin-lens falloff), so the eye lands where the story is;
 *  - fog: far cards fade into the paper, which is what makes it a field and
 *    not a wallpaper;
 *  - emphasis: the kit's ink ring (Lift), drawn on the card's own rounded
 *    rect, with a small lift toward the camera; never a recolour.
 *
 * Motion blur is real: `MotionField` renders the field at several moments
 * inside one frame's shutter and averages them (each sample is opaque, and
 * sample k is laid over the first k at opacity 1/k, which is exactly their
 * mean). Fast moves get more samples; a still frame gets one.
 */

export const FIELD_BG = 'linear-gradient(180deg, #F8F9FB 0%, #F1F3F6 58%, #ECEEF2 100%)';

const FOG: [number, number] = [4200, 9400];
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export type FieldState = {
  cam: Cam;
  insts: Inst[];
  /** focal distance (world px) */
  focus: number;
  /** screen blur, px, at twice / half the focal distance */
  aperture?: number;
  /** instance key → emphasis 0–1 (ink ring + lift) */
  rings?: Record<string, number>;
  /** keys allowed closer than the near cull (the needle the camera dives into) */
  near?: string[];
  /** 0–1: everything but the `near` cards recedes (the find) */
  dimOthers?: number;
  /** the card the story is about this moment: anything nearer that would
   *  cover it on screen steps out of the way (fades by how much it covers) */
  subject?: string;
  /** [start, end] of the fog, world px */
  fog?: [number, number];
};

const src = (id: string, big: boolean) => staticFile(`reel/app/clips/needle/${big ? 'cards' : 'cards-sm'}/${id}.png`);

export const FieldView: React.FC<FieldState & { background?: boolean }> = ({
  cam,
  insts,
  focus,
  aperture = 7,
  rings = {},
  near = [],
  dimOthers = 0,
  subject,
  fog: fogRange = FOG,
  background = true,
}) => {
  const items = insts
    .map((i) => ({ i, d: cam.z - i.z }))
    .filter(({ i, d }) => d > (near.includes(i.key) ? 60 : 110) && d < fogRange[1])
    .sort((a, b) => b.d - a.d);
  // the subject's box on screen (centre ± half its card), for the step-aside
  const subj = (() => {
    const q = subject ? items.find(({ i }) => i.key === subject) : undefined;
    if (!q) return null;
    const g = geom(q.i.id);
    const s = FOCAL / q.d;
    const k = q.i.s ?? 1;
    return {
      d: q.d,
      x: FRAME.cx + (q.i.x - cam.x) * s,
      y: FRAME.cy + (q.i.y - cam.y) * s,
      w: g.rect.w * s * k,
      h: g.rect.h * s * k,
    };
  })();
  return (
    <AbsoluteFill style={{ overflow: 'hidden' }}>
      {background && (
        <>
          <AbsoluteFill style={{ background: FIELD_BG }} />
          <Dither />
        </>
      )}
      <AbsoluteFill
        style={{
          perspective: FOCAL,
          perspectiveOrigin: `${FRAME.cx}px ${FRAME.cy}px`,
          transform: cam.roll ? `rotate(${cam.roll.toFixed(3)}deg)` : undefined,
          transformOrigin: `${FRAME.cx}px ${FRAME.cy}px`,
        }}
      >
        {items.map(({ i, d }) => {
          const g = geom(i.id);
          const s = FOCAL / d;
          const k = i.s ?? 1;
          const ring = rings[i.key] ?? 0;
          const lift = 1 + 0.06 * ring;
          const screenW = g.imgW * s * k * lift;
          // off-frame: skip (rotation and lift included in the margin)
          const sx = FRAME.cx + (i.x - cam.x) * s;
          const sy = FRAME.cy + (i.y - cam.y) * s;
          const half = (Math.max(g.imgW, g.imgH) * s * k * lift) / 2 + 60;
          if (sx + half < -40 || sx - half > FRAME.w + 40 || sy + half < -40 || sy - half > FRAME.h + 40) return null;
          // too small to read or to matter: a speck the fog would take anyway
          if (screenW < 22) return null;
          const fog = 1 - smooth(fogRange[0], fogRange[1], d);
          const fade = near.includes(i.key) ? 1 : smooth(110, 190, d);
          let aside = 1;
          if (subj && i.key !== subject && d < subj.d) {
            const w = g.rect.w * s * k;
            const h = g.rect.h * s * k;
            const ox = Math.max(0, Math.min(sx + w / 2, subj.x + subj.w / 2) - Math.max(sx - w / 2, subj.x - subj.w / 2));
            const oy = Math.max(0, Math.min(sy + h / 2, subj.y + subj.h / 2) - Math.max(sy - h / 2, subj.y - subj.h / 2));
            aside = 1 - 0.92 * Math.min(1, (3 * ox * oy) / (subj.w * subj.h));
          }
          const opacity = fog * fade * aside * (near.includes(i.key) ? 1 : 1 - 0.45 * dimOthers);
          if (opacity < 0.01) return null;
          const blurScreen = Math.min(18, aperture * Math.abs(1 - focus / d));
          const blurLocal = blurScreen / (s * k * lift);
          return (
            <div
              key={i.key}
              style={{
                position: 'absolute',
                left: FRAME.cx - g.imgW / 2,
                top: FRAME.cy - g.imgH / 2,
                width: g.imgW,
                height: g.imgH,
                opacity,
                transform: [
                  `translate3d(${(i.x - cam.x).toFixed(2)}px, ${(i.y - cam.y).toFixed(2)}px, ${(FOCAL - d).toFixed(2)}px)`,
                  `rotateX(${i.rx.toFixed(3)}deg)`,
                  `rotateY(${i.ry.toFixed(3)}deg)`,
                  `rotateZ(${i.rz.toFixed(3)}deg)`,
                  `scale(${(k * lift).toFixed(4)})`,
                ].join(' '),
                filter: blurScreen > 0.35 ? `blur(${blurLocal.toFixed(2)}px)` : undefined,
              }}
            >
              <Img src={src(i.id, screenW > 760)} style={{ width: '100%', height: '100%', display: 'block' }} />
              {ring > 0.003 && (
                <div
                  style={{
                    position: 'absolute',
                    left: g.rect.x,
                    top: g.rect.y,
                    width: g.rect.w,
                    height: g.rect.h,
                    borderRadius: g.radius,
                    boxShadow: [
                      `0 0 0 ${(4.6 / (s * k * lift)).toFixed(2)}px rgba(20,20,27,${Math.min(0.75, 0.72 * ring).toFixed(3)})`,
                      `0 ${(26 / (s * k)).toFixed(1)}px ${(60 / (s * k)).toFixed(1)}px -${(10 / (s * k)).toFixed(1)}px rgba(24,32,48,${(0.3 * ring).toFixed(3)})`,
                    ].join(', '),
                  }}
                />
              )}
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

/**
 * The field with a 180° shutter: `samples` renders inside the frame's
 * exposure, averaged. `at(t)` gives the field at any (fractional) frame.
 */
export const MotionField: React.FC<{ frame: number; samples: number; shutter?: number; at: (t: number) => FieldState }> = ({
  frame,
  samples,
  shutter = 0.5,
  at,
}) => {
  const n = Math.max(1, Math.round(samples));
  if (n === 1) return <FieldView {...at(frame)} />;
  return (
    <AbsoluteFill>
      {Array.from({ length: n }, (_, k) => {
        const t = frame + (k / (n - 1) - 0.5) * shutter;
        const st = at(t);
        return (
          <AbsoluteFill key={k} style={{ opacity: 1 / (k + 1) }}>
            <FieldView {...st} aperture={(st.aperture ?? 7) * (n > 3 ? 0.55 : 1)} />
          </AbsoluteFill>
        );
      })}
    </AbsoluteFill>
  );
};
