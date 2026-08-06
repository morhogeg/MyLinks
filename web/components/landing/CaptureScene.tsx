'use client';

import { useEffect, useState } from 'react';
import { Check, Share } from 'lucide-react';
import { CAPTURE_SOURCES } from './demoData';
import { CardView, KindMark } from './parts';
import { useInView, useSequence, prefersReducedMotion } from './hooks';

/** How long the finished card holds before the next source starts. Long enough
 *  to read the summary, short enough that the scene never looks parked. */
const HOLD_MS = 4200;

/**
 * What happens to a save — run live, continuously.
 *
 * ONE demo, cycling through the three source kinds on its own, instead of the
 * first pass's three-tab segmented control. Owner call (2026-08-06 round 5):
 * showing the full five-step pipeline three separate times was repetition
 * dressed as content — the pipeline is the same pipeline; only the second step
 * changes ("Reading the page" / "Looking at the screenshot" / "Watching the
 * video"). So the scene now plays link → screenshot → video in a loop, the
 * quiet source line above the checklist names which one is running, and nobody
 * has to click anything to learn that all three exist. The copy still names
 * all three outright, because reviewers read text, not choreography.
 *
 * The checklist itself is still the REAL pipeline — `LINK_SCAN_STEPS` from
 * `lib/scanPhases.ts`, the same array the in-app stepper and the iOS
 * share-sheet banner read, one label swapped per source.
 */
export default function CaptureScene() {
    const [ref, inView] = useInView<HTMLElement>();
    const [sourceIdx, setSourceIdx] = useState(0);
    // Bumped every cycle; keys the sequence timer AND the card's landing
    // animation, so each pass replays rather than swapping content in place.
    const [runId, setRunId] = useState(0);
    // True once the reader picks a kind themselves — the first click stops the
    // auto-cycle for good, same alive-until-touched rule as the Ask scene.
    const [interacted, setInteracted] = useState(false);

    const source = CAPTURE_SOURCES[sourceIdx % CAPTURE_SOURCES.length];
    const step = useSequence(source.steps.length, 620, inView, runId);
    const done = step >= source.steps.length;

    // The cycle: card lands → hold → next source runs. Stops once the reader
    // has taken over, with reduced motion (the finished frame is the content),
    // and while off-screen.
    useEffect(() => {
        if (!done || !inView || interacted || prefersReducedMotion()) return;
        const id = setTimeout(() => {
            setSourceIdx((i) => (i + 1) % CAPTURE_SOURCES.length);
            setRunId((n) => n + 1);
        }, HOLD_MS);
        return () => clearTimeout(id);
    }, [done, inView, interacted]);

    return (
        <section ref={ref} aria-labelledby="mx-capture-title" className="mx-auto max-w-5xl px-6 py-14 sm:py-20">
            <div className="mx-auto max-w-2xl text-center">
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">
                    Capture
                </p>
                <h2
                    id="mx-capture-title"
                    className="mt-3 text-3xl font-semibold tracking-tight text-text text-balance sm:text-4xl"
                >
                    Share it once. It comes back understood.
                </h2>
                <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-text-secondary text-pretty sm:text-base">
                    Send a link, a screenshot or a video to Machina — from any app on your
                    phone, or from the web app on your computer. It reads the page, looks at
                    the screenshot, watches the video, and turns each save into a card with a
                    real summary, a category, tags, and connections to what you saved before.
                </p>
            </div>

            {/* The three kinds — BUTTONS that the cycle also drives (round 7:
                labels that changed on their own but ignored a tap read as
                broken). Tapping one runs that kind immediately and hands the
                wheel to the reader; untouched, the scene keeps demoing itself.
                The active one carries a dot so "which is playing" reads at a
                glance rather than by contrast alone. */}
            <div className="mt-8 flex items-center justify-center gap-2" role="group" aria-label="What you shared">
                {CAPTURE_SOURCES.map((s, i) => {
                    const active = i === sourceIdx % CAPTURE_SOURCES.length;
                    return (
                        <button
                            key={s.id}
                            type="button"
                            aria-pressed={active}
                            onClick={() => {
                                setInteracted(true);
                                setSourceIdx(i);
                                setRunId((n) => n + 1);
                            }}
                            className={
                                'flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-medium '
                                + 'uppercase tracking-[0.12em] transition-colors duration-300 '
                                + (active
                                    ? 'bg-fill-subtle text-text'
                                    : 'text-text-muted hover:text-text-secondary')
                            }
                        >
                            <span
                                aria-hidden
                                className={
                                    'h-1 w-1 rounded-full transition-opacity duration-300 '
                                    + (active ? 'bg-text opacity-100' : 'opacity-0')
                                }
                            />
                            {s.tab}
                        </button>
                    );
                })}
            </div>

            {/* `items-center`: the pipeline card is fixed at five phases and the
                result card is shorter — top-aligned, the right column trailed a
                void. Centred, the payoff sits opposite the work. */}
            <div className="mt-8 grid gap-6 md:grid-cols-2 md:items-center">
                {/* The work. `min-w-0` is load-bearing: a grid item defaults to
                    `min-width: auto` and an unbreakable URL below would other-
                    wise force horizontal page scroll at 320px. */}
                <div className="min-w-0 rounded-3xl border border-border-subtle bg-card p-6 shadow-[var(--shadow-card)]">
                    <div className="flex items-center gap-2 border-b border-border-subtle pb-4">
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fill-subtle">
                            <Share className="h-4 w-4 text-text-secondary" aria-hidden />
                        </span>
                        <span className="min-w-0">
                            <span className="block text-[11px] uppercase tracking-wider text-text-muted">
                                Shared to Machina
                            </span>
                            <span className="block truncate text-[13px] font-medium text-text">
                                {source.handle}
                            </span>
                        </span>
                    </div>

                    <ol className="mt-4 space-y-1">
                        {source.steps.map((label, i) => {
                            const state = done || i < step ? 'done' : i === step ? 'active' : 'todo';
                            return (
                                <li
                                    key={label}
                                    className={
                                        'flex items-center gap-3 rounded-xl px-2 py-2.5 transition-colors duration-300 '
                                        + (state === 'active' ? 'bg-fill-subtle ' : '')
                                        + (state === 'todo' ? 'opacity-40' : '')
                                    }
                                >
                                    <span
                                        className={
                                            'grid h-5 w-5 shrink-0 place-items-center rounded-full '
                                            + (state === 'done'
                                                ? 'bg-accent text-accent-ink'
                                                : 'border border-border-strong')
                                        }
                                    >
                                        {state === 'done' && <Check className="h-3 w-3" aria-hidden strokeWidth={3} />}
                                        {state === 'active' && (
                                            <span className="h-1.5 w-1.5 rounded-full bg-text animate-pulse-subtle" />
                                        )}
                                    </span>
                                    <span className="text-[13px] text-text">{label}</span>
                                    {state === 'active' && (
                                        <span className="mx-sweep relative ml-auto h-px w-16 overflow-hidden rounded-full bg-fill-subtle" />
                                    )}
                                </li>
                            );
                        })}
                    </ol>

                    <p className="sr-only" role="status">
                        {done ? 'Save complete.' : `Step ${Math.max(1, step + 1)} of ${source.steps.length}: ${source.steps[Math.min(step, source.steps.length - 1)]}`}
                    </p>
                </div>

                {/* What comes back. */}
                <div className="min-w-0 min-h-[15rem]">
                    {done ? (
                        <div key={runId} className="mx-card-land">
                            <CardView card={source.card} />
                            <p className="mt-4 flex items-center gap-1.5 text-[12px] text-text-muted">
                                <KindMark kind={source.card.kind} className="h-3 w-3" />
                                Saved · connected to 3 earlier saves
                            </p>
                        </div>
                    ) : (
                        /* The card's own skeleton at the card's proportions, so
                           nothing jumps when the finished card replaces it. */
                        <div className="rounded-2xl border border-border-subtle bg-card p-5 shadow-[var(--shadow-card)]">
                            <div className="h-3 w-24 rounded-full bg-fill-subtle" />
                            <div className="mt-4 h-4 w-3/4 rounded-full bg-fill-subtle" />
                            <div className="mt-3 space-y-2">
                                <div className="h-2.5 w-full rounded-full bg-fill-subtle" />
                                <div className="h-2.5 w-5/6 rounded-full bg-fill-subtle" />
                            </div>
                            <div className="mt-4 flex gap-2">
                                <div className="h-4 w-16 rounded-full bg-fill-subtle" />
                                <div className="h-4 w-12 rounded-full bg-fill-subtle" />
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
