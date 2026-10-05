import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CAPTIONS, FPS, HITS, TOTAL_FRAMES } from '../../../../clips/save-timeline.mjs';
import VO from './vo.json';
import { Lockup } from '../../kit/Brand';
import { KineticLine } from '../../kit/Type';
import { prog } from '../../kit/curves';

/**
 * The close: the reel's lockup on the clip's clock. The mark arrives with the
 * app's launch motion and strikes on the score's impact, the drawn wordmark
 * wipes in as the narrator says "Machina", then the tagline, "Everything you
 * save, finally useful.", in the reel's line voice (KineticLine, ONE row at
 * 52px, owner 2026-10-01, each word arriving on the narrator's timing),
 * and the end card holds. The clip ends ON it (owner call 2026-09-28: every
 * launch film ends on the tagline). The line is a KineticLine, not the
 * Lockup's own line, because that one splits on spaces only and would lose
 * the row break.
 */
const LINE = CAPTIONS.find((c) => c.place === 'lockup')!;
const timing = VO.find((v) => v.frame === LINE.at);
const starts = timing?.words.map((s) => Math.round(s * FPS)) ?? [];
// "Machina. Everything you save, finally useful.": the first word is the drawn
// wordmark (wiping in as it is said), the rest is the line
const [, ...rows] = LINE.text.split('\n');
const TAG = rows.join('\n');

export const End: React.FC<{ f: number }> = ({ f }) => {
  if (f < HITS.lockup) return null;
  const drift = prog(f, HITS.markStrike + 6, TOTAL_FRAMES, (t) => t);
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <div style={{ position: 'absolute', top: 560, transform: `scale(${1 + drift * 0.025})`, transformOrigin: '50% 40%' }}>
        <Lockup frame={f} strike={HITS.markStrike} wordAt={LINE.at + (starts[0] ?? 0)} line="" showLine={false} wordWidth={620} />
        <div style={{ marginTop: 64, display: 'flex', justifyContent: 'center' }}>
          <KineticLine text={TAG} frame={f} from={LINE.at} to={TOTAL_FRAMES + 30} starts={starts.slice(1)} size={52} width={1040} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
