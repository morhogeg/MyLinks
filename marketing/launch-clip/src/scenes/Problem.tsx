import React from 'react';
import { AbsoluteFill, useCurrentFrame } from 'remotion';
import { Search } from 'lucide-react';
import { Phone, StatusBar, HomeIndicator } from '../ui/Phone';
import { FloorGlow, Rig, Stage } from '../film/effects';
import { BASE_SCALE, BASE_Y, drift, prog, ramp, typed, EASE_IN_OUT, EASE_OUT } from '../film/anim';
import { sans } from '../fonts';

/**
 * The problem, shown rather than claimed.
 *
 * Deliberately NOT Machina's UI: this is the generic pile — a read-later list of
 * unlabelled saves, scrolling faster than anyone could read, then a search for a
 * half-remembered phrase that returns nothing. The scene has to be un-branded,
 * or the audience reads the failure as the product's.
 */

const JUNK = [
  ['Untitled', 'medium.com · 4 months ago'],
  ['(no title)', 'x.com/i/web/status/1783… · Apr 2'],
  ['Sleep, Memory and the…', 'nature.com · 3 months ago'],
  ['Bookmark', 'news.ycombinator.com · Mar 28'],
  ['Thread', 'x.com · Mar 26'],
  ['Untitled', 'substack.com · Mar 21'],
  ['The Complete Guide to…', 'blog.example.io · Mar 19'],
  ['(no title)', 'youtube.com/watch?v=… · Mar 14'],
  ['Saved page', 'arxiv.org/abs/1706.03762 · Mar 9'],
  ['Untitled', 'linkedin.com/posts/… · Mar 4'],
  ['Read later', 'newyorker.com · Feb 27'],
  ['Screenshot 2026-02-24', 'Photos · Feb 24'],
  ['Retrieval Practice Produces…', 'pubmed.gov · Feb 20'],
  ['Untitled', 'reddit.com/r/… · Feb 18'],
  ['(no title)', 'instagram.com/p/… · Feb 11'],
  ['Bookmark', 'stratechery.com · Feb 6'],
  ['Untitled', 'journals.plos.org · Feb 2'],
  ['Thread', 'x.com · Jan 30'],
  ['Saved page', 'hbr.org · Jan 24'],
  ['Untitled', 'github.com · Jan 19'],
  ['(no title)', 'tiktok.com/@… · Jan 15'],
  ['Read later', 'theverge.com · Jan 9'],
  ['Bookmark', 'apple.com/newsroom · Jan 4'],
  ['Untitled', 'medium.com · Dec 28'],
];

const Row: React.FC<{ title: string; meta: string }> = ({ title, meta }) => (
  <div
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '13px 18px',
      borderBottom: '1px solid rgba(255,255,255,0.045)',
    }}
  >
    <div
      style={{
        width: 34,
        height: 34,
        borderRadius: 7,
        background: 'rgba(255,255,255,0.05)',
        flexShrink: 0,
      }}
    />
    <div style={{ minWidth: 0 }}>
      <div
        style={{
          fontSize: 13.5,
          color: 'rgba(190,190,198,0.75)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          maxWidth: 268,
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 11, color: 'rgba(130,130,140,0.6)', marginTop: 3 }}>{meta}</div>
    </div>
  </div>
);

const OldWayScreen: React.FC<{
  scroll: number;
  query: string;
  caret: boolean;
  empty: number;
  grey: number;
}> = ({ scroll, query, caret, empty, grey }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      background: '#0a0a0c',
      fontFamily: sans,
      overflow: 'hidden',
      filter: grey > 0 ? `saturate(${1 - grey}) brightness(${1 - grey * 0.25})` : undefined,
    }}
  >
    <StatusBar />
    <div
      style={{
        position: 'absolute',
        top: 54,
        left: 0,
        right: 0,
        height: 118,
        padding: '8px 18px 0',
        background: 'rgba(14,14,16,0.96)',
        zIndex: 20,
        borderBottom: '1px solid rgba(255,255,255,0.05)',
      }}
    >
      <div
        style={{
          fontSize: 25,
          fontWeight: 700,
          letterSpacing: '-0.03em',
          color: 'rgba(210,210,218,0.9)',
        }}
      >
        Saved
      </div>
      <div
        style={{
          marginTop: 9,
          height: 33,
          borderRadius: 10,
          background: 'rgba(255,255,255,0.07)',
          display: 'flex',
          alignItems: 'center',
          gap: 7,
          padding: '0 10px',
        }}
      >
        <Search size={14} color="rgba(150,150,158,0.8)" />
        <span style={{ fontSize: 13, color: query ? 'rgba(210,210,218,0.9)' : 'rgba(140,140,148,0.7)' }}>
          {query || 'Search'}
          {caret && (
            <span
              style={{
                display: 'inline-block',
                width: 1.5,
                height: 14,
                background: 'rgba(210,210,218,0.9)',
                marginLeft: 1,
                verticalAlign: 'text-bottom',
              }}
            />
          )}
        </span>
      </div>
      <div style={{ marginTop: 9, fontSize: 11.5, color: 'rgba(130,130,140,0.65)' }}>
        1,284 items
      </div>
    </div>

    <div style={{ position: 'absolute', top: 172, left: 0, right: 0, bottom: 0, overflow: 'hidden' }}>
      <div style={{ transform: `translateY(${-scroll}px)`, opacity: 1 - empty }}>
        {[...JUNK, ...JUNK].map((r, i) => (
          <Row key={i} title={r[0]} meta={r[1]} />
        ))}
      </div>

      {empty > 0 && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
            opacity: empty,
            background: '#0a0a0c',
          }}
        >
          <Search size={30} color="rgba(120,120,130,0.35)" />
          <div style={{ fontSize: 15, fontWeight: 500, color: 'rgba(160,160,170,0.6)' }}>
            No results
          </div>
          <div style={{ fontSize: 12.5, color: 'rgba(120,120,130,0.45)' }}>
            Try a different search.
          </div>
        </div>
      )}
    </div>
    <HomeIndicator />
  </div>
);

export const Problem: React.FC = () => {
  const f = useCurrentFrame();

  // the pile accelerates past readability, then stops dead
  const accel = ramp(f, [0, 96], [0, 1], EASE_IN_OUT);
  const scrollSpeed = 4 + accel * 46;
  const scroll = ramp(f, [0, 96], [0, 1], EASE_IN_OUT) * 1500 + f * 1.2;
  const settled = f > 96;
  const blur = settled ? ramp(f, [96, 108], [3.4, 0], EASE_OUT) : Math.min(3.4, scrollSpeed * 0.075);

  // then: a half-remembered search, and nothing
  const QUERY = 'sleep thing i saved';
  const chars = typed(f, 112, 152, QUERY.length);
  const empty = prog(f, 158, 172);
  const grey = prog(f, 158, 200);

  // camera: hanging close over the pile, easing back as the search fails
  const scale = ramp(f, [0, 210], [1.16, 1.04], EASE_IN_OUT) * BASE_SCALE;
  const rotY = ramp(f, [0, 210], [-15, -7], EASE_IN_OUT);
  const rotX = ramp(f, [0, 210], [7, 3], EASE_IN_OUT);
  const y = BASE_Y + 26 + drift(f, 7, 240);

  const out = 1 - prog(f, 213, 225);

  return (
    <AbsoluteFill style={{ background: '#050505', opacity: out }}>
      <Stage intensity={0.5} backlight={0.34} />
      <Rig scale={scale} rotY={rotY} rotX={rotX} y={y} blur={0}>
        <div style={{ position: 'relative' }}>
          <FloorGlow y={890} w={700} opacity={0.55} />
          <Phone>
            <div style={{ position: 'absolute', inset: 0, filter: blur > 0.05 ? `blur(${blur}px)` : undefined }}>
              <OldWayScreen
                scroll={scroll}
                query={QUERY.slice(0, chars)}
                caret={chars > 0 && chars < QUERY.length}
                empty={empty}
                grey={grey}
              />
            </div>
          </Phone>
        </div>
      </Rig>
      {/* the pile's own weight, pressing the frame down — kept light: the earlier
          pass crushed the device into the background instead of framing it */}
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(180deg, rgba(5,5,5,0.34) 0%, rgba(5,5,5,0) 24%, rgba(5,5,5,0) 78%, rgba(5,5,5,0.42) 100%)',
        }}
      />
    </AbsoluteFill>
  );
};
