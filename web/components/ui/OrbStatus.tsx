'use client';

import { useEffect, useRef, useState } from 'react';
import CitationMark, { type MarkMotion, type OrbSize } from './CitationMark';

/**
 * OrbStatus — a Thinking Orb and its status line, exchanged as ONE gesture.
 *
 * Used anywhere Machina narrates staged work (Ask's drafting beats, the capture
 * banner): the orb's shape is a second, wordless read on what's happening, so
 * both it and the copy have to change as a single event.
 *
 * The motion: ONLY THE ORB dips — to a held plateau at 22%, down over 66ms,
 * held 62ms, back up over 92ms on `--ease-modal`. The label does not animate at
 * all; it is replaced outright on the same frame the orb's canvas is retargeted,
 * because both come from one `setShown` and therefore one commit.
 *
 * Why the label is deliberately NOT animated — two reasons, both from device
 * reports:
 *
 * 1. **Flicker.** Dipping the whole row took the status line to near-nothing
 *    for ~70ms. On a line you are actively reading, that reads as a blink, not
 *    a transition. Status text is better replaced outright (the iOS pattern);
 *    what needs masking is the orb's shape morph, not the words.
 * 2. **Stale glyphs.** Mutating text inside an element with a running opacity
 *    animation puts it in a composited layer that is promoted and demoted
 *    around the change. WebKit's partial invalidation does not reliably cover
 *    the old text's full extent, so a shorter new phrase left fragments of the
 *    longer old one behind ("Thinking it through…" trailing debris from
 *    "Re-reading the sources…"). Keeping the label outside every animated
 *    element keeps it on the ordinary, correct repaint path; the `key` on it
 *    additionally forces element replacement rather than a text-node mutation.
 *
 * The swap is scheduled off the animation's OWN `currentTime` rather than a
 * wall-clock timer, so it self-corrects instead of drifting against the
 * compositor, and the plateau gives the paint a window (±31ms) rather than
 * demanding one exact frame.
 */

const DIP_MS = 220;
/** Opacity floor for the ORB — soft enough to mask a shape change, high
 *  enough that it reads as a dip rather than the orb blinking out. */
const DIP_FLOOR = 0.22;
/** The hold: the orb is retargeted inside this window. */
const HOLD_FROM = 0.30;
const HOLD_TO = 0.58;
const SWAP_AT = DIP_MS * 0.42; // mid-plateau
const EASE_IN = 'cubic-bezier(0.4, 0, 1, 1)';
const EASE_MODAL_FALLBACK = 'cubic-bezier(0.32, 0.72, 0, 1)';

interface OrbStatusProps {
    orb: MarkMotion;
    label: string;
    /**
     * Identifies the current beat — a change here triggers the dip-and-exchange.
     * `orb` and `label` are read at that moment, so the key must change whenever
     * either of them does (the phase label itself works as a key).
     */
    stageKey: string | number;
    size?: OrbSize;
    /** Forwarded to CitationMark: one-shot arrival on mount. */
    entry?: 'launch' | 'trace';
    /** Forwarded to CitationMark: roomy viewBox so moving brackets don't clip. */
    roam?: boolean;
    /** Classes for the static wrapper that holds the orb + label. */
    className?: string;
    labelClassName?: string;
}

/** Matches the fallback in `--ease-modal`. */

export default function OrbStatus({
    orb,
    label,
    stageKey,
    size = 20,
    entry,
    roam = false,
    className = 'inline-flex items-center gap-2.5',
    labelClassName = 'text-[13px] text-text-muted',
}: OrbStatusProps) {
    const [shown, setShown] = useState({ orb, label, key: stageKey });
    /** The dip targets the orb alone — never an ancestor of the label. */
    const ref = useRef<HTMLSpanElement>(null);

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
        <div className={className}>
            {/* Only this span is animated. The label is a sibling, so it never
                joins a composited layer — see the stale-glyph note above. */}
            <span ref={ref} className="inline-flex shrink-0">
                <CitationMark state={shown.orb} size={size} entry={entry} roam={roam} />
            </span>
            {/* Keyed so React replaces the element instead of mutating a text
                node, forcing a clean paint of the whole line. */}
            <span key={shown.label} className={labelClassName}>{shown.label}</span>
        </div>
    );
}
