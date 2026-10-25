import React from 'react';
import { AbsoluteFill, random } from 'remotion';
import {
  Activity,
  AlarmClock,
  BookOpen,
  Bookmark,
  Brain,
  Camera,
  ChevronLeft,
  Coffee,
  Copy,
  Ellipsis,
  Gift,
  Heart,
  History,
  House,
  KeyRound,
  Lamp,
  Luggage,
  MapPin,
  Monitor,
  Moon,
  Music,
  Pencil,
  Plane,
  Play,
  Search,
  SearchX,
  Sparkles,
  Sun,
  Sunset,
  Timer,
  TrainFront,
  Wallet,
  Waves,
  type LucideIcon,
} from 'lucide-react';
import { PlatformMark } from '../../../ui/app';
import { TOKENS, alpha, uiText } from '../../kit/tokens';

/**
 * The places a save hides, drawn as their apps lay them out: generic and
 * un-branded (the platform named in type; the only mark is the app's own
 * Instagram glyph, PlatformMark). (Round 2, owner: the blank tiles showed.)
 * Every tile and screenshot now carries the content those places are really
 * full of, made of nothing but type, line icons and paper: Instagram's
 * text-led carousel covers, TikTok's white caption pills, a chat, a map pin,
 * a list. No third-party image, face or logo, and nothing to license. The
 * lost café is in both grids, in plain sight, for whoever pauses.
 *
 * Each place takes a scroll offset and is drawn on its own opaque ground,
 * so a motion-blurred copy (Smear) averages cleanly.
 */

const W = 1080;
/** where a place's own header sits: just under the house band (HOUSE_BAND.clear) */
export const HEADER_Y = 576;

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

/** a soft pool of light on a tile, so no two read as flat fills */
const wash = (i: number) =>
  `radial-gradient(120% 80% at ${Math.round(20 + 60 * random(`wx${i}`))}% ${Math.round(10 + 50 * random(`wy${i}`))}%, ${alpha(TOKENS.card, 0.55)} 0%, ${alpha(TOKENS.card, 0)} 70%)`;

type Post = { text: string; icon: LucideIcon; look?: 'top' | 'center' | 'icon' };

/** what an Instagram saved grid is full of: text-led carousel covers */
const INSTA: Post[] = [
  { text: '10 things to do\nin Lisbon', icon: MapPin },
  { text: 'Save this for\nyour next trip', icon: Plane, look: 'center' },
  { text: 'The 2-minute\nrule', icon: Timer },
  { text: 'How to\nactually rest', icon: Moon, look: 'icon' },
  { text: 'Read before you\nsign a lease', icon: KeyRound },
  { text: '5 books that\nrewired my brain', icon: BookOpen },
  { text: '12-minute\nmorning mobility', icon: Activity, look: 'icon' },
  // the lost café, in plain sight
  { text: 'Lisbon’s\nprettiest café', icon: Coffee },
  { text: 'Sardinia’s\nbest beaches', icon: Waves, look: 'center' },
  { text: 'Gift ideas\nunder $50', icon: Gift, look: 'icon' },
  { text: 'Budget like\na grown-up', icon: Wallet },
  { text: 'Remember what\nyou read', icon: Brain, look: 'center' },
  { text: 'Shoot better\nphone photos', icon: Camera, look: 'icon' },
  { text: 'Tokyo in\nfive days', icon: TrainFront },
  { text: 'Slow mornings,\na guide', icon: Sun, look: 'center' },
  { text: 'Desk setup\nideas', icon: Lamp, look: 'icon' },
];

/** what a TikTok favorites grid is full of: a subject and a caption in pills */
const TIKTOK: Post[] = [
  { text: 'day 14 of\nlearning guitar', icon: Music },
  { text: 'this changed\nhow I study', icon: Pencil },
  // the lost café again, right there on the pan
  { text: '3 cafés in Lisbon\nyou can’t miss', icon: Coffee },
  { text: 'carry-on only\npacking hack', icon: Luggage },
  { text: 'apartment tour\npart 2', icon: House },
  { text: 'you’re cleaning\nyour desk wrong', icon: Sparkles },
  { text: 'the 5am myth', icon: AlarmClock },
  { text: 'best sunset spot\nin the city', icon: Sunset },
  { text: '3 stretches for\ndesk people', icon: Activity },
  { text: 'Tokyo on\na budget', icon: TrainFront },
  { text: 'rate my setup', icon: Monitor },
  { text: 'read this\nif you’re 25', icon: BookOpen },
  { text: 'hidden beach,\nno crowds', icon: Waves },
  { text: 'save this for\ndate night', icon: Heart },
];

/** an Instagram cover: the headline is the picture */
/** a grid's post at index i: the café only at its one place, never in a later cycle */
const postAt = (posts: Post[], cafe: number, i: number) => {
  const p = posts[i % posts.length];
  return i !== cafe && p.icon === Coffee ? posts[(i + 3) % posts.length] : p;
};
/** where the café sits: Instagram row 3 (whips past), TikTok top right (on the pan) */
const CAFE = { insta: 7, tiktok: 2 };

const InstaCover: React.FC<{ i: number; w: number; h: number }> = ({ i, w, h }) => {
  const p = postAt(INSTA, CAFE.insta, i);
  const look = p.look ?? 'top';
  const Icon = p.icon;
  // a carousel's badge sits top right, so only on covers whose type isn't there
  const carousel = look !== 'top' && random(`c${i}`) > 0.3;
  return (
    <div style={{ position: 'relative', width: w, height: h, background: tint(i), backgroundImage: wash(i), overflow: 'hidden' }}>
      {look === 'icon' ? (
        <>
          <Icon size={128} color={TOKENS.inkSoft} strokeWidth={1.5} style={{ position: 'absolute', left: w / 2 - 64, top: h * 0.3 - 64 }} />
          <div style={{ position: 'absolute', left: 24, right: 24, bottom: carousel ? 42 : 30, textAlign: 'center', whiteSpace: 'pre-line', ...uiText(30, 700) }}>{p.text}</div>
        </>
      ) : look === 'center' ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center', whiteSpace: 'pre-line', padding: 24, ...uiText(42, 760), letterSpacing: '-0.03em', lineHeight: 1.04 }}>
          {p.text}
        </div>
      ) : (
        <>
          <div style={{ position: 'absolute', left: 26, right: 22, top: 30, whiteSpace: 'pre-line', ...uiText(38, 760), letterSpacing: '-0.03em', lineHeight: 1.04 }}>{p.text}</div>
          <Icon size={46} color={TOKENS.inkSoft} strokeWidth={1.8} style={{ position: 'absolute', left: 26, bottom: 30 }} />
        </>
      )}
      {carousel && (
        <>
          <Copy size={28} color={TOKENS.ink} strokeWidth={2.2} style={{ position: 'absolute', right: 16, top: 16, opacity: 0.55 }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 14, display: 'flex', justifyContent: 'center', gap: 7 }}>
            {[0, 1, 2, 3].map((d) => (
              <div key={d} style={{ width: 8, height: 8, borderRadius: 4, background: d === 0 ? TOKENS.ink : TOKENS.skeletonStrong }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

/** a TikTok cover: a subject, and the caption on white pills, line by line */
const TiktokCover: React.FC<{ i: number; w: number; h: number }> = ({ i, w, h }) => {
  const p = postAt(TIKTOK, CAFE.tiktok, i);
  const Icon = p.icon;
  return (
    <div style={{ position: 'relative', width: w, height: h, background: tint(i + 4), backgroundImage: wash(i + 40), overflow: 'hidden' }}>
      <Icon size={176} color={TOKENS.inkFaint} strokeWidth={1.25} style={{ position: 'absolute', left: w / 2 - 88, top: h * 0.2 }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: h * 0.56, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        {p.text.split('\n').map((l, k) => (
          <div key={k} style={{ padding: '6px 14px 8px', borderRadius: 10, background: TOKENS.card, boxShadow: TOKENS.shadowSoft, ...uiText(28, 720), letterSpacing: '-0.02em' }}>
            {l}
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', left: 16, bottom: 14, display: 'flex', alignItems: 'center', gap: 6, ...uiText(26, 650, TOKENS.inkSoft) }}>
        <Play size={22} color={TOKENS.inkSoft} fill={TOKENS.inkSoft} />
        {(1 + random(`v${i}`) * 48).toFixed(1)}K
      </div>
    </div>
  );
};

/** Instagram's saved grid (3:4 covers) or TikTok's favorites (9:16), scrolled by `y` */
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
      {/* (round 2) the header row needs the frame's width: at 0 wide its back and more icons never showed */}
      <div style={{ position: 'absolute', left: 0, top: -y, width: W, height: 1 }}>
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
        <div style={{ position: 'absolute', left: 0, width: W, top: HEADER_Y + 116, height: 1, background: TOKENS.hairline }} />
      </div>
      {Array.from({ length: rows }, (_, r) => first + r).flatMap((row) =>
        [0, 1, 2].map((col) => {
          const i = row * 3 + col;
          return (
            <div key={i} style={{ position: 'absolute', left: col * (w + gap), top: top + row * (h + gap) }}>
              {insta ? <InstaCover i={i} w={w} h={h} /> : <TiktokCover i={i} w={w} h={h} />}
            </div>
          );
        }),
      )}
    </AbsoluteFill>
  );
};

/** ── the camera roll's screenshots ─────────────────────────────────────── */

const SHOT_CHATS = [
  ['you HAVE to go here', 'where is this??', 'lisbon!! the tile café'],
  ['sending you the link', 'ok saving it', 'don’t lose it this time'],
  ['that beach!!', 'add it to the list', 'deal'],
  ['what was that book', 'the one with the habits', 'screenshot it'],
];
const SHOT_LISTS = [
  ['Lisbon list', 'the tile café', 'Miradouro at sunset', 'tram 28, early', 'Alfama walk'],
  ['Read next', 'Piranesi', 'The Overstory', 'Four Thousand Weeks'],
  ['Gifts', 'Dana: film camera', 'Sam: a good pen', 'Mom: the scarf'],
];
const SHOT_POSTS = ['Nobody tells you\nthis about\nmoving abroad', 'Start where\nyou are.', 'The best time\nto save was\nyesterday'];

const StatusBar: React.FC = () => (
  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', height: 18 }}>
    <div style={uiText(15, 650)}>9:41</div>
    <div style={{ width: 40, height: 9, borderRadius: 5, background: TOKENS.skeletonStrong }} />
  </div>
);

const Bubble: React.FC<{ text: string; mine: boolean }> = ({ text, mine }) => (
  <div
    style={{
      alignSelf: mine ? 'flex-end' : 'flex-start',
      maxWidth: '82%',
      padding: '8px 12px 9px',
      borderRadius: 16,
      background: mine ? TOKENS.bubbleMine : TOKENS.paper,
      ...uiText(17, 560),
    }}
  >
    {text}
  </div>
);

/** one screenshot, of one of the things people screenshot */
const Shot: React.FC<{ i: number }> = ({ i }) => {
  const kind = ['chat', 'map', 'list', 'post', 'ticket'][i % 5];
  let body: React.ReactNode;
  if (kind === 'chat') {
    const lines = SHOT_CHATS[Math.floor(i / 5) % SHOT_CHATS.length];
    body = (
      <>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 8, borderBottom: `1px solid ${TOKENS.hairline}` }}>
          <div style={{ width: 26, height: 26, borderRadius: 13, background: TOKENS.skeletonStrong }} />
          <div style={{ width: 70, height: 10, borderRadius: 5, background: TOKENS.skeletonStrong }} />
        </div>
        {lines.map((l, k) => (
          <Bubble key={k} text={l} mine={k % 2 === 1} />
        ))}
        <div style={{ height: 70, borderRadius: 14, background: tint(i), backgroundImage: wash(i), alignSelf: 'flex-start', width: '70%' }} />
      </>
    );
  } else if (kind === 'map') {
    body = (
      <>
        <div style={{ position: 'relative', height: 250, borderRadius: 16, background: tint(i + 2), overflow: 'hidden' }}>
          {[28, 64, 118].map((y, k) => (
            <div key={k} style={{ position: 'absolute', left: -20, right: -20, top: y + k * 30, height: 7, background: TOKENS.card, transform: `rotate(${k * 14 - 12}deg)` }} />
          ))}
          <div style={{ position: 'absolute', left: 120, top: -10, bottom: -10, width: 7, background: TOKENS.card, transform: 'rotate(8deg)' }} />
          <MapPin size={44} color={TOKENS.ink} fill={TOKENS.card} strokeWidth={2} style={{ position: 'absolute', left: 92, top: 92 }} />
        </div>
        <div style={uiText(21, 720)}>Café</div>
        <div style={uiText(16, 500, TOKENS.inkSoft)}>Lisbon · 4.8 · Open now</div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['Directions', 'Save'].map((b) => (
            <div key={b} style={{ padding: '7px 12px', borderRadius: 999, background: TOKENS.paper, ...uiText(15, 650) }}>
              {b}
            </div>
          ))}
        </div>
      </>
    );
  } else if (kind === 'list') {
    const [title, ...items] = SHOT_LISTS[Math.floor(i / 5) % SHOT_LISTS.length];
    body = (
      <>
        <div style={{ ...uiText(24, 760), marginTop: 6 }}>{title}</div>
        {items.map((it) => (
          <div key={it} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 16, height: 16, borderRadius: 5, border: `2px solid ${TOKENS.inkFaint}` }} />
            <div style={uiText(17, 520)}>{it}</div>
          </div>
        ))}
      </>
    );
  } else if (kind === 'post') {
    body = (
      <>
        <div style={{ height: 150, borderRadius: 14, background: tint(i + 5), backgroundImage: wash(i + 5) }} />
        <div style={{ whiteSpace: 'pre-line', ...uiText(25, 760), letterSpacing: '-0.025em', lineHeight: 1.06 }}>{SHOT_POSTS[Math.floor(i / 5) % SHOT_POSTS.length]}</div>
        {[0.9, 0.75, 0.82].map((w, k) => (
          <div key={k} style={{ height: 11, borderRadius: 6, width: `${w * 100}%`, background: TOKENS.skeleton }} />
        ))}
      </>
    );
  } else {
    body = (
      <div style={{ marginTop: 10, borderRadius: 16, background: TOKENS.paper, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={uiText(15, 650, TOKENS.inkSoft)}>Boarding pass</div>
        <div style={{ ...uiText(34, 780), letterSpacing: '-0.02em' }}>LIS → OPO</div>
        <div style={uiText(16, 520, TOKENS.inkSoft)}>Sat 14:20 · Seat 12A</div>
        <div style={{ borderTop: `2px dashed ${TOKENS.skeletonStrong}`, margin: '6px 0' }} />
        <div style={{ display: 'flex', gap: 3, height: 54 }}>
          {Array.from({ length: 30 }, (_, k) => (
            <div key={k} style={{ width: random(`bc${i}-${k}`) > 0.5 ? 4 : 2, background: TOKENS.ink, opacity: 0.8 }} />
          ))}
        </div>
      </div>
    );
  }
  return (
    <div
      style={{
        width: 240,
        height: 520,
        borderRadius: 26,
        background: TOKENS.card,
        boxShadow: TOKENS.shadowSoft,
        overflow: 'hidden',
        padding: '16px 16px',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <StatusBar />
      {body}
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
            <Shot i={col * 7 + n * 3} />
          </div>
        ));
      })}
    </AbsoluteFill>
  );
};

/** ── the chat you send yourself links in: bare links, at all hours ───── */
const LINKS: { day?: string; url: string; at: string }[] = [
  { day: 'Last week', url: 'instagram.com/reel/C8kQ2vXr…', at: '23:41' },
  { url: 'tiktok.com/t/ZT8sYbQ2/', at: '23:42' },
  { url: 'youtu.be/Rk2nV7…', at: '08:15' },
  { day: 'Tuesday', url: 'instagram.com/p/C9a1LmB…', at: '12:03' },
  { url: 'x.com/i/status/18471…', at: '12:04' },
  { url: 'maps.app.goo.gl/x7Fq…', at: '19:58' },
  { day: 'Yesterday', url: 'tiktok.com/t/ZT8hQx1/', at: '00:12' },
  { url: 'instagram.com/reel/DA03pk…', at: '00:13' },
  { url: 'youtu.be/g3LmO…', at: '07:40' },
  { url: 'instagram.com/reel/C7xT…', at: '22:19' },
  { day: 'Today', url: 'tiktok.com/t/ZT8mW4/', at: '01:06' },
  { url: 'instagram.com/p/DB1n…', at: '01:07' },
];

/** the chat's fixed header: its top and height */
const CHAT_HEAD = { top: HEADER_Y - 24, height: 140 };

export const SelfChat: React.FC<{ y: number }> = ({ y }) => (
  <AbsoluteFill style={{ background: TOKENS.paper }}>
    {/* (round 2) the messages scroll UNDER the fixed header, never above it */}
    <div style={{ position: 'absolute', left: 0, right: 0, top: CHAT_HEAD.top + CHAT_HEAD.height, bottom: 0, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 4 - y, display: 'flex', flexDirection: 'column', gap: 18, padding: '0 40px' }}>
        {LINKS.map((m, i) => (
          <React.Fragment key={i}>
            {m.day && (
              <div style={{ alignSelf: 'center', padding: '8px 22px', borderRadius: 999, background: TOKENS.card, boxShadow: TOKENS.shadowSoft, ...uiText(24, 600, TOKENS.inkSoft), margin: '14px 0' }}>
                {m.day}
              </div>
            )}
            <div style={{ alignSelf: 'flex-end', maxWidth: 760, padding: '20px 26px 16px', borderRadius: 30, borderBottomRightRadius: 10, background: TOKENS.bubbleMine, boxShadow: TOKENS.shadowSoft }}>
              <div style={{ ...uiText(34, 500, TOKENS.ink), textDecoration: 'underline', textDecorationColor: TOKENS.inkFaint, textUnderlineOffset: 6 }}>{m.url}</div>
              <div style={{ ...uiText(22, 500, TOKENS.inkFaint), textAlign: 'right', marginTop: 6 }}>{m.at}</div>
            </div>
          </React.Fragment>
        ))}
      </div>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, top: CHAT_HEAD.top, height: CHAT_HEAD.height, background: TOKENS.paper, boxShadow: `0 1px 0 ${TOKENS.hairline}` }}>
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

/** ── the search ────────────────────────────────────────────────────────── */

/** the search bar's top, and where what it shows under it begins */
export const SEARCH = { top: 700, height: 120, under: 870 };

/** (round 2) the history under the bar: every way you already tried */
const RECENTS = ['lisbon café', 'café lisbon instagram', 'that café with the blue tiles', 'lisbon café saved reel'];

/**
 * The search bar: a query or its placeholder and the caret; under it, the
 * recent searches (`recents`, 0–1) or the empty state (`none`, 0–1).
 */
export const SearchBar: React.FC<{ query: string; caret: boolean; none: number; noneShake?: number; recents?: number }> = ({ query, caret, none, noneShake = 0, recents = 0 }) => (
  <>
    <div
      style={{
        position: 'absolute',
        left: 110,
        width: 860,
        top: SEARCH.top,
        height: SEARCH.height,
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
    {recents > 0.001 && (
      <div style={{ position: 'absolute', left: 150, right: 150, top: SEARCH.under, opacity: recents, transform: `translateY(${Math.round((1 - recents) * 10)}px)` }}>
        <div style={{ ...uiText(28, 650, TOKENS.inkSoft), marginBottom: 14 }}>Recent</div>
        {RECENTS.map((r) => (
          <div key={r} style={{ display: 'flex', alignItems: 'center', gap: 22, height: 76, borderBottom: `1px solid ${TOKENS.hairline}` }}>
            <History size={32} color={TOKENS.inkFaint} strokeWidth={2} />
            <div style={uiText(36, 500)}>{r}</div>
          </div>
        ))}
      </div>
    )}
    {none > 0.001 && (
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: SEARCH.under + 20,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          opacity: none,
          transform: `translate(${Math.round(noneShake)}px, ${Math.round((1 - none) * 14)}px)`,
        }}
      >
        <SearchX size={92} color={TOKENS.inkFaint} strokeWidth={1.6} />
        <div style={{ ...uiText(48, 680, TOKENS.inkSoft), marginTop: 22 }}>No results</div>
        {query && <div style={{ ...uiText(30, 500, TOKENS.inkFaint), marginTop: 10 }}>for “{query}”</div>}
      </div>
    )}
  </>
);
