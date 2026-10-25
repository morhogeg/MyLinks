import React from 'react';
import { AbsoluteFill, Audio, random, staticFile, useCurrentFrame } from 'remotion';
import { CAPTIONS, ENDINGS, FPS, HITS, MONTAGE, QUERY, SIGNATURE_AT } from '../../../../clips/pov-timeline.mjs';
import { SaveChip, type SaveKind } from '../../kit/Brand';
import { BandScrim, HOUSE_BAND } from '../../kit/Captions';
import { EASE_FLING, EASE_GATHER, EASE_IN_OUT, EASE_MODAL, EASE_SPRING, prog } from '../../kit/curves';
import { HookTitle } from '../../kit/Hook';
import { Lens, Paper } from '../../kit/Paper';
import { Signature } from '../../kit/Signature';
import { SIGNATURE, signatureWordAt } from '../../kit/signature.mjs';
import { TOKENS } from '../../kit/tokens';
import { HEAD_LEAD, KineticLine } from '../../kit/Type';
import { Grid, ScreenshotWall, SearchBar, SelfChat } from './Places';
import VO from './pov-vo.json';

/**
 * POV: YOU SAVED IT. 30s, 1080 × 1920 (clips/pov-timeline.mjs).
 *
 * The hunt (a blank search bar; an Instagram-style saved grid and a
 * TikTok-style favorites grid whipping past; a wall of screenshots; the
 * chat you send yourself links in; the search that finds nothing, twice),
 * the turn (every place drifts apart and bleaches into the paper), the
 * gather (the saves rush back from every side into one point of ink), and
 * the kit's Signature, the ending every new video shares, with today's
 * footer. Everything is drawn from the kit: Paper, tokens, KineticLine,
 * SaveChip, the curves (audio/house-verify.mjs checks).
 */

type Ending = keyof typeof ENDINGS;

/** ── the clock of each place ─────────────────────────────────────────── */

/** Instagram: a beat on its header, then a thumb's flick up the grid (round 2:
 *  a flick is thrown, fast off the thumb and a long slow-down: EASE_FLING) */
const instaY = (f: number) => 3400 * prog(f, HITS.insta + 6, HITS.tiktok - 2, EASE_FLING);
/** TikTok: arrives on a whip-pan, then its own flick */
const tiktokY = (f: number) => 2600 * prog(f, HITS.tiktok + 12, HITS.shots - 2, EASE_FLING);
const panX = (f: number) => prog(f, HITS.tiktok - 2, HITS.tiktok + 10, EASE_IN_OUT);
/** the screenshots fly up, too fast to read, faster and faster */
const shotsY = (f: number) => 5600 * prog(f, HITS.shots + 4, HITS.chat, (t) => t * t * (2 - t) * 0.6 + t * 0.4);
/** the chat scrolls up, quick through the middle and slow at both ends, so
 *  its links read (round 3: speeding up into the cut, the last links blurred
 *  double and "youtu.be" read as "youtube") */
const chatY = (f: number) => 1250 * prog(f, HITS.chat + 6, HITS.search, EASE_IN_OUT);
/** a place drawn N times along its own motion (a 180° shutter): real motion blur */
const Smear: React.FC<{ dx: number; dy: number; children: (ox: number, oy: number) => React.ReactNode }> = ({ dx, dy, children }) => {
  const len = Math.hypot(dx, dy);
  const k = len < 1.5 ? 1 : Math.min(7, Math.max(3, Math.ceil(len / 10)));
  return (
    <>
      {Array.from({ length: k }, (_, i) => {
        const t = k === 1 ? 0 : i / (k - 1) - 0.5;
        // each sample opaque; sample i laid over the first i at 1/(i+1): the mean
        return (
          <AbsoluteFill key={i} style={{ opacity: 1 / (i + 1) }}>
            {children(dx * t, dy * t)}
          </AbsoluteFill>
        );
      })}
    </>
  );
};

/** a place at frame f, blurred by how far it moves in half a frame */
const Blurred: React.FC<{ f: number; pos: (f: number) => number; axis?: 'x' | 'y'; render: (v: number) => React.ReactNode }> = ({ f, pos, axis = 'y', render }) => {
  const v = (pos(f) - pos(f - 1)) * 0.5;
  return (
    <Smear dx={axis === 'x' ? v : 0} dy={axis === 'y' ? v : 0}>
      {(ox, oy) => render(pos(f) + (axis === 'x' ? ox : oy))}
    </Smear>
  );
};

/** ── the hunt ─────────────────────────────────────────────────────────── */

const caretOn = (f: number) => Math.floor(f / 15) % 2 === 0;

const Hunt: React.FC<{ f: number }> = ({ f }) => {
  if (f < HITS.insta) {
    const push = 1 + 0.035 * prog(f, 0, HITS.insta, (t) => t);
    return (
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: '540px 900px' }}>
        <SearchBar query="" caret={caretOn(f)} none={0} recents={1} />
      </AbsoluteFill>
    );
  }
  if (f < HITS.shots) {
    const x = panX(f);
    const vx = (panX(f) - panX(f - 1)) * 1080 * 0.5;
    return (
      <Smear dx={vx} dy={0}>
        {(ox) => (
          <>
            {x < 1 && (
              <AbsoluteFill style={{ transform: `translateX(${Math.round(-x * 1080 + ox)}px)` }}>
                <Blurred f={f} pos={instaY} render={(y) => <Grid kind="insta" y={y} />} />
              </AbsoluteFill>
            )}
            {x > 0 && (
              <AbsoluteFill style={{ transform: `translateX(${Math.round((1 - x) * 1080 + ox)}px)` }}>
                <Blurred f={f} pos={tiktokY} render={(y) => <Grid kind="tiktok" y={y} />} />
              </AbsoluteFill>
            )}
          </>
        )}
      </Smear>
    );
  }
  if (f < HITS.chat) return <Blurred f={f} pos={shotsY} render={(y) => <ScreenshotWall y={y} />} />;
  if (f < HITS.search) return <Blurred f={f} pos={chatY} render={(y) => <SelfChat y={y} />} />;
  return <Searching f={f} />;
};

/** "that Lisbon café": typed, nothing; every place again, nothing again */
const typed = (f: number) => QUERY.slice(0, Math.max(0, Math.min(QUERY.length, Math.floor((f - HITS.type) / 1.7))));
/** the search, first time ("No results" on "Nothing.") or again (with a small, flat shake) */
const SearchPage: React.FC<{ f: number; again?: boolean }> = ({ f, again = false }) => {
  const query = typed(f);
  const done = query.length === QUERY.length;
  const land = MONTAGE.again + 2;
  const none = again ? prog(f, land, land + 8, EASE_MODAL) : prog(f, HITS.none1, HITS.none1 + 8, EASE_MODAL);
  const shake = again && f >= land ? 10 * Math.exp(-(f - land) / 4) * Math.sin((f - land) * 1.9) : 0;
  return (
    <SearchBar
      query={query}
      caret={!done || caretOn(f)}
      none={none}
      noneShake={shake}
      recents={1 - prog(f, HITS.type, HITS.type + 8, EASE_IN_OUT)}
    />
  );
};

/**
 * (round 3, owner) The montage between the two "No results": every place
 * again, stacked like pages a thumb throws up the screen: the search,
 * Instagram, TikTok, the screenshots, the chat, the search. Each throw is
 * EASE_FLING (fast off the thumb, then settling), so a page is blurred only
 * in its throw and readable for most of its 13 frames; under each, a slow
 * drift. `thrown(f)`: how many pages have gone by (fractional mid-throw).
 */
const PAGES = ['search', 'insta', 'tiktok', 'shots', 'chat', 'again'] as const;
const throwAt = (k: number) => MONTAGE.from + k * MONTAGE.scene;
const thrown = (f: number) => PAGES.slice(1).reduce((n, _, k) => n + prog(f, throwAt(k), throwAt(k) + MONTAGE.swipe, EASE_FLING), 0);
/** each page where it was left (no café in view), drifting while it is up */
const pageView = (page: (typeof PAGES)[number], p: number, f: number) => {
  const d = 60 * prog(f, throwAt(p - 1), throwAt(p) + MONTAGE.swipe, (t) => t);
  if (page === 'insta') return <Grid kind="insta" y={2000 + d} />;
  if (page === 'tiktok') return <Grid kind="tiktok" y={1300 + d} />;
  if (page === 'shots') return <ScreenshotWall y={1400 + d} />;
  if (page === 'chat') return <SelfChat y={300 + d} />;
  // the search's page carries its own set, the same lit paper as behind it
  return (
    <>
      <Paper drift={f / 900} />
      <SearchPage f={f} again={page === 'again'} />
    </>
  );
};

/**
 * A throw is a transition, not a camera move: at up to ~1000px a frame a
 * sampled smear shows as stacked copies, so the page gets a true vertical
 * Gaussian blur instead (an SVG filter, blurring along the throw only),
 * σ ≈ 0.12 × its speed, capped at 60px. (The house cap of 10px is for the
 * camera on a hold; this is the whip the owner asked for.)
 */
const WHIP = { k: 0.12, max: 60 };
const Searching: React.FC<{ f: number }> = ({ f }) => {
  if (f < MONTAGE.from) return <SearchPage f={f} />;
  if (f >= MONTAGE.again + MONTAGE.swipe) return <SearchPage f={f} again />;
  const n = thrown(f);
  const speed = Math.abs(thrown(f) - thrown(f - 1)) * 1920;
  const sigma = Math.min(WHIP.max, WHIP.k * speed);
  return (
    <AbsoluteFill>
      <svg width={0} height={0} style={{ position: 'absolute' }}>
        <filter id="pov-whip" x="0" y="-15%" width="100%" height="130%" colorInterpolationFilters="sRGB">
          <feGaussianBlur stdDeviation={`0 ${sigma.toFixed(2)}`} edgeMode="duplicate" />
        </filter>
      </svg>
      {PAGES.map((page, p) =>
        Math.abs(p - n) >= 1 ? null : (
          <AbsoluteFill
            key={p}
            style={{ transform: `translateY(${Math.round((p - n) * 1920)}px)`, filter: sigma > 0.6 ? 'url(#pov-whip)' : undefined }}
          >
            {pageView(page, p, f)}
          </AbsoluteFill>
        ),
      )}
    </AbsoluteFill>
  );
};

/** the hunt's scenes at a held moment, for the turn's five panels */
const PANELS: { place: (f: number) => React.ReactNode; x: number; y: number; dir: [number, number]; rot: number }[] = [
  { place: () => <Grid kind="insta" y={1200} />, x: 248, y: 870, dir: [-1, -0.35], rot: -4 },
  { place: () => <Grid kind="tiktok" y={900} />, x: 832, y: 870, dir: [1, -0.35], rot: 4 },
  { place: () => <ScreenshotWall y={1400} />, x: 248, y: 1430, dir: [-1, 0.8], rot: 3 },
  { place: () => <SelfChat y={600} />, x: 832, y: 1430, dir: [1, 0.8], rot: -3 },
  { place: (f) => <SearchBar query={QUERY} caret={caretOn(f)} none={1} />, x: 540, y: 1150, dir: [0, 1], rot: 0 },
];
const PANEL_S = 0.3;

/** ── the turn: every place drifts apart and bleaches into the paper ───── */
const Turn: React.FC<{ f: number }> = ({ f }) => {
  const pull = prog(f, HITS.drift, HITS.drift + 24, EASE_MODAL);
  const drift = prog(f, HITS.drift + 10, HITS.white, (t) => t);
  const bleach = prog(f, HITS.drift + 40, HITS.white - 6, EASE_IN_OUT);
  return (
    <AbsoluteFill>
      {PANELS.map((p, i) => {
        const search = i === PANELS.length - 1;
        // the search, full frame, pulls back into its panel; the rest arrive
        const s = search ? 1 + (PANEL_S - 1) * pull : PANEL_S * (1.08 - 0.08 * pull);
        const cx = search ? 540 + (p.x - 540) * pull : p.x;
        const cy = search ? 960 + (p.y - 960) * pull : p.y;
        const away = 240 * drift;
        const op = (search ? 1 : pull) * (1 - bleach);
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              width: 1080,
              height: 1920,
              transformOrigin: '540px 960px',
              transform: `translate(${Math.round(cx - 540 + p.dir[0] * away)}px, ${Math.round(cy - 960 + p.dir[1] * away)}px) rotate(${(p.rot * drift).toFixed(2)}deg) scale(${s.toFixed(4)})`,
              borderRadius: 64 / s,
              overflow: 'hidden',
              background: TOKENS.paper,
              boxShadow: pull > 0.02 ? TOKENS.shadow : undefined,
              opacity: op,
              filter: bleach > 0.01 ? `blur(${(bleach * 6).toFixed(2)}px)` : undefined,
            }}
          >
            {p.place(f)}
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

/** ── the gather: the saves rush back from every side into one point ──── */
const SAVES: { kind: SaveKind; title: string }[] = [
  { kind: 'web', title: 'Read before you sign a lease' },
  { kind: 'youtube', title: 'Stanford commencement address' },
  { kind: 'screenshot', title: 'Read Atomic Habits, start small' },
  { kind: 'x', title: 'Thread: the two-minute rule' },
  { kind: 'web', title: 'Why you forget most of what you read' },
  { kind: 'instagram', title: 'Cala Goloritzé, Sardinia' },
  { kind: 'youtube', title: 'A 20-minute mobility routine' },
  { kind: 'screenshot', title: 'Gift idea for Dana' },
  { kind: 'web', title: 'Studio apartment, Alfama' },
  { kind: 'instagram', title: 'Tokyo in five days' },
  { kind: 'x', title: 'The best note-taking advice I got' },
  { kind: 'youtube', title: 'Life is a video game' },
];
const GATHER_N = 48;
/** the point: where the Signature's own dot strikes (layout.markY), its size */
const POINT = { x: 540, y: SIGNATURE.layout.markY, r: (52 * SIGNATURE.layout.markW) / 576 };

const gatherOf = (i: number) => {
  const a = i * 2.39996 + 0.4;
  // they come in waves through the line, each in view for about a second
  const start = HITS.gather + Math.round((i / GATHER_N) * 68 + random(`gs${i}`) * 8);
  return { a, start, end: start + 30 + Math.round(random(`gd${i}`) * 8), r0: 640 + 460 * random(`gr${i}`), size: 0.8 + 0.45 * random(`gz${i}`) };
};

/**
 * (round 2) The save you couldn't find is the last one home: it glides in
 * from the left, slows so it can be read, then joins the point. The point's
 * last pulse is its arrival.
 */
const HERO = { kind: 'instagram' as SaveKind, title: 'That Lisbon café', in: HITS.gather + 60, read: HITS.gather + 80, end: HITS.point + 4, scale: 1.3, from: { x: -340, y: 1060 }, rest: { x: 400, y: 1010 } };
const LAST_ARRIVAL = HERO.end;

const Hero: React.FC<{ f: number }> = ({ f }) => {
  if (f < HERO.in || f >= HERO.end) return null;
  const at = (ff: number) => {
    // glide in and settle (an arrival), drift while read, then rush into the point
    const glide = prog(ff, HERO.in, HERO.read, EASE_MODAL);
    const join = prog(ff, HERO.read + 8, HERO.end, EASE_GATHER);
    const x0 = HERO.from.x + (HERO.rest.x - HERO.from.x) * glide + 14 * prog(ff, HERO.read, HERO.read + 8, (t) => t);
    const y0 = HERO.from.y + (HERO.rest.y - HERO.from.y) * glide;
    return { x: x0 + (POINT.x - x0) * join, y: y0 + (POINT.y - y0) * join, s: HERO.scale * (1 - 0.9 * join), t: join };
  };
  const p = at(f);
  const q = at(f - 1);
  return (
    <Smear dx={(p.x - q.x) * 0.5} dy={(p.y - q.y) * 0.5}>
      {(ox, oy) => (
        <div
          style={{
            position: 'absolute',
            left: 0,
            top: 0,
            transform: `translate(${(p.x + ox).toFixed(1)}px, ${(p.y + oy).toFixed(1)}px) translate(-50%, -50%) scale(${p.s.toFixed(3)}) rotate(${(-3 * (1 - p.t)).toFixed(2)}deg)`,
            opacity: 1 - prog(f, HERO.end - 3, HERO.end, (t) => t),
          }}
        >
          <SaveChip kind={HERO.kind} title={HERO.title} />
        </div>
      )}
    </Smear>
  );
};

const Gather: React.FC<{ f: number }> = ({ f }) => (
  <AbsoluteFill>
    {Array.from({ length: GATHER_N }, (_, i) => {
      const g = gatherOf(i);
      if (f < g.start || f >= g.end) return null;
      const at = (ff: number) => {
        const t = prog(ff, g.start, g.end, EASE_GATHER);
        const r = g.r0 * (1 - t);
        return { x: POINT.x + Math.cos(g.a) * r, y: POINT.y + Math.sin(g.a) * r, s: g.size * (1 - 0.88 * t), t };
      };
      const p = at(f);
      const q = at(f - 1);
      const save = SAVES[i % SAVES.length];
      return (
        <Smear key={i} dx={(p.x - q.x) * 0.5} dy={(p.y - q.y) * 0.5}>
          {(ox, oy) => (
            <div
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                transform: `translate(${(p.x + ox).toFixed(1)}px, ${(p.y + oy).toFixed(1)}px) translate(-50%, -50%) scale(${p.s.toFixed(3)}) rotate(${((1 - p.t) * (random(`rot${i}`) - 0.5) * 24).toFixed(1)}deg)`,
                opacity: 1 - prog(f, g.end - 4, g.end, (t) => t),
              }}
            >
              <SaveChip kind={save.kind} title={save.title} />
            </div>
          )}
        </Smear>
      );
    })}
  </AbsoluteFill>
);

/** the point of ink, growing as the saves arrive; it hands over to the
 *  Signature's own dot on its strike */
const Point: React.FC<{ f: number }> = ({ f }) => {
  const arrived = Array.from({ length: GATHER_N }, (_, i) => gatherOf(i).end).filter((e) => e <= f).length / GATHER_N;
  if (arrived === 0) return null;
  const pulse = 1 + 0.18 * Math.exp(-Math.max(0, f - LAST_ARRIVAL) / 4) * (f >= LAST_ARRIVAL ? 1 : 0);
  const r = POINT.r * (0.25 + 0.75 * EASE_SPRING(arrived)) * pulse;
  // the Signature's dot strikes over (drawFrom + 0.44…0.68 of its 32-frame draw)
  const strike = SIGNATURE_AT + signatureWordAt(0) - Math.round(0.56 * 32);
  const hand = 1 - prog(f, strike + 14, strike + 22, EASE_IN_OUT);
  if (hand <= 0) return null;
  return (
    <div
      style={{
        position: 'absolute',
        left: POINT.x - r,
        top: POINT.y - r,
        width: 2 * r,
        height: 2 * r,
        borderRadius: '50%',
        background: TOKENS.ink,
        opacity: hand,
      }}
    />
  );
};

/** ── the narration on screen ──────────────────────────────────────────── */
const Lines: React.FC<{ f: number }> = ({ f }) => (
  <AbsoluteFill style={{ pointerEvents: 'none' }}>
    {CAPTIONS.map((c) => {
      const t = VO.find((v) => v.frame === c.at);
      const lines = c.text.split('\n');
      // each line on screen arrives on its cue word; the hook is up from frame 0
      const starts = lines.flatMap((line, k) => {
        const cue = c.cues[k];
        const s = cue === undefined ? -(c.at + HEAD_LEAD + 12) : Math.round((t?.words[cue] ?? 0) * FPS);
        return line.split(' ').map(() => s);
      });
      if (c.place === 'hook') {
        const [kicker, ...big] = lines;
        return <HookTitle key={c.at} kicker={kicker} lines={big} frame={f} to={c.to} />;
      }
      // (round 3) the punchline line, a touch heavier than the lines above it
      const weights = c.punch === undefined ? undefined : lines.map((_, k) => (k === c.punch ? HOUSE_BAND.weight + 110 : HOUSE_BAND.weight));
      // (round 3) a screen-only roll-over on a later word ("Nothing." → "Still nothing.")
      const thenAt = c.then ? c.at + Math.round((t?.words[c.then.cue] ?? 0) * FPS) : null;
      const line = (text: string, from: number, to: number, at: number[]) => (
        <div key={`${c.at}-${from}`} style={{ position: 'absolute', left: 0, right: 0, top: HOUSE_BAND.top, display: 'flex', justifyContent: 'center' }}>
          <KineticLine text={text} frame={f} from={from} to={to} starts={at} size={HOUSE_BAND.size} weight={HOUSE_BAND.weight} weights={weights} width={HOUSE_BAND.width} />
        </div>
      );
      if (c.then && thenAt !== null) {
        return (
          <React.Fragment key={c.at}>
            {line(c.text, c.at, thenAt - HEAD_LEAD - 1, starts)}
            {line(c.then.text, thenAt, c.to, c.then.text.split(' ').map(() => 0))}
          </React.Fragment>
        );
      }
      return line(c.text, c.at, c.to, starts);
    })}
  </AbsoluteFill>
);

export const Pov: React.FC<{ withAudio?: boolean; withCaptions?: boolean; ending?: Ending }> = ({ withAudio = true, withCaptions = true, ending = 'soon' }) => {
  const f = useCurrentFrame();
  // the paper band over anything that rises into the type: the places, and the saves rushing in
  const scrim = (f >= HITS.insta && f < HITS.drift) || (f >= HITS.gather && f < SIGNATURE_AT) ? 1 : 0;
  return (
    <AbsoluteFill style={{ background: TOKENS.paper }}>
      <Paper drift={f / 900} />
      {f < HITS.drift && <Hunt f={f} />}
      {f >= HITS.drift && f < HITS.white + 6 && <Turn f={f} />}
      {f >= HITS.gather && f < SIGNATURE_AT + 2 && <Gather f={f} />}
      {f >= HITS.gather && f < SIGNATURE_AT + 2 && <Hero f={f} />}
      {scrim > 0 && <BandScrim opacity={scrim} tone={TOKENS.paper} band={HOUSE_BAND} />}
      {withCaptions && <Lines f={f} />}
      <Lens vignette={0.35} grain={0.035} />
      <Signature from={SIGNATURE_AT} footer={ENDINGS[ending]} />
      <Point f={f} />
      {withAudio && <Audio src={staticFile(`clips/pov/score-vo.wav`)} />}
    </AbsoluteFill>
  );
};
