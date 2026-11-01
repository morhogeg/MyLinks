import React from 'react';
import { AbsoluteFill, Img, staticFile } from 'remotion';
import { BatteryFull, Camera, ChevronLeft, Heart, MapPin, MessageCircle, Navigation, Repeat2, Share, Signal, Star, Wifi } from 'lucide-react';
import { TOKENS, alpha, uiText } from '../../kit/tokens';

/**
 * The three screenshots (clips/shots-timeline.mjs HEROES), drawn ONCE in the
 * 393 × 852 points of an iPhone screen and rendered to PNG by
 * `MachinaShotsStill` (public/clips/shots/<id>.png, 3× = 1179 × 2556, the
 * size an iPhone saves). The same PNGs are the camera roll's tiles in the
 * reel AND the images the app's cards show (the capture server serves them),
 * so "same screenshots" is literally true.
 *
 * Schematic and un-branded (house rule "never a blank placeholder"; the ads
 * brief: no third-party image, logo or face): another app's screen made of
 * type, line icons and paper tints. Real facts only: the Olympus mju II is a
 * 1997 35mm compact (f/2.8 lens, splash-proof); the Seneca line is Letters to
 * Lucilius 13; Senhora do Monte is Lisbon's highest viewpoint, in Graça.
 *
 * Each one puts something it is recognisable by just under the status bar:
 * a card's banner shows a screenshot's top 122 points (Card.tsx: object-top
 * at 361 × 112), so that strip is what the viewer meets again in Machina.
 */

export type HeroId = 'camera' | 'seneca' | 'viewpoint';

export const SHOT = { w: 393, h: 852 };

/** the status bar every screenshot carries (9:41, as on every Apple screen) */
export const StatusBar: React.FC<{ tone?: string }> = ({ tone = TOKENS.ink }) => (
  <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 30px 0 46px', boxSizing: 'border-box' }}>
    <div style={{ ...uiText(17, 640, tone), letterSpacing: '-0.02em' }}>9:41</div>
    <div style={{ display: 'flex', gap: 6, alignItems: 'center', color: tone }}>
      <Signal size={17} strokeWidth={2.4} />
      <Wifi size={17} strokeWidth={2.4} />
      <BatteryFull size={25} strokeWidth={1.8} />
    </div>
  </div>
);

const Pill: React.FC<{ children: React.ReactNode; solid?: boolean }> = ({ children, solid = false }) => (
  <div
    style={{
      padding: '7px 12px',
      borderRadius: 999,
      background: solid ? TOKENS.ink : alpha(TOKENS.card, 0.92),
      ...uiText(13, 650, solid ? TOKENS.card : TOKENS.ink),
      display: 'flex',
      alignItems: 'center',
      gap: 6,
    }}
  >
    {children}
  </div>
);

const Round: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ width: 38, height: 38, borderRadius: 19, background: alpha(TOKENS.card, 0.92), display: 'flex', alignItems: 'center', justifyContent: 'center', color: TOKENS.ink }}>{children}</div>
);

/** ── a product page: a used film camera, in some shop ─────────────────── */
const CameraShot: React.FC = () => (
  <AbsoluteFill style={{ background: TOKENS.card }}>
    {/* the photo, full bleed under the status bar; the camera sits high in
        it, so the banner's strip catches its top and the condition badge */}
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 0,
        height: 420,
        background: TOKENS.tiles[2],
        backgroundImage: `radial-gradient(90% 70% at 50% 34%, ${alpha(TOKENS.card, 0.7)} 0%, ${alpha(TOKENS.card, 0)} 72%)`,
      }}
    />
    <div style={{ position: 'absolute', left: 0, right: 0, top: 58, display: 'flex', justifyContent: 'space-between', padding: '0 16px' }}>
      <Round>
        <ChevronLeft size={22} strokeWidth={2.2} />
      </Round>
      <div style={{ display: 'flex', gap: 10 }}>
        <Round>
          <Share size={18} strokeWidth={2.1} />
        </Round>
        <Round>
          <Heart size={18} strokeWidth={2.1} />
        </Round>
      </div>
    </div>
    <div style={{ position: 'absolute', left: 0, right: 0, top: 84, display: 'flex', justifyContent: 'center', color: TOKENS.ink }}>
      <Camera size={236} strokeWidth={0.9} />
    </div>
    <div style={{ position: 'absolute', left: 16, top: 104 }}>
      <Pill>Used · Excellent</Pill>
    </div>
    <div style={{ position: 'absolute', right: 16, top: 376 }}>
      <Pill>1 / 6</Pill>
    </div>
    <div style={{ position: 'absolute', left: 20, right: 20, top: 444, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={uiText(14, 600, TOKENS.inkSoft)}>Film cameras · 35mm compact</div>
      <div style={{ ...uiText(27, 740), letterSpacing: '-0.025em', lineHeight: 1.08 }}>Olympus mju II</div>
      <div style={uiText(16, 520, TOKENS.inkSoft)}>35mm f/2.8 lens · splash-proof · 1997</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginTop: 6 }}>
        <div style={{ ...uiText(30, 760), letterSpacing: '-0.02em' }}>€189</div>
        <div style={uiText(15, 560, TOKENS.inkFaint)}>+ €6 shipping</div>
      </div>
      <div style={{ display: 'flex', gap: 3, alignItems: 'center', color: TOKENS.ink }}>
        {[0, 1, 2, 3, 4].map((k) => (
          <Star key={k} size={15} strokeWidth={2} fill={k < 5 ? TOKENS.ink : 'none'} />
        ))}
        <div style={{ ...uiText(14, 560, TOKENS.inkSoft), marginLeft: 6 }}>Seller rated 4.9 · 212 sales</div>
      </div>
      <div style={{ borderTop: `1px solid ${TOKENS.hairline}`, margin: '12px 0 4px' }} />
      <div style={uiText(15, 500, TOKENS.inkSoft)}>Tested with film. Flash works, lens clean, no scratches on the window. Comes with a strap and a new battery.</div>
    </div>
    <div style={{ position: 'absolute', left: 16, right: 16, bottom: 34, display: 'flex', gap: 10 }}>
      <div style={{ flex: 1, height: 52, borderRadius: 16, background: TOKENS.paper, display: 'flex', alignItems: 'center', justifyContent: 'center', ...uiText(16, 650) }}>Make an offer</div>
      <div style={{ flex: 1, height: 52, borderRadius: 16, background: TOKENS.ink, display: 'flex', alignItems: 'center', justifyContent: 'center', ...uiText(16, 650, TOKENS.card) }}>Buy now</div>
    </div>
    <StatusBar />
  </AbsoluteFill>
);

/** ── a quote, as a post someone shared ───────────────────────────────── */
const SenecaShot: React.FC = () => (
  <AbsoluteFill style={{ background: TOKENS.card }}>
    {/* the account row, then the quote card at once: the banner's strip
        catches the big opening quote mark and the first words */}
    <div style={{ position: 'absolute', left: 16, right: 16, top: 60, display: 'flex', alignItems: 'center', gap: 10 }}>
      <div style={{ width: 34, height: 34, borderRadius: 17, background: TOKENS.tiles[4], display: 'flex', alignItems: 'center', justifyContent: 'center', ...uiText(15, 700) }}>S</div>
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        <div style={uiText(15, 680)}>slowthoughts</div>
        <div style={uiText(13, 500, TOKENS.inkFaint)}>3d</div>
      </div>
    </div>
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 104,
        height: 470,
        background: TOKENS.tiles[7],
        backgroundImage: `radial-gradient(110% 80% at 30% 20%, ${alpha(TOKENS.card, 0.6)} 0%, ${alpha(TOKENS.card, 0)} 70%)`,
        padding: '18px 34px 0',
        boxSizing: 'border-box',
      }}
    >
      <div style={{ ...uiText(110, 760), lineHeight: 0.8, height: 64, letterSpacing: '-0.04em' }}>“</div>
      <div style={{ ...uiText(35, 720), letterSpacing: '-0.03em', lineHeight: 1.12, marginTop: 6 }}>We suffer more often in imagination than in reality.</div>
      <div style={{ ...uiText(18, 600, TOKENS.inkSoft), marginTop: 26 }}>Seneca</div>
      <div style={uiText(15, 500, TOKENS.inkFaint)}>Letters to Lucilius, 13</div>
    </div>
    <div style={{ position: 'absolute', left: 16, right: 16, top: 590, display: 'flex', gap: 22, color: TOKENS.ink, alignItems: 'center' }}>
      <Heart size={23} strokeWidth={2} />
      <MessageCircle size={23} strokeWidth={2} />
      <Repeat2 size={23} strokeWidth={2} />
      <Share size={21} strokeWidth={2} />
    </div>
    <div style={{ position: 'absolute', left: 16, right: 16, top: 628, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={uiText(15, 650)}>4,812 likes</div>
      <div style={uiText(15, 500, TOKENS.inkSoft)}>
        <span style={{ fontWeight: 650, color: TOKENS.ink }}>slowthoughts </span>
        Read this twice. Then read it again on a Sunday night.
      </div>
      <div style={uiText(14, 500, TOKENS.inkFaint)}>View all 96 comments</div>
    </div>
    <StatusBar />
  </AbsoluteFill>
);

/** ── a place, pinned on a map ─────────────────────────────────────────── */
const ROADS: { x: number; y: number; w: number; r: number; h?: number }[] = [
  { x: -40, y: 140, w: 520, r: -14, h: 12 },
  { x: -60, y: 300, w: 560, r: 9, h: 9 },
  { x: -20, y: 430, w: 500, r: -4, h: 7 },
  { x: 60, y: 30, w: 600, r: 64, h: 10 },
  { x: -120, y: 120, w: 560, r: 112, h: 7 },
  { x: 160, y: 200, w: 420, r: 32, h: 6 },
  { x: -80, y: 520, w: 560, r: 18, h: 6 },
];
const ViewpointShot: React.FC = () => (
  <AbsoluteFill style={{ background: TOKENS.card }}>
    {/* the map fills the top: the banner's strip is streets */}
    <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 600, background: TOKENS.tiles[0], overflow: 'hidden' }}>
      {/* the river along the bottom */}
      <div style={{ position: 'absolute', left: -60, right: -60, top: 470, height: 200, background: TOKENS.tiles[8], transform: 'rotate(-6deg)' }} />
      {/* a park */}
      <div style={{ position: 'absolute', left: 250, top: 330, width: 110, height: 70, borderRadius: 22, background: TOKENS.bubbleMine }} />
      {ROADS.map((r, k) => (
        <div
          key={k}
          style={{ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h ?? 8, borderRadius: 6, background: TOKENS.card, transform: `rotate(${r.r}deg)`, transformOrigin: '0 50%' }}
        />
      ))}
      <div style={{ position: 'absolute', left: 54, top: 84, ...uiText(12, 600, TOKENS.inkFaint), letterSpacing: '0.12em' }}>GRAÇA</div>
      <div style={{ position: 'absolute', left: 236, top: 250, ...uiText(12, 600, TOKENS.inkFaint), letterSpacing: '0.12em' }}>ALFAMA</div>
      <div style={{ position: 'absolute', left: 120, top: 548, ...uiText(12, 600, TOKENS.inkSoft), letterSpacing: '0.12em' }}>TAGUS</div>
      {/* the pin */}
      <div style={{ position: 'absolute', left: 150, top: 168, color: TOKENS.ink, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <MapPin size={64} strokeWidth={1.8} fill={TOKENS.card} />
        <div style={{ width: 14, height: 5, borderRadius: 7, background: TOKENS.skeletonStrong, marginTop: -3 }} />
      </div>
      <div style={{ position: 'absolute', right: 14, top: 470, color: TOKENS.ink }}>
        <Round>
          <Navigation size={17} strokeWidth={2.2} />
        </Round>
      </div>
    </div>
    {/* the place sheet */}
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: 560,
        bottom: 0,
        background: TOKENS.card,
        borderRadius: '28px 28px 0 0',
        boxShadow: TOKENS.shadowSoft,
        padding: '10px 20px 0',
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ alignSelf: 'center', width: 38, height: 5, borderRadius: 3, background: TOKENS.skeletonStrong, marginBottom: 6 }} />
      <div style={{ ...uiText(24, 740), letterSpacing: '-0.02em', lineHeight: 1.1 }}>Miradouro da Senhora do Monte</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: TOKENS.ink }}>
        <div style={uiText(15, 620)}>4.8</div>
        <Star size={14} strokeWidth={2} fill={TOKENS.ink} />
        <div style={uiText(15, 500, TOKENS.inkSoft)}>Viewpoint · Graça, Lisbon</div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {['Directions', 'Save', 'Share'].map((b, k) => (
          <div key={b} style={{ padding: '10px 16px', borderRadius: 999, background: k === 0 ? TOKENS.ink : TOKENS.paper, ...uiText(15, 650, k === 0 ? TOKENS.card : TOKENS.ink) }}>
            {b}
          </div>
        ))}
      </div>
    </div>
    <StatusBar />
  </AbsoluteFill>
);

const SHOTS: Record<HeroId, React.FC> = { camera: CameraShot, seneca: SenecaShot, viewpoint: ViewpointShot };

/** one screenshot, drawn in points (the parent scales it) */
export const HeroShot: React.FC<{ id: HeroId }> = ({ id }) => {
  const S = SHOTS[id];
  return (
    <div style={{ position: 'relative', width: SHOT.w, height: SHOT.h, overflow: 'hidden' }}>
      <S />
    </div>
  );
};

/** `MachinaShotsStill`: one screenshot at 3×, for `npx remotion still` */
export const ShotsStill: React.FC<{ id: HeroId }> = ({ id }) => (
  <AbsoluteFill style={{ background: TOKENS.card }}>
    <div style={{ transform: 'scale(3)', transformOrigin: '0 0' }}>
      <HeroShot id={id} />
    </div>
  </AbsoluteFill>
);

/** the rendered PNG (what the reel shows wherever a screenshot is a picture) */
export const HeroImg: React.FC<{ id: HeroId; style?: React.CSSProperties }> = ({ id, style }) => (
  <Img src={staticFile(`clips/shots/${id}.png`)} style={{ width: SHOT.w, height: SHOT.h, display: 'block', ...style }} />
);
