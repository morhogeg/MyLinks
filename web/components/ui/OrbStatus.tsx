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
 * The motion: the wrapper dips — opacity to 32% over 152ms on an ease-in — the
 * orb AND the label are exchanged in the same render at the trough, where the
 * row is faint enough that the exchange isn't legible, then it reforms over
 * 248ms on `--ease-modal`.
 *
 * Why one wrapper and not two fades: animating the orb and the text separately
 * desyncs their opacity envelopes even when both are told to swap on the same
 * instant — the text leaves early and the orb visibly lags behind it. One
 * element on one animation makes that drift structurally impossible.
 */

const DIP_MS = 400;
const DIP_TROUGH = 0.38;
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

        if (!instant) {
            // Read the easing token rather than hardcoding the curve.
            const ease = getComputedStyle(document.documentElement)
                .getPropertyValue('--ease-modal').trim() || EASE_MODAL_FALLBACK;
            el.animate(
                [
                    { opacity: 1, easing: EASE_IN },
                    { opacity: 0.32, offset: DIP_TROUGH, easing: ease },
                    { opacity: 1 },
                ],
                { duration: DIP_MS, easing: 'linear' },
            );
        }

        // Both paths exchange from a timer callback, never synchronously in the
        // effect body — a sync setState here would cascade a render every beat.
        const swap = setTimeout(
            () => setShown({ orb, label, key: stageKey }),
            instant ? 0 : DIP_MS * DIP_TROUGH,
        );
        return () => clearTimeout(swap);
    }, [stageKey, orb, label, shown.key]);

    return (
        <div ref={ref} className={className}>
            <BrandOrb state={shown.orb} size={size} />
            <span className={labelClassName}>{shown.label}</span>
        </div>
    );
}
