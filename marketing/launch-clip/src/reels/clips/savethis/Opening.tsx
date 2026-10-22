import React from 'react';
import { AbsoluteFill, random } from 'remotion';
import { HITS } from '../../../../clips/savethis-timeline.mjs';
import { MarkAssembly } from '../../kit/Brand';
import { EASE_GATHER, EASE_IN_OUT, EASE_MODAL, EASE_SPRING, mix, prog } from '../../kit/curves';
import { SET_BG } from '../../../film/effects';
import { Paper } from '../../kit/Paper';
import { Bookmark, POSTER, PosterArt } from './Poster';

/**
 * 0:00 to the app. Where saves go, and the one place they don't.
 *
 *  poster   frame 0: "You're going to save this video." over an empty
 *           bookmark; the thumb fills it on "save".
 *  trapdoor "And never watch it again": the type rolls out, the paper
 *           splits under the bookmark and swings open like a trapdoor.
 *  pit      it falls into a well lined with every other save (posts,
 *           videos, screenshots, links: unreadable, bleaching into the
 *           paper with depth) and lands on the heap at the bottom on the
 *           beat after "there,"; "with all the others" dives down at it.
 *  gather   "Unless you save it to Machina": the well and its heap rush
 *           into the vanishing point, which IS the mark's point; the
 *           brackets close on it on "Machina" (the score's impact).
 *  hand-off the mark shrinks and travels onto the processing card's own
 *           mark as the app irises open around it (App.tsx owns the
 *           iris; MARK_TO is where the card's mark sits in frame).
 *
 * Generic glyphs only, never a platform's UI: the pit is nobody's app.
 */

const C = { x: 540, y: 1040 }; // the vanishing point, then the mark
const F = 1000; // focal length of the well's projection

/** the well's camera depth: a slow push while the bookmark falls, then the
 *  dive at the heap on "with all the others" */
const camZ = (f: number) =>
  prog(f, HITS.drop + 4, HITS.land, (t) => t) * 500 + prog(f, HITS.land + 8, HITS.gather - 2, EASE_IN_OUT) * 2700;

type Kind = 'post' | 'video' | 'link' | 'shot' | 'mark';
type Tile = { x: number; y: number; z: number; w: number; h: number; r: number; kind: Kind; tone: number };

/** the well: rings of saves on the walls of a tall box, deeper and deeper */
const WALL = { x: 760, y: 1180 };
const RINGS = 26;
const PILE_Z = 4600;
const tiles: Tile[] = (() => {
  const out: Tile[] = [];
  const kinds: Kind[] = ['post', 'video', 'link', 'shot', 'post', 'video', 'mark'];
  for (let k = 0; k < RINGS; k++) {
    const z = 700 + k * 150;
    const n = 9;
    for (let j = 0; j < n; j++) {
      const s = `w${k}-${j}`;
      // a point on the box's perimeter, jittered
      const u = (j + random(s + 'u') * 0.8) / n;
      const per = 2 * (WALL.x + WALL.y);
      let d = u * per * 2;
      let x: number;
      let y: number;
      const P = 2 * WALL.x;
      const Q = 2 * WALL.y;
      d %= 2 * (P + Q);
      if (d < P) [x, y] = [-WALL.x + d, -WALL.y];
      else if (d < P + Q) [x, y] = [WALL.x, -WALL.y + (d - P)];
      else if (d < 2 * P + Q) [x, y] = [WALL.x - (d - P - Q), WALL.y];
      else [x, y] = [-WALL.x, WALL.y - (d - 2 * P - Q)];
      const kind = kinds[Math.floor(random(s + 'k') * kinds.length)];
      const w = kind === 'shot' ? 230 : 300 + random(s + 'w') * 60;
      const h = kind === 'shot' ? 400 : kind === 'mark' ? 300 : 330 + random(s + 'h') * 70;
      out.push({ x: x * 0.92, y: y * 0.92, z, w, h, r: (random(s + 'r') - 0.5) * 16, kind, tone: random(s + 't') });
    }
  }
  // the heap at the bottom: every other save, piled up
  for (let i = 0; i < 150; i++) {
    const s = `p${i}`;
    const a = random(s + 'a') * Math.PI * 2;
    const rr = Math.sqrt(random(s + 'r')) * 1000;
    const kind = (['mark', 'post', 'mark', 'video', 'shot', 'mark', 'link'] as Kind[])[Math.floor(random(s + 'k') * 7)];
    out.push({
      x: Math.cos(a) * rr,
      y: Math.sin(a) * rr * 0.85 + 60,
      // a heap: its middle is its peak, nearest the camera
      z: PILE_Z - (1 - rr / 1000) * 520 - random(s + 'z') * 60,
      w: kind === 'shot' ? 230 : 300,
      h: kind === 'shot' ? 400 : kind === 'mark' ? 300 : 340,
      r: (random(s + 'o') - 0.5) * 120,
      kind,
      tone: random(s + 't'),
    });
  }
  // far first, so the near ones paint over them
  return out.sort((a, b) => b.z - a.z);
})();

/** one save as the well shows it: generic, grey, unreadable */
const SaveTile: React.FC<{ t: Tile }> = ({ t }) => {
  if (t.kind === 'mark') {
    return <Bookmark size={t.w} fill={1} color={`rgba(52,60,74,${0.55 + t.tone * 0.3})`} stroke={1.2} shadow={0.6} />;
  }
  const bar = (w: string, o = 0.16) => (
    <div style={{ height: 18, width: w, borderRadius: 9, background: `rgba(52,64,84,${o})`, marginTop: 14 }} />
  );
  const media =
    t.kind === 'post' || t.kind === 'video' ? (
      <div
        style={{
          height: '56%',
          borderRadius: 16,
          background: `linear-gradient(160deg, rgba(52,64,84,${0.1 + t.tone * 0.08}), rgba(52,64,84,${0.2 + t.tone * 0.1}))`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {t.kind === 'video' && (
          <div style={{ width: 0, height: 0, borderTop: '22px solid transparent', borderBottom: '22px solid transparent', borderLeft: '36px solid rgba(255,255,255,0.92)', marginLeft: 8 }} />
        )}
      </div>
    ) : null;
  return (
    <div
      style={{
        width: t.w,
        height: t.h,
        borderRadius: t.kind === 'shot' ? 34 : 24,
        background: '#FFFFFF',
        border: '1px solid rgba(16,24,40,0.07)',
        boxShadow: '0 2px 4px rgba(16,24,40,0.06), 0 22px 44px -18px rgba(24,32,48,0.3)',
        padding: 18,
        boxSizing: 'border-box',
      }}
    >
      {media}
      {t.kind === 'link' && (
        <div style={{ width: 54, height: 54, borderRadius: 14, background: 'rgba(52,64,84,0.12)', marginBottom: 6 }} />
      )}
      {bar('86%')}
      {bar('64%', 0.11)}
      {t.kind !== 'post' && bar('72%', 0.09)}
    </div>
  );
};

/** the poster's slow push (frame 0 at rest, so the loop lands on it), about
 *  the middle of the type and the bookmark */
const PUSH_Y = 1140;
const posterPush = (f: number) => 1 + 0.035 * prog(f, 0, HITS.drop, (t) => t);

/** the bookmark's fall: world position (x, y at depth z), tumbling */
const bookmarkAt = (f: number) => {
  // it hangs a moment over the opening doors, then gravity
  const t = Math.max(0, f - (HITS.drop + 8)) / (HITS.land - HITS.drop - 8);
  const fall = Math.min(1, t * t);
  const z0 = F / posterPush(HITS.drop); // on the poster's plane, as the push left it
  const z = mix(z0, PILE_Z - 560, fall);
  // from where it sits on the poster to the top of the heap
  const x = mix(POSTER.bookmark.x - C.x, 40, fall);
  const y = mix((PUSH_Y + (POSTER.bookmark.y - PUSH_Y) * posterPush(HITS.drop) - C.y) / posterPush(HITS.drop), 20, fall);
  const tip = prog(f, HITS.drop, HITS.drop + 6, EASE_MODAL);
  return { x, y, z, rz: -10 * tip + fall * 210, rx: 24 * tip + fall * 40 };
};

/** where the processing card's own mark sits in frame when the app opens
 *  (App.tsx measures it from the capture and the opening camera) */
export type MarkTarget = { x: number; y: number; size: number };

export const Opening: React.FC<{ f: number; markTo: MarkTarget; paperDrift: number }> = ({ f, markTo, paperDrift }) => {
  if (f > HITS.iris + 16) return null;

  // ── the trapdoor: the paper splits under the bookmark and swings down
  const door = prog(f, HITS.drop, HITS.drop + 16, EASE_GATHER);
  // ── the well, behind the doors, until the gather empties it
  const cz = camZ(f);
  const gather = prog(f, HITS.gather, HITS.markStrike - 10, EASE_GATHER);
  const wellLight = 1 - prog(f, HITS.markStrike - 14, HITS.markStrike - 4, EASE_IN_OUT);

  // ── the mark: the point lands, the brackets close on "Machina"
  const pointAt = HITS.markStrike - 10;
  const dot = f < pointAt ? 0 : prog(f, pointAt, pointAt + 6, EASE_SPRING);
  const close = prog(f, pointAt + 2, HITS.markStrike, EASE_SPRING);
  const flash = f < pointAt ? Math.pow(gather, 3) * 0.55 : Math.max(0, 1 - (f - pointAt) / 16);
  // ── the hand-off onto the card's mark, as the app opens around it
  const travel = prog(f, HITS.iris - 4, HITS.iris + 10, EASE_IN_OUT);
  const MARK_W = 300;
  const markX = mix(C.x, markTo.x, travel);
  const markY = mix(C.y, markTo.y, travel);
  const markW = mix(MARK_W, markTo.size, travel);

  const push = posterPush(f);
  const b = bookmarkAt(f);
  const bs = F / Math.max(60, b.z - cz);
  const landed = f >= HITS.land;
  // the landing: a small settle and a puff on the heap
  const settle = landed ? prog(f, HITS.land, HITS.land + 10, EASE_SPRING) : 0;

  return (
    <AbsoluteFill style={{ pointerEvents: 'none' }}>
      {/* the well (behind the doors; its own light, deepening to the heap) */}
      {f >= HITS.drop && f < HITS.markStrike && (
        <AbsoluteFill style={{ opacity: wellLight }}>
          <AbsoluteFill
            style={{
              background: `radial-gradient(46% 30% at ${(C.x / 1080) * 100}% ${(C.y / 1920) * 100}%, #AEB5C0 0%, #D3D8DF 34%, ${SET_BG} 78%)`,
            }}
          />
          {tiles.map((t, i) => {
            const dz = t.z - cz;
            if (dz < 90) return null;
            const s = F / dz;
            let x = C.x + t.x * s;
            let y = C.y + t.y * s;
            let sc = s;
            // gathered: everything rushes into the vanishing point
            if (gather > 0) {
              x = mix(x, C.x, gather);
              y = mix(y, C.y, gather);
              sc = sc * mix(1, 0.02, Math.pow(gather, 0.6));
            }
            const w = t.w * sc;
            if (w < 2.5 || x + w < -200 || x - w > 1280 || y + w * 1.6 < -200 || y - w * 1.6 > 2120) return null;
            // depth bleaches them into the well's light (forgotten), and the
            // nearest ones go soft (they are right at the lens)
            const isPile = t.z > PILE_Z - 700;
            const fog = Math.min(1, Math.max(0, (dz - 900) / 3600)) * (isPile ? 0.42 : 0.88);
            const near = Math.max(0, 1 - dz / 700);
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: x,
                  top: y,
                  transform: `translate(-50%, -50%) rotate(${t.r * (1 - gather) + gather * 40}deg) scale(${sc})`,
                  opacity: (1 - fog) * (1 - Math.pow(gather, 4)) * Math.min(1, (dz - 90) / 420),
                  filter: near > 0.02 ? `blur(${(near * 10).toFixed(1)}px)` : undefined,
                }}
              >
                <SaveTile t={t} />
              </div>
            );
          })}
        </AbsoluteFill>
      )}

      {/* the poster's paper, split in two, swinging down into the well */}
      {f < HITS.drop + 17 && (
        <AbsoluteFill style={{ perspective: 1600, perspectiveOrigin: `${C.x}px ${POSTER.bookmark.y}px` }}>
          {[0, 1].map((side) => (
            <div
              key={side}
              style={{
                position: 'absolute',
                top: 0,
                left: side === 0 ? 0 : 540,
                width: 540,
                height: 1920,
                overflow: 'hidden',
                transformOrigin: side === 0 ? 'left center' : 'right center',
                transform: `rotateY(${(side === 0 ? 1 : -1) * door * 100}deg)`,
                backfaceVisibility: 'hidden',
                boxShadow: door > 0.02 ? `0 0 ${60 * door}px rgba(24,32,48,${0.25 * door})` : undefined,
              }}
            >
              <div style={{ position: 'absolute', top: 0, left: side === 0 ? 0 : -540, width: 1080, height: 1920 }}>
                {/* the set itself, exactly as the reel's Paper draws it: on
                    frame 0 the doors ARE the poster (and the cover) */}
                <Paper drift={paperDrift} />
                <div style={{ position: 'absolute', inset: 0, transform: `scale(${push})`, transformOrigin: `540px ${PUSH_Y}px` }}>
                  <PosterArt sinceTap={f - HITS.tapSave} typeOut={prog(f, HITS.drop - 2, HITS.drop + 6, (t) => t)} hideBookmark />
                </div>
              </div>
              {door > 0.01 && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    background: `linear-gradient(to ${side === 0 ? 'right' : 'left'}, rgba(24,32,48,0) 0%, rgba(24,32,48,${(0.5 * door).toFixed(3)}) 100%)`,
                  }}
                />
              )}
            </div>
          ))}
        </AbsoluteFill>
      )}

      {/* the bookmark: on the poster, then falling into the well */}
      {f < HITS.gather + 2 && (
        <div
          style={{
            position: 'absolute',
            left: f < HITS.drop ? POSTER.bookmark.x : C.x + b.x * bs,
            top: f < HITS.drop ? PUSH_Y + (POSTER.bookmark.y - PUSH_Y) * push : C.y + b.y * bs + settle * 0,
            transform: `translate(-50%, -50%) perspective(1200px) rotateX(${b.rx}deg) rotateZ(${b.rz}deg) scale(${f < HITS.drop ? push : bs})`,
            opacity: landed ? 1 - prog(f, HITS.land + 6, HITS.land + 30, EASE_MODAL) * 0.6 : 1,
          }}
        >
          {f < HITS.drop ? (
            <PosterBookmark sinceTap={f - HITS.tapSave} />
          ) : (
            <Bookmark size={POSTER.bookmark.size} fill={1} />
          )}
        </div>
      )}

      {/* the landing: a breath of dust off the heap */}
      {landed && f < HITS.land + 24 && (
        <div
          style={{
            position: 'absolute',
            left: C.x + bookmarkAt(HITS.land).x * (F / (bookmarkAt(HITS.land).z - camZ(HITS.land))),
            top: C.y + bookmarkAt(HITS.land).y * (F / (bookmarkAt(HITS.land).z - camZ(HITS.land))),
            width: 10,
            height: 10,
          }}
        >
          {Array.from({ length: 14 }).map((_, i) => {
            const a = (i / 14) * Math.PI * 2 + random(`d${i}`) * 0.4;
            const p = prog(f, HITS.land, HITS.land + 22, EASE_MODAL);
            const r = 18 + p * (40 + random(`dr${i}`) * 50);
            return (
              <div
                key={i}
                style={{
                  position: 'absolute',
                  left: Math.cos(a) * r,
                  top: Math.sin(a) * r * 0.7,
                  width: 6,
                  height: 6,
                  borderRadius: 6,
                  background: 'rgba(52,64,84,0.5)',
                  opacity: 1 - p,
                }}
              />
            );
          })}
        </div>
      )}

      {/* the gathered light, where the point lands */}
      {f >= HITS.gather && f < HITS.iris + 16 && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(34% 20% at ${(markX / 1080) * 100}% ${(markY / 1920) * 100}%, rgba(255,255,255,${0.9 * flash}) 0%, rgba(255,255,255,0) 70%)`,
          }}
        />
      )}

      {/* the mark: the point first, then the brackets on "Machina" */}
      {f >= pointAt && (
        <div
          style={{
            position: 'absolute',
            left: markX,
            top: markY,
            transform: 'translate(-50%, -50%)',
            opacity: 1 - prog(f, HITS.iris + 11, HITS.iris + 15, EASE_IN_OUT),
            filter: `drop-shadow(0 ${(10 + flash * 10) * (markW / MARK_W)}px ${(30 + flash * 40) * (markW / MARK_W)}px rgba(24,32,48,${0.22 + flash * 0.2}))`,
          }}
        >
          <MarkAssembly close={close} dot={dot} width={markW} />
        </div>
      )}
    </AbsoluteFill>
  );
};

/** the poster's bookmark before it falls: filled by the tap, with its pop */
const PosterBookmark: React.FC<{ sinceTap: number }> = ({ sinceTap }) => {
  const fill = sinceTap < 0 ? 0 : prog(sinceTap, 0, 6, EASE_MODAL);
  const pop = sinceTap < 0 ? 0 : prog(sinceTap, 0, 12, EASE_SPRING) * (1 - prog(sinceTap, 6, 20, EASE_MODAL));
  return (
    <div style={{ width: POSTER.bookmark.size, height: POSTER.bookmark.size, transform: `scale(${mix(1, 1.12, pop)})` }}>
      <Bookmark size={POSTER.bookmark.size} fill={fill} />
    </div>
  );
};
