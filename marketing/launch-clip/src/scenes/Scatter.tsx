import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { SAVES, HITS } from '../../timeline.mjs';
import {
  CONSTELLATION,
  FlyChip,
  SaveSurface,
  Silo,
  SILO_BASE_COUNT,
  SILO_OFFSET,
  SURFACE_CTL,
  SURFACE_H,
} from '../ui/platforms';
import { SET_BG, Stage } from '../film/effects';
import { useFraming } from '../film/format';
import { Tap } from '../ui/app';
import { drift, prog, ramp, EASE_IN_OUT, EASE_MODAL, EASE_OUT } from '../film/anim';

/**
 * Act one, rebuilt as a story (round 13): SCATTERED SAVING.
 *
 * Beat A — saving everywhere. A fast run across the five surfaces, each with
 * its own real gesture: bookmark on Instagram, Save-to-playlist on YouTube,
 * send-to-yourself on WhatsApp, star on X, one-more-tab in Safari. Every save
 * flies off in a different direction and lands in its own separate silo. The
 * tap contacts sit ON the quarter-note grid (timeline.mjs SAVES) so the score
 * ticks each one.
 *
 * Beat B — the piles. The five silos sit apart, each growing its own stack,
 * nothing crossing between them. What is inside is deliberately unreadable:
 * stacked edges, faded thumbnails, no titles.
 *
 * Beat C — the loss, ON BAR 3 (the film's only minor chord). One person goes
 * looking for one thing they know they saved — and opens the wrong pile,
 * twice. A fingertip motivates each open; the fan-out reveals only more
 * unreadable cards; the pile drops shut with a thud. Then everything bleaches
 * into the paper, and the wordmark's gather resolves it.
 *
 * Everything stays 2D — 3D rotation makes Chromium snapshot-and-scale layers,
 * which was the softness the owner flagged in round 11. Light grade, ink on
 * paper, un-branded surfaces (a failure wearing Machina's chrome would read as
 * the product's).
 */

// Local tap-contact frames, derived from the shared bar map (scene starts bar 1).
const CONTACTS = SAVES.map((s) => Math.round((s - 1) * 75));
const LOSS = {
  openA: Math.round((HITS.lossOpenA - 1) * 75), // 155
  shutA: Math.round((HITS.lossShutA - 1) * 75), // 190
  openB: Math.round((HITS.lossOpenB - 1) * 75), // 200
  shutB: Math.round((HITS.lossShutB - 1) * 75), // 235
};
// which pile the search opens (both wrong): WhatsApp first, then Safari
const WRONG_A = 3;
const WRONG_B = 4;

export const Scatter: React.FC = () => {
  const f = useCurrentFrame();
  const fr = useFraming();
  const vx = fr.vertical ? 0.42 : 0.78;
  const vy = fr.vertical ? 1.45 : 0.82;

  const siloPos = CONSTELLATION.map((p) => ({ x: p.x * vx, y: p.y * vy }));

  // ── camera: neutral through the save run, a gentle push onto each wrong
  // pile during the loss, back out for the bleach. 2D only.
  const wA =
    prog(f, LOSS.openA - 6, LOSS.openA + 16, EASE_IN_OUT) *
    (1 - prog(f, LOSS.openB - 8, LOSS.openB + 12, EASE_IN_OUT));
  const wB =
    prog(f, LOSS.openB - 8, LOSS.openB + 12, EASE_IN_OUT) *
    (1 - prog(f, LOSS.shutB, LOSS.shutB + 27, EASE_IN_OUT));
  const camScale = (fr.vertical ? 0.9 : 1) * (1 + 0.15 * (wA + wB));
  const camX = -(siloPos[WRONG_A].x * wA + siloPos[WRONG_B].x * wB) * 0.6;
  const camY = -(siloPos[WRONG_A].y * wA + siloPos[WRONG_B].y * wB) * 0.6 + drift(f, 6, 320);

  const out = 1 - prog(f, 288, 300);

  return (
    <AbsoluteFill style={{ background: SET_BG, opacity: out }}>
      <Stage intensity={0.62} backlight={0.25} />

      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
        <div
          style={{
            position: 'relative',
            width: 1,
            height: 1,
            transform: `translate3d(${Math.round(camX)}px, ${Math.round(camY)}px, 0) scale(${camScale})`,
          }}
        >
          {/* ── the five silos, sitting apart the whole act */}
          {CONSTELLATION.map((p, i) => {
            const c = CONTACTS[i];
            const land = c + 15;
            // the silo exists faintly from the start, brightens as ITS save lands
            const alive = 0.45 + 0.55 * prog(f, land - 4, land + 8, EASE_OUT);
            // the pile keeps growing through beat B — items nobody will read
            const grow =
              prog(f, land, land + 30, EASE_IN_OUT) * 0.5 +
              prog(f, land + 30, land + 65, EASE_IN_OUT) * 0.5;
            // landing bounce
            const bounce = Math.max(0, 1 - Math.abs(f - land - 4) / 9) * 0.06;
            // the wrong-pile opens (beat C)
            const openT =
              i === WRONG_A
                ? prog(f, LOSS.openA, LOSS.openA + 15, EASE_MODAL) * (1 - prog(f, LOSS.shutA - 5, LOSS.shutA + 5, EASE_MODAL))
                : i === WRONG_B
                  ? prog(f, LOSS.openB, LOSS.openB + 15, EASE_MODAL) * (1 - prog(f, LOSS.shutB - 5, LOSS.shutB + 5, EASE_MODAL))
                  : 0;
            // the shut: a small drop the moment the fan collapses
            const shutAt = i === WRONG_A ? LOSS.shutA : i === WRONG_B ? LOSS.shutB : -100;
            const shutThud = Math.max(0, 1 - Math.abs(f - shutAt - 4) / 8) * 0.05;
            // the light-grade exit: bleach into the paper, staggered
            const gone = prog(f, 245 + ((i * 13) % 5) * 8, 278 + ((i * 13) % 5) * 8, EASE_IN_OUT);

            const count = SILO_BASE_COUNT[p.k] + (f >= land ? 1 : 0);

            return (
              <div
                key={p.k}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  marginLeft: SILO_OFFSET.x,
                  marginTop: SILO_OFFSET.y,
                  transform: [
                    `translate3d(${siloPos[i].x}px, ${siloPos[i].y + drift(f, 4, 260 + i * 24, i)}px, 0)`,
                    `scale(${1 + bounce + shutThud + openT * 0.3})`,
                  ].join(' '),
                  opacity: alive * (1 - gone) * (openT > 0 ? 1 : 1),
                  zIndex: openT > 0 ? 30 : 10 - i,
                  filter: `blur(${gone * 5}px) saturate(${1 - gone * 0.9}) brightness(${1 + gone * 0.35})`,
                }}
              >
                <Silo k={p.k} grow={grow} open={openT} count={count} />
                {/* the searching fingertip, landing just before each open */}
                {i === WRONG_A && <Tap t={prog(f, LOSS.openA - 12, LOSS.openA + 12)} size={54} />}
                {i === WRONG_B && <Tap t={prog(f, LOSS.openB - 12, LOSS.openB + 12)} size={54} />}
              </div>
            );
          })}

          {/* ── the flying saves: gesture → arc → land in the silo */}
          {CONSTELLATION.map((p, i) => {
            const c = CONTACTS[i];
            const t = prog(f, c, c + 16, EASE_IN_OUT);
            if (t <= 0 || t >= 1) return null;
            const ctl = SURFACE_CTL[p.k];
            const x0 = ctl.x * (fr.vertical ? 0.9 : 1);
            const y0 = -20 + ctl.y;
            const x = x0 + (siloPos[i].x - x0) * t;
            const y = y0 + (siloPos[i].y - y0) * t - Math.sin(Math.PI * t) * 80;
            return (
              <div
                key={`fly-${p.k}`}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  marginLeft: -44,
                  marginTop: -28,
                  transform: `translate3d(${x}px, ${y}px, 0) scale(${1 - t * 0.5}) rotate(${(t * (i % 2 ? 10 : -10))}deg)`,
                  opacity: Math.min(1, t * 6) * (1 - Math.max(0, (t - 0.88) / 0.12)),
                  zIndex: 40,
                }}
              >
                <FlyChip k={p.k} />
              </div>
            );
          })}

          {/* ── beat A: the surfaces. Each one LINGERS after its tap (round
              13c: the hard in-and-out read as too fast) — after the save it
              drifts off toward its own silo and fades while the next surface
              rises over it, so the run reads as a cascade, not a slideshow. */}
          {CONSTELLATION.map((p, i) => {
            const c = CONTACTS[i];
            const enter = prog(f, c - 17, c - 5, EASE_OUT);
            const exit = prog(f, c + 6, c + 36, EASE_IN_OUT);
            if (enter <= 0 || exit >= 1) return null;
            const save = prog(f, c - 4, c + 4);
            const ctl = SURFACE_CTL[p.k];
            return (
              <div
                key={`srf-${p.k}`}
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  marginLeft: -215,
                  marginTop: -SURFACE_H / 2 - 20,
                  transform: [
                    `translate3d(${exit * siloPos[i].x * 0.3}px, ${
                      (1 - enter) * 44 + exit * siloPos[i].y * 0.3
                    }px, 0)`,
                    `scale(${(0.95 + enter * 0.05 - exit * 0.12) * (fr.vertical ? 0.9 : 1)})`,
                  ].join(' '),
                  opacity: enter * (1 - exit),
                  zIndex: 50 + i,
                }}
              >
                <div style={{ position: 'relative' }}>
                  <SaveSurface k={p.k} save={save} />
                  {/* the fingertip, centred on this surface's save control */}
                  <span
                    style={{
                      position: 'absolute',
                      left: 215 + ctl.x,
                      top: SURFACE_H / 2 + ctl.y,
                      width: 0,
                      height: 0,
                    }}
                  >
                    <Tap t={prog(f, c - 11, c + 11)} size={48} />
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </AbsoluteFill>

      {/* the frame washing toward white as the piles bleach out */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(78% 66% at 50% 48%, rgba(238,240,244,0) 42%, rgba(244,246,249,${
            0.2 + prog(f, 240, 296) * 0.55
          }) 100%)`,
          pointerEvents: 'none',
        }}
      />
    </AbsoluteFill>
  );
};
