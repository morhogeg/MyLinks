'use client';

import { useEffect, useState } from 'react';
import { Check, Share } from 'lucide-react';
import { CAPTURE_SOURCES } from './demoData';
import { CardView, KindMark, Segmented } from './parts';
import { useInView, useSequence } from './hooks';

/**
 * What happens to a save after you share it — run live, and switchable.
 *
 * The checklist is the REAL pipeline: `demoData.stepsFor` maps over
 * `LINK_SCAN_STEPS` from `lib/scanPhases.ts`, the same array the in-app stepper
 * and the iOS share-sheet banner read, with one label swapped per source type
 * ("Reading the page" / "Looking at the screenshot" / "Watching the video").
 * So this demo cannot drift from the product by accident: add a phase to the
 * pipeline and it appears here.
 *
 * The timing is honest about being a demo — a real save takes longer than eight
 * seconds and the app says so elsewhere. What the scene claims is the SHAPE of
 * the work and the shape of what comes back, and both are accurate.
 */
export default function CaptureScene() {
    const [ref, inView] = useInView<HTMLElement>();
    const [sourceId, setSourceId] = useState<(typeof CAPTURE_SOURCES)[number]['id']>('link');
    // Bumped on every source change and on Replay. `useSequence` keys its timer
    // off this, so switching tabs mid-run cancels the old run rather than
    // leaving two sequences interleaving their steps.
    const [runId, setRunId] = useState(0);

    const source = CAPTURE_SOURCES.find((s) => s.id === sourceId) ?? CAPTURE_SOURCES[0];
    const step = useSequence(source.steps.length, 620, inView, runId);
    const done = step >= source.steps.length;

    // Changing source restarts the pipeline, so the reader always sees the
    // work happen rather than being dropped on a finished card.
    useEffect(() => { setRunId((n) => n + 1); }, [sourceId]);

    return (
        <section ref={ref} aria-labelledby="mx-capture-title" className="mx-auto max-w-5xl px-6 py-20 sm:py-28">
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
                    Send a link, a screenshot or a video to Machina from any app on your phone,
                    from the web app, or from the browser extension. It reads the page, looks at
                    the screenshot, watches the video — and turns each save into a card with a
                    real summary, a category, tags, and connections to what you saved before.
                </p>
            </div>

            <div className="mt-10 flex justify-center">
                <Segmented
                    label="What you shared"
                    value={sourceId}
                    onChange={setSourceId}
                    options={CAPTURE_SOURCES.map((s) => ({ id: s.id, label: s.tab }))}
                />
            </div>

            {/* `items-center`, not `items-start`: the pipeline card is fixed at
                five phases and the result card is shorter, so top-aligning them
                left a visible void under the right column. Centred, the payoff
                sits opposite the work that produced it. */}
            <div className="mt-10 grid gap-6 md:grid-cols-2 md:items-center">
                {/* Left: the work.
                    `min-w-0` IS LOad-BEARING. A grid item defaults to
                    `min-width: auto`, so this card refused to shrink below the
                    min-content width of the handle below it — and
                    `seriouseats.com/one-pan-lemon-chicken` has no break
                    opportunity in it, so at 320px the card forced 50px of
                    horizontal page scroll despite the `truncate`. `truncate`
                    only ellipsises once something upstream allows the box to be
                    narrower than its text. */}
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
                                    {/* The scan line rides only the phase that is
                                        actually running — the app's own gesture. */}
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

                {/* Right: what comes back. Keyed on the run so each pass replays
                    the landing animation rather than swapping content in place. */}
                <div className="min-w-0 min-h-[15rem]">
                    {done ? (
                        <div key={runId} className="mx-card-land">
                            <CardView card={source.card} />
                            <div className="mt-4 flex items-center justify-between gap-3">
                                <span className="flex items-center gap-1.5 text-[12px] text-text-muted">
                                    <KindMark kind={source.card.kind} className="h-3 w-3" />
                                    Saved · connected to 3 earlier saves
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setRunId((n) => n + 1)}
                                    className="text-[13px] font-medium text-text-secondary underline underline-offset-4 transition-colors hover:text-text"
                                >
                                    Replay
                                </button>
                            </div>
                        </div>
                    ) : (
                        /* The waiting frame is the card's own skeleton, at the
                           card's real proportions — so nothing jumps when the
                           finished card replaces it. */
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
