import React from 'react';
import { AbsoluteFill, random } from 'remotion';
import { TOKENS, alpha, uiText } from '../../kit/tokens';
import { Shot } from '../pov/Places';
import { HeroImg, SHOT, StatusBar, type HeroId } from './Screens';

/**
 * The camera roll's Screenshots album, in the 393 × 852 points of the
 * screen (the scene scales it): a title, a square grid four across, newest
 * at the bottom, the count under the last row. Generic and un-branded, like
 * POV's places: what such a grid is really full of (POV's own screenshots:
 * chats, map pins, lists, posts, boarding passes), never blank tiles.
 *
 * 2,847 = 711 full rows + 3: the last row holds exactly the three
 * screenshots the reel follows, drawn from the same PNGs the app's cards
 * show (Screens.tsx).
 */

export const COUNT = 2847;
const COLS = 4;
const GAP = 2;
export const TILE = (SHOT.w - GAP * (COLS - 1)) / COLS;
const STRIDE = TILE + GAP;
const ROWS = Math.ceil(COUNT / COLS);
/** where the grid starts under the title */
const GRID_TOP = 132;
/** the content's height: the grid, the count, room for the home indicator */
const CONTENT = GRID_TOP + ROWS * STRIDE + 96;
/** the furthest the roll scrolls (its last row and the count in view) */
export const MAX_Y = CONTENT - SHOT.h;

const HEROES: HeroId[] = ['camera', 'seneca', 'viewpoint'];

/** a tile's box in screen points at scroll `y` (n: 0 is the oldest) */
export const tileRect = (n: number, y: number): [number, number, number, number] => {
  const row = Math.floor(n / COLS);
  const col = n % COLS;
  return [col * STRIDE, GRID_TOP + row * STRIDE - y, TILE, TILE];
};
/** the three screenshots' places: the last three items */
export const heroIndex = (k: number) => COUNT - 3 + k;

/** one of the other 2,844: one of POV's screenshots, square-cropped */
const Tile: React.FC<{ n: number }> = ({ n }) => {
  const s = TILE / 240;
  const off = (520 * s - TILE) * (0.15 + 0.6 * random(`roll-crop${n}`));
  return (
    <div style={{ width: TILE, height: TILE, overflow: 'hidden', position: 'relative', background: TOKENS.paper }}>
      <div style={{ position: 'absolute', left: 0, top: -off, transform: `scale(${s})`, transformOrigin: '0 0' }}>
        <Shot i={(n * 7 + Math.floor(n / 13)) % 97} />
      </div>
    </div>
  );
};

/** one of the three: its PNG, square-cropped from the middle (as a grid crops) */
const HeroTile: React.FC<{ id: HeroId }> = ({ id }) => {
  const s = TILE / SHOT.w;
  return (
    <div style={{ width: TILE, height: TILE, overflow: 'hidden', position: 'relative' }}>
      <div style={{ position: 'absolute', left: 0, top: -(SHOT.h * s - TILE) / 2, transform: `scale(${s})`, transformOrigin: '0 0' }}>
        <HeroImg id={id} />
      </div>
    </div>
  );
};

/**
 * The album at scroll `y` (points). `blur`: a vertical motion blur in
 * points (the flick), drawn as a true Gaussian along the scroll only.
 * `hide`: a hero tile left empty (it is open, flying, or shared).
 */
export const Roll: React.FC<{ y: number; blur?: number; id: string; hide?: number[] }> = ({ y, blur = 0, id, hide = [] }) => {
  const first = Math.max(0, Math.floor((y - GRID_TOP) / STRIDE) - 1);
  const last = Math.min(ROWS - 1, Math.ceil((y + SHOT.h - GRID_TOP) / STRIDE) + 1);
  const rows: number[] = [];
  for (let r = first; r <= last; r++) rows.push(r);
  const footerY = GRID_TOP + ROWS * STRIDE + 22 - y;
  return (
    <AbsoluteFill style={{ background: TOKENS.card, overflow: 'hidden' }}>
      {blur > 0.3 && (
        <svg width={0} height={0} style={{ position: 'absolute' }}>
          <filter id={`roll-${id}`} x="0" y="-10%" width="100%" height="120%" colorInterpolationFilters="sRGB">
            <feGaussianBlur stdDeviation={`0 ${blur.toFixed(2)}`} edgeMode="duplicate" />
          </filter>
        </svg>
      )}
      <AbsoluteFill style={{ filter: blur > 0.3 ? `url(#roll-${id})` : undefined }}>
        {/* the title scrolls away with the grid */}
        <div style={{ position: 'absolute', left: 16, top: 62 - y }}>
          <div style={{ ...uiText(32, 760), letterSpacing: '-0.03em' }}>Screenshots</div>
          <div style={{ ...uiText(15, 520, TOKENS.inkSoft), marginTop: 2 }}>{COUNT.toLocaleString('en-US')} items</div>
        </div>
        {rows.map((r) =>
          Array.from({ length: COLS }, (_, c) => r * COLS + c)
            .filter((n) => n < COUNT)
            .map((n) => {
              const [x, ty] = tileRect(n, y);
              const k = n - (COUNT - 3);
              return (
                <div key={n} style={{ position: 'absolute', left: x, top: ty, opacity: hide.includes(k) ? 0 : 1 }}>
                  {k >= 0 ? <HeroTile id={HEROES[k]} /> : <Tile n={n} />}
                </div>
              );
            }),
        )}
        <div style={{ position: 'absolute', left: 0, right: 0, top: footerY, textAlign: 'center', ...uiText(15, 640) }}>
          {COUNT.toLocaleString('en-US')} Screenshots
        </div>
      </AbsoluteFill>
      {/* the status bar stays, over a soft white fade, as an album's does */}
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 64, background: `linear-gradient(180deg, ${alpha(TOKENS.card, 0.96)} 0%, ${alpha(TOKENS.card, 0.9)} 70%, ${alpha(TOKENS.card, 0)} 100%)` }} />
      <StatusBar />
    </AbsoluteFill>
  );
};
