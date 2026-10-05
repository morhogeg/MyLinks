import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CAPTIONS, FPS, HITS, TOTAL_FRAMES } from '../../../../ads/card-timeline.mjs';
import VO from './vo.json';
import { Lockup } from '../../kit/Brand';
import { KineticLine } from '../../kit/Type';
import { prog } from '../../kit/curves';
import { useAdFrame } from './format';

/**
 * The close (the SAVE clip's End, framed per shape): the mark arrives with
 * the app's launch motion and strikes on the score's impact, the drawn
 * wordmark wipes in as the narrator says "Machina", then the tagline,
 * exactly "Everything you save, finally useful.", on ONE line, each word on
 * the narrator's timing, held 1.6s. No App Store badge and no "available"
 * line: the listing is not live, and Meta's Install button carries the call to
 * action. The space under the line stays clear for the official badge.
 */
const LINE = CAPTIONS.find((c) => c.place === 'lockup')!;
const timing = VO.find((v) => v.frame === LINE.at);
const starts = timing?.words.map((s) => Math.round(s * FPS)) ?? [];
const [, ...rows] = LINE.text.split('\n');
const TAG = rows.join('\n');

export const End: React.FC<{ f: number }> = ({ f }) => {
  const { lockupTop } = useAdFrame();
  if (f < HITS.lockup) return null;
  const drift = prog(f, HITS.markStrike + 6, TOTAL_FRAMES, (t) => t);
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <div style={{ position: 'absolute', top: lockupTop, transform: `scale(${1 + drift * 0.025})`, transformOrigin: '50% 40%' }}>
        <Lockup frame={f} strike={HITS.markStrike} wordAt={LINE.at + (starts[0] ?? 0)} line="" showLine={false} wordWidth={620} />
        <div style={{ marginTop: 64, display: 'flex', justifyContent: 'center' }}>
          <KineticLine text={TAG} frame={f} from={LINE.at} to={TOTAL_FRAMES + 30} starts={starts.slice(1)} size={52} width={1040} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
