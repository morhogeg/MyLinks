/* Shared motion core — pasted into both artifacts so they can never disagree.
   Kept in the repo as the reference for the React component.

   The previous version hitched at three places, all of them value jumps across
   a phase boundary: the search sweep handed over at 58±sin(…) into a lock that
   began at exactly 58; the lock ended the point at r52 into a breathe that
   began at r50; the breathe ended at r50 into a release that began at r52. It
   also swept at 6 cycles over ~1.2s — about 5Hz, which reads as jitter rather
   than as looking around.

   This version is C1-continuous the whole way round the loop: every
   oscillation's AMPLITUDE is ramped in and out with smoothstep, so each phase
   hands over at both the same value and the same velocity, and the wrap from
   release back into search matches too. The sweep is down to 2 cycles. */

const c01 = (x) => Math.min(1, Math.max(0, x));
const sstep = (a, b, x) => { const t = c01((x - a) / (b - a)); return t * t * (3 - 2 * t); };
const quint = (x) => (x < .5 ? 16 * x ** 5 : 1 - Math.pow(-2 * x + 2, 5) / 2);

const SPREAD = 58, R_LO = 21, R_HI = 52, OP_LO = .46;
const LOCK0 = .30, LOCK1 = .58, REL0 = .90;
const HALF = 200, ARM_H = 58;          // clip heights: full reveal vs corner ticks

/* The sustained wait. */
function clampAt(t) {
  if (t < LOCK0) {
    const u = t / LOCK0;
    const amp = 11 * sstep(0, .18, u) * (1 - sstep(.74, 1, u));
    return { spread: SPREAD + amp * Math.sin(4 * Math.PI * u),
             dotR: R_LO, dotOp: OP_LO, clipH: HALF };
  }
  if (t < LOCK1) {
    const e = quint((t - LOCK0) / (LOCK1 - LOCK0));
    return { spread: SPREAD * (1 - e), dotR: R_LO + (R_HI - R_LO) * e,
             dotOp: OP_LO + (1 - OP_LO) * e, clipH: HALF };
  }
  if (t < REL0) {
    const u = (t - LOCK1) / (REL0 - LOCK1);
    const amp = 3.2 * sstep(0, .18, u) * (1 - sstep(.82, 1, u));
    return { spread: 0, dotR: R_HI + amp * Math.sin(2 * Math.PI * u),
             dotOp: 1, clipH: HALF };
  }
  const e = sstep(0, 1, (t - REL0) / (1 - REL0));
  return { spread: SPREAD * e, dotR: R_HI - (R_HI - R_LO) * e,
           dotOp: 1 - (1 - OP_LO) * e, clipH: HALF };
}

/* The arrival, played once. Ends exactly on clampAt(0) — brackets drawn, held
   wide, point at its searching floor — so the loop picks it up without a seam. */
function traceEntry(u) {
  const g = sstep(0, .82, u), lit = sstep(.5, 1, u);
  return { spread: SPREAD, clipH: ARM_H + (HALF - ARM_H) * g,
           dotR: R_LO * lit, dotOp: OP_LO * lit };
}

/* The launch screen. Same assembly, but it resolves to the LOCKED mark rather
   than handing off to a search — an arrival, not a prelude to waiting. */
function launchAt(u) {
  const g = sstep(0, .46, u), strike = sstep(.44, .68, u);
  return { spread: SPREAD * (1 - sstep(.30, .70, u)),
           clipH: ARM_H + (HALF - ARM_H) * g,
           dotR: R_HI * strike, dotOp: strike };
}
