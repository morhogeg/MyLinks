import React from 'react';
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame } from 'remotion';
import { sans } from '../../fonts';
import { AnimatedMark, Wordmark } from '../../ui/Brand';
import { EASE_IN_OUT, EASE_MODAL, prog } from './curves';
import { Lens, Paper } from './Paper';
import { INK, INK_SOFT } from './Type';
import { SIGNATURE, signatureWordAt } from './signature.mjs';

/**
 * THE SIGNATURE (2026-10-25, owner): the ending every new Machina video
 * shares, identical in every one: the house paper rises over the video's
 * last shot, the app's own launch mark draws in and strikes on the spoken
 * "Machina", the drawn wordmark wipes in on it, and the tagline arrives word
 * by word on the ONE voice take (kit/signature.mjs). FIND THE BOOK's
 * approved sign-off, made fixed.
 *
 * A video places it over its last SIGNATURE.frames frames and passes nothing
 * that changes the picture, except an optional `footer`: one quiet line under
 * the tagline for what is true today ("Coming soon · mymachina.app", later
 * the store). Its frames are counted from its own start (a Sequence), so the
 * grain, the push and every reveal are the same pixels in every video.
 * `withAudio` plays the take here; a video whose mix already carries it
 * (mix-vo places SIGNATURE.voicePath at the same frame) leaves it off.
 *
 * Do not fork this inside a clip. A change here changes every future video,
 * which is the point.
 */
export const Signature: React.FC<{ from: number; footer?: string; withAudio?: boolean }> = ({ from, footer, withAudio = false }) => (
  <Sequence from={from} durationInFrames={SIGNATURE.frames} name="Signature">
    <SignatureFrame footer={footer} />
    {withAudio && (
      <Sequence from={SIGNATURE.voiceAt}>
        <Audio src={staticFile(SIGNATURE.voiceFile)} />
      </Sequence>
    )}
  </Sequence>
);

const L = SIGNATURE.layout;
const MARK_H = (L.markW * 416) / 576;
/** the launch, a touch quicker than the app's 39 frames; its point strikes at 0.56 */
const DRAW = 32;
const PUSH = 0.03;

const SignatureFrame: React.FC<{ footer?: string }> = ({ footer }) => {
  const f = useCurrentFrame();
  const name = signatureWordAt(0);
  const drawFrom = name - Math.round(0.56 * DRAW);
  const paper = prog(f, 0, SIGNATURE.paperIn, EASE_IN_OUT);
  const u = prog(f, drawFrom, drawFrom + DRAW, (t) => t);
  const wipe = prog(f, name - 3, name + 12, EASE_MODAL);
  const push = 1 + PUSH * prog(f, 0, SIGNATURE.frames, (t) => t);
  const words = SIGNATURE.line.split(' ');
  const lastWord = signatureWordAt(SIGNATURE.words.length - 1);
  const foot = prog(f, lastWord + 14, lastWord + 26, EASE_MODAL);
  return (
    <AbsoluteFill style={{ opacity: paper }}>
      <Paper />
      <AbsoluteFill style={{ transform: `scale(${push})`, transformOrigin: `540px ${L.markY}px` }}>
        <div
          style={{
            position: 'absolute',
            left: 540 - L.markW / 2,
            top: L.markY - MARK_H / 2,
            width: L.markW,
            height: MARK_H,
            color: INK,
            opacity: prog(f, drawFrom - 2, drawFrom + 4, (t) => t * t * (3 - 2 * t)),
            // ink on paper: the faintest lift, not a drop shadow (FIND THE BOOK round 5)
            filter: 'drop-shadow(0 8px 24px rgba(24,32,48,0.07))',
          }}
        >
          <AnimatedMark u={u} id="signature" style={{ width: '100%', height: '100%' }} />
        </div>
        <div
          style={{
            position: 'absolute',
            left: 540 - L.nameW / 2,
            top: L.markY + L.nameDy,
            width: L.nameW,
            color: INK,
            lineHeight: 0,
            clipPath: `inset(-10% ${(1 - wipe) * 100}% -10% 0)`,
            transform: `translateY(${Math.round((1 - wipe) * 10)}px)`,
          }}
        >
          <Wordmark style={{ width: '100%', height: 'auto' }} />
        </div>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: L.markY + L.lineDy,
            display: 'flex',
            justifyContent: 'center',
            columnGap: '0.25em',
            fontFamily: sans,
            fontSize: L.lineSize,
            fontWeight: 600,
            letterSpacing: '-0.028em',
            lineHeight: 1.1,
            color: INK,
            whiteSpace: 'nowrap',
          }}
        >
          {words.map((w, k) => {
            const s0 = signatureWordAt(k + 1) - 3;
            const t = prog(f, s0, s0 + 8, EASE_MODAL);
            return (
              <span
                key={k}
                style={{
                  display: 'inline-block',
                  opacity: Math.min(1, t * 1.6),
                  transform: `translateY(${Math.round((1 - t) * 12)}px)`,
                  filter: t < 0.999 ? `blur(${((1 - t) * 10).toFixed(2)}px)` : undefined,
                }}
              >
                {w}
              </span>
            );
          })}
        </div>
        {footer && (
          <div
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: L.markY + L.footerDy,
              textAlign: 'center',
              fontFamily: sans,
              fontSize: L.footerSize,
              fontWeight: 500,
              letterSpacing: '-0.01em',
              color: INK_SOFT,
              opacity: foot,
              transform: `translateY(${Math.round((1 - foot) * 8)}px)`,
            }}
          >
            {footer}
          </div>
        )}
      </AbsoluteFill>
      <Lens vignette={0.35} grain={0.035} />
    </AbsoluteFill>
  );
};
