import React from 'react';
import { ChevronLeft, Crosshair, Instagram, Lock, MessagesSquare, Newspaper, Play, Plus, Share2, Star, Youtube } from 'lucide-react';
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
  Tap,
} from './app';
import { AnimatedMark, CitationGlyph } from './Brand';
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
  <Screen style={{ background: '#ffffff' }}>
    <StatusBar />
    <div style={{ position: 'absolute', top: 54, left: 0, right: 0, bottom: 0, filter: dim ? `brightness(${1 - dim * 0.25})` : undefined }}>
      {/* browser chrome */}
      <div
        style={{
          height: 42,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          borderBottom: '1px solid rgba(0,0,0,0.07)',
          background: 'rgba(248,248,250,0.95)',
        }}
      >
        <Lock size={10} color="#8a8a92" />
        <span style={{ fontSize: 12.5, color: '#3c3c43' }}>{INCOMING.url}</span>
      </div>
      <div style={{ padding: '26px 26px 0' }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 800,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color: '#8a8a92',
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
            color: '#111318',
          }}
        >
          {INCOMING.headline}
        </h1>
        <p style={{ marginTop: 14, fontSize: 14.5, lineHeight: 1.55, color: '#55555f' }}>
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
                background: 'rgba(0,0,0,0.07)',
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
          background: 'rgba(248,248,250,0.96)',
          borderTop: '1px solid rgba(0,0,0,0.07)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          padding: '0 26px',
          color: '#8a8a92',
        }}
      >
        <ChevronLeft size={20} />
        <ChevronLeft size={20} style={{ transform: 'rotate(180deg)', opacity: 0.35 }} />
        <Share2 size={19} color="#26262b" />
        <Newspaper size={19} />
      </div>
    </div>
  </Screen>
);

/**
 * The three places a save starts, for the "share it from anywhere" beat.
 *
 * The share sheet stays anchored while the SOURCE behind it cross-cuts through
 * an Instagram post, a YouTube video and an article. Showing one app and then
 * cutting into Machina made the claim once; holding the sheet still while the
 * world behind it changes makes it three times, in the same ten seconds, and
 * without a single word of copy.
 */
export const InstagramSource: React.FC = () => (
  <Screen style={{ background: '#ffffff' }}>
    <StatusBar />
    <div style={{ position: 'absolute', top: 54, left: 0, right: 0, bottom: 0 }}>
      <div
        style={{
          height: 46,
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          padding: '0 16px',
          borderBottom: '1px solid rgba(0,0,0,0.08)',
        }}
      >
        <Instagram size={17} color="rgb(225,48,108)" />
        <span style={{ fontSize: 13, fontWeight: 600, color: '#111318' }}>@quietplaces</span>
      </div>
      <div style={{ padding: 14 }}>
        <div
          style={{
            aspectRatio: '1',
            borderRadius: 12,
            background:
              'linear-gradient(150deg, rgba(225,48,108,0.12), rgba(244,244,248,0.9) 55%, rgba(230,231,238,0.95))',
            border: '1px solid rgba(0,0,0,0.07)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 26,
          }}
        >
          <span
            style={{
              fontSize: 25,
              fontWeight: 700,
              lineHeight: 1.18,
              letterSpacing: '-0.03em',
              color: '#1b1c22',
              textAlign: 'center',
            }}
          >
            Hidden coves of Sardinia
          </span>
        </div>
        <div style={{ display: 'flex', gap: 5, justifyContent: 'center', marginTop: 12 }}>
          {[0, 1, 2, 3, 4].map((i) => (
            <div
              key={i}
              style={{
                width: 5,
                height: 5,
                borderRadius: 5,
                background: i === 2 ? 'rgba(27,28,34,0.9)' : 'rgba(0,0,0,0.18)',
              }}
            />
          ))}
        </div>
      </div>
    </div>
  </Screen>
);

export const YouTubeSource: React.FC = () => (
  <Screen style={{ background: '#ffffff' }}>
    <StatusBar />
    <div style={{ position: 'absolute', top: 54, left: 0, right: 0, bottom: 0 }}>
      {/* A thumbnail that READS like a real YouTube thumb (owner note, 13h):
          bold statement type on the image + a duration badge — without
          reproducing any actual copyrighted frame. */}
      <div
        style={{
          position: 'relative',
          height: 220,
          background:
            'linear-gradient(160deg, rgba(20,22,28,0.92), rgba(52,56,66,0.9) 55%, rgba(255,0,0,0.25))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 34px',
          borderBottom: '1px solid rgba(0,0,0,0.07)',
        }}
      >
        <span
          style={{
            fontSize: 30,
            fontWeight: 900,
            lineHeight: 1.08,
            letterSpacing: '-0.02em',
            textTransform: 'uppercase',
            color: '#ffffff',
            textShadow: '0 2px 14px rgba(0,0,0,0.5)',
          }}
        >
          AI can’t
          <br />
          take this.
        </span>
        <div
          style={{
            position: 'absolute',
            left: 16,
            bottom: 12,
            width: 44,
            height: 44,
            borderRadius: 44,
            background: 'rgba(17,19,24,0.6)',
            border: '1px solid rgba(255,255,255,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <Play size={17} fill="#ffffff" strokeWidth={0} />
        </div>
        <span
          style={{
            position: 'absolute',
            right: 12,
            bottom: 12,
            padding: '3px 7px',
            borderRadius: 5,
            background: 'rgba(0,0,0,0.75)',
            color: '#ffffff',
            fontSize: 11.5,
            fontWeight: 600,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          21:07
        </span>
      </div>
      <div style={{ padding: '16px 16px 0' }}>
        <div style={{ fontSize: 17, fontWeight: 700, lineHeight: 1.22, letterSpacing: '-0.02em', color: '#111318' }}>
          What AI can’t take from you
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginTop: 11 }}>
          <Youtube size={15} color="rgb(255,0,0)" />
          <span style={{ fontSize: 12.5, color: '#606068' }}>IAmMarkManson · 3.1M views</span>
        </div>
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
  /** 0–1 fingertip gesture over the Machina icon (see `Tap`). */
  tap?: number;
  /** What is actually being shared — the sheet must name the source behind it. */
  item?: { title: string; site: string; mark?: string };
}> = ({ open, pick = 0, tap = 0, item }) => {
  const shared = item ?? { title: INCOMING.headline, site: INCOMING.site };
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
          background: 'rgba(247,247,249,0.96)',
          backdropFilter: 'blur(30px)',
          border: '1px solid rgba(0,0,0,0.06)',
          boxShadow: '0 -20px 60px rgba(24,32,48,0.28)',
          padding: '10px 0 26px',
          height: H - 12,
        }}
      >
        <div
          style={{
            width: 38,
            height: 5,
            borderRadius: 3,
            background: 'rgba(0,0,0,0.18)',
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
              background: 'linear-gradient(140deg, #FFFFFF, #E8E8EE)',
              border: '1px solid rgba(0,0,0,0.08)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 9,
              fontWeight: 800,
              color: '#6b6b74',
            }}
          >
            {shared.site.slice(0, 1).toUpperCase()}
          </div>
          <div style={{ minWidth: 0 }}>
            {/* The row must name the SOURCE currently behind the sheet — the
                cross-cut only argues "from anywhere" if the sheet agrees. */}
            <div style={{ fontSize: 13.5, fontWeight: 600, color: '#111318', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 250 }}>
              {shared.title}
            </div>
            <div style={{ fontSize: 11.5, color: '#7a7a84' }}>{shared.site}</div>
          </div>
        </div>
        <div style={{ height: 1, background: 'rgba(0,0,0,0.08)', margin: '0 0 14px' }} />
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
                  position: 'relative',
                  width: 58,
                  height: 58,
                  borderRadius: 14,
                  margin: '0 auto 7px',
                  // The Machina app icon does not theme — it is the dark
                  // graphite tile in light mode too, which also makes it the
                  // strongest mark in the row.
                  background: a.machina
                    ? 'radial-gradient(circle at 50% 36%, #282833, #16161d 46%, #07070a 100%)'
                    : a.hue,
                  border: a.machina ? '1px solid rgba(0,0,0,0.25)' : 'none',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transform: a.machina ? `scale(${1 + pick * 0.08})` : 'none',
                  boxShadow: a.machina
                    ? `0 ${4 + pick * 8}px ${10 + pick * 22}px -4px rgba(24,32,48,${0.2 + pick * 0.35})`
                    : 'none',
                }}
              >
                {a.machina && (
                  <div style={{ color: '#F2F5FA', width: 20, height: 23 }}>
                    <CitationGlyph style={{ width: '100%', height: '100%' }} />
                  </div>
                )}
                {a.machina && <Tap t={tap} size={50} />}
              </div>
              <div
                style={{
                  fontSize: 10.5,
                  color: a.machina ? '#111318' : '#6b6b74',
                  fontWeight: a.machina ? 600 : 400,
                }}
              >
                {a.name}
              </div>
            </div>
          ))}
        </div>
        <div style={{ height: 1, background: 'rgba(0,0,0,0.08)', margin: '0 0 8px' }} />
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
              color: '#26262b',
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
  /** 0–1 launch progress of the ANIMATED mark — the app's own thinking orb
   *  (CitationMark's launch motion), not a static glyph in a tile. */
  markU?: number;
  /** Current frame — after the launch, the point BREATHES (the app's searching
   *  state), so the mark is visibly alive for the whole pipeline. */
  markPulse?: number | null;
}> = ({ progress, cardEnter = 0, markU = 1, markPulse = null }) => {
  const step = progress >= 92 ? 4 : progress >= 72 ? 3 : progress >= 50 ? 2 : progress >= 25 ? 1 : 0;
  const card = byId('aiarticle');
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
          {/* No mark in the header (owner note, round 13c) — the living logo
              moved DOWN into the checklist, one per phase. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 16 }}>
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
                  {/* MATCH THE SHIPPED SHEET (owner screenshot, round 13f):
                      done = a bare black checkmark, active = the app's
                      ANIMATED mark breathing its searching pulse, pending =
                      an empty grey circle. */}
                  <div
                    style={{
                      width: 16,
                      height: 17,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                  >
                    {done && (
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={T.accent} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M4 12.5 9.5 18 20 6.5" />
                      </svg>
                    )}
                    {active && (
                      <span style={{ color: T.accent, display: 'inline-flex' }}>
                        <AnimatedMark id={`step-${i}`} u={markU} pulse={markPulse} style={{ width: 14, height: 'auto' }} />
                      </span>
                    )}
                    {!done && !active && (
                      <div
                        style={{
                          width: 14,
                          height: 14,
                          borderRadius: 14,
                          border: `1.5px solid ${T.borderStrong}`,
                        }}
                      />
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
          {CARDS.filter((c) => c.id !== 'aiarticle')
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
  /** 0–1 the finger tapping the Graph chip — the film's cut into the graph. */
  graphTap?: number;
  thinking?: number;
  scrollY?: number;
}> = ({ typed = 0, streamed = 0, sources = [], graphChip = 0, graphTap = 0, thinking = 0, scrollY = 0 }) => {
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

          {/* The bubble exists only AFTER the question is sent. While typing, the
              text lives in the composer alone — rendering both showed the same
              half-finished sentence twice on screen, which read as a glitch. */}
          {asked && (
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
                {ASK_QUESTION}
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
                    <CitationChip key={s.id} label={s.label} kind={s.kind} title={s.title} enter={sources[i] ?? 0} />
                  ))}
                </div>
              )}

              {graphChip > 0 && (
                <div style={{ marginTop: 12 }}>
                  <span style={{ position: 'relative', display: 'inline-flex' }}>
                    <GraphChip
                      opacity={graphChip}
                      pressed={graphTap > 0 ? Math.min(1, graphTap / 0.5) * (1 - Math.max(0, (graphTap - 0.6) / 0.4)) : 0}
                    />
                    <Tap t={graphTap} />
                  </span>
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
            boxShadow: '0 8px 24px -10px rgba(24,32,48,0.18)',
          }}
        >
          <span style={{ fontSize: 13.5, color: asked ? T.textMuted : T.text, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden' }}>
            {/* No "library" anywhere in the film — standing owner rule. */}
            {asked ? 'Ask a follow-up' : q || 'Ask about your saves'}
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
 *
 * The chrome above the canvas is the SHIPPED layout, not an invention: the
 * "Back to Ask" pill sits at the top of the content (navigation), then the
 * stats line, then the category legend chips (filters that act on the view) —
 * the exact hierarchy the app settled on. The pill is present from the first
 * frame because in the film the user has just TAPPED Graph on a cited answer.
 */
const GRAPH_LEGEND = [
  { name: 'AI', n: 3 },
  { name: 'Home', n: 4 },
  { name: 'Cooking', n: 3 },
  { name: 'Philosophy', n: 2 },
  { name: 'Travel', n: 1 },
];

export const GraphScreen: React.FC<{
  /** 0–1 how much of the graph has been drawn. */
  draw: number;
  /** 0–1 cluster label fade. */
  labels?: number;
  backPill?: number;
}> = ({ draw, labels = 0, backPill = 0 }) => {
  const W = SCREEN_W;
  const H = SCREEN_H;
  // The canvas is inset in a rounded container, exactly as the app lays it out —
  // below the back pill / stats / legend stack.
  const PAD = 14;
  const TOP = 218;
  const BOT = 104;
  const cw = W - PAD * 2;
  const chh = H - TOP - BOT;
  // Coordinates are relative to the CANVAS, which is already inset by PAD/TOP —
  // adding those again pushed the whole constellation down and out of frame.
  const px = (n: { x: number; y: number }) => ({ x: n.x * cw, y: n.y * chh });

  return (
    <Screen>
      <StatusBar />
      <AppHeader title="Graph" showSearch={false} />

      {/* back pill → stats → legend, the shipped top-of-content stack */}
      <div style={{ position: 'absolute', top: 105, left: PAD, right: PAD, opacity: backPill }}>
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 5,
            padding: '6px 12px 6px 6px',
            borderRadius: 999,
            background: T.card,
            border: `1px solid ${T.border}`,
            boxShadow: '0 1px 2px rgba(16,24,40,0.06)',
            fontSize: 12,
            fontWeight: 600,
            color: T.textSecondary,
            marginTop: 10,
          }}
        >
          <ChevronLeft size={15} color={T.accent} />
          <MessagesSquare size={13} color={T.accent} />
          Back to Ask
        </div>
        <div style={{ marginTop: 9, fontSize: 12.5, fontWeight: 500, color: T.textSecondary, fontVariantNumeric: 'tabular-nums' }}>
          {GRAPH_NODES.length} connected cards
          <span style={{ color: T.textMuted }}> · </span>
          {GRAPH_EDGES.length} connections
          <span style={{ color: T.textMuted }}> · </span>
          {CLUSTERS.length} clusters
        </div>
        <div style={{ marginTop: 8, display: 'flex', gap: 6, overflow: 'hidden' }}>
          {GRAPH_LEGEND.map((c, ci) => {
            const col = categoryColor(c.name);
            // chips stagger in with the first edges (energy pass, round 13)
            const chipT = Math.max(0, Math.min(1, draw * 8 - ci * 0.6));
            return (
              <span
                key={c.name}
                style={{
                  opacity: chipT,
                  transform: `translateY(${(1 - chipT) * 8}px)`,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  height: 27,
                  padding: '0 10px',
                  borderRadius: 999,
                  border: `1px solid ${T.border}`,
                  background: T.card,
                  fontSize: 11.5,
                  fontWeight: 500,
                  color: T.textSecondary,
                  whiteSpace: 'nowrap',
                  flexShrink: 0,
                }}
              >
                <span style={{ width: 8, height: 8, borderRadius: 8, background: col.fg, flexShrink: 0 }} />
                {c.name}
                <span style={{ color: T.textMuted, fontVariantNumeric: 'tabular-nums' }}>{c.n}</span>
              </span>
            );
          })}
        </div>
      </div>

      {/* The app's own canvas container: rounded-2xl, a hairline, and a
          card→background radial. Ported from KnowledgeGraph.tsx's inline style
          rather than approximated. */}
      <div
        style={{
          position: 'absolute',
          left: PAD,
          right: PAD,
          top: TOP,
          height: chh,
          borderRadius: 16,
          border: `1px solid ${T.border}`,
          background: `radial-gradient(120% 100% at 50% 38%, ${T.card}, ${T.background} 88%)`,
          overflow: 'hidden',
        }}
      >
        <svg width={cw} height={chh} style={{ position: 'absolute', inset: 0 }}>
          <defs>
            {GRAPH_NODES.map((n) => {
              const c = categoryColor(n.category).fg;
              return (
                // Body: the category colour with a lit top — a radial offset up
                // and left, exactly the app's createRadialGradient call.
                <radialGradient
                  key={n.id}
                  id={`nd-${n.id}`}
                  gradientUnits="objectBoundingBox"
                  cx="0.32"
                  cy="0.32"
                  r="0.72"
                >
                  <stop offset="0%" stopColor={c} stopOpacity="1" />
                  <stop offset="100%" stopColor={c} stopOpacity="0.65" />
                </radialGradient>
              );
            })}
          </defs>

          {/* Edges are MUTED GREY at low alpha — the app only colours an edge
              when it is lit by a selection. A constellation of coloured threads
              was the mockup's invention. */}
          {GRAPH_EDGES.map(([a, b], i) => {
            const na = GRAPH_NODES.find((n) => n.id === a);
            const nb = GRAPH_NODES.find((n) => n.id === b);
            if (!na || !nb) return null;
            const pa = px(na);
            const pb = px(nb);
            const len = Math.hypot(pb.x - pa.x, pb.y - pa.y);
            const t = Math.max(0, Math.min(1, (draw - 0.05 * (i % 7)) / 0.5));
            return (
              <line
                key={i}
                x1={pa.x}
                y1={pa.y}
                x2={pb.x}
                y2={pb.y}
                stroke={T.textMuted}
                strokeOpacity={0.13 + (i % 5) * 0.055}
                strokeWidth={0.7 + (i % 3) * 0.35}
                strokeDasharray={len}
                strokeDashoffset={len * (1 - t)}
              />
            );
          })}

          {GRAPH_NODES.map((n, i) => {
            const p = px(n);
            const t = Math.max(0, Math.min(1, (draw - 0.03 * i) / 0.32));
            const r = n.r * (0.2 + 0.8 * t);
            const c = categoryColor(n.category).fg;
            return (
              <g key={n.id} opacity={t}>
                <circle
                  cx={p.x}
                  cy={p.y}
                  r={r}
                  fill={`url(#nd-${n.id})`}
                  stroke={c}
                  strokeOpacity={0.35}
                  strokeWidth={1}
                />
              </g>
            );
          })}

          {/* Node labels: 600 11px, textSecondary, below the disc, with a
              CARD-toned halo stroke — the app's exact treatment (a background-
              toned halo smears ghost shapes, per its own QA note). */}
          {GRAPH_NODES.filter((n) => n.label).map((n) => {
            const p = px(n);
            const t = Math.max(0, Math.min(1, (draw - 0.55) / 0.3));
            return (
              <text
                key={n.id}
                x={p.x}
                y={p.y + n.r + 14}
                textAnchor="middle"
                style={{ fontFamily: sans, fontSize: 11, fontWeight: 600 }}
                fill={T.textSecondary}
                opacity={t}
                stroke={T.card}
                strokeOpacity={0.7}
                strokeWidth={3}
                paintOrder="stroke"
              >
                {n.label}
              </text>
            );
          })}

          {/* Island captions: 700 11px, UPPERCASE, textSecondary at 0.75. */}
          {CLUSTERS.map((c) => (
            <text
              key={c.name}
              x={c.x * cw}
              y={c.y * chh}
              textAnchor="middle"
              style={{ fontFamily: sans, fontSize: 11, fontWeight: 700 }}
              fill={T.textSecondary}
              opacity={labels * 0.75}
              stroke={T.card}
              strokeOpacity={labels * 0.5}
              strokeWidth={3}
              paintOrder="stroke"
            >
              {c.name.toUpperCase()}
            </text>
          ))}
        </svg>
      </div>

      {/* the re-fit control (bottom-end, inside the canvas — as shipped) */}
      <div
        style={{
          position: 'absolute',
          top: TOP + chh - 46,
          right: PAD + 10,
          width: 34,
          height: 34,
          borderRadius: 999,
          background: 'rgba(255,255,255,0.85)',
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
    <div style={{ position: 'absolute', top: 105, left: 0, right: 0, bottom: 0, padding: '14px 14px' }}>
      {/* THE REAL SYNTHESIS READING VIEW (owner call, round 13j) — ported from
          the shipped SynthesisCard.tsx `alwaysOpen` layout: accent-tinted card,
          masthead (glyph + THIS WEEK IN MACHINA + title + week·saves), the
          narrative lead, the amber STANDOUT card (doubling as the resurfaced
          save), the italic "Worth sitting with" question, and the Your-notes
          footer. Not an approximation — the same hierarchy, radii and type
          scale, in the film's light tokens. */}
      <div
        style={{
          borderRadius: 18,
          background: T.card,
          border: '1px solid rgba(20,20,27,0.22)',
          boxShadow: T.shadowCard,
          overflow: 'hidden',
          opacity: enter,
          transform: `translateY(${(1 - enter) * 18}px)`,
          padding: '18px 16px 16px',
        }}
      >
        {/* masthead */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 7,
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: T.accent,
          }}
        >
          <CitationGlyph style={{ width: 9, height: 11 }} />
          This week in Machina
        </div>
        <h2
          style={{
            margin: '9px 0 0',
            fontSize: 21,
            lineHeight: 1.15,
            fontWeight: 700,
            letterSpacing: '-0.01em',
            color: T.text,
          }}
        >
          {SYNTHESIS.title}
        </h2>
        <div style={{ marginTop: 5, fontSize: 12, color: T.textMuted }}>{SYNTHESIS.meta}</div>

        {/* the narrative lead */}
        <p style={{ margin: '13px 0 0', fontSize: 13.5, lineHeight: 1.65, color: T.text }}>
          {SYNTHESIS.lead}
        </p>

        {/* STANDOUT — the resurfaced save, exactly the app's card */}
        <div
          style={{
            marginTop: 16,
            borderRadius: 16,
            border: `1px solid ${T.border}`,
            background: T.fillSubtle,
            padding: '13px 15px',
            opacity: reviewEnter,
            transform: `translateY(${(1 - reviewEnter) * 14}px)`,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 5,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: '#D97706',
            }}
          >
            <Star size={12} fill="#D97706" strokeWidth={0} />
            Standout
          </div>
          <div style={{ marginTop: 6, fontSize: 14.5, fontWeight: 700, lineHeight: 1.25, color: T.text }}>
            {SYNTHESIS.standoutTitle}
          </div>
          <div style={{ marginTop: 4, fontSize: 12.5, lineHeight: 1.6, color: T.textSecondary }}>
            {SYNTHESIS.standoutReason}
          </div>
        </div>

        {/* Worth sitting with — the open question, italic, as shipped */}
        <div
          style={{
            marginTop: 10,
            borderRadius: 16,
            background: T.fillSubtle,
            padding: '13px 15px',
            opacity: reviewEnter,
            transform: `translateY(${(1 - reviewEnter) * 14}px)`,
          }}
        >
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.14em',
              textTransform: 'uppercase',
              color: T.textMuted,
            }}
          >
            Worth sitting with
          </div>
          <div style={{ marginTop: 6, fontSize: 13.5, lineHeight: 1.6, color: T.text, fontStyle: 'italic' }}>
            {SYNTHESIS.question}
          </div>
        </div>

        {/* Your notes — the footer the user writes; empty state as shipped */}
        <div
          style={{
            marginTop: 16,
            paddingTop: 13,
            borderTop: `1px solid ${T.border}`,
            opacity: reviewEnter * 0.95,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: '0.14em',
                textTransform: 'uppercase',
                color: T.textMuted,
              }}
            >
              Your notes
            </span>
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                height: 28,
                padding: '0 11px 0 8px',
                borderRadius: 999,
                border: `1px solid ${T.borderStrong}`,
                background: T.card,
                fontSize: 11.5,
                fontWeight: 700,
                color: T.text,
              }}
            >
              <Plus size={12} strokeWidth={2.6} />
              Add a note
            </span>
          </div>
          <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5, color: T.textMuted }}>
            Nothing yet — jot down what you want to carry forward from this week.
          </div>
        </div>
      </div>
    </div>
    <TabBar active="digest" />
    <HomeIndicator />
  </Screen>
);

/** Collections — a fast establishing beat, not a feature tour. */
export const CollectionsScreen: React.FC<{ enter?: number }> = ({ enter = 1 }) => {
  const cols = [
    { name: 'AI & what it means', n: 12, key: 'indigo' },
    { name: 'Recipes to try', n: 18, key: 'teal' },
    { name: 'The apartment hunt', n: 9, key: 'orange' },
    { name: 'Gift ideas', n: 7, key: 'blue' },
    { name: 'Workouts', n: 11, key: 'pink' },
    { name: 'Sent by friends', n: 14, key: 'green' },
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
