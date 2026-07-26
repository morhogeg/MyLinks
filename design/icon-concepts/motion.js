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

/* ── One motion per verb ───────────────────────────────────────────────────
   lib/scanPhases.ts states the rule as "one verb → one orb, app-wide": the
   SHAPE says what kind of work is running, and it repeats deliberately when two
   adjacent phases do the same kind of work. A single mark keeps that rule by
   varying MOTION instead of shape. Reference render: verb_motions.gif.

     listening  STATIC  locked, no motion at all          at ease, ready
     working    PULSE   tight fast pumping                 in flight, on the wire
     searching  SWEEP   wide slow sweep, point faint       scanning
     solving    STEP    ratchets, one tick per candidate   weighing candidates
     shaping    HOLD    locked, the point breathes         producing the output

   TRACE is NOT in this table. It stays reserved for arrival — Ask opening, app
   launch — and is never looped. */

/* listening — the Ask idle hero. STATIC, by decision: motion means work is
   happening, and an invitation screen has none. Takes no t. */
function restAt() {
  return { spread: 0, dotR: R_HI, dotOp: 1, clipH: HALF };
}

function pulseAt(t) {                                  // working / fetching
  return { spread: 18 + 10 * Math.sin(6 * Math.PI * t), dotR: 38, dotOp: .82, clipH: HALF };
}

function sweepAt(t) {                                  // searching
  const amp = 11 * sstep(0, .12, t) * (1 - sstep(.88, 1, t));
  return { spread: SPREAD + amp * Math.sin(4 * Math.PI * t),
           dotR: R_LO, dotOp: OP_LO, clipH: HALF };
}

function stepAt(t) {                                   // solving
  if (t < .8) {
    const k = Math.min(4, Math.floor(t / .16)), f = (t - k * .16) / .16;
    const a = 84 - 16 * k, b = 84 - 16 * (k + 1);
    return { spread: a + (b - a) * sstep(0, .4, f),
             dotR: 20 + 6 * k, dotOp: .42 + .1 * k, clipH: HALF };
  }
  const e = sstep(0, 1, (t - .8) / .2);
  return { spread: 4 * (1 - e), dotR: 44 + 8 * e, dotOp: .82 + .18 * e, clipH: HALF };
}

function holdAt(t) {                                   // shaping
  const amp = 3.2 * sstep(0, .15, t) * (1 - sstep(.85, 1, t));
  return { spread: 0, dotR: R_HI + amp * Math.sin(2 * Math.PI * t), dotOp: 1, clipH: HALF };
}

/* Drop-in for scanPhases' orb-state strings, so callers keep passing a verb. */
const VERB_MOTION = {
  listening: restAt, working: pulseAt, searching: sweepAt,
  solving: stepAt, shaping: holdAt,
};
