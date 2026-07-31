import React from 'react';
import { T } from '../theme';

/** iPhone logical screen size the app is designed against (iPhone 15/16 class). */
export const SCREEN_W = 393;
export const SCREEN_H = 852;

const BEZEL = 13;
const BODY_R = 62;
const SCREEN_R = 50;

/**
 * The device. A titanium-ish body, a black inner bezel, the screen, the Dynamic
 * Island and a glass sheen — assembled from gradients rather than a bitmap
 * mockup so it stays crisp at any camera scale and never carries someone else's
 * watermark.
 */
export const Phone: React.FC<{
  children: React.ReactNode;
  /** 0–1 position of a specular sweep across the glass; null for none. */
  sweep?: number | null;
  style?: React.CSSProperties;
  /** Screen-off (endcard / cold open) renders the glass black. */
  off?: boolean;
}> = ({ children, sweep = null, style, off = false }) => {
  return (
    <div
      style={{
        width: SCREEN_W + BEZEL * 2,
        height: SCREEN_H + BEZEL * 2,
        borderRadius: BODY_R,
        padding: BEZEL,
        background:
          'linear-gradient(147deg, #8e8e96 0%, #3a3a40 18%, #24242a 44%, #4e4e57 62%, #1b1b20 84%, #6a6a73 100%)',
        boxShadow: [
          '0 0 0 1px rgba(255,255,255,0.35)',
          'inset 0 0 0 1px rgba(0,0,0,0.6)',
          '0 40px 90px -20px rgba(24,32,48,0.45)',
          '0 8px 26px rgba(24,32,48,0.25)',
        ].join(', '),
        position: 'relative',
        ...style,
      }}
    >
      {/* inner black rim — the gap between titanium and glass */}
      <div
        style={{
          position: 'absolute',
          inset: BEZEL - 3,
          borderRadius: SCREEN_R + 3,
          background: '#000',
        }}
      />
      <div
        style={{
          position: 'relative',
          width: SCREEN_W,
          height: SCREEN_H,
          borderRadius: SCREEN_R,
          overflow: 'hidden',
          background: off ? '#000' : T.background,
        }}
      >
        {!off && children}

        {/* Dynamic Island */}
        <div
          style={{
            position: 'absolute',
            top: 11,
            left: '50%',
            transform: 'translateX(-50%)',
            width: 118,
            height: 34,
            borderRadius: 17,
            background: '#000',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            paddingRight: 12,
            zIndex: 60,
          }}
        >
          <div
            style={{
              width: 9,
              height: 9,
              borderRadius: 9,
              background: 'radial-gradient(circle at 35% 30%, #1d2b3a, #050608 70%)',
              boxShadow: 'inset 0 0 2px rgba(90,140,190,0.5)',
            }}
          />
        </div>

        {/* glass: a fixed top sheen plus an optional travelling specular */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: SCREEN_R,
            background:
              'linear-gradient(160deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0) 28%)',
            pointerEvents: 'none',
            zIndex: 70,
          }}
        />
        {sweep !== null && (
          <div
            style={{
              position: 'absolute',
              top: '-30%',
              left: `${-60 + sweep * 200}%`,
              width: '55%',
              height: '160%',
              transform: 'rotate(14deg)',
              background:
                'linear-gradient(90deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.10) 45%, rgba(255,255,255,0.14) 55%, rgba(255,255,255,0) 100%)',
              filter: 'blur(10px)',
              pointerEvents: 'none',
              zIndex: 71,
            }}
          />
        )}
      </div>
    </div>
  );
};

/** iOS status bar — the small truth that makes a mock read as a device.
 *  Ink follows the film's theme (`T.text`); pass `light` to force dark ink on
 *  a surface that stays bright regardless of grade. */
export const StatusBar: React.FC<{ time?: string; light?: boolean }> = ({
  time = '9:41',
  light = false,
}) => {
  const ink = light ? '#111827' : T.text;
  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: 54,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 30px 0',
        fontSize: 15,
        fontWeight: 600,
        color: ink,
        letterSpacing: 0.1,
        zIndex: 55,
      }}
    >
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>{time}</span>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {/* cellular */}
        <svg width="18" height="12" viewBox="0 0 18 12" fill={ink}>
          {[0, 1, 2, 3].map((i) => (
            <rect key={i} x={i * 4.6} y={9 - i * 2.6} width="3.1" height={3 + i * 2.6} rx="1" />
          ))}
        </svg>
        {/* wifi */}
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none" stroke={ink} strokeWidth="1.6">
          <path d="M1.2 4.2a10 10 0 0 1 13.6 0" strokeLinecap="round" />
          <path d="M3.8 7a6.4 6.4 0 0 1 8.4 0" strokeLinecap="round" />
          <circle cx="8" cy="9.9" r="1.1" fill={ink} stroke="none" />
        </svg>
        {/* battery */}
        <svg width="26" height="13" viewBox="0 0 26 13">
          <rect
            x="0.6"
            y="0.6"
            width="22"
            height="11.8"
            rx="3.4"
            fill="none"
            stroke={ink}
            strokeOpacity="0.4"
          />
          <rect x="2.4" y="2.4" width="15.5" height="8.2" rx="2.1" fill={ink} />
          <path d="M24.4 4.4v4.2a2.3 2.3 0 0 0 0-4.2Z" fill={ink} fillOpacity="0.5" />
        </svg>
      </div>
    </div>
  );
};

/** The home indicator pill. */
export const HomeIndicator: React.FC = () => (
  <div
    style={{
      position: 'absolute',
      bottom: 8,
      left: '50%',
      transform: 'translateX(-50%)',
      width: 138,
      height: 5,
      borderRadius: 3,
      background: 'rgba(20,20,27,0.4)',
      zIndex: 58,
    }}
  />
);
