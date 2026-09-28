import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CAPTIONS, FPS, HITS, TOTAL_FRAMES } from '../../../../clips/save-timeline.mjs';
import VO from './vo.json';
import { Lockup } from '../../kit/Brand';
import { KineticLine } from '../../kit/Type';
import { prog } from '../../kit/curves';

/**
 * The close: the takeaway, and the name that ties it together. The reel's
 * lockup (the mark arrives with the app's launch motion and strikes on the
 * score's impact; the drawn wordmark wipes in as the narrator says
 * "Machina"), and under it the line, "Save it once. / Machina does the
 * rest.", in the reel's line voice (KineticLine at the statement's 60px),
 * each line arriving on the narrator's words. The clip ends on it.
 */
const LINE = CAPTIONS.find((c) => c.place === 'lockup')!;
const timing = VO.find((v) => v.frame === LINE.at);
const starts = timing?.words.map((s) => Math.round(s * FPS)) ?? [];
// "Save it once. Machina does the rest.": the wordmark wipes on "Machina"
const NAME_WORD = LINE.text.split(/\s+/).indexOf('Machina');

export const End: React.FC<{ f: number }> = ({ f }) => {
  if (f < HITS.lockup) return null;
  const drift = prog(f, HITS.markStrike + 6, TOTAL_FRAMES, (t) => t);
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      <div style={{ position: 'absolute', top: 560, transform: `scale(${1 + drift * 0.025})`, transformOrigin: '50% 40%' }}>
        <Lockup frame={f} strike={HITS.markStrike} wordAt={LINE.at + (starts[NAME_WORD] ?? 30)} line="" showLine={false} wordWidth={620} />
        <div style={{ marginTop: 64, display: 'flex', justifyContent: 'center' }}>
          <KineticLine text={LINE.text} frame={f} from={LINE.at} to={TOTAL_FRAMES + 30} starts={starts} size={60} width={1000} />
        </div>
      </div>
    </AbsoluteFill>
  );
};
