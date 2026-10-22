import React from 'react';
import { AbsoluteFill, Audio, staticFile, useCurrentFrame } from 'remotion';
import { CAPTIONS, FPS, HITS, KICKERS, TOTAL_FRAMES } from '../../../../clips/savethis-timeline.mjs';
import { sans } from '../../../fonts';
import { Wordmark } from '../../../ui/Brand';
import { Tap } from '../../kit/AppShot';
import { BandScrim, Captions, clearOf, type ReelCaption, type ReelKicker } from '../../kit/Captions';
import { CLOCK } from '../../kit/camera';
import { EASE_IN_OUT, EASE_MODAL, prog } from '../../kit/curves';
import { Lens, Paper } from '../../kit/Paper';
import { GRADE } from './grade';
import { INK } from '../../kit/Type';
import { App, HANDOVER, MARK_TO } from './App';
import { Dive } from './Dive';
import { Opening } from './Opening';
import { POSTER } from './Poster';
import VO from './savethis-vo.json';

/**
 * SAVE THIS: the organic Reel. 21.5s, 1080 x 1920, the house look (Paper,
 * Lens, the kit's captions and camera) on its own clock
 * (clips/savethis-timeline.mjs). Every frame of app UI is the real app
 * (capture/shoot.mjs `savethisClip`); the opening and the dive are the
 * reel's own (Opening.tsx, Dive.tsx).
 *
 * It loops: the last frame is the poster, frame 0, so the set's drift is
 * periodic over the reel and every layer that is not the poster is gone by
 * the end.
 */
export const paperDriftAt = (f: number) => Math.sin((2 * Math.PI * f) / TOTAL_FRAMES) * 0.5;

export const SaveThis: React.FC<{
  withAudio?: boolean;
  withCaptions?: boolean;
  audioFile?: string;
}> = ({ withAudio = true, withCaptions = true, audioFile = 'clips/savethis/score-vo.wav' }) => {
  const f = useCurrentFrame();
  // the reel runs on output frames: motion blur measures one frame
  CLOCK.perFrame = 1;
  const drift = paperDriftAt(f);
  // type never sits on UI or on the well: the paper rises behind the band
  // while either is up, and lets go as the cover opens into the poster
  const scrim =
    prog(f, HITS.drop + 2, HITS.drop + 12, EASE_IN_OUT) * (1 - prog(f, HANDOVER, HITS.poster, EASE_IN_OUT));
  return (
    <AbsoluteFill style={{ fontFamily: sans }}>
      {withAudio && <Audio src={staticFile(audioFile)} />}
      <Paper drift={drift} tone={GRADE.tone} cool={GRADE.cool} />
      <App f={f} />
      <Opening f={f} markTo={MARK_TO} paperDrift={drift} />
      <Dive f={f} paperDrift={drift} />
      {/* the thumb on the poster's bookmark, on "save" */}
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1080, height: 1920 }}>
        <Tap x={POSTER.bookmark.x} y={POSTER.bookmark.y + 18} t={prog(f, HITS.tapSave - 10, HITS.tapSave + 18, (t) => t)} size={120} />
      </div>
      <BandScrim opacity={scrim} tone={GRADE.tone} />
      {/* (round 4) once the app's camera glides in on the lit ties, the
          paper rises further, over the graph's own header and legend */}
      {f >= HITS.connect && f < HITS.skip && (
        <AbsoluteFill
          style={{
            pointerEvents: 'none',
            opacity: prog(f, HITS.connect + 2, HITS.connect + 18, EASE_IN_OUT),
            background: `linear-gradient(180deg, ${GRADE.tone} 0px, ${GRADE.tone} 700px, ${clearOf(GRADE.tone)} 930px)`,
          }}
        />
      )}
      <TaglineLockup f={f} show={withCaptions} />
      <Captions
        frame={f}
        fps={FPS}
        captions={CAPTIONS.filter((c) => c.place !== 'scene') as ReelCaption[]}
        timing={VO}
        kickers={KICKERS as ReelKicker[]}
        showCaptions={withCaptions}
        showKickers={withCaptions}
      />
      <Lens vignette={GRADE.vignette} grain={GRADE.grain} />
    </AbsoluteFill>
  );
};

/**
 * The tagline, said once, over the save it just brought back: the drawn
 * wordmark wipes in, then "Everything you save, / finally useful." word by
 * word on the narrator's timing, in the band above the card. It leaves
 * before the thumb taps the cover.
 */
const TAG = CAPTIONS.find((c) => c.at === HITS.tagline)!;
const TAG_T = VO.find((v) => v.frame === TAG.at);

const TaglineLockup: React.FC<{ f: number; show: boolean }> = ({ f, show }) => {
  if (!show || f < TAG.at - 8 || f > TAG.to + 1) return null;
  const starts = TAG_T?.words.map((s) => TAG.at + Math.round(s * FPS)) ?? [];
  // (round 2) the first word is the name: the drawn wordmark wipes in as
  // the narrator says "Machina", then the line, word by word
  const word = prog(f, (starts[0] ?? TAG.at) - 3, (starts[0] ?? TAG.at) + 12, EASE_MODAL);
  const out = prog(f, TAG.to - 8, TAG.to, EASE_IN_OUT);
  const rows = TAG.text.split('\n').slice(1);
  let k = 0;
  return (
    <AbsoluteFill style={{ pointerEvents: 'none', opacity: 1 - out, transform: `translateY(${Math.round(-out * 14)}px)` }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 282, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        <div
          style={{
            width: 440,
            color: '#14141B',
            lineHeight: 0,
            clipPath: `inset(-10% ${(1 - word) * 100}% -10% 0)`,
            transform: `translateY(${Math.round((1 - word) * 10)}px)`,
          }}
        >
          <Wordmark style={{ width: '100%', height: 'auto' }} />
        </div>
        <div style={{ marginTop: 30, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          {rows.map((row, r) => (
            <div key={r} style={{ display: 'flex', columnGap: '0.25em', fontFamily: sans, fontSize: 60, fontWeight: 600, letterSpacing: '-0.028em', lineHeight: 1.1, color: INK, whiteSpace: 'nowrap' }}>
              {row.split(' ').map((w) => {
                k++;
                const s0 = (starts[k] ?? TAG.at) - 3;
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
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
