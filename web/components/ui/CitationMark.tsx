'use client';

import { useEffect, useRef } from 'react';

/**
 * CitationMark — the Citation mark as the app-wide working indicator.
 *
 * Replaces the Thinking Orbs (`BrandOrb`). The geometry and every motion are
 * ported VERBATIM from design/icon-concepts/motion.js — the C1-continuous core
 * tuned against real renders. Do not re-derive the numbers.
 *
 * One verb → one motion, app-wide (lib/scanPhases.ts states the rule): the
 * MOTION says what kind of work is running, and it repeats deliberately when
 * two adjacent phases do the same kind of work.
 *
 *   listening  STATIC  locked, no motion at all          at ease, ready
 *   working    PULSE   tight fast pumping                in flight, on the wire
 *   searching  SWEEP   wide slow sweep, point faint      scanning
 *   solving    STEP    ratchets, one tick per candidate  weighing candidates
 *   shaping    HOLD    locked, the point breathes        producing the output
 *
 * TRACE/LAUNCH are NOT in the table — they are the arrival, played once via the
 * `entry` prop (Ask opening), never looped. `listening` does not animate:
 * motion in this system means work is happening, and an idle screen has none.
 *
 * Ink is `currentColor`, so the mark is graphite on light and porcelain on
 * dark with no per-theme code. The tight viewBox (288 292 448 416) is used
 * everywhere: the ink is 432×400 in a 1024 canvas, so the full artboard would
 * render at ~8px in a 20px slot and float off the text's centre.
 *
 * Reduced motion: the mark rests locked, no animation.
 */

export type OrbState = 'listening' | 'working' | 'searching' | 'solving' | 'shaping';
export type OrbSize = number;

/* ── Geometry — nonletter.py:citation() ─────────────────────────────────── */
const TOP = 300, BOT = 700, W = 58, ARM = 100;
const LX = 296, RX = 728, CX = 512, CY = 500;
const VIEWBOX = '288 292 448 416';

/* ── Motion core — motion.js, verbatim ──────────────────────────────────── */
const c01 = (x: number) => Math.min(1, Math.max(0, x));
const sstep = (a: number, b: number, x: number) => {
    const t = c01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
};
const quint = (x: number) => (x < 0.5 ? 16 * x ** 5 : 1 - Math.pow(-2 * x + 2, 5) / 2);

const SPREAD = 58, R_LO = 21, R_HI = 52, OP_LO = 0.46;
const LOCK0 = 0.30, LOCK1 = 0.58, REL0 = 0.90;
const HALF = 200, ARM_H = 58; // clip heights: full reveal vs corner ticks

interface MarkFrame {
    spread: number;
    dotR: number;
    dotOp: number;
    clipH: number;
    alpha?: number;
}

/* The sustained wait. (Kept for parity with the reference; the app's verbs
   currently map to the single-motion functions below.) */
export function clampAt(t: number): MarkFrame {
    if (t < LOCK0) {
        const u = t / LOCK0;
        const amp = 11 * sstep(0, 0.18, u) * (1 - sstep(0.74, 1, u));
        return { spread: SPREAD + amp * Math.sin(4 * Math.PI * u), dotR: R_LO, dotOp: OP_LO, clipH: HALF };
    }
    if (t < LOCK1) {
        const e = quint((t - LOCK0) / (LOCK1 - LOCK0));
        return { spread: SPREAD * (1 - e), dotR: R_LO + (R_HI - R_LO) * e, dotOp: OP_LO + (1 - OP_LO) * e, clipH: HALF };
    }
    if (t < REL0) {
        const u = (t - LOCK1) / (REL0 - LOCK1);
        const amp = 3.2 * sstep(0, 0.18, u) * (1 - sstep(0.82, 1, u));
        return { spread: 0, dotR: R_HI + amp * Math.sin(2 * Math.PI * u), dotOp: 1, clipH: HALF };
    }
    const e = sstep(0, 1, (t - REL0) / (1 - REL0));
    return { spread: SPREAD * e, dotR: R_HI - (R_HI - R_LO) * e, dotOp: 1 - (1 - OP_LO) * e, clipH: HALF };
}

/* The arrival, played once. Ends exactly on clampAt(0) — brackets drawn, held
   wide, point at its searching floor — so a loop picks it up without a seam.
   (Exported for parity with the reference; the shipped entry is launchAt.) */
export function traceEntry(u: number): MarkFrame {
    const g = sstep(0, 0.82, u), lit = sstep(0.5, 1, u);
    return { spread: SPREAD, clipH: ARM_H + (HALF - ARM_H) * g, dotR: R_LO * lit, dotOp: OP_LO * lit };
}

/* Same assembly, but it resolves to the LOCKED mark rather than handing off to
   a search — an arrival, not a prelude to waiting. Runs when Ask opens. */
function launchAt(u: number): MarkFrame {
    const g = sstep(0, 0.46, u), strike = sstep(0.44, 0.68, u);
    return {
        spread: SPREAD * (1 - sstep(0.30, 0.70, u)),
        clipH: ARM_H + (HALF - ARM_H) * g,
        dotR: R_HI * strike, dotOp: strike,
    };
}

/* listening — the Ask idle hero. STATIC, by decision: motion means work is
   happening, and an invitation screen has none. Takes no t. */
function restAt(): MarkFrame {
    return { spread: 0, dotR: R_HI, dotOp: 1, clipH: HALF };
}

function pulseAt(t: number): MarkFrame { // working / fetching
    return { spread: 18 + 10 * Math.sin(6 * Math.PI * t), dotR: 38, dotOp: 0.82, clipH: HALF };
}

function sweepAt(t: number): MarkFrame { // searching
    const amp = 11 * sstep(0, 0.12, t) * (1 - sstep(0.88, 1, t));
    return { spread: SPREAD + amp * Math.sin(4 * Math.PI * t), dotR: R_LO, dotOp: OP_LO, clipH: HALF };
}

function stepAt(t: number): MarkFrame { // solving
    if (t < 0.8) {
        const k = Math.min(4, Math.floor(t / 0.16)), f = (t - k * 0.16) / 0.16;
        const a = 84 - 16 * k, b = 84 - 16 * (k + 1);
        return { spread: a + (b - a) * sstep(0, 0.4, f), dotR: 20 + 6 * k, dotOp: 0.42 + 0.1 * k, clipH: HALF };
    }
    const e = sstep(0, 1, (t - 0.8) / 0.2);
    return { spread: 4 * (1 - e), dotR: 44 + 8 * e, dotOp: 0.82 + 0.18 * e, clipH: HALF };
}

function holdAt(t: number): MarkFrame { // shaping
    const amp = 3.2 * sstep(0, 0.15, t) * (1 - sstep(0.85, 1, t));
    return { spread: 0, dotR: R_HI + amp * Math.sin(2 * Math.PI * t), dotOp: 1, clipH: HALF };
}

/* Drop-in for scanPhases' orb-state strings, so callers keep passing a verb. */
const VERB_MOTION: Record<OrbState, (t: number) => MarkFrame> = {
    listening: restAt, working: pulseAt, searching: sweepAt,
    solving: stepAt, shaping: holdAt,
};

const LOCKED = restAt();
const CYCLE = 3600;   // ms per loop — the identity prototype's cadence
const ENTRY_MS = 1300; // launch assembly length (machina-identity.html ASSEMBLE)

const bracketPaths = (spread: number): [string, string] => {
    const lx = LX - spread, rx = RX + spread;
    return [
        `M${lx} ${TOP} L${lx + ARM} ${TOP} L${lx + ARM} ${TOP + W} L${lx + W} ${TOP + W} ` +
        `L${lx + W} ${BOT - W} L${lx + ARM} ${BOT - W} L${lx + ARM} ${BOT} L${lx} ${BOT} Z`,
        `M${rx} ${TOP} L${rx - ARM} ${TOP} L${rx - ARM} ${TOP + W} L${rx - W} ${TOP + W} ` +
        `L${rx - W} ${BOT - W} L${rx - ARM} ${BOT - W} L${rx - ARM} ${BOT} L${rx} ${BOT} Z`,
    ];
};

interface CitationMarkProps {
    /** Which verb's motion. @default 'working' */
    state?: OrbState;
    /** CSS px of the slot (the mark fills it — tight viewBox). @default 64 */
    size?: OrbSize;
    /** Speed multiplier on the loop. @default 1 */
    speed?: number;
    /** Play the arrival once on mount, then hand to the verb's motion.
     *  Reserved for Ask opening — never looped. */
    entry?: boolean;
    /** Soft brand glow behind the ink — hero sizes only. */
    glow?: boolean;
    className?: string;
    'aria-label'?: string;
}

let uid = 0;

export default function CitationMark({
    state = 'working', size = 64, speed = 1, entry = false, glow = false,
    className = '', ...rest
}: CitationMarkProps) {
    const idRef = useRef<string | null>(null);
    if (idRef.current === null) idRef.current = `cm${uid++}`;
    const id = idRef.current;

    const svgRef = useRef<SVGSVGElement>(null);

    // The active verb lives in a ref so a `state` change is a pointer swap the
    // next frame picks up — NOT a teardown (same rule BrandOrb followed: a
    // deps-driven restart landed at the exact instant Ask swapped its phrase,
    // delaying the paint).
    const stateRef = useRef(state);
    useEffect(() => { stateRef.current = state; }, [state]);

    useEffect(() => {
        const svg = svgRef.current;
        if (!svg) return;
        const $ = (suffix: string) => svg.querySelector<SVGElement>(`#${id}-${suffix}`);
        const pl = $('pl'), pr = $('pr'), dt = $('dt'), ct = $('ct'), cb = $('cb'), g = $('g');
        if (!pl || !pr || !dt || !ct || !cb || !g) return;

        const paint = (f: MarkFrame) => {
            const [l, r] = bracketPaths(f.spread || 0);
            pl.setAttribute('d', l);
            pr.setAttribute('d', r);
            dt.setAttribute('r', (f.dotR ?? R_HI).toFixed(1));
            dt.setAttribute('opacity', (f.dotOp ?? 1).toFixed(3));
            const h = f.clipH ?? HALF;
            ct.setAttribute('height', h.toFixed(1));
            cb.setAttribute('y', (BOT - h).toFixed(1));
            cb.setAttribute('height', h.toFixed(1));
            g.setAttribute('opacity', (f.alpha ?? 1).toFixed(3));
        };

        const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (reduce) {
            paint(LOCKED); // reduced motion: the mark rests locked, no animation
            return;
        }

        const entryStart = entry ? performance.now() : 0;
        let loopStart = performance.now();

        const frameAt = (now: number): MarkFrame | null => {
            if (entry) {
                const el = now - entryStart;
                if (el < ENTRY_MS) return launchAt(el / ENTRY_MS);
            }
            const verb = stateRef.current;
            if (verb === 'listening') return restAt();
            return VERB_MOTION[verb](((now - loopStart) * speed % CYCLE) / CYCLE);
        };

        let rafId = 0;
        let running = false;
        const tick = () => {
            const now = performance.now();
            paint(frameAt(now) ?? LOCKED);
            // Idle + entry finished → nothing left to animate; park the loop
            // (a static screen must not burn frames).
            if (stateRef.current === 'listening' && (!entry || now - entryStart >= ENTRY_MS)) {
                running = false;
                return;
            }
            if (running) rafId = requestAnimationFrame(tick);
        };
        const start = () => {
            if (!running) {
                running = true;
                loopStart = performance.now();
                rafId = requestAnimationFrame(tick);
            }
        };
        const stop = () => { running = false; cancelAnimationFrame(rafId); };

        paint(frameAt(performance.now()) ?? LOCKED);
        // `listening` with no entry never animates — one painted frame is the
        // whole job. Everything else runs the loop while visible.
        const isStatic = stateRef.current === 'listening' && !entry;

        const io = !isStatic && typeof IntersectionObserver !== 'undefined'
            ? new IntersectionObserver(([e]) => {
                if (e.isIntersecting && document.visibilityState !== 'hidden') start(); else stop();
            })
            : null;
        io?.observe(svg);
        const onVis = () => { if (document.visibilityState === 'hidden') stop(); else start(); };
        if (!isStatic) {
            document.addEventListener('visibilitychange', onVis);
            if (!io) start();
        }

        return () => {
            stop();
            io?.disconnect();
            if (!isStatic) document.removeEventListener('visibilitychange', onVis);
        };
        // `state` is deliberately NOT a dep — see stateRef above. But a swap
        // between static-listening and a working verb needs the loop's gating
        // recomputed, so re-run when the *kind* changes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [id, size, speed, entry, state === 'listening']);

    const [l0, r0] = bracketPaths(LOCKED.spread);
    return (
        <svg
            ref={svgRef}
            viewBox={VIEWBOX}
            width={size}
            height={Math.round(size * 416 / 448)}
            style={{
                width: size,
                height: Math.round(size * 416 / 448),
                filter: glow ? `drop-shadow(0 0 ${Math.round(size * 0.22)}px var(--accent-ring))` : undefined,
            }}
            className={`shrink-0 ${className}`}
            aria-hidden={rest['aria-label'] ? undefined : true}
            role={rest['aria-label'] ? 'img' : undefined}
            {...rest}
        >
            <defs>
                <clipPath id={`${id}-clip`}>
                    <rect id={`${id}-ct`} x="0" y={TOP} width="1024" height={HALF} />
                    <rect id={`${id}-cb`} x="0" y={BOT - HALF} width="1024" height={HALF} />
                </clipPath>
            </defs>
            <g id={`${id}-g`}>
                <g clipPath={`url(#${id}-clip)`}>
                    <path id={`${id}-pl`} d={l0} fill="currentColor" />
                    <path id={`${id}-pr`} d={r0} fill="currentColor" />
                </g>
                <circle id={`${id}-dt`} cx={CX} cy={CY} r={LOCKED.dotR} fill="currentColor" />
            </g>
        </svg>
    );
}
