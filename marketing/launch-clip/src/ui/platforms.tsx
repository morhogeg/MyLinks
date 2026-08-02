import React from 'react';
import { Bookmark, MessageCircle, Play, Plus, Star, Heart, Send, Layers } from 'lucide-react';
import { sans } from '../fonts';

/**
 * The five places things get saved before Machina — Instagram, X, YouTube,
 * WhatsApp-to-yourself, Safari tabs/Reading List.
 *
 * Round 13 rebuilt act one as a STORY: each surface now carries its own real
 * save gesture (bookmark / save to playlist / send to yourself / star / one
 * more tab), the save flies off into that platform's own SILO, the silos pile
 * up unreadable, and one person opens the wrong pile twice. So this file holds
 * three things: the platform vocabulary, a `SaveSurface` per platform (the
 * gesture), and the `Silo` (the pile).
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
  reading: { name: 'Safari', label: 'Open tabs', rgb: '90, 160, 230' },
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

/** A faded, title-less thumbnail block — the honest state of a buried save. */
const thumb = (hue: string, seed: number, w = 44, h = 30) => (
  <div
    style={{
      width: w,
      height: h,
      borderRadius: 6,
      flexShrink: 0,
      background: `linear-gradient(${120 + (seed % 3) * 40}deg, rgba(${hue},${
        0.1 + (seed % 3) * 0.03
      }), rgba(16,20,32,${0.06 + (seed % 4) * 0.015}))`,
      border: '1px solid rgba(16,24,40,0.06)',
    }}
  />
);

// ─────────────────────────────────────────────────────────── save surfaces

export const SURFACE_W = 430;
export const SURFACE_H = 330;

/**
 * Where each platform's save CONTROL sits, relative to the surface centre —
 * the Tap fingertip lands here, and the flying save launches from here.
 */
// Re-measured against the CURRENT layouts (round 13i — several taps were
// landing beside their buttons): offsets are the control's true centre,
// derived from the layout maths (header 52px + padding 16 + block heights),
// relative to the surface centre (215, 165).
export const SURFACE_CTL: Record<PlatformKey, { x: number; y: number }> = {
  instagram: { x: 180, y: 112 }, // bookmark, right end of the action row
  youtube: { x: 153, y: 131 }, // the right-aligned Save pill
  whatsapp: { x: 180, y: 132 }, // send button, composer bottom-right
  x: { x: 172, y: 132 }, // star, right end of the action row
  reading: { x: 145, y: 132 }, // the tabs pill, bottom-right
};

const surfaceShell = (k: PlatformKey, children: React.ReactNode) => {
  const p = PLATFORM[k];
  const ink = `rgb(${p.rgb})`;
  return (
    <div
      style={{
        width: SURFACE_W,
        height: SURFACE_H,
        borderRadius: 22,
        background: 'linear-gradient(168deg, rgba(255,255,255,0.99), rgba(243,244,248,0.99))',
        border: '1px solid rgba(16,24,40,0.09)',
        boxShadow: '0 30px 70px -20px rgba(24,32,48,0.4), inset 0 1px 0 rgba(255,255,255,0.9)',
        fontFamily: sans,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '15px 18px',
          borderBottom: '1px solid rgba(16,24,40,0.06)',
        }}
      >
        <span style={{ color: ink, display: 'inline-flex', opacity: 0.95 }}>
          <PlatformGlyph k={k} size={15} />
        </span>
        {/* X's mark IS its name — printing both read as "✕ X". */}
        {k !== 'x' && (
          <span style={{ fontSize: 14.5, fontWeight: 600, color: 'rgba(20,24,34,0.92)' }}>
            {p.name}
          </span>
        )}
      </div>
      <div style={{ position: 'relative', padding: 16, height: SURFACE_H - 52 }}>{children}</div>
    </div>
  );
};

/** A round-cornered action button, filling as `save` runs 0→1. */
const ActionButton: React.FC<{
  save: number;
  ink: string;
  children: React.ReactNode;
  wide?: boolean;
}> = ({ save, ink, children, wide = false }) => (
  <div
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      height: 38,
      minWidth: wide ? 92 : 38,
      padding: wide ? '0 14px' : 0,
      borderRadius: 999,
      background: save > 0.5 ? `rgba(${ink},0.14)` : 'rgba(16,20,32,0.05)',
      border: `1px solid ${save > 0.5 ? `rgba(${ink},0.5)` : 'rgba(16,24,40,0.1)'}`,
      color: save > 0.5 ? `rgb(${ink})` : 'rgba(40,44,54,0.8)',
      fontSize: 13,
      fontWeight: 600,
      transform: `scale(${1 + Math.sin(Math.min(1, save) * Math.PI) * 0.12})`,
    }}
  >
    {children}
  </div>
);

/**
 * One platform, one gesture. `save` is 0–1: 0.5 is the tap contact, after
 * which the control fills/increments — the same beat the flying chip launches.
 */
export const SaveSurface: React.FC<{ k: PlatformKey; save: number }> = ({ k, save }) => {
  const p = PLATFORM[k];
  const on = save > 0.5;

  if (k === 'instagram') {
    return surfaceShell(
      k,
      <>
        <div
          style={{
            height: 176,
            borderRadius: 12,
            background:
              'linear-gradient(150deg, rgba(225,48,108,0.14), rgba(244,244,248,0.9) 55%, rgba(230,231,238,0.95))',
            border: '1px solid rgba(16,24,40,0.07)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 22,
          }}
        >
          <span style={{ fontSize: 21, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em', color: '#1b1c22', textAlign: 'center' }}>
            One-pan lemon chicken with orzo
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 14, gap: 14, color: 'rgba(40,44,54,0.75)' }}>
          <Heart size={20} />
          <MessageCircle size={20} />
          <Send size={19} />
          <span style={{ marginLeft: 'auto' }}>
            <ActionButton save={save} ink={p.rgb}>
              <Bookmark size={18} fill={on ? `rgb(${p.rgb})` : 'none'} />
            </ActionButton>
          </span>
        </div>
      </>,
    );
  }

  if (k === 'youtube') {
    return surfaceShell(
      k,
      <>
        <div
          style={{
            position: 'relative',
            height: 168,
            borderRadius: 12,
            background:
              'linear-gradient(160deg, rgba(20,22,28,0.92), rgba(52,56,66,0.9) 55%, rgba(255,0,0,0.25))',
            border: '1px solid rgba(16,24,40,0.07)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0 26px',
            overflow: 'hidden',
          }}
        >
          {/* reads like a real thumb: bold statement type + duration badge */}
          <span
            style={{
              fontSize: 24,
              fontWeight: 900,
              lineHeight: 1.08,
              letterSpacing: '-0.02em',
              textTransform: 'uppercase',
              color: '#ffffff',
              textShadow: '0 2px 12px rgba(0,0,0,0.5)',
            }}
          >
            Use AI. Scare people.
          </span>
          <span
            style={{
              position: 'absolute',
              right: 10,
              bottom: 10,
              padding: '2px 6px',
              borderRadius: 5,
              background: 'rgba(0,0,0,0.75)',
              color: '#ffffff',
              fontSize: 10.5,
              fontWeight: 600,
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            15:28
          </span>
        </div>
        <div style={{ marginTop: 12, fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.02em', color: '#111318', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          How to Use AI to Improve Yourself So Much it Will Scare People
        </div>
        <div style={{ display: 'flex', alignItems: 'center', marginTop: 10 }}>
          <span style={{ fontSize: 12, color: '#606068' }}>IAmMarkManson</span>
          <span style={{ marginLeft: 'auto' }}>
            <ActionButton save={save} ink={p.rgb} wide>
              <Plus size={15} strokeWidth={2.6} />
              {on ? 'Saved' : 'Save'}
            </ActionButton>
          </span>
        </div>
      </>,
    );
  }

  if (k === 'whatsapp') {
    return surfaceShell(
      k,
      <>
        <div style={{ fontSize: 12, color: 'rgba(96,102,116,0.85)', marginBottom: 10 }}>
          You (Me)
        </div>
        {on && (
          <div
            style={{
              marginLeft: 'auto',
              maxWidth: '80%',
              width: 'fit-content',
              padding: '10px 13px',
              borderRadius: 14,
              borderBottomRightRadius: 4,
              background: 'rgba(37,211,102,0.16)',
              border: '1px solid rgba(37,211,102,0.32)',
              fontSize: 13,
              color: 'rgba(38,74,52,0.9)',
            }}
          >
            zillow.com/homes/2-bed-balcony…
          </div>
        )}
        <div
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 14,
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div
            style={{
              flex: 1,
              height: 40,
              borderRadius: 999,
              border: '1px solid rgba(16,24,40,0.12)',
              background: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              padding: '0 14px',
              fontSize: 12.5,
              color: on ? 'rgba(96,102,116,0.5)' : 'rgba(38,74,52,0.85)',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
            }}
          >
            {on ? 'Message' : 'zillow.com/homes/2-bed-balcony…'}
          </div>
          <ActionButton save={save} ink={p.rgb}>
            <Send size={17} />
          </ActionButton>
        </div>
      </>,
    );
  }

  if (k === 'x') {
    return surfaceShell(
      k,
      <>
        <div style={{ display: 'flex', gap: 11 }}>
          <div style={{ width: 34, height: 34, borderRadius: 34, background: 'rgba(16,20,32,0.1)', flexShrink: 0 }} />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
            <div style={{ fontSize: 12, color: 'rgba(96,102,116,0.85)' }}>@futuretense</div>
            <div style={{ fontSize: 14.5, fontWeight: 600, lineHeight: 1.3, color: '#14161c' }}>
              What AI actually changes about work — a thread:
            </div>
            {grey(94)}
            {grey(78)}
          </div>
        </div>
        <div
          style={{
            position: 'absolute',
            left: 16,
            right: 16,
            bottom: 14,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            color: 'rgba(40,44,54,0.65)',
            padding: '0 8px',
          }}
        >
          <MessageCircle size={18} />
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="m17 2 4 4-4 4" />
            <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
            <path d="m7 22-4-4 4-4" />
            <path d="M21 13v1a4 4 0 0 1-4 4H3" />
          </svg>
          <ActionButton save={save} ink={p.rgb}>
            <Star size={18} fill={on ? `rgb(${p.rgb})` : 'none'} />
          </ActionButton>
        </div>
      </>,
    );
  }

  // Safari — the pile of open tabs: the save gesture is "one more tab".
  const tabCount = on ? 48 : 47;
  return surfaceShell(
    k,
    <>
      <div style={{ fontSize: 11, color: 'rgba(96,102,116,0.8)' }}>theatlantic.com</div>
      <div style={{ marginTop: 10, fontSize: 17, fontWeight: 700, lineHeight: 1.2, letterSpacing: '-0.02em', color: '#111318' }}>
        The jobs AI actually changes
      </div>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {grey(98)}
        {grey(92)}
        {grey(96)}
        {grey(64)}
      </div>
      <div
        style={{
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 14,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          color: 'rgba(40,44,54,0.7)',
          padding: '0 8px',
        }}
      >
        <Send size={17} style={{ transform: 'rotate(-45deg)' }} />
        <Bookmark size={17} />
        <ActionButton save={save} ink={p.rgb} wide>
          <Layers size={15} />
          <span style={{ fontVariantNumeric: 'tabular-nums' }}>{tabCount}</span>
        </ActionButton>
      </div>
    </>,
  );
};

// ─────────────────────────────────────────────────────────────────── silos

export const SILO_W = 224;
export const SILO_H = 168;
export const SILO_OFFSET = { x: -SILO_W / 2, y: -SILO_H / 2 };

/**
 * One platform's pile. Deliberately UNREADABLE inside: stacked edges, faded
 * thumbnails, no titles — because that is the honest state of a buried save.
 * `grow` 0–1 adds items on top; `open` 0–1 fans the stack out (the wrong-pile
 * beat), which reveals only MORE unreadable items.
 */
export const Silo: React.FC<{ k: PlatformKey; grow: number; open?: number; count: number }> = ({
  k,
  grow,
  open = 0,
  count,
}) => {
  const p = PLATFORM[k];
  const ink = `rgb(${p.rgb})`;
  const items = 3 + Math.round(grow * 3); // 3 → 6 stacked edges
  return (
    <div
      style={{
        width: SILO_W,
        height: SILO_H,
        borderRadius: 16,
        background: 'linear-gradient(168deg, rgba(255,255,255,0.99), rgba(243,244,248,0.99))',
        border: '1px solid rgba(16,24,40,0.09)',
        boxShadow: '0 20px 50px -16px rgba(24,32,48,0.35), inset 0 1px 0 rgba(255,255,255,0.9)',
        fontFamily: sans,
        overflow: open > 0.02 ? 'visible' : 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '10px 12px',
          borderBottom: '1px solid rgba(16,24,40,0.06)',
        }}
      >
        <span style={{ color: ink, display: 'inline-flex', opacity: 0.95 }}>
          <PlatformGlyph k={k} size={12} />
        </span>
        {k !== 'x' && (
          <span style={{ fontSize: 11.5, fontWeight: 600, color: 'rgba(20,24,34,0.92)' }}>
            {p.name}
          </span>
        )}
        <span
          style={{
            marginLeft: 'auto',
            fontSize: 10.5,
            fontWeight: 700,
            fontVariantNumeric: 'tabular-nums',
            color: 'rgba(96,102,116,0.9)',
            background: 'rgba(16,20,32,0.06)',
            borderRadius: 999,
            padding: '2px 8px',
          }}
        >
          {count}
        </span>
      </div>

      {/* the stack: edges and faded thumbnails only — nothing readable */}
      <div style={{ position: 'relative', padding: '10px 12px' }}>
        {Array.from({ length: items }).map((_, i) => {
          const depth = items - 1 - i; // 0 = top of pile
          // closed: cards peek out by their top edge; open: they fan into a column
          const closedY = depth * 11;
          const openY = depth * 40;
          const y = closedY + (openY - closedY) * open;
          const fade = 1 - depth * 0.14 * (1 - open * 0.5);
          return (
            <div
              key={i}
              style={{
                position: 'absolute',
                left: 12,
                right: 12,
                top: 10 + y,
                height: 36,
                borderRadius: 8,
                background: '#ffffff',
                border: '1px solid rgba(16,24,40,0.08)',
                boxShadow: '0 3px 10px -4px rgba(24,32,48,0.25)',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '0 8px',
                opacity: fade,
                transform: `scale(${1 - depth * 0.02 * (1 - open)})`,
              }}
            >
              {thumb(p.rgb, i * 7 + (k.length % 5), 30, 22)}
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 4 }}>
                {grey(60 + ((i * 17) % 30), 5, 0.1)}
                {grey(34 + ((i * 23) % 26), 4, 0.06)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

/** The little card that flies from a save gesture to its silo. */
export const FlyChip: React.FC<{ k: PlatformKey }> = ({ k }) => {
  const p = PLATFORM[k];
  return (
    <div
      style={{
        width: 88,
        height: 56,
        borderRadius: 10,
        background: '#ffffff',
        border: '1px solid rgba(16,24,40,0.1)',
        boxShadow: '0 12px 30px -8px rgba(24,32,48,0.45)',
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        padding: '0 9px',
        fontFamily: sans,
      }}
    >
      <span style={{ color: `rgb(${p.rgb})`, display: 'inline-flex' }}>
        <PlatformGlyph k={k} size={13} />
      </span>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
        {grey(88, 6, 0.12)}
        {grey(60, 5, 0.08)}
      </div>
    </div>
  );
};

/**
 * Where each silo sits in the constellation, and which way it drifts.
 *
 * Shared by the scatter scene and the converge that opens the wordmark, so the
 * five silos fly back to exactly the positions they piled up in — the gather
 * only reads as an answer if it undoes the same scatter.
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
  { k: 'x', x: 80, y: -234, z: 90, rotY: -13, rotX: 6, dx: 62, dy: -104 },
  // nudged right+down when the constellation compressed (round 10), so X's
  // panel stops covering this one's header
  { k: 'youtube', x: 560, y: 16, z: -185, rotY: -19, rotX: -4, dx: 132, dy: 20 },
  { k: 'whatsapp', x: -308, y: 176, z: 125, rotY: 15, rotX: 7, dx: -104, dy: 78 },
  { k: 'reading', x: 282, y: 232, z: -70, rotY: -11, rotX: 8, dx: 74, dy: 92 },
];

/** Starting pile size per platform — incremented on-screen as saves land. */
export const SILO_BASE_COUNT: Record<PlatformKey, number> = {
  instagram: 23,
  x: 31,
  youtube: 14,
  whatsapp: 58,
  reading: 47,
};
