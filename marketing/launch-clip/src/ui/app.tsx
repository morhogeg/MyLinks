import React from 'react';
import {
  Clock,
  Facebook,
  Home,
  Instagram,
  Youtube,
  Layers,
  MessagesSquare,
  Newspaper,
  Plus,
  Search,
  StickyNote,
  Image as ImageIcon,
  Waypoints,
} from 'lucide-react';
import { T, categoryColor } from '../theme';
import { sans } from '../fonts';
import { CitationGlyph, Wordmark } from './Brand';
import type { Card } from '../data/library';

/**
 * Machina's screen furniture, rebuilt from the shipped components
 * (`Card.tsx`, `BottomTabBar.tsx`, `AskBrain.tsx`) with the same radii, type
 * scale, chips and hairlines. Where the app uses a Tailwind token, this uses the
 * token's value from `theme.ts`.
 */

export const Screen: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({
  children,
  style,
}) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      background: T.background,
      color: T.text,
      fontFamily: sans,
      overflow: 'hidden',
      ...style,
    }}
  >
    {children}
  </div>
);

/** The app header: the bare brand lockup, search, avatar, and the hairline glow. */
export const AppHeader: React.FC<{ title?: string; showSearch?: boolean }> = ({
  title,
  showSearch = true,
}) => (
  <div
    style={{
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      paddingTop: 54,
      background: 'rgba(249,250,251,0.88)',
      backdropFilter: 'blur(20px)',
      zIndex: 40,
    }}
  >
    <div
      style={{
        height: 50,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 18px',
      }}
    >
      {title ? (
        <span style={{ fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em' }}>{title}</span>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: T.text }}>
          <CitationGlyph style={{ width: 13, height: 15 }} />
          <Wordmark style={{ height: 11, width: 'auto', opacity: 0.95 }} />
        </div>
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {showSearch && <Search size={19} color={T.textSecondary} strokeWidth={2} />}
        <div
          style={{
            width: 27,
            height: 27,
            borderRadius: 27,
            background: 'linear-gradient(140deg, #ECECF1, #D8D8E0)',
            border: `1px solid ${T.borderStrong}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 11,
            fontWeight: 700,
            color: T.textSecondary,
          }}
        >
          M
        </div>
      </div>
    </div>
    <div
      style={{
        height: 1,
        background: T.accentGradient,
        opacity: 0.3,
      }}
    />
  </div>
);

/** The bottom tab bar — 44px row, four tabs around the center capture action. */
export const TabBar: React.FC<{ active?: 'home' | 'collections' | 'ask' | 'digest' }> = ({
  active = 'home',
}) => {
  const tabs = [
    { key: 'home', label: 'Home', Icon: Home },
    { key: 'collections', label: 'Collections', Icon: Layers },
    { key: 'ask', label: 'Ask', Icon: MessagesSquare },
    { key: 'digest', label: 'Digest', Icon: Newspaper },
  ] as const;

  const Tab: React.FC<{ t: (typeof tabs)[number] }> = ({ t }) => {
    const on = active === t.key;
    return (
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 2,
          minWidth: 58,
          height: '100%',
          color: on ? T.accent : T.tabbarInactive,
        }}
      >
        <t.Icon size={20} strokeWidth={2} />
        <span style={{ fontSize: 10, fontWeight: 600, lineHeight: 1 }}>{t.label}</span>
      </div>
    );
  };

  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        paddingBottom: 22,
        background: 'rgba(249,250,251,0.88)',
        backdropFilter: 'blur(20px)',
        borderTop: `1px solid ${T.border}`,
        zIndex: 50,
      }}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 1, background: T.accentGradient, opacity: 0.3 }} />
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          height: 44,
          padding: '0 4px',
        }}
      >
        <Tab t={tabs[0]} />
        <Tab t={tabs[1]} />
        <div
          style={{
            width: 40,
            height: 40,
            flexShrink: 0,
            borderRadius: 40,
            background: T.accentGradient,
            color: T.accentInk,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: `0 8px 22px -6px ${T.accentRing}`,
          }}
        >
          <Plus size={20} strokeWidth={2.4} />
        </div>
        <Tab t={tabs[2]} />
        <Tab t={tabs[3]} />
      </div>
    </div>
  );
};

/** Category chip — `text-[10px] uppercase font-black tracking-widest`, hashed color. */
export const CategoryChip: React.FC<{ category: string }> = ({ category }) => {
  const c = categoryColor(category);
  return (
    <span
      style={{
        fontSize: 10,
        textTransform: 'uppercase',
        fontWeight: 900,
        letterSpacing: '0.1em',
        padding: '4px 8px',
        borderRadius: 8,
        background: c.bg,
        color: c.fg,
        whiteSpace: 'nowrap',
      }}
    >
      {category}
    </span>
  );
};

export const TagChip: React.FC<{ tag: string }> = ({ tag }) => {
  const parts = tag.split('/');
  const leaf = parts[parts.length - 1];
  const parents = parts.slice(0, -1).join('/');
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        fontSize: 9,
        fontWeight: 900,
        textTransform: 'uppercase',
        letterSpacing: '0.05em',
        padding: '2px 6px',
        borderRadius: 6,
        background: T.fillSubtle,
        color: 'rgba(102,102,102,0.85)',
      }}
    >
      {parents && <span style={{ opacity: 0.4, fontWeight: 400, marginRight: 2 }}>{parents}/</span>}
      {leaf}
    </span>
  );
};

/**
 * Platform bylines. The app's rule (`components/SourceByline.tsx`) is that
 * platform sources keep their OWN recognisable mark and brand hue while
 * everything else gets the muted host chip — and the film needs that especially,
 * because a feed that visibly mixes YouTube, Instagram and X is what proves the
 * "one place for all of it" promise instead of just captioning it. Hues are the
 * app's PLATFORM_RGB values.
 */
const PLATFORM_INK: Record<string, string> = {
  youtube: 'rgb(255, 0, 0)',
  instagram: 'rgb(225, 48, 108)',
  facebook: 'rgb(24, 119, 242)',
  // The app's PLATFORM_RGB silver (191,201,214) is tuned for the dark theme
  // and disappears on white; on the light grade X wears its light-mode black.
  x: 'rgb(15, 20, 25)',
};

/** The app's platform marks — the same lucide icons `platformIcon` returns. */
const PlatformMark: React.FC<{ kind: string; size?: number }> = ({ kind, size = 12 }) => {
  if (kind === 'youtube') return <Youtube size={size} strokeWidth={2} />;
  if (kind === 'instagram') return <Instagram size={size} strokeWidth={2} />;
  if (kind === 'facebook') return <Facebook size={size} strokeWidth={2} />;
  return (
    <svg width={size - 2} height={size - 2} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.9 2H22l-7 8 7.6 12h-6.2l-4.9-7.7L5.9 22H2.8l7.3-8.4L2.8 2H9l4.6 7.2L18.9 2Z" />
    </svg>
  );
};

export const PlatformByline: React.FC<{ kind: string; label: string; size?: number }> = ({
  kind,
  label,
  size = 12,
}) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      fontSize: 11,
      fontWeight: 500,
      color: PLATFORM_INK[kind] ?? T.textMuted,
      whiteSpace: 'nowrap',
    }}
  >
    <PlatformMark kind={kind} size={size} />
    {label}
  </span>
);

const SourceByline: React.FC<{ card: Card }> = ({ card }) => {
  const k = card.sourceKind;
  if (k === 'youtube' || k === 'instagram' || k === 'facebook' || k === 'x') {
    return <PlatformByline kind={k} label={card.source} size={k === 'x' ? 11 : 12} />;
  }
  if (k === 'screenshot') {
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 600, letterSpacing: '0.02em', color: 'rgba(102,102,102,0.8)' }}>
        <ImageIcon size={11} />
        Screenshot
      </span>
    );
  }
  return <span style={{ fontSize: 11, color: 'rgba(102,102,102,0.7)' }}>{card.source}</span>;
};

/**
 * A feed card. Anatomy follows `Card.tsx`: rounded-[20px] on bg-card with
 * --shadow-card, a chrome row (category ↔ source), then title, summary, and a
 * footer above a hairline holding tags, your note, and the metadata row.
 */
export const AppCard: React.FC<{
  card: Card;
  /** 0–1 entrance progress (fade + lift), matching animate-card-enter. */
  enter?: number;
  /** Highlight ring, for the search-hit and citation-target beats. */
  highlight?: number;
  style?: React.CSSProperties;
}> = ({ card, enter = 1, highlight = 0, style }) => (
  <div
    style={{
      background: T.card,
      borderRadius: 20,
      border: `1px solid ${highlight > 0 ? `rgba(20,20,27,${0.06 + highlight * 0.28})` : T.border}`,
      boxShadow:
        highlight > 0
          ? `${T.shadowCard}, 0 8px ${18 + highlight * 22}px -8px rgba(24,32,48,${0.08 + highlight * 0.22})`
          : T.shadowCard,
      padding: 16,
      display: 'flex',
      flexDirection: 'column',
      gap: 12,
      opacity: enter,
      transform: `translateY(${(1 - enter) * 16}px) scale(${0.985 + enter * 0.015})`,
      ...style,
    }}
  >
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', height: 22 }}>
      <CategoryChip category={card.category} />
      <SourceByline card={card} />
    </div>

    <h3
      style={{
        margin: 0,
        fontSize: 16,
        fontWeight: 700,
        lineHeight: 1.2,
        letterSpacing: '-0.015em',
        color: T.text,
      }}
    >
      {card.title}
    </h3>

    <p
      style={{
        margin: 0,
        fontSize: 12.5,
        lineHeight: 1.5,
        color: T.textSecondary,
      }}
    >
      {card.summary}
    </p>

    <div style={{ paddingTop: 12, borderTop: `1px solid ${T.border}`, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {card.tags.map((t) => (
          <TagChip key={t} tag={t} />
        ))}
      </div>

      {card.note && (
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 6,
            fontSize: 12,
            lineHeight: 1.35,
            fontStyle: 'italic',
            color: 'rgba(107,114,128,0.95)',
          }}
        >
          <StickyNote size={12} style={{ flexShrink: 0, marginTop: 2, opacity: 0.6 }} />
          <span>{card.note}</span>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontSize: 11, fontWeight: 500, color: 'rgba(102,102,102,0.6)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          <Clock size={11} />
          {card.readTime}m
        </span>
        <span>{card.age}</span>
      </div>
    </div>
  </div>
);

/** The search field, with an optional caret and a semantic-mode hint. */
export const SearchField: React.FC<{ value: string; caret?: boolean; semantic?: number }> = ({
  value,
  caret = false,
  semantic = 0,
}) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 9,
      height: 40,
      padding: '0 13px',
      borderRadius: 14,
      background: T.card,
      border: `1px solid ${semantic > 0 ? `rgba(20,20,27,${0.06 + semantic * 0.24})` : T.border}`,
      boxShadow: semantic > 0 ? `0 6px 26px -8px rgba(24,32,48,${0.3 * semantic})` : undefined,
    }}
  >
    <Search size={15} color={T.textMuted} />
    <span style={{ fontSize: 13.5, color: value ? T.text : T.textMuted, whiteSpace: 'nowrap' }}>
      {value || 'Search everything you saved'}
      {caret && (
        <span
          style={{
            display: 'inline-block',
            width: 1.5,
            height: 15,
            background: T.accent,
            marginLeft: 1,
            verticalAlign: 'text-bottom',
          }}
        />
      )}
    </span>
    {/* No "MEANING" badge. It was invented for the film to sell a
        search-by-meaning narrative the owner dropped — and it is not a chip the
        app actually paints, so it was both off-message and untrue. The field
        still glows as the query lands; the search simply works. */}
  </div>
);

/** A citation chip from the Ask answer — icon tile + source label + title. */
export const CitationChip: React.FC<{
  label: string;
  title: string;
  /** Platform of the cited card, so the chip wears that platform's mark. */
  kind?: string;
  enter?: number;
}> = ({ label, title, kind = 'link', enter = 1 }) => {
  const platform = kind !== 'link' && kind !== 'screenshot';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        padding: '7px 13px 7px 9px',
        borderRadius: 12,
        background: T.card,
        border: `1px solid ${T.border}`,
        boxShadow: '0 1px 2px rgba(16,24,40,0.08)',
        opacity: enter,
        transform: `translateY(${(1 - enter) * 10}px) scale(${0.96 + enter * 0.04})`,
        maxWidth: '100%',
      }}
    >
      {/* The app's rule: a platform source keeps its OWN mark, everything else
          gets the bracket glyph. Here it also carries the argument — three chips
          from three different platforms under one answer. */}
      <span
        style={{
          flexShrink: 0,
          width: 26,
          height: 26,
          borderRadius: 9,
          background: platform ? `${PLATFORM_INK[kind]}1F` : 'rgba(20,20,27,0.06)',
          color: platform ? PLATFORM_INK[kind] : T.accent,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {platform ? <PlatformMark kind={kind} size={13} /> : <CitationGlyph style={{ width: 11, height: 12 }} />}
      </span>
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.02em', color: T.textMuted }}>
          {label}
        </span>
        <span
          style={{
            fontSize: 12.5,
            fontWeight: 500,
            color: T.text,
            lineHeight: 1.25,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            maxWidth: 250,
          }}
        >
          {title}
        </span>
      </span>
    </div>
  );
};

/** The quiet dashed "Graph" chip the app appends to a cited answer.
 *  `pressed` (0–1) is the touch-down state: the chip fills and dips like a
 *  real control, so the cut into the graph reads as a TAP, not an edit. */
export const GraphChip: React.FC<{ opacity?: number; pressed?: number }> = ({
  opacity = 1,
  pressed = 0,
}) => (
  <span
    style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      fontSize: 10.5,
      fontWeight: 600,
      letterSpacing: '0.02em',
      color: T.text,
      background: `rgba(20,20,27,${0.04 + pressed * 0.08})`,
      border: `1px ${pressed > 0.4 ? 'solid' : 'dashed'} ${T.borderStrong}`,
      borderRadius: 999,
      padding: '4px 9px',
      opacity,
      transform: `scale(${1 - pressed * 0.06})`,
    }}
  >
    <Waypoints size={11} />
    Graph
  </span>
);

/**
 * A fingertip. Rendered inside a `position: relative` parent, centred on it:
 * the pad lands (scales in, darkens), then lifts as a ripple that expands and
 * fades. `t` runs 0–1 over the whole gesture; contact is at ~0.5.
 */
export const Tap: React.FC<{ t: number; size?: number }> = ({ t, size = 44 }) => {
  if (t <= 0 || t >= 1) return null;
  const down = Math.min(1, t / 0.45); // approach + land
  const up = Math.max(0, (t - 0.5) / 0.5); // lift + ripple
  return (
    <span
      style={{
        position: 'absolute',
        left: '50%',
        top: '50%',
        width: size,
        height: size,
        pointerEvents: 'none',
        transform: `translate(-50%, -50%) scale(${0.7 + down * 0.3 + up * 0.9})`,
        borderRadius: '50%',
        background: `rgba(20,20,27,${0.22 * down * (1 - up)})`,
        border: `1.5px solid rgba(20,20,27,${0.3 * (1 - up) * down})`,
        boxShadow: `0 0 0 ${up * 14}px rgba(20,20,27,${0.1 * (1 - up)})`,
      }}
    />
  );
};
