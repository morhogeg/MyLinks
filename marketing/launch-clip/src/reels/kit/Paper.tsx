import React from 'react';
import { AbsoluteFill } from 'remotion';
import { Grain, SET_BG, Vignette } from '../../film/effects';

/**
 * The set every Machina reel is shot on: the film's paper (SET_BG, a shade
 * under the app's #F9FAFB so a white screen still separates), lit for a tall
 * frame. A daylight pool high in frame where the type lives, a lift of light
 * behind the product, two slow cool pools so a hold never reads as a flat
 * fill. `drift` moves the pools (pass a slow function of the frame).
 *
 * Grade rules: light only (ink on paper, never a dark flip), no colour casts,
 * no gradients that band; grain and a whisper of vignette are the lens.
 */
export const Paper: React.FC<{ drift?: number; lift?: number; children?: React.ReactNode }> = ({
  drift = 0,
  lift = 1,
  children,
}) => (
  <AbsoluteFill style={{ background: SET_BG, overflow: 'hidden' }}>
    <AbsoluteFill
      style={{
        background:
          'radial-gradient(90% 42% at 50% 22%, rgba(255,255,255,0.95) 0%, rgba(250,251,253,0.5) 46%, rgba(238,240,244,0) 100%)',
        transform: `translateY(${drift * 40}px)`,
      }}
    />
    <div
      style={{
        position: 'absolute',
        left: '50%',
        top: '56%',
        width: 1500,
        height: 1500,
        transform: 'translate(-50%, -50%)',
        borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.3) 38%, rgba(255,255,255,0) 70%)',
        filter: 'blur(40px)',
        opacity: lift,
      }}
    />
    <div
      style={{
        position: 'absolute',
        width: 1300,
        height: 1300,
        left: -520 + drift * 70,
        top: 980,
        background: 'radial-gradient(circle, rgba(52,64,84,0.06) 0%, rgba(52,64,84,0) 62%)',
        filter: 'blur(30px)',
      }}
    />
    <div
      style={{
        position: 'absolute',
        width: 1100,
        height: 1100,
        right: -460 - drift * 60,
        top: -260,
        background: 'radial-gradient(circle, rgba(52,64,84,0.05) 0%, rgba(52,64,84,0) 64%)',
        filter: 'blur(36px)',
      }}
    />
    {children}
  </AbsoluteFill>
);

/** The lens over everything: grain + the lightest vignette. */
export const Lens: React.FC = () => (
  <>
    <Vignette strength={0.8} />
    <Grain opacity={0.045} />
  </>
);
