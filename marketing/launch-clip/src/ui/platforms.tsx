import React from 'react';
import { Bookmark, MessageCircle, Play } from 'lucide-react';
import { sans } from '../fonts';

/**
 * The five places things get saved before Machina — Instagram, X, YouTube,
 * WhatsApp-to-yourself, Reading List.
 *
 * This is the film's opening argument, straight from the founder letter: the
 * problem was never one messy list, it was that everything interesting was
 * "scattered across five platforms, quietly disappearing" — and when you finally
 * remembered something, you could not remember WHICH app you had buried it in.
 *
 * Two rules held here:
 *  - Brand hues are the app's own (`web/lib/platform.tsx` PLATFORM_RGB), so the
 *    film's platform vocabulary matches what the product paints on a card.
 *  - The glyphs are generic marks (a play triangle, a bubble, a bookmark) beside
 *    the platform's NAME in type — recognisable in context, without reproducing
 *    anyone's logo.
 */

export type PlatformKey = 'instagram' | 'x' | 'youtube' | 'whatsapp' | 'reading';

export const PLATFORM: Record<
  PlatformKey,
  { name: string; label: string; rgb: string }
> = {
  // PLATFORM_RGB from web/lib/platform.tsx, verbatim where the app defines one.
  instagram: { name: 'Instagram', label: 'Saved', rgb: '225, 48, 108' },
  // X's app silver (191,201,214) is a dark-theme value and vanishes on a white
  // panel; the light grade uses X's own light-mode black.
  x: { name: 'X', label: 'Bookmarks', rgb: '15, 20, 25' },
  youtube: { name: 'YouTube', label: 'Watch later', rgb: '255, 0, 0' },
  whatsapp: { name: 'WhatsApp', label: 'Messages to you', rgb: '37, 211, 102' },
  reading: { name: 'Safari', label: 'Reading List', rgb: '90, 160, 230' },
};

export const XGlyph: React.FC<{ size?: number }> = ({ size = 11 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.9 2H22l-7 8 7.6 12h-6.2l-4.9-7.7L5.9 22H2.8l7.3-8.4L2.8 2H9l4.6 7.2L18.9 2Z" />
  </svg>
);

const InstagramGlyph: React.FC<{ size?: number }> = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <rect x="3" y="3" width="18" height="18" rx="5" />
    <circle cx="12" cy="12" r="4" />
    <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
  </svg>
);

export const PlatformGlyph: React.FC<{ k: PlatformKey; size?: number }> = ({ k, size = 12 }) => {
  if (k === 'x') return <XGlyph size={size - 1} />;
  if (k === 'instagram') return <InstagramGlyph size={size} />;
  if (k === 'youtube') return <Play size={size} fill="currentColor" strokeWidth={0} />;
  if (k === 'whatsapp') return <MessageCircle size={size} />;
  return <Bookmark size={size} />;
};

const grey = (w: number, h = 7, o = 0.1) => (
  <div style={{ width: `${w}%`, height: h, borderRadius: 4, background: `rgba(16,20,32,${o})` }} />
);

/**
 * One platform's saved surface. Everything inside is deliberately UNLABELLED —
 * bare handles, bare hosts, grey title bars — because that is the honest state of
 * a save in any of these apps: it is kept exactly the way it arrived.
 */
export const PANEL_W = 340;
export const PANEL_H = 214;

export const PlatformPanel: React.FC<{ k: PlatformKey; w?: number }> = ({ k, w = PANEL_W }) => {
  const p = PLATFORM[k];
  const ink = `rgb(${p.rgb})`;

  return (
    <div
      style={{
        width: w,
        // A FIXED height, so a panel can be centred on its point with plain
        // negative margins. Centring by `translate(-50%,-50%)` made the panel
        // overflow its transformed parent and the lower two got clipped
        // mid-header — a bug that survived two wrong diagnoses (filter region,
        // transform order) before the shape of the box became the fix.
        height: PANEL_H,
        borderRadius: 18,
        background: 'linear-gradient(168deg, rgba(255,255,255,0.99), rgba(243,244,248,0.99))',
        border: '1px solid rgba(16,24,40,0.09)',
        boxShadow: '0 24px 60px -18px rgba(24,32,48,0.35), inset 0 1px 0 rgba(255,255,255,0.9)',
        fontFamily: sans,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '13px 15px',
          borderBottom: '1px solid rgba(16,24,40,0.06)',
        }}
      >
        <span style={{ color: ink, display: 'inline-flex', opacity: 0.95 }}>
          <PlatformGlyph k={k} size={13} />
        </span>
        {/* X's mark IS its name — printing both read as "✕ X". */}
        {k !== 'x' && (
          <span style={{ fontSize: 12.5, fontWeight: 600, color: 'rgba(20,24,34,0.92)' }}>
            {p.name}
          </span>
        )}
        <span style={{ fontSize: 11, color: 'rgba(96,102,116,0.85)', marginLeft: 'auto' }}>
          {p.label}
        </span>
      </div>

      <div style={{ padding: 13, overflow: 'hidden' }}>
        {k === 'instagram' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 5 }}>
            {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div
                key={i}
                style={{
                  aspectRatio: '1',
                  borderRadius: 5,
                  background: `rgba(16,20,32,${0.07 + (i % 3) * 0.016})`,
                }}
              />
            ))}
          </div>
        )}

        {k === 'x' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {['@shreyas', '@naval', '@patio11'].map((h) => (
              <div key={h} style={{ display: 'flex', gap: 9 }}>
                <div style={{ width: 26, height: 26, borderRadius: 26, background: 'rgba(16,20,32,0.1)', flexShrink: 0 }} />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <div style={{ fontSize: 10.5, color: 'rgba(96,102,116,0.85)' }}>{h}</div>
                  {grey(96)}
                  {grey(72)}
                </div>
              </div>
            ))}
          </div>
        )}

        {k === 'youtube' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[0, 1, 2].map((i) => (
              <div key={i} style={{ display: 'flex', gap: 9 }}>
                <div
                  style={{
                    width: 58,
                    height: 33,
                    borderRadius: 5,
                    background: 'rgba(16,20,32,0.1)',
                    flexShrink: 0,
                  }}
                />
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, paddingTop: 2 }}>
                  {grey(94)}
                  {grey(58, 6, 0.06)}
                </div>
              </div>
            ))}
          </div>
        )}

        {k === 'whatsapp' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, alignItems: 'flex-end' }}>
            {['youtu.be/dQw4…', 'instagram.com/p/C8x…', 'nature.com/articles/s41…'].map((u) => (
              <div
                key={u}
                style={{
                  maxWidth: '86%',
                  padding: '8px 11px',
                  borderRadius: 12,
                  borderBottomRightRadius: 4,
                  background: 'rgba(37,211,102,0.14)',
                  border: '1px solid rgba(37,211,102,0.3)',
                  fontSize: 11,
                  color: 'rgba(38,74,52,0.9)',
                }}
              >
                {u}
              </div>
            ))}
          </div>
        )}

        {k === 'reading' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {['nature.com', 'newyorker.com', 'stratechery.com'].map((h) => (
              <div key={h} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                {grey(88)}
                <div style={{ fontSize: 10.5, color: 'rgba(96,102,116,0.8)' }}>{h}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/** Half-extents, for centring a panel on its constellation point. */
export const PANEL_OFFSET = { x: -PANEL_W / 2, y: -PANEL_H / 2 };

/**
 * Where each panel sits in the constellation, and which way it drifts.
 *
 * Shared by the scatter scene and the converge that opens the wordmark, so the
 * five panels fly back to exactly the positions they drifted out from — the
 * gather only reads as an answer if it undoes the same scatter.
 */
export const CONSTELLATION: {
  k: PlatformKey;
  x: number;
  y: number;
  z: number;
  rotY: number;
  rotX: number;
  /** drift direction, in px at full drift */
  dx: number;
  dy: number;
}[] = [
  { k: 'instagram', x: -472, y: -158, z: -130, rotY: 17, rotX: -6, dx: -120, dy: -46 },
  { k: 'x', x: 118, y: -224, z: 90, rotY: -13, rotX: 6, dx: 62, dy: -104 },
  { k: 'youtube', x: 512, y: -22, z: -185, rotY: -19, rotX: -4, dx: 132, dy: 20 },
  { k: 'whatsapp', x: -308, y: 176, z: 125, rotY: 15, rotX: 7, dx: -104, dy: 78 },
  { k: 'reading', x: 282, y: 232, z: -70, rotY: -11, rotX: 8, dx: 74, dy: 92 },
];
