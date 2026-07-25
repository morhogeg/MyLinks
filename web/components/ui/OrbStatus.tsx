'use client';

import { useEffect, useRef, useState } from 'react';
import type { OrbState, OrbSize } from 'thinking-orbs';
import BrandOrb from './BrandOrb';

/**
 * OrbStatus — a Thinking Orb and its status line, exchanged as ONE gesture.
 *
 * Used anywhere Machina narrates staged work (Ask's drafting beats, the capture
 * banner): the orb's shape is a second, wordless read on what's happening, so
 * both it and the copy have to change as a single event.
 *
 * The motion: the wrapper dips to a HELD PLATEAU at 12% — down over 78ms, held
 * for 73ms, back up over 109ms on `--ease-modal`. The orb and the label are
 * exchanged in the same render partway through the hold.
 *
 * Why a plateau and not a single trough: a knife-edge trough demands the new
 * content *finish painting* on one exact frame. It doesn't — the React commit
 * lands, then layout and paint follow — and measured under a running canvas
 * loop the words were completing at ~45% opacity, i.e. visibly. The hold gives
 * the paint a window (±36ms) in which the row is too faint to read, so a late
 * frame costs nothing. The swap is also scheduled off the animation's OWN
 * `currentTime` rather than a wall-clock timer, so it self-corrects instead of
 * drifting against the compositor.
 *
 * Why one wrapper and not two fades: animating the orb and the text separately
 * desyncs their opacity envelopes even when both are told to swap on the same
 * instant — the text leaves early and the orb visibly lags behind it. One
 * element on one animation makes that drift structurally impossible.
 */

const DIP_MS = 260;
/** Opacity floor — deep enough that a frame of slop is not legible. */
const DIP_FLOOR = 0.12;
/** The hold: content is exchanged inside this window. */
const HOLD_FROM = 0.30;
const HOLD_TO = 0.58;
const SWAP_AT = DIP_MS * 0.42; // mid-plateau
const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';
const EASE_MODAL_FALLBACK = 'cubic-bezier(0.32, 0.72, 0, 1)';

interface OrbStatusProps {
    orb: OrbState;
    label: string;
    /**
     * Identifies the current beat — a change here triggers the dip-and-exchange.
     * `orb` and `label` are read at that moment, so the key must change whenever
     * either of them does (the phase label itself works as a key).
     */
    stageKey: string | number;
    size?: OrbSize;
    /** Classes for the wrapper that holds the orb + label. */
    className?: string;
    labelClassName?: string;
}

export default function OrbStatus({
    orb,
    label,
    stageKey,
    size = 20,
    className = 'inline-flex items-center gap-2.5',
    labelClassName = 'text-[13px] text-text-muted',
}: OrbStatusProps) {
    const [shown, setShown] = useState({ orb, label, key: stageKey });
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (stageKey === shown.key) return;

        const el = ref.current;
        const reduce = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        const instant = !el || reduce || typeof el.animate !== 'function';

        if (instant) {
            // setState from a callback, never synchronously in the effect body.
            const t = setTimeout(() => setShown({ orb, label, key: stageKey }), 0);
            return () => clearTimeout(t);
        }

        // Read the easing token rather than hardcoding the curve.
        const ease = getComputedStyle(document.documentElement)
            .getPropertyValue('--ease-modal').trim() || EASE_MODAL_FALLBACK;
        const dip = el.animate(
            [
                { opacity: 1, easing: EASE_IN },
                { opacity: DIP_FLOOR, offset: HOLD_FROM, easing: 'linear' },
                { opacity: DIP_FLOOR, offset: HOLD_TO, easing: ease },
                { opacity: 1 },
            ],
            { duration: DIP_MS, easing: 'linear' },
        );

        // Drive the exchange off the animation's own clock: a wall-clock timer
        // can land out of step with the compositor, but `currentTime` cannot.
        let raf = requestAnimationFrame(function tick() {
            const t = Number(dip.currentTime ?? 0);
            if (t >= SWAP_AT || dip.playState === 'finished') {
                setShown({ orb, label, key: stageKey });
            } else {
                raf = requestAnimationFrame(tick);
            }
        });
        return () => cancelAnimationFrame(raf);
    }, [stageKey, orb, label, shown.key]);

    return (
        <div ref={ref} className={className}>
            <BrandOrb state={shown.orb} size={size} />
            <span className={labelClassName}>{shown.label}</span>
        </div>
    );
}
