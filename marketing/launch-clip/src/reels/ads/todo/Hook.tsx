import React from 'react';
import { AbsoluteFill, Img, staticFile, useVideoConfig } from 'remotion';
import { HITS } from '../../../../clips/ad-todo-timeline.mjs';
import { MarkAssembly } from '../../kit/Brand';
import { EASE_GATHER, EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../../kit/curves';
import { useShape } from './frame';

/**
 * 1 HOOK. The poster: a pile of screenshots, the kind a camera roll fills up
 * with (the ad's own invented, typographic ones: capture/ad-todo.mjs renders
 * them, copied small into public/ads/todo/hook/). The advice carousel the ad
 * saves is on top: "How to ask for a raise". Frame 0 already reads (no fade
 * from white). On "…never took." they rush into one point (EASE_GATHER), the
 * brackets snap round it (the app's spring): the Machina mark. The point
 * then drops onto the + button (the reel's match cut) and the app irises open
 * round it (App.tsx draws the iris from the same point).
 *
 * The shots are pictures, not app UI: no platform chrome, no third-party
 * image, no real creator.
 */

/** where everything gathers (tall frame; the feed shape moves it by dy) */
export const POINT = { x: 540, y: 960 };
/** the + button's centre in the frame when the app opens (App.tsx OPEN_CAM) */
export const PLUS = { x: 540, y: 1180, r: 20 * 1.5 };
const MARK_W = 220;
export const POINT_R = 52 * (MARK_W / 448);

const SHOTS: { f: string; x: number; y: number; w: number; r: number; blur: number }[] = [
  { f: 'other-3', x: 840, y: 1180, w: 300, r: 9, blur: 1.2 },
  { f: 'other-2', x: 230, y: 1220, w: 290, r: -10, blur: 1.2 },
  { f: 'raise-3', x: 790, y: 860, w: 310, r: 6, blur: 0.4 },
  { f: 'other-1', x: 270, y: 840, w: 300, r: -7, blur: 0.4 },
  { f: 'raise-2', x: 650, y: 1000, w: 330, r: 3, blur: 0 },
  { f: 'raise-1', x: 430, y: 960, w: 350, r: -3.5, blur: 0 },
];

export const Hook: React.FC<{ f: number }> = ({ f }) => {
  const { dy } = useShape();
  const { height } = useVideoConfig();
  if (f > HITS.iris[1]) return null;
  const P = { x: POINT.x, y: POINT.y + dy };
  const g = (lag: number) => prog(f - lag, HITS.gather[0], HITS.gather[1], EASE_GATHER);
  // a slow push in from frame 0 (a hold is never dead still)
  const push = 1 + 0.05 * prog(f, 0, HITS.gather[0], (t) => t);
  const dot = prog(f, HITS.gather[1], HITS.gather[1] + 7, EASE_SPRING);
  const flash = f < HITS.gather[1] ? Math.pow(prog(f, HITS.gather[0], HITS.gather[1], (t) => t), 3) * 0.45 : Math.max(0, 1 - (f - HITS.gather[1]) / 18);
  const close = prog(f, HITS.gather[1] + 1, HITS.snap + 4, EASE_SPRING);
  // the brackets hold while the point drops away, then part
  const part = prog(f, HITS.part + 6, HITS.iris[1], EASE_IN_OUT);
  const travel = prog(f, HITS.part, HITS.iris[0], EASE_IN_OUT);
  const plus = { x: PLUS.x, y: PLUS.y + dy };
  const dotX = mix(P.x, plus.x, travel);
  const dotY = mix(P.y, plus.y, travel);
  const dotScale = mix(1, PLUS.r / POINT_R, travel);
  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {f < HITS.gather[1] + 1 &&
        SHOTS.map((s, k) =>
          [3, 2, 1, 0].map((lag) => {
            const t = g(lag * 1.2 - k * 0.6);
            if (lag > 0 && t < 0.08) return null;
            const alpha = lag === 0 ? 1 : [0, 0.28, 0.16, 0.08][lag];
            const x = P.x + (s.x - POINT.x) * push * (1 - t);
            const y = P.y + (s.y - POINT.y) * push * (1 - t);
            const sc = push * mix(1, 0.05, Math.pow(t, 0.7));
            return (
              <div
                key={`${k}-${lag}`}
                style={{
                  position: 'absolute',
                  left: x,
                  top: y,
                  width: s.w,
                  transform: `translate(-50%, -50%) rotate(${s.r * (1 - t) + t * (k % 2 ? 14 : -14)}deg) scale(${sc})`,
                  opacity: alpha * (1 - Math.pow(t, 5)),
                  filter: s.blur + t * 2 > 0.2 ? `blur(${(s.blur * (1 - t) + t * 2).toFixed(2)}px)` : undefined,
                }}
              >
                <Img
                  src={staticFile(`ads/todo/hook/${s.f}.jpg`)}
                  style={{
                    display: 'block',
                    width: '100%',
                    borderRadius: 22,
                    border: '1px solid rgba(16,24,40,0.08)',
                    boxShadow: '0 1px 2px rgba(16,24,40,0.08), 0 26px 60px -20px rgba(24,32,48,0.35), 0 50px 90px -40px rgba(24,32,48,0.22)',
                  }}
                />
              </div>
            );
          }),
        )}

      {/* the landing: a lift of white light */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(38% 22% at 50% ${((P.y / height) * 100).toFixed(2)}%, rgba(255,255,255,${0.9 * flash}) 0%, rgba(255,255,255,0) 70%)`,
        }}
      />

      {/* the mark: the brackets */}
      {f >= HITS.gather[1] - 1 && part < 1 && (
        <div
          style={{
            position: 'absolute',
            left: P.x,
            top: P.y,
            transform: 'translate(-50%, -50%)',
            opacity: 1 - part,
            filter: `drop-shadow(0 ${10 + flash * 10}px ${30 + flash * 40}px rgba(24,32,48,${0.22 + flash * 0.2}))`,
          }}
        >
          <MarkAssembly close={Math.max(0, close * (1 - part * 0.35))} dot={0} width={MARK_W} />
        </div>
      )}

      {/* the point: everything gathered; it drops onto the + */}
      {dot > 0 && f < HITS.iris[0] + 8 && (
        <div
          style={{
            position: 'absolute',
            left: dotX,
            top: dotY,
            width: POINT_R * 2,
            height: POINT_R * 2,
            borderRadius: '50%',
            background: '#14141B',
            transform: `translate(-50%, -50%) scale(${dot * dotScale})`,
            boxShadow: `0 ${8 + flash * 8}px ${26 + flash * 30}px rgba(24,32,48,${0.3 + flash * 0.2})`,
            opacity: 1 - prog(f, HITS.iris[0], HITS.iris[0] + 8, EASE_MODAL),
          }}
        />
      )}
    </AbsoluteFill>
  );
};
