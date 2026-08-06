'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';

/** True when the user has asked the OS to reduce motion. Read once per call
 *  site rather than stored globally so a scene can re-check on mount. */
export function prefersReducedMotion(): boolean {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Fires ONCE when the element first comes into view, and then disconnects.
 *
 * Entrances on this page are one-shot on purpose: a section that re-animates
 * every time it scrolls back past reads as a page that can't sit still, and it
 * makes reading the copy a second time actively annoying.
 *
 * `rootMargin` pulls the trigger up so a section starts arriving as it enters
 * rather than after it is already fully on screen.
 */
export function useInView<T extends HTMLElement>(
    rootMargin = '0px 0px -18% 0px',
): [RefObject<T | null>, boolean] {
    const ref = useRef<T>(null);
    const [seen, setSeen] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        // No IntersectionObserver (or SSR hydration on an ancient engine):
        // show everything rather than leaving the page blank at opacity 0.
        if (typeof IntersectionObserver === 'undefined') {
            setSeen(true);
            return;
        }
        const io = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) {
                    setSeen(true);
                    io.disconnect();
                }
            },
            { rootMargin },
        );
        io.observe(el);
        return () => io.disconnect();
    }, [rootMargin]);

    return [ref, seen];
}

/** One easing curve for every derived scene value: a smoothstep between two
 *  progress marks, so a beat eases in and out instead of starting and stopping
 *  on a hard edge. */
function smoothstep(edge0: number, edge1: number, x: number): number {
    const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

/** The five values the gather scene runs on. See `landing.css` `.mx-stage`.
 *  `fade` and `resolve` are separate on purpose — see the beat map below. */
export interface SceneProgress {
    spread: number;
    gather: number;
    mark: number;
    fade: number;
    resolve: number;
}

/** The scene's resolved end state — silos gathered, mark closed, problem line
 *  gone, closing line showing. This is what reduced-motion and no-JS both get. */
const RESOLVED: SceneProgress = { spread: 0, gather: 1, mark: 1, fade: 1, resolve: 1 };

/**
 * Turns the scroll position of a tall section into the gather scene's state,
 * and writes it straight onto the sticky stage as CSS custom properties.
 *
 * Why custom properties and not React state: this runs on every scroll frame.
 * Re-rendering a dozen positioned children 60 times a second is exactly the
 * kind of thing that makes a marketing page feel cheap on a mid-range phone.
 * One `setProperty` per frame on ONE element, and the compositor does the rest
 * — no React work, no layout, no paint outside the transformed layers.
 *
 * @param sectionRef the TALL scroll track
 * @param stageRef   the STICKY stage inside it that carries `.mx-stage`
 */
export function useSceneProgress(
    sectionRef: RefObject<HTMLElement | null>,
    stageRef: RefObject<HTMLElement | null>,
) {
    useEffect(() => {
        const section = sectionRef.current;
        const stage = stageRef.current;
        if (!section || !stage) return;

        const apply = (p: SceneProgress) => {
            stage.style.setProperty('--spread', String(p.spread));
            stage.style.setProperty('--gather', String(p.gather));
            stage.style.setProperty('--mark', String(p.mark));
            stage.style.setProperty('--fade', String(p.fade));
            stage.style.setProperty('--resolve', String(p.resolve));
        };

        // Reduced motion: pin the scene to its conclusion and never listen to
        // scroll at all. The silos still say what they say; they just don't fly.
        if (prefersReducedMotion()) {
            apply(RESOLVED);
            return;
        }

        let frame = 0;
        const measure = () => {
            frame = 0;
            const rect = section.getBoundingClientRect();
            // Distance scrolled through the track, over the scrollable length
            // of the track (its height minus the one viewport the stage pins
            // for). Guard the divisor: a section shorter than the viewport
            // would otherwise divide by ~0 and snap between 0 and 1.
            const travel = section.offsetHeight - window.innerHeight;
            const p = travel > 0 ? Math.min(1, Math.max(0, -rect.top / travel)) : 1;

            // The beat map. These four ranges were tuned against rendered
            // frames, not guessed, and two of them are load-bearing:
            //
            // `mark` STARTS WHILE `gather` IS STILL RUNNING (0.5 vs 0.36–0.68).
            // The first pass had the mark trailing the collapse and left a dead
            // frame where the silos had gone and nothing had arrived — the
            // brackets have to be closing as the last pile lands, so the two
            // read as one gesture instead of a handoff.
            //
            // The two copy states DO NOT OVERLAP. The problem line is fully out
            // by 0.7 and the closing line does not begin until 0.74. A partial
            // cross-fade of display type reads as a rendering bug, not as a
            // transition — at 15% opacity, 48px white text on graphite is still
            // perfectly legible under the line replacing it. The gap between
            // them is also the scene's best frame: the mark, alone.
            apply({
                spread: smoothstep(0.02, 0.34, p),
                gather: smoothstep(0.36, 0.68, p),
                // Finishes exactly where `gather` finishes, not after it. The
                // mark drives its own opacity, so a range that ran past the
                // collapse left the arrival frame sitting at ~30% ink — murky
                // grey on graphite at the one moment that has to feel lit.
                mark: smoothstep(0.44, 0.68, p),
                fade: smoothstep(0.56, 0.68, p),
                resolve: smoothstep(0.74, 0.88, p),
            });
        };

        const onScroll = () => {
            // rAF-coalesced: scroll fires far more often than we can paint, and
            // `getBoundingClientRect` in a raw scroll handler forces layout on
            // every one of those events.
            if (!frame) frame = requestAnimationFrame(measure);
        };

        measure();
        window.addEventListener('scroll', onScroll, { passive: true });
        window.addEventListener('resize', onScroll, { passive: true });
        return () => {
            if (frame) cancelAnimationFrame(frame);
            window.removeEventListener('scroll', onScroll);
            window.removeEventListener('resize', onScroll);
        };
    }, [sectionRef, stageRef]);
}

/**
 * Runs a timed sequence of steps and returns the current index.
 *
 * Used by the capture pipeline and the Ask demo. Returns -1 before the sequence
 * starts. Restarting is a `key` bump from the caller (changing `runId`), which
 * cancels the pending timer — so tapping through the source tabs quickly can't
 * leave two sequences racing each other.
 */
export function useSequence(
    stepCount: number,
    stepMs: number,
    active: boolean,
    runId: number,
): number {
    const [step, setStep] = useState(-1);

    useEffect(() => {
        if (!active) return;
        // Reduced motion skips straight to the finished state — the point of
        // these demos is the RESULT; the choreography is the flourish.
        if (prefersReducedMotion()) {
            setStep(stepCount);
            return;
        }
        setStep(0);
        let i = 0;
        const id = setInterval(() => {
            i += 1;
            setStep(i);
            if (i >= stepCount) clearInterval(id);
        }, stepMs);
        return () => clearInterval(id);
    }, [stepCount, stepMs, active, runId]);

    return step;
}
