import React from 'react';
import { AbsoluteFill } from 'remotion';
import { sans } from '../../../fonts';
import { INK, INK_SOFT } from '../../kit/Type';
import { ITEMS, L, TOPS, heightOf, linesOf, type Item } from './list';

/**
 * The ink list, drawn: one save per row, an empty circle, the verb in bold,
 * the title, the byline and length in grey. Ink on paper, the house type
 * (Geist), set at whole pixels.
 *
 * `InkRow` draws one item from a geometry (where its circle sits and how big,
 * where its text block starts and at what size), so the same row can sit in
 * the list, be picked out of it, and land on a real "Do this" row.
 * `InkList` lays the whole list out from a scroll and a zoom.
 */

export const SHEET = '#FBFBFC';
export const SHEET_BG = 'linear-gradient(180deg, #FCFCFD 0%, #F8F9FA 60%, #F4F5F7 100%)';

export type RowGeo = {
  /** the circle's centre and diameter */
  cx: number;
  cy: number;
  d: number;
  /** the text block's top-left, and the title's size (the meta scales with it) */
  tx: number;
  ty: number;
  size: number;
};

/** an item's geometry in the list: top at `y` (frame px), zoom `z` about the
 *  frame's left edge at `ox` */
export const listGeo = (y: number, z = 1, ox = 0): RowGeo => ({
  cx: ox + L.circleX * z,
  cy: y + (L.lineH / 2) * z,
  d: L.circleD * z,
  tx: ox + L.textX * z,
  ty: y,
  size: L.size * z,
});

export const InkRow: React.FC<{
  it: Item;
  g: RowGeo;
  opacity?: number;
  /** 0–1: the item set apart (an ink ring around it, a small lift) */
  ring?: number;
  /** 0–1: the verb struck through (and gone at 1) */
  strike?: number;
  /** 0–1: the byline line's presence */
  meta?: number;
  /** 0–1: the circle's presence */
  circle?: number;
  /** 0–1: the title's colour from ink toward the app's muted grey */
  mute?: number;
  /** show only the first line (the title as one line, cut to fit `oneLineW`) */
  oneLine?: number;
}> = ({ it, g, opacity = 1, ring = 0, strike = 0, meta = 1, circle = 1, mute = 0, oneLine }) => {
  if (opacity <= 0.002) return null;
  const k = g.size / L.size;
  const [l1, l2] = linesOf(it);
  const lineH = L.lineH * k;
  const nLines = oneLine ? 1 : l2 ? 2 : 1;
  const blockH = nLines * lineH + (L.metaGap + L.metaH) * k * meta;
  const blockW = L.textW * k;
  const ink = mute > 0 ? `rgba(${Math.round(17 + (107 - 17) * mute)},${Math.round(24 + (114 - 24) * mute)},${Math.round(39 + (128 - 39) * mute)},0.96)` : INK;
  const verbW = strike > 0 ? 1 : 0;
  const pad = 22 * k;
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, opacity }}>
      {/* the emphasis: the kit's ink ring on the row's own box */}
      {ring > 0.002 && (
        <div
          style={{
            position: 'absolute',
            left: g.cx - g.d / 2 - pad,
            top: g.ty - pad * 0.8,
            width: g.tx - (g.cx - g.d / 2) + blockW * 0.92 + 2 * pad,
            height: blockH + 1.6 * pad,
            borderRadius: 26 * k,
            background: `rgba(255,255,255,${0.9 * ring})`,
            boxShadow: [
              `0 ${10 * k}px ${30 * k}px rgba(24,32,48,${0.14 * ring})`,
              `0 0 0 ${(2.2 * k).toFixed(2)}px rgba(20,20,27,${(0.5 * ring).toFixed(3)})`,
            ].join(', '),
          }}
        />
      )}
      {/* the circle: an empty ring, the app's own "Do this" circle in ink */}
      <div
        style={{
          position: 'absolute',
          left: g.cx - g.d / 2,
          top: g.cy - g.d / 2,
          width: g.d,
          height: g.d,
          borderRadius: '50%',
          boxShadow: `inset 0 0 0 ${(L.stroke * (g.d / L.circleD)).toFixed(2)}px rgba(17,24,39,${(0.62 * circle).toFixed(3)})`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: g.tx,
          top: g.ty,
          width: oneLine ? oneLine : blockW,
          fontFamily: sans,
          fontSize: g.size,
          lineHeight: `${lineH}px`,
          letterSpacing: '-0.012em',
          color: ink,
          whiteSpace: 'nowrap',
          overflow: oneLine ? 'hidden' : undefined,
          textOverflow: oneLine ? 'ellipsis' : undefined,
        }}
      >
        <div style={{ overflow: oneLine ? 'hidden' : undefined, textOverflow: oneLine ? 'ellipsis' : undefined }}>
          <span style={{ position: 'relative', display: 'inline-block', fontWeight: 700, opacity: 1 - Math.max(0, strike - 0.55) / 0.45, marginRight: strike > 0 ? `${-(1 - (1 - Math.max(0, strike - 0.55) / 0.45)) * 0}px` : undefined }}>
            {it.verb}
            {verbW > 0 && (
              <span
                style={{
                  position: 'absolute',
                  left: -2 * k,
                  top: '54%',
                  height: Math.max(1.5, 3.2 * k),
                  width: `calc(${Math.min(1, strike / 0.55) * 100}% + ${4 * k}px)`,
                  background: INK,
                  borderRadius: 2 * k,
                }}
              />
            )}
          </span>
          <span style={{ fontWeight: 500 }}> {oneLine && l2 ? `${l1} ${l2}` : l1}</span>
        </div>
        {!oneLine && l2 && <div style={{ fontWeight: 500 }}>{l2}</div>}
        {meta > 0.002 && (
          <div
            style={{
              marginTop: L.metaGap * k,
              fontSize: L.meta * k,
              lineHeight: `${L.metaH * k}px`,
              fontWeight: 500,
              letterSpacing: '-0.004em',
              color: INK_SOFT,
              opacity: meta,
            }}
          >
            {it.meta}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * The list on its sheet: every item at its place, scrolled by `scroll` px and
 * zoomed by `z` about (zx, zy). `dim` sets an item's opacity by index (the
 * stop sets the others back), `ring` its emphasis.
 *
 * (round 4) The rows are laid out once, at full size and on whole pixels, and
 * the scroll and the zoom are ONE transform on a composited layer: Chromium
 * moves that layer by fractions of a pixel. Laid out per frame (the type
 * resized for the zoom, each row's top set to the scroll), the text snapped
 * to whole pixels and shimmered through every slow push, about half a pixel
 * either way.
 */
export const InkList: React.FC<{
  scroll: number;
  top?: number;
  z?: number;
  zx?: number;
  zy?: number;
  dim?: (k: number) => number;
  ring?: (k: number) => number;
  /** an item drawn elsewhere (picked out of the list): skipped here */
  skip?: (k: number) => boolean;
  dividers?: number;
}> = ({ scroll, top = L.top0, z = 1, zx = 540, zy = 960, dim, ring, skip, dividers = 1 }) => {
  // frame y of a list y (0 = the first item's top), through the transform
  const Y = (ly: number) => zy + (top + ly - scroll - zy) * z;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: 1080,
          height: 1920,
          transformOrigin: `${zx}px ${zy}px`,
          transform: `scale(${z.toFixed(5)}) translateY(${(-scroll).toFixed(3)}px)`,
          willChange: 'transform',
        }}
      >
        {ITEMS.map((it, k) => {
          const y = Y(TOPS[k]);
          const h = heightOf(it) * z;
          if (y > 1920 + 60 || y + h < -60 || skip?.(k)) return null;
          const o = dim ? dim(k) : 1;
          const ly = top + TOPS[k];
          return (
            <React.Fragment key={it.id}>
              {dividers > 0 && k > 0 && (
                <div
                  style={{
                    position: 'absolute',
                    left: L.textX,
                    width: 1080 - 64 - L.textX,
                    top: ly - L.gap / 2,
                    height: 1.5,
                    background: `rgba(17,24,39,${(0.06 * dividers * Math.min(o, dim ? dim(k - 1) : 1)).toFixed(3)})`,
                  }}
                />
              )}
              <InkRow it={it} g={listGeo(ly)} opacity={o} ring={ring ? ring(k) : 0} />
            </React.Fragment>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};
