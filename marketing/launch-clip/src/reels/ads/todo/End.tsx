import React from 'react';
import { AbsoluteFill } from 'remotion';
import { CAPTIONS, FPS, HITS, TOTAL_FRAMES } from '../../../../clips/ad-todo-timeline.mjs';
import VO from './vo.json';
import { Lockup } from '../../kit/Brand';
import { prog } from '../../kit/curves';
import { KineticLine } from '../../kit/Type';
import { useShape } from './frame';

/**
 * 6 CTA (round 3, owner: end on a clear, confident call to download). The
 * narrator says "Download Machina. Everything you save, finally useful.":
 *  - "Download Machina." is set in the caption band, the kit's line, as it is
 *    said, and stays to the last frame (the ask is on screen as long as the
 *    ad is);
 *  - the kit's lockup, unchanged (kit/Brand.tsx `Lockup`): the mark launches
 *    and strikes on the score's impact, the drawn wordmark wipes in as
 *    "Machina" is said, and the tagline arrives on the narrator's timing on
 *    one line and holds: the ad still ENDS on the tagline (owner,
 *    2026-09-28).
 * Nothing under the tagline: that space is kept for the App Store badge once
 * the listing is live (no badge, no "available now" before then).
 */
const LINE = CAPTIONS.find((c) => c.place === 'lockup')!;
const timing = VO.find((v) => v.frame === LINE.at);
const [CTA, TAGLINE] = LINE.text.split('\n');
const CTA_WORDS = CTA.split(' ').length;

export const End: React.FC<{ f: number; withCaptions?: boolean }> = ({ f, withCaptions = true }) => {
  const { lockupTop, slots } = useShape();
  if (f < HITS.out) return null;
  const starts = timing?.words.map((s) => LINE.at + Math.round(s * FPS)) ?? [];
  const drift = prog(f, HITS.markStrike + 6, TOTAL_FRAMES, (t) => t);
  return (
    <AbsoluteFill style={{ alignItems: 'center' }}>
      {withCaptions && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: slots.top, display: 'flex', justifyContent: 'center' }}>
          <KineticLine
            text={CTA}
            frame={f}
            from={LINE.at}
            to={TOTAL_FRAMES + 30}
            starts={starts.slice(0, CTA_WORDS).map((s) => s - LINE.at)}
            size={56}
            width={980}
          />
        </div>
      )}
      <div style={{ position: 'absolute', top: lockupTop, transform: `scale(${1 + drift * 0.025})` }}>
        <Lockup
          frame={f}
          strike={HITS.markStrike}
          wordAt={starts[CTA_WORDS - 1]}
          line={TAGLINE}
          lineStarts={starts.slice(CTA_WORDS)}
          lineStyle="statement"
          lineSize={50}
          wordWidth={620}
        />
      </div>
    </AbsoluteFill>
  );
};
