import React from 'react';
import { AbsoluteFill, random } from 'remotion';
import { Bookmark, ChevronLeft, Copy, Ellipsis, Heart, Play, Search } from 'lucide-react';
import { PlatformMark } from '../../../ui/app';
import { TOKENS, uiText } from '../../kit/tokens';

/**
 * The places a save hides, drawn as their apps lay them out and nothing
 * more: generic, un-branded (the platform is named in type; the only mark is
 * the app's own Instagram glyph, PlatformMark), no third-party thumbnails
 * (tiles are paper tints), nothing meant to be read but the search, the
 * chat's links and the headers. Each place takes a scroll offset and is
 * drawn on its own opaque ground, so a motion-blurred copy (Smear) averages
 * cleanly.
 */

const W = 1080;
/** where a place's own header sits: below the caption band (BAND.clear) */
export const HEADER_Y = 736;

/** a header row: back, title over its source, more */
const Header: React.FC<{ title: string; source: React.ReactNode; y: number; icon: React.ReactNode }> = ({ title, source, y, icon }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, top: y, height: 104, display: 'flex', alignItems: 'center', padding: '0 40px', gap: 22 }}>
    <ChevronLeft size={44} color={TOKENS.ink} strokeWidth={2.2} />
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, ...uiText(40, 650) }}>
        {icon}
        {title}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, ...uiText(26, 500, TOKENS.inkSoft) }}>{source}</div>
    </div>
    <Ellipsis size={40} color={TOKENS.ink} />
  </div>
);

const tint = (i: number) => TOKENS.tiles[(i * 7 + 3) % TOKENS.tiles.length];

/** a stand-in thumbnail: a paper tint and a soft shape, never an image */
const Tile: React.FC<{ i: number; w: number; h: number; children?: React.ReactNode }> = ({ i, w, h, children }) => {
  const r = random(`tile${i}`);
  return (
    <div style={{ position: 'relative', width: w, height: h, background: tint(i), overflow: 'hidden' }}>
      <div
        style={{
          position: 'absolute',
          width: w * (0.55 + 0.3 * r),
          height: w * (0.55 + 0.3 * r),
          left: w * (0.1 + 0.4 * random(`tx${i}`)),
          top: h * (0.15 + 0.45 * random(`ty${i}`)),
          borderRadius: r > 0.5 ? '50%' : 28,
          background: TOKENS.skeleton,
        }}
      />
      {children}
    </div>
  );
};

/** Instagram's saved grid (3:4 tiles) or TikTok's favorites (9:16), scrolled by `y` */
export const Grid: React.FC<{ kind: 'insta' | 'tiktok'; y: number }> = ({ kind, y }) => {
  const insta = kind === 'insta';
  const gap = 6;
  const w = (W - 2 * gap) / 3;
  const h = insta ? (w * 4) / 3 : (w * 16) / 9;
  const top = HEADER_Y + 128 - y;
  const first = Math.max(0, Math.floor((-top - h) / (h + gap)));
  const rows = Math.ceil(1920 / (h + gap)) + 2;
  return (
    <AbsoluteFill style={{ background: TOKENS.card }}>
      <div style={{ position: 'absolute', left: 0, top: -y }}>
        <Header
          y={HEADER_Y}
          title={insta ? 'Saved' : 'Favorites'}
          icon={insta ? <Bookmark size={34} color={TOKENS.ink} strokeWidth={2.2} /> : <Heart size={34} color={TOKENS.ink} strokeWidth={2.2} />}
          source={
            insta ? (
              <>
                <PlatformMark kind="instagram" size={24} /> Instagram
              </>
            ) : (
              'TikTok'
            )
          }
        />
        <div style={{ position: 'absolute', left: 0, right: 0, top: HEADER_Y + 116, height: 1, background: TOKENS.hairline }} />
      </div>
      {Array.from({ length: rows }, (_, r) => first + r).flatMap((row) =>
        [0, 1, 2].map((col) => {
          const i = row * 3 + col + (insta ? 0 : 50);
          return (
            <div key={i} style={{ position: 'absolute', left: col * (w + gap), top: top + row * (h + gap) }}>
              <Tile i={i} w={w} h={h}>
                {insta && random(`c${i}`) > 0.55 && (
                  <Copy size={30} color={TOKENS.card} strokeWidth={2.4} style={{ position: 'absolute', right: 16, top: 16 }} />
                )}
                {insta && random(`c${i}`) < 0.22 && (
                  <Play size={30} color={TOKENS.card} fill={TOKENS.card} style={{ position: 'absolute', right: 16, top: 16 }} />
                )}
                {!insta && (
                  <div style={{ position: 'absolute', left: 16, bottom: 14, display: 'flex', alignItems: 'center', gap: 6, ...uiText(26, 600, TOKENS.inkSoft) }}>
                    <Play size={24} color={TOKENS.inkSoft} fill={TOKENS.inkSoft} />
                    {(1 + random(`v${i}`) * 48).toFixed(1)}K
                  </div>
                )}
              </Tile>
            </div>
          );
        }),
      )}
    </AbsoluteFill>
  );
};

/** one screenshot: a status bar, a picture block, lines of something */
const Shot: React.FC<{ i: number }> = ({ i }) => {
  const r = random(`s${i}`);
  const lines = 3 + Math.floor(random(`sl${i}`) * 4);
  return (
    <div
      style={{
        width: 240,
        height: 520,
        borderRadius: 26,
        background: TOKENS.card,
        boxShadow: TOKENS.shadowSoft,
        overflow: 'hidden',
        padding: '18px 18px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <div style={{ width: 44, height: 10, borderRadius: 5, background: TOKENS.skeletonStrong }} />
        <div style={{ width: 36, height: 10, borderRadius: 5, background: TOKENS.skeleton }} />
      </div>
      {r > 0.3 && <div style={{ height: 120 + 140 * random(`sh${i}`), borderRadius: 16, background: tint(i + 11) }} />}
      {Array.from({ length: lines }, (_, k) => (
        <div key={k} style={{ height: 14, borderRadius: 7, width: `${55 + 40 * random(`w${i}-${k}`)}%`, background: TOKENS.skeleton }} />
      ))}
      {r <= 0.3 &&
        [0, 1, 2].map((k) => (
          <div key={k} style={{ alignSelf: k % 2 ? 'flex-end' : 'flex-start', height: 44, width: '62%', borderRadius: 18, background: k % 2 ? TOKENS.bubbleMine : TOKENS.paper }} />
        ))}
    </div>
  );
};

/** the camera roll's screenshots: four columns, each at its own speed */
export const ScreenshotWall: React.FC<{ y: number }> = ({ y }) => {
  const speeds = [1, 1.22, 0.9, 1.12];
  const stride = 520 + 24;
  return (
    <AbsoluteFill style={{ background: TOKENS.paper }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: HEADER_Y - y * 0.9, textAlign: 'center' }}>
        <div style={uiText(44, 650)}>Screenshots</div>
        <div style={{ ...uiText(28, 500, TOKENS.inkSoft), marginTop: 8 }}>2,847 items</div>
      </div>
      {speeds.map((sp, col) => {
        const off = HEADER_Y + 150 + (col % 2) * 90 - y * sp;
        const first = Math.max(0, Math.floor(-off / stride) - 1);
        return Array.from({ length: 6 }, (_, k) => first + k).map((n) => (
          <div key={`${col}-${n}`} style={{ position: 'absolute', left: 24 + col * (240 + 24), top: off + n * stride }}>
            <Shot i={col * 100 + n} />
          </div>
        ));
      })}
    </AbsoluteFill>
  );
};

/** the chat you send yourself links in: bare links, at all hours */
const LINKS: { day?: string; url: string; at: string }[] = [
  { day: 'Last week', url: 'instagram.com/reel/C8kQ2vXr…', at: '23:41' },
  { url: 'tiktok.com/t/ZT8sYbQ2/', at: '23:42' },
  { url: 'youtu.be/Rk2nV7…', at: '08:15' },
  { day: 'Tuesday', url: 'instagram.com/p/C9a1LmB…', at: '12:03' },
  { url: 'x.com/i/status/18471…', at: '12:04' },
  { url: 'maps.app.goo.gl/x7Fq…', at: '19:58' },
  { day: 'Yesterday', url: 'tiktok.com/t/ZT8hQx1/', at: '00:12' },
  { url: 'instagram.com/reel/DA03pk…', at: '00:13' },
  { url: 'youtu.be/q3Lm0…', at: '07:40' },
  { url: 'instagram.com/reel/C7xT…', at: '22:19' },
  { day: 'Today', url: 'tiktok.com/t/ZT8mW4/', at: '01:06' },
  { url: 'instagram.com/p/DB1n…', at: '01:07' },
];

export const SelfChat: React.FC<{ y: number }> = ({ y }) => (
  <AbsoluteFill style={{ background: TOKENS.paper }}>
    <div style={{ position: 'absolute', left: 0, right: 0, top: HEADER_Y + 120 - y, display: 'flex', flexDirection: 'column', gap: 18, padding: '0 40px' }}>
      {LINKS.map((m, i) => (
        <React.Fragment key={i}>
          {m.day && (
            <div style={{ alignSelf: 'center', padding: '8px 22px', borderRadius: 999, background: TOKENS.card, boxShadow: TOKENS.shadowSoft, ...uiText(24, 600, TOKENS.inkSoft), margin: '14px 0' }}>
              {m.day}
            </div>
          )}
          <div style={{ alignSelf: 'flex-end', maxWidth: 760, padding: '20px 26px 16px', borderRadius: 30, borderBottomRightRadius: 10, background: TOKENS.bubbleMine, boxShadow: TOKENS.shadowSoft }}>
            <div style={{ ...uiText(34, 500, TOKENS.ink), textDecoration: 'underline', textDecorationColor: TOKENS.inkFaint, textUnderlineOffset: 6 }}>
              {m.url}
            </div>
            <div style={{ ...uiText(22, 500, TOKENS.inkFaint), textAlign: 'right', marginTop: 6 }}>{m.at}</div>
          </div>
        </React.Fragment>
      ))}
    </div>
    {/* the chat's own header, fixed */}
    <div style={{ position: 'absolute', left: 0, right: 0, top: HEADER_Y - 24, height: 140, background: TOKENS.paper, boxShadow: `0 1px 0 ${TOKENS.hairline}` }}>
      <div style={{ position: 'absolute', left: 40, top: 24, display: 'flex', alignItems: 'center', gap: 22 }}>
        <ChevronLeft size={44} color={TOKENS.ink} strokeWidth={2.2} />
        <div style={{ width: 76, height: 76, borderRadius: '50%', background: TOKENS.skeletonStrong }} />
        <div>
          <div style={uiText(38, 650)}>You</div>
          <div style={{ ...uiText(26, 500, TOKENS.inkSoft), marginTop: 4 }}>Message yourself</div>
        </div>
      </div>
    </div>
  </AbsoluteFill>
);

/** the search bar: a query or its placeholder, the caret, and what it found */
export const SearchBar: React.FC<{ query: string; caret: boolean; none: number; noneShake?: number }> = ({ query, caret, none, noneShake = 0 }) => (
  <>
    <div
      style={{
        position: 'absolute',
        left: 110,
        width: 860,
        top: 920,
        height: 120,
        borderRadius: 60,
        background: TOKENS.card,
        boxShadow: TOKENS.shadow,
        display: 'flex',
        alignItems: 'center',
        padding: '0 44px',
        gap: 24,
        boxSizing: 'border-box',
      }}
    >
      <Search size={44} color={TOKENS.inkSoft} strokeWidth={2.4} />
      <div style={{ ...uiText(42, 500, query ? TOKENS.ink : TOKENS.inkFaint), display: 'flex', alignItems: 'center', whiteSpace: 'pre' }}>
        {query}
        <span style={{ display: 'inline-block', width: 4, height: 52, marginLeft: 3, borderRadius: 2, background: TOKENS.ink, opacity: caret ? 1 : 0 }} />
        {!query && <span style={{ marginLeft: 10 }}>Search</span>}
      </div>
    </div>
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 1092,
        textAlign: 'center',
        opacity: none,
        transform: `translate(${Math.round(noneShake)}px, ${Math.round((1 - none) * 14)}px)`,
      }}
    >
      <div style={uiText(46, 650, TOKENS.inkSoft)}>No results</div>
      {query && <div style={{ ...uiText(30, 500, TOKENS.inkFaint), marginTop: 10 }}>for “{query}”</div>}
    </div>
  </>
);
