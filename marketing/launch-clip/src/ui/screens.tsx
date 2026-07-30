import React from 'react';
import { ChevronLeft, Crosshair, Lock, Newspaper, Share2, Sparkles, Waypoints } from 'lucide-react';
import { T, categoryColor } from '../theme';
import { sans } from '../fonts';
import { StatusBar, HomeIndicator, SCREEN_W, SCREEN_H } from './Phone';
import {
  AppCard,
  AppHeader,
  CitationChip,
  GraphChip,
  Screen,
  SearchField,
  TabBar,
} from './app';
import { CitationGlyph } from './Brand';
import {
  ASK_ANSWER,
  ASK_QUESTION,
  ASK_SOURCES,
  byId,
  CARDS,
  CLUSTERS,
  GRAPH_EDGES,
  GRAPH_NODES,
  FEED_ORDER,
  INCOMING,
  REVIEW,
  SYNTHESIS,
} from '../data/library';

/** CARDS in the order the film's feed shows them (see FEED_ORDER's note). */
const FEED_CARDS = FEED_ORDER.map((id) => byId(id));

/** The five real processing phases, copied from `web/lib/scanPhases.ts`. */
const LINK_SCAN_STEPS = [
  'Fetching the link',
  'Reading the page',
  'Writing the summary',
  'Searching connections',
  'Organizing & tagging',
];

// ───────────────────────────────────────────────────────────── the feed

export const FeedScreen: React.FC<{
  /** Per-card entrance progress, indexed like CARDS. */
  enters?: number[];
  scrollY?: number;
  search?: { value: string; caret?: boolean; semantic?: number } | null;
  /** ids that keep full opacity while the rest dim (the semantic-filter beat). */
  hits?: string[] | null;
  /** 0–1 how much the non-hits have receded. */
  filtered?: number;
  cards?: typeof CARDS;
}> = ({ enters, scrollY = 0, search = null, hits = null, filtered = 0, cards = FEED_CARDS }) => (
  <Screen>
    <StatusBar />
    <AppHeader />
    <div
      style={{
        position: 'absolute',
        top: 105,
        left: 0,
        right: 0,
        bottom: 0,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '12px 16px 90px', transform: `translateY(${-scrollY}px)` }}>
        {search && (
          <div style={{ marginBottom: 14 }}>
            <SearchField value={search.value} caret={search.caret} semantic={search.semantic} />
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {cards.map((c, i) => {
            const isHit = !hits || hits.includes(c.id);
            const cut = isHit ? 0 : filtered;
            const enter = enters ? enters[i] ?? 1 : 1;
            return (
              /* The wrapper is what makes the filter READ: a non-match collapses
                 its own height and margin, so the matches below it travel up the
                 screen instead of just brightening in place. */
              <div
                key={c.id}
                style={{
                  maxHeight: cut > 0 ? `${(1 - cut) * 420}px` : 'none',
                  marginBottom: 16 * (1 - cut),
                  overflow: cut > 0 ? 'hidden' : undefined,
                  opacity: 1 - cut,
                  transform: `scale(${1 - cut * 0.06})`,
                  transformOrigin: 'center top',
                }}
              >
                <AppCard
                  card={c}
                  enter={enter}
                  highlight={hits && isHit ? filtered : 0}
                  style={{
                    filter: cut > 0.02 ? `blur(${cut * 3}px)` : undefined,
                  }}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
    <TabBar active="home" />
    <HomeIndicator />
  </Screen>
);

// ───────────────────────────────────────────────────── capture: safari + share

/** The article being read, in a browser — where a save actually starts. */
export const ArticleScreen: React.FC<{ dim?: number }> = ({ dim = 0 }) => (
  <Screen style={{ background: '#0b0b0d' }}>
    <StatusBar />
    <div style={{ position: 'absolute', top: 54, left: 0, right: 0, bottom: 0, filter: dim ? `brightness(${1 - dim * 0.45})` : undefined }}>
      {/* browser chrome */}
      <div
        style={{
          height: 42,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(20,20,23,0.92)',
        }}
      >
        <Lock size={10} color="#8a8a92" />
        <span style={{ fontSize: 12.5, color: '#c9c9d1' }}>{INCOMING.url}</span>
      </div>
      <div style={{ padding: '26px 26px 0' }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: '#7a7a86',
          }}
        >
          {INCOMING.site}
        </div>
        <h1
          style={{
            margin: '12px 0 0',
            fontSize: 27,
            lineHeight: 1.14,
            fontWeight: 700,
            letterSpacing: '-0.03em',
            color: '#ececf2',
          }}
        >
          {INCOMING.headline}
        </h1>
        <p style={{ marginTop: 14, fontSize: 14.5, lineHeight: 1.55, color: '#a4a4b0' }}>
          {INCOMING.standfirst}
        </p>
        {/* body texture — greeked lines, never lorem gibberish on screen */}
        <div style={{ marginTop: 22, display: 'flex', flexDirection: 'column', gap: 9 }}>
          {[100, 96, 99, 92, 97, 88, 99, 94, 70].map((w, i) => (
            <div
              key={i}
              style={{
                height: 8,
                width: `${w}%`,
                borderRadius: 4,
                background: 'rgba(255,255,255,0.055)',
              }}
            />
          ))}
        </div>
      </div>
      {/* browser toolbar */}
      <div
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: 62,
          background: 'rgba(20,20,23,0.95)',
          borderTop: '1px solid rgba(255,255,255,0.06)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          padding: '0 26px',
          color: '#8a8a92',
        }}
      >
        <ChevronLeft size={20} />
        <ChevronLeft size={20} style={{ transform: 'rotate(180deg)', opacity: 0.35 }} />
        <Share2 size={19} color="#e9e9f2" />
        <Newspaper size={19} />
      </div>
    </div>
  </Screen>
);

/**
 * The iOS share sheet, with Machina in the app row. This is the app's widest
 * capture surface and the reason the film opens the story here.
 */
export const ShareSheet: React.FC<{
  /** 0–1 sheet travel. */
  open: number;
  /** 0–1 how selected the Machina row is. */
  pick?: number;
}> = ({ open, pick = 0 }) => {
  const H = 420;
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: H,
        transform: `translateY(${(1 - open) * H}px)`,
        zIndex: 80,
      }}
    >
      <div
        style={{
          margin: '0 8px',
          borderRadius: 34,
          background: 'rgba(28,28,32,0.94)',
          backdropFilter: 'blur(30px)',
          border: '1px solid rgba(255,255,255,0.09)',
          boxShadow: '0 -20px 60px rgba(0,0,0,0.7)',
          padding: '10px 0 26px',
          height: H - 12,
        }}
      >
        <div
          style={{
            width: 38,
            height: 5,
            borderRadius: 3,
            background: 'rgba(255,255,255,0.22)',
            margin: '0 auto 14px',
          }}
        />
        {/* the page being shared */}
        <div style={{ display: 'flex', gap: 11, alignItems: 'center', padding: '0 18px 14px' }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 9,
              background: 'linear-gradient(140deg, #2a2a31, #15151a)',
              border: '1px solid rgba(255,255,255,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 9,
              fontWeight: 800,
              color: '#9a9aa6',
            }}
          >
            N
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: '#ececf2', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 250 }}>
              {INCOMING.headline}
            </div>
            <div style={{ fontSize: 11.5, color: '#84848e' }}>{INCOMING.site}</div>
          </div>
        </div>
        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '0 0 14px' }} />
        {/* app row — Machina first */}
        <div style={{ display: 'flex', gap: 20, padding: '0 20px 18px' }}>
          {[
            { name: 'Machina', machina: true },
            { name: 'Messages', hue: '#2ecc57' },
            { name: 'Mail', hue: '#2f7ce0' },
            { name: 'Notes', hue: '#e8c34a' },
          ].map((a) => (
            <div key={a.name} style={{ width: 62, textAlign: 'center' }}>
              <div
                style={{
                  width: 58,
                  height: 58,
                  borderRadius: 14,
                  margin: '0 auto 7px',
                  background: a.machina
                    ? 'radial-gradient(circle at 50% 36%, #282833, #16161d 46%, #07070a 100%)'
                    : a.hue,
                  border: a.machina ? '1px solid rgba(255,255,255,0.1)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: a.machina ? `scale(${1 + pick * 0.08})` : 'none',
                  boxShadow: a.machina
                    ? `0 0 ${10 + pick * 30}px -4px rgba(203,210,226,${0.15 + pick * 0.5})`
                    : 'none',
                }}
              >
                {a.machina && (
                  <div style={{ color: '#F2F5FA', width: 20, height: 23 }}>
                    <CitationGlyph style={{ width: '100%', height: '100%' }} />
                  </div>
                )}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: a.machina ? '#ececf2' : '#9a9aa6',
                  fontWeight: a.machina ? 600 : 400,
                }}
              >
                {a.name}
              </div>
            </div>
          ))}
        </div>
        <div style={{ height: 1, background: 'rgba(255,255,255,0.07)', margin: '0 0 8px' }} />
        {[
          { label: 'Copy', icon: '⧉' },
          { label: 'Add to Reading List', icon: '⌾' },
        ].map((r) => (
          <div
            key={r.label}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '13px 20px',
              fontSize: 14,
              color: '#c9c9d1',
            }}
          >
            {r.label}
            <span style={{ opacity: 0.5 }}>{r.icon}</span>
          </div>
        ))}
      </div>
    </div>
  );
};

/**
 * The processing sheet: the real five-phase checklist with the Citation mark as
 * the thinking orb. The honesty of this beat matters — it is what the app
 * actually shows for the ~15s the pipeline takes.
 */
export const AnalyzingScreen: React.FC<{
  /** 0–100, same scale as the app's progress. */
  progress: number;
  /** 0–1 entrance of the finished card. */
  cardEnter?: number;
}> = ({ progress, cardEnter = 0 }) => {
  const step = progress >= 92 ? 4 : progress >= 72 ? 3 : progress >= 50 ? 2 : progress >= 25 ? 1 : 0;
  const card = byId('sleep');
  return (
    <Screen>
      <StatusBar />
      <AppHeader />
      <div style={{ position: 'absolute', top: 105, left: 0, right: 0, bottom: 0, padding: '18px 16px' }}>
        {/* the analyzing sheet */}
        <div
          style={{
            borderRadius: 20,
            background: T.card,
            border: `1px solid ${T.border}`,
            boxShadow: T.shadowCard,
            padding: 18,
            // The sheet must be GONE before the card is legible, or the two
            // cross-fade through each other and the beat reads as a glitch
            // instead of a hand-off.
            opacity: Math.max(0, 1 - cardEnter * 2.4),
            transform: `scale(${1 - cardEnter * 0.05})`,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 16 }}>
            <div
              style={{
                width: 30,
                height: 30,
                borderRadius: 10,
                background: 'rgba(233,233,242,0.10)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: T.accent,
                boxShadow: `0 0 ${8 + (progress % 20)}px -3px ${T.accentRing}`,
              }}
            >
              <CitationGlyph style={{ width: 12, height: 14 }} />
            </div>
            <div>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>
                {LINK_SCAN_STEPS[step]}
              </div>
              <div style={{ fontSize: 11, color: T.textMuted }}>{INCOMING.site}</div>
            </div>
            <span
              style={{
                marginLeft: 'auto',
                fontSize: 11,
                fontWeight: 700,
                color: T.textSecondary,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {Math.round(progress)}%
            </span>
          </div>

          {/* progress rail */}
          <div style={{ height: 3, borderRadius: 3, background: T.fillSubtle, overflow: 'hidden', marginBottom: 16 }}>
            <div
              style={{
                height: '100%',
                width: `${progress}%`,
                background: T.accentGradient,
                borderRadius: 3,
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {LINK_SCAN_STEPS.map((s, i) => {
              const done = i < step;
              const active = i === step;
              return (
                <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div
                    style={{
                      width: 15,
                      height: 15,
                      borderRadius: 15,
                      border: `1.5px solid ${done || active ? 'rgba(233,233,242,0.5)' : T.borderStrong}`,
                      background: done ? T.accent : 'transparent',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {done && (
                      <svg width="9" height="9" viewBox="0 0 12 12">
                        <path d="M2 6.4 4.6 9 10 3.2" fill="none" stroke={T.accentInk} strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    )}
                    {active && (
                      <div style={{ width: 5, height: 5, borderRadius: 5, background: T.accent }} />
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: 12.5,
                      color: done ? T.textSecondary : active ? T.text : T.textMuted,
                      fontWeight: active ? 600 : 400,
                    }}
                  >
                    {s}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* the finished card, landing in the sheet's place */}
        {cardEnter > 0 && (
          <div style={{ position: 'absolute', left: 16, right: 16, top: 18 }}>
            <AppCard card={card} enter={cardEnter} highlight={cardEnter * 0.7} />
          </div>
        )}

        {/* The library the save is landing INTO. The app shows the analyzing
            banner above an existing feed, and an empty screen behind the sheet
            made the shot read as a first-run demo instead of a real library. */}
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 16, opacity: 0.9 }}>
          {CARDS.filter((c) => c.id !== 'sleep')
            .slice(0, 2)
            .map((c) => (
              <AppCard key={c.id} card={c} />
            ))}
        </div>
      </div>
      <TabBar active="home" />
      <HomeIndicator />
    </Screen>
  );
};

// ───────────────────────────────────────────────────────────────── ask

export const AskScreen: React.FC<{
  /** characters of the question typed so far */
  typed?: number;
  /** characters of the answer streamed so far */
  streamed?: number;
  /** 0–1 per-source chip entrance */
  sources?: number[];
  graphChip?: number;
  thinking?: number;
  scrollY?: number;
}> = ({ typed = 0, streamed = 0, sources = [], graphChip = 0, thinking = 0, scrollY = 0 }) => {
  const q = ASK_QUESTION.slice(0, typed);
  const answer = ASK_ANSWER.slice(0, streamed);
  const asked = typed >= ASK_QUESTION.length;

  return (
    <Screen>
      <StatusBar />
      <AppHeader title="Ask" showSearch={false} />
      <div
        style={{
          position: 'absolute',
          top: 105,
          left: 0,
          right: 0,
          bottom: 96,
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '20px 16px 0', transform: `translateY(${-scrollY}px)` }}>
          {!asked && streamed === 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                paddingTop: 60,
                opacity: 1 - Math.min(1, typed / 6),
              }}
            >
              <div style={{ color: T.accent, width: 34, height: 39, filter: `drop-shadow(0 0 18px ${T.accentRing})` }}>
                <CitationGlyph style={{ width: '100%', height: '100%' }} />
              </div>
              <div style={{ marginTop: 18, fontSize: 15, color: T.textSecondary }}>
                Ask anything you&apos;ve saved
              </div>
            </div>
          )}

          {typed > 0 && (
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 18 }}>
              <div
                style={{
                  maxWidth: '84%',
                  background: T.accent,
                  color: T.accentInk,
                  padding: '10px 14px',
                  borderRadius: 18,
                  borderBottomRightRadius: 6,
                  fontSize: 14,
                  lineHeight: 1.4,
                  fontWeight: 500,
                }}
              >
                {q}
              </div>
            </div>
          )}

          {thinking > 0 && streamed === 0 && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, opacity: thinking }}>
              <div style={{ color: T.accent, width: 14, height: 16 }}>
                <CitationGlyph style={{ width: '100%', height: '100%' }} />
              </div>
              <span style={{ fontSize: 13, color: T.textSecondary }}>
                Reading your saves…
              </span>
            </div>
          )}

          {streamed > 0 && (
            <div>
              {answer.split('\n').map((para, i) =>
                para === '' ? (
                  <div key={i} style={{ height: 12 }} />
                ) : (
                  <p
                    key={i}
                    style={{
                      margin: 0,
                      fontSize: 14.5,
                      lineHeight: 1.58,
                      color: T.text,
                      letterSpacing: '-0.006em',
                    }}
                  >
                    {para}
                    {i === answer.split('\n').length - 1 && streamed < ASK_ANSWER.length && (
                      <span
                        style={{
                          display: 'inline-block',
                          width: 7,
                          height: 15,
                          background: T.accent,
                          marginLeft: 3,
                          verticalAlign: 'text-bottom',
                          borderRadius: 1,
                        }}
                      />
                    )}
                  </p>
                ),
              )}

              {sources.some((s) => s > 0) && (
                <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {ASK_SOURCES.map((s, i) => (
                    <CitationChip key={s.id} label={s.label} title={s.title} enter={sources[i] ?? 0} />
                  ))}
                </div>
              )}

              {graphChip > 0 && (
                <div style={{ marginTop: 12 }}>
                  <GraphChip opacity={graphChip} />
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* composer */}
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 66,
          padding: '0 16px',
          zIndex: 45,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            height: 44,
            padding: '0 6px 0 15px',
            borderRadius: 22,
            background: T.card,
            border: `1px solid ${T.border}`,
            boxShadow: '0 8px 24px -10px rgba(0,0,0,0.8)',
          }}
        >
          <span style={{ fontSize: 13.5, color: asked ? T.textMuted : T.text, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {asked ? 'Ask a follow-up' : q || 'Ask about your library'}
            {!asked && typed > 0 && (
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
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 32,
              background: typed > 0 ? T.accentGradient : T.fillSubtle,
              color: T.accentInk,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={typed > 0 ? T.accentInk : T.textMuted} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 19V5M5 12l7-7 7 7" />
            </svg>
          </div>
        </div>
      </div>
      <TabBar active="ask" />
      <HomeIndicator />
    </Screen>
  );
};

// ─────────────────────────────────────────────────────────────── graph

/**
 * The knowledge graph. The app draws it on canvas; here it is SVG so edges can
 * be stroke-dashed into existence and nodes can bloom on their own schedule.
 */
export const GraphScreen: React.FC<{
  /** 0–1 how much of the graph has been drawn. */
  draw: number;
  /** 0–1 cluster label fade. */
  labels?: number;
  backPill?: number;
}> = ({ draw, labels = 0, backPill = 0 }) => {
  const W = SCREEN_W;
  const H = SCREEN_H;
  const px = (n: { x: number; y: number }) => ({ x: n.x * W, y: 150 + n.y * (H - 268) });
  const clusterInk = ['rgb(99, 102, 241)', 'rgb(20, 184, 166)', 'rgb(249, 115, 22)'];

  return (
    <Screen>
      <StatusBar />
      <AppHeader title="Graph" showSearch={false} />
      <svg width={W} height={H} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <radialGradient id="gNode" cx="40%" cy="35%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#CBD2E0" />
          </radialGradient>
        </defs>
        {/* edges */}
        {GRAPH_EDGES.map(([a, b], i) => {
          const na = GRAPH_NODES.find((n) => n.id === a);
          const nb = GRAPH_NODES.find((n) => n.id === b);
          if (!na || !nb) return null;
          const pa = px(na);
          const pb = px(nb);
          const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
          // edges come in staggered — they read as connections being FOUND
          const t = Math.max(0, Math.min(1, (draw - 0.06 * (i % 7)) / 0.5));
          const cross = na.cluster !== nb.cluster;
          return (
            <line
              key={i}
              x1={pa.x}
              y1={pa.y}
              x2={pb.x}
              y2={pb.y}
              stroke={cross ? 'rgba(233,233,242,0.30)' : clusterInk[na.cluster]}
              strokeOpacity={cross ? 0.5 : 0.4}
              strokeWidth={cross ? 1.1 : 1.4}
              strokeDasharray={len}
              strokeDashoffset={len * (1 - t)}
            />
          );
        })}
        {/* nodes */}
        {GRAPH_NODES.map((n, i) => {
          const p = px(n);
          const t = Math.max(0, Math.min(1, (draw - 0.03 * i) / 0.32));
          const r = n.r * (0.2 + 0.8 * t);
          return (
            <g key={n.id} opacity={t}>
              <circle cx={p.x} cy={p.y} r={r * 2.6} fill={clusterInk[n.cluster]} opacity={0.09 * t} />
              <circle
                cx={p.x}
                cy={p.y}
                r={r}
                fill="url(#gNode)"
                stroke={clusterInk[n.cluster]}
                strokeOpacity={0.85}
                strokeWidth={1.4}
              />
            </g>
          );
        })}
        {/* node labels for the few named ones */}
        {GRAPH_NODES.filter((n) => n.label).map((n) => {
          const p = px(n);
          const t = Math.max(0, Math.min(1, (draw - 0.55) / 0.3));
          return (
            <text
              key={n.id}
              x={p.x}
              y={p.y + n.r + 15}
              textAnchor="middle"
              style={{ fontFamily: sans, fontSize: 11, fontWeight: 600 }}
              fill={T.text}
              opacity={t * 0.92}
              stroke={T.card}
              strokeWidth={2.6}
              paintOrder="stroke"
            >
              {n.label}
            </text>
          );
        })}
        {/* cluster labels */}
        {CLUSTERS.map((c, i) => (
          <text
            key={c.name}
            x={c.x * W}
            y={150 + c.y * (H - 268)}
            textAnchor="middle"
            style={{
              fontFamily: sans,
              fontSize: 10.5,
              fontWeight: 800,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
            }}
            fill={clusterInk[i]}
            opacity={labels * 0.95}
          >
            {c.name.toUpperCase()}
          </text>
        ))}
      </svg>

      {/* Back to Ask pill (top-start) and the re-fit control (bottom-end) */}
      <div
        style={{
          position: 'absolute',
          top: 118,
          left: 14,
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          padding: '7px 12px 7px 9px',
          borderRadius: 999,
          background: 'rgba(18,18,18,0.8)',
          backdropFilter: 'blur(12px)',
          border: `1px solid ${T.borderStrong}`,
          fontSize: 12,
          fontWeight: 600,
          color: T.text,
          opacity: backPill,
          transform: `translateY(${(1 - backPill) * -6}px)`,
        }}
      >
        <ChevronLeft size={14} />
        Back to Ask
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 96,
          right: 14,
          width: 34,
          height: 34,
          borderRadius: 999,
          background: 'rgba(18,18,18,0.8)',
          backdropFilter: 'blur(12px)',
          border: `1px solid ${T.borderStrong}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: T.textSecondary,
          opacity: backPill,
        }}
      >
        <Crosshair size={16} />
      </div>
      <TabBar active="home" />
      <HomeIndicator />
    </Screen>
  );
};

// ────────────────────────────────────────────────────────────── digest

export const DigestScreen: React.FC<{ enter?: number; reviewEnter?: number }> = ({
  enter = 1,
  reviewEnter = 0,
}) => (
  <Screen>
    <StatusBar />
    <AppHeader title="Digest" showSearch={false} />
    <div style={{ position: 'absolute', top: 105, left: 0, right: 0, bottom: 0, padding: '18px 16px' }}>
      <div
        style={{
          borderRadius: 20,
          background: T.card,
          border: `1px solid ${T.border}`,
          boxShadow: T.shadowCard,
          overflow: 'hidden',
          opacity: enter,
          transform: `translateY(${(1 - enter) * 18}px)`,
        }}
      >
        <div style={{ height: 2, background: T.accentGradient, opacity: 0.75 }} />
        <div style={{ padding: 18 }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              fontSize: 9.5,
              fontWeight: 800,
              letterSpacing: '0.15em',
              textTransform: 'uppercase',
              color: T.textMuted,
            }}
          >
            <Sparkles size={11} color={T.accent} />
            {SYNTHESIS.kicker}
          </div>
          <h2
            style={{
              margin: '12px 0 0',
              fontSize: 20,
              lineHeight: 1.18,
              fontWeight: 700,
              letterSpacing: '-0.025em',
              color: T.text,
            }}
          >
            {SYNTHESIS.title}
          </h2>
          <p style={{ margin: '11px 0 0', fontSize: 13, lineHeight: 1.55, color: T.textSecondary }}>
            {SYNTHESIS.body}
          </p>
          <div style={{ marginTop: 15, display: 'flex', gap: 7 }}>
            {['Memory', 'Recall', 'Tools for thought'].map((t) => (
              <span
                key={t}
                style={{
                  fontSize: 9,
                  fontWeight: 900,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  padding: '3px 7px',
                  borderRadius: 6,
                  background: T.fillSubtle,
                  color: 'rgba(102,102,102,0.9)',
                }}
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* the resurface nudge — spaced repetition, the loop closing */}
      <div
        style={{
          marginTop: 14,
          borderRadius: 18,
          background: T.card,
          border: `1px solid ${T.border}`,
          boxShadow: T.shadowCard,
          padding: 15,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          opacity: reviewEnter,
          transform: `translateY(${(1 - reviewEnter) * 16}px)`,
        }}
      >
        <div
          style={{
            width: 34,
            height: 34,
            borderRadius: 12,
            background: 'rgba(233,233,242,0.10)',
            color: T.accent,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <Waypoints size={16} />
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: T.text, lineHeight: 1.25 }}>
            {REVIEW.title}
          </div>
          <div style={{ fontSize: 11, color: T.textMuted, marginTop: 3 }}>{REVIEW.meta}</div>
        </div>
        <div
          style={{
            fontSize: 11.5,
            fontWeight: 700,
            padding: '7px 12px',
            borderRadius: 999,
            background: T.accentGradient,
            color: T.accentInk,
            flexShrink: 0,
          }}
        >
          Review
        </div>
      </div>

      {/* Earlier entries — the digest is a recurring habit, not a one-off card,
          and the empty half-screen made it look like a first run. */}
      <div style={{ marginTop: 22, opacity: reviewEnter * 0.9 }}>
        <div
          style={{
            fontSize: 9.5,
            fontWeight: 800,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            color: T.textMuted,
            marginBottom: 11,
          }}
        >
          Earlier
        </div>
        {[
          { t: 'Two threads you never closed', m: 'Last week · 4 cards' },
          { t: 'Attention keeps showing up', m: '2 weeks ago · 6 cards' },
        ].map((r) => (
          <div
            key={r.t}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 11,
              padding: '11px 0',
              borderTop: `1px solid ${T.border}`,
            }}
          >
            <Newspaper size={14} color={T.textMuted} style={{ flexShrink: 0 }} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 12.5, fontWeight: 500, color: T.textSecondary }}>{r.t}</div>
              <div style={{ fontSize: 10.5, color: T.textMuted, marginTop: 2 }}>{r.m}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
    <TabBar active="digest" />
    <HomeIndicator />
  </Screen>
);

/** Collections — a fast establishing beat, not a feature tour. */
export const CollectionsScreen: React.FC<{ enter?: number }> = ({ enter = 1 }) => {
  const cols = [
    { name: 'How memory works', n: 14, key: 'indigo' },
    { name: 'Attention economy', n: 9, key: 'teal' },
    { name: 'Product notes', n: 23, key: 'orange' },
    { name: 'Read again', n: 6, key: 'blue' },
  ];
  return (
    <Screen>
      <StatusBar />
      <AppHeader title="Collections" showSearch={false} />
      <div
        style={{
          position: 'absolute',
          top: 105,
          left: 0,
          right: 0,
          bottom: 0,
          padding: '18px 16px',
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 13,
          alignContent: 'start',
        }}
      >
        {cols.map((c, i) => {
          const col = categoryColor(c.name);
          const t = Math.max(0, Math.min(1, (enter - i * 0.12) / 0.5));
          return (
            <div
              key={c.name}
              style={{
                borderRadius: 18,
                background: T.card,
                border: `1px solid ${T.border}`,
                boxShadow: T.shadowCard,
                padding: 14,
                height: 118,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                opacity: t,
                transform: `translateY(${(1 - t) * 14}px) scale(${0.97 + t * 0.03})`,
              }}
            >
              <div
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 10,
                  background: col.bg,
                  color: col.fg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
                  <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
                  <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text, lineHeight: 1.2 }}>
                  {c.name}
                </div>
                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>{c.n} cards</div>
              </div>
            </div>
          );
        })}
      </div>
      <TabBar active="collections" />
      <HomeIndicator />
    </Screen>
  );
};
