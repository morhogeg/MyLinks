/**
 * TICK IT OFF: the ink list, as data (plain JS, so the picture, the score
 * and the gates read the same list and the same scroll): this account's real
 * saves written as the to-do list they quietly are, one empty circle each.
 * Every item is a save in REVISIT's account (capture/library.mjs;
 * audio/revisit-verify.mjs checks the id and the title, word for word), its
 * verb what the save asks of you, its meta the save's own byline and length
 * (the video's 11:45 is YouTube's own). `act` marks the five that carry a
 * "Do this" line, by their row in Revisit (newest save first): the video is
 * row 0.
 *
 * `br`: a long title's second line starts at this word (the type is set, not
 * flowed, so the slot reel's arithmetic is exact).
 */
import { HITS } from './revisit-timeline.mjs';

export const ITEMS = [
  { id: 'walker', verb: 'Watch', title: 'Sleep is your superpower', meta: 'TED · 20 min' },
  { id: 'tailend', verb: 'Read', title: 'The Tail End', meta: 'Wait But Why · 7 min', act: 1 },
  { id: 'seljalandsfoss', verb: 'Visit', title: 'Seljalandsfoss, Iceland', meta: '@ringroad.notes' },
  { id: 'kindofblue', verb: 'Listen to', title: 'Kind of Blue', meta: 'Miles Davis · 46 min' },
  { id: 'coffee', verb: 'Try', title: 'The Ultimate V60 Technique', meta: 'James Hoffmann · 9 min', act: 2 },
  { id: 'greatwork', verb: 'Read', title: 'How to Do Great Work', meta: 'Paul Graham · 45 min' },
  { id: 'freesolo', verb: 'Watch', title: 'Free Solo', meta: 'National Geographic' },
  { id: 'yoga', verb: 'Do', title: 'Yoga For Complete Beginners, 20 Minute Home Yoga Workout', br: '20', meta: 'Yoga With Adriene · 23 min' },
  { id: 'money', verb: 'Read', title: 'The Psychology of Money', meta: 'Collaborative Fund · 18 min' },
  { id: 'goloritze', verb: 'Visit', title: 'Cala Goloritzé, Sardinia', meta: '@slowcoasts', act: 4 },
  { id: 'robinson', verb: 'Watch', title: 'Do schools kill creativity?', meta: 'TED · 20 min' },
  { id: 'kahneman', verb: 'Read', title: 'Thinking, Fast and Slow', meta: 'Goodreads' },
  { id: 'pomodoro', verb: 'Try', title: 'The Pomodoro Technique', meta: 'Francesco Cirillo' },
  { id: 'entropy', verb: 'Watch', title: 'The Most Misunderstood Concept in Physics', br: 'Concept', meta: 'Veritasium · 28 min' },
  { id: 'c25k', verb: 'Start', title: 'Couch to 5K', meta: 'NHS' },
  { id: 'fourthousand', verb: 'Read', title: 'Four Thousand Weeks', meta: 'Oliver Burkeman · 5 min', act: 3 },
  { id: 'wtrek', verb: 'Plan', title: 'The W Trek, Torres del Paine', meta: '@farwalks' },
  { id: 'bretvictor', verb: 'Watch', title: 'Inventing on Principle', meta: 'Vimeo · 54 min' },
  { id: 'makers', verb: 'Read', title: 'Maker’s Schedule, Manager’s Schedule', br: 'Manager’s', meta: 'Paul Graham · 6 min' },
  { id: 'pantheon', verb: 'Visit', title: 'The Pantheon, Rome', meta: '@romebyfoot' },
  { id: 'egg', verb: 'Watch', title: 'The Egg - A Short Story', meta: 'Kurzgesagt · 8 min' },
  { id: 'hailmary', verb: 'Read', title: 'Project Hail Mary', meta: 'Andy Weir' },
  { id: 'boxbreath', verb: 'Try', title: 'Box breathing before big meetings', br: 'before', meta: 'Note' },
  { id: 'jobs', verb: 'Watch', title: "Steve Jobs' 2005 Stanford Commencement Address", br: 'Commencement', meta: 'Stanford · 15 min' },
  { id: 'sivers', verb: 'Read', title: 'Hell Yeah or No', meta: 'Derek Sivers · 2 min' },
  { id: 'mulafossur', verb: 'Visit', title: 'Múlafossur waterfall, Faroe Islands', br: 'Faroe', meta: '@northbound.days' },
  { id: 'sinek', verb: 'Watch', title: 'How great leaders inspire action', br: 'inspire', meta: 'TED · 18 min' },
  { id: 'range', verb: 'Read', title: 'Range: Why Generalists Triumph in a Specialized World', br: 'Triumph', meta: 'David Epstein' },
  { id: 'sevenmin', verb: 'Do', title: 'The Scientific 7-Minute Workout', meta: 'The New York Times' },
  { id: 'overstory', verb: 'Read', title: 'The Overstory', meta: 'W. W. Norton' },
  // the one the spin stops on
  { id: 'dosomething', verb: 'Watch', title: 'How to Beat Procrastination Like It Owes You Money', br: 'Like', meta: 'Mark Manson · 11:45', act: 0 },
  { id: 'truefans', verb: 'Read', title: '1,000 True Fans', meta: 'Kevin Kelly · 12 min' },
  { id: 'lisbon', verb: 'Visit', title: 'Miradouro da Senhora do Monte', meta: '@sevenhills.walks' },
  { id: 'spirited', verb: 'Watch', title: 'Spirited Away', meta: 'Studio Ghibli' },
  { id: 'refactoringui', verb: 'Read', title: 'Refactoring UI', meta: 'Refactoring UI · 7 min' },
  // (the list never ends on screen)
  { id: 'perfectdays', verb: 'Watch', title: 'Perfect Days', meta: 'NEON · 2 min' },
  { id: 'naval', verb: 'Read', title: 'How to Get Rich (without getting lucky)', br: 'getting', meta: '@naval · 6 min' },
  { id: 'tmb', verb: 'Plan', title: 'Tour du Mont Blanc', meta: 'Autour du Mont Blanc' },
  { id: 'grant', verb: 'Watch', title: 'The surprising habits of original thinkers', br: 'original', meta: 'TED · 16 min' },
  { id: 'dune', verb: 'Read', title: 'Dune', meta: '@slowshelf' },
  { id: 'fushimi', verb: 'Visit', title: 'Fushimi Inari at dawn', meta: '@earlytrains' },
  { id: 'paleblue', verb: 'Read', title: 'Pale Blue Dot', meta: 'NASA · 3 min' },
];

export const VIDEO = ITEMS.findIndex((it) => it.id === 'dosomething');
/** the five "Do this" items, in Revisit's order (row 0 first), with their index in the list */
export const ACTS = ITEMS.map((it, k) => ({ it, k })).filter(({ it }) => it.act !== undefined).sort((a, b) => a.it.act - b.it.act);

/** an item's two lines: the title's first part (after the verb); the rest */
export const linesOf = (it) => {
  if (!it.br) return [it.title, null];
  const at = it.title.indexOf(` ${it.br}`);
  return [it.title.slice(0, at), it.title.slice(at + 1)];
};

// ── the layout, at full size (frame 0), in frame pixels
export const L = {
  circleX: 118, // the circle's centre
  circleD: 46,
  stroke: 3.5,
  textX: 176,
  textW: 860,
  size: 46,
  lineH: 52,
  meta: 30,
  metaH: 38,
  metaGap: 6,
  gap: 50,
  /** where the list's first item starts on frame 0, under the hook */
  top0: 612,
};

export const heightOf = (it) => (it.br ? 2 : 1) * L.lineH + L.metaGap + L.metaH + L.gap;
/** each item's top, from the list's own top */
export const TOPS = ITEMS.reduce((acc, it, k) => [...acc, k === 0 ? 0 : acc[k - 1] + heightOf(ITEMS[k - 1])], []);
export const LIST_H = TOPS[TOPS.length - 1] + heightOf(ITEMS[ITEMS.length - 1]);

/** where the video's title block is centred when the spin stops: on the real
 *  card's title once the sheet tears off (App.tsx `CARD_TITLE_Y`) */
export const STOP_Y = 783;

// the app's spring (--ease-spring), cubic-bezier(0.34, 1.56, 0.64, 1), solved
// exactly as the kit's (Remotion's Easing.bezier: Newton, then bisection)
const bezier = (x1, y1, x2, y2) => {
  const A = (a1, a2) => 1 - 3 * a2 + 3 * a1;
  const B = (a1, a2) => 3 * a2 - 6 * a1;
  const C = (a1) => 3 * a1;
  const calc = (t, a1, a2) => ((A(a1, a2) * t + B(a1, a2)) * t + C(a1)) * t;
  const slope = (t, a1, a2) => 3 * A(a1, a2) * t * t + 2 * B(a1, a2) * t + C(a1);
  const N = 11;
  const step = 1 / (N - 1);
  const samples = new Float32Array(N);
  for (let i = 0; i < N; i++) samples[i] = calc(i * step, x1, x2);
  const tForX = (x) => {
    let start = 0;
    let cur = 1;
    for (; cur !== N - 1 && samples[cur] <= x; ++cur) start += step;
    --cur;
    const dist = (x - samples[cur]) / (samples[cur + 1] - samples[cur]);
    let t = start + dist * step;
    const s0 = slope(t, x1, x2);
    if (s0 >= 0.001) {
      for (let i = 0; i < 4; i++) {
        const s = slope(t, x1, x2);
        if (s === 0) return t;
        t -= (calc(t, x1, x2) - x) / s;
      }
      return t;
    }
    if (s0 === 0) return t;
    let a = start;
    let b = start + step;
    let i = 0;
    let cx;
    do {
      t = a + (b - a) / 2;
      cx = calc(t, x1, x2) - x;
      if (cx > 0) b = t;
      else a = t;
    } while (Math.abs(cx) > 1e-7 && ++i < 10);
    return t;
  };
  return (x) => {
    const c = Math.min(1, Math.max(0, x));
    if (c === 0 || c === 1) return c;
    return calc(tForX(c), y1, y2);
  };
};
const SPRING = bezier(0.34, 1.56, 0.64, 1);

const S_STOP = (() => {
  const mid = TOPS[VIDEO] + ((ITEMS[VIDEO].br ? 2 : 1) * L.lineH) / 2;
  return L.top0 + mid - STOP_Y;
})();
/** after each ratchet step, the list has moved on this many saves */
const STEPS = [
  [HITS.step1, 1],
  [HITS.step2, 3],
  [HITS.step3, 6],
];

const easeOutBack = (u, c1 = 0.55) => {
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(u - 1, 3) + c1 * Math.pow(u - 1, 2);
};

/**
 * The list's scroll (px it has moved up) at frame t, fractional for the
 * shutter: still for the hook; three ratchet steps on the voice's verbs (the
 * app's spring); then the slot spin, accelerating (ease-in) into a fast
 * middle and braking with a small overshoot (ease-out-back), velocities
 * matched where the two meet, landing exactly on the video at HITS.stop.
 */
export const scrollAt = (t) => {
  let s = 0;
  for (const [f, n] of STEPS) {
    const to = TOPS[n];
    const from = s;
    if (t <= f) break;
    s = from + (to - from) * SPRING(Math.min(1, (t - f) / 11));
  }
  if (t <= HITS.spin) return s;
  const S0 = TOPS[STEPS[STEPS.length - 1][1]];
  const D = S_STOP - S0;
  // accelerate over A frames (u²), brake over B frames (ease-out-back, whose
  // start velocity is c1 + 3): equal speed at the hand-over
  const A = 52;
  const B = HITS.stop - HITS.spin - A;
  const vb = 0.55 + 3;
  const D2 = D / (1 + (vb * A) / (2 * B));
  const D1 = D - D2;
  const u = t - HITS.spin;
  if (u <= A) return S0 + D1 * (u / A) ** 2;
  if (u <= A + B) return S0 + D1 + D2 * easeOutBack((u - A) / B);
  return S_STOP;
};

/** px per frame the list is moving at t (for the shutter's sample count) */
export const speedAt = (t) => Math.abs(scrollAt(t + 0.5) - scrollAt(t - 0.5));

/**
 * The moments (fractional frames) a save's divider crosses the reading line
 * (the frame's middle) during the steps and the spin: the slot reel's clicks,
 * for the score (audio/revisit-score.mjs).
 */
export const CLICKS = (() => {
  const out = [];
  const line = 980;
  let prev = null;
  for (let t = HITS.step1; t <= HITS.stop + 12; t += 0.05) {
    const s = scrollAt(t);
    // which divider is above the line: the count of tops passed
    const n = TOPS.filter((top) => L.top0 + top - s < line).length;
    if (prev !== null && n !== prev) out.push(Math.round(t * 100) / 100);
    prev = n;
  }
  return out;
})();
