'use client';

import { useEffect, useState } from 'react';
import { Check, Share } from 'lucide-react';
import { CAPTURE_DEMO } from './demoData';
import { CardView } from './parts';
import { useInView, useSequence, prefersReducedMotion } from './hooks';

/** How long the finished card holds before the demo replays. */
const HOLD_MS = 6000;

/**
 * What happens to a save — ONE demo now, and it is the screenshot (round 10;
 * the owner's call, and the right one: three staged variants of the same five
 * steps divided the value, and the screenshot is the capture with something to
 * SHOW — the scan).
 *
 * The left panel is the screenshot itself as a little window, and while the
 * pipeline runs it is being SCANNED: a light bar sweeps it using the app's own
 * `animate-scan-sweep` keyframe — the exact gesture the app's analysis
 * surfaces use, not a lookalike. When the steps complete, the scan stops and
 * the finished card lands beside it: what went in, what came back.
 *
 * The checklist stays the REAL pipeline — `LINK_SCAN_STEPS` with the two
 * source-specific labels swapped ("Receiving the screenshot" / "Looking at the
 * screenshot"). The copy still names all three capture kinds in prose, because
 * reviewers read text; the demo shows one deeply instead of three shallowly.
 */
export default function CaptureScene() {
    const [ref, inView] = useInView<HTMLElement>();
    // Keys the sequence timer AND the card's landing animation, so each replay
    // runs the whole performance rather than swapping content in place.
    const [runId, setRunId] = useState(0);

    const demo = CAPTURE_DEMO;
    const step = useSequence(demo.steps.length, 620, inView, runId);
    const done = step >= demo.steps.length;

    // Card lands → hold → replay. Stops off-screen and with motion off.
    useEffect(() => {
        if (!done || !inView || prefersReducedMotion()) return;
        const id = setTimeout(() => setRunId((n) => n + 1), HOLD_MS);
        return () => clearTimeout(id);
    }, [done, inView]);

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
                {/* "…or from the web app on your computer" was backwards (owner,
                    round 10) — you send things TO Machina, so the web app is a
                    destination here, not a source. */}
                <p className="mx-auto mt-5 max-w-xl text-[15px] leading-relaxed text-text-secondary text-pretty sm:text-base">
                    Send a link, a screenshot or a video to Machina — from any app on your
                    phone, or dropped straight into the web app. It reads the page, looks at
                    the screenshot, watches the video, and turns each save into a card with a
                    real summary, a category, tags, and connections to what you saved before.
                </p>
            </div>

            {/* items-center: the three panels differ in height, and centred they
                read as one horizontal machine — in, work, out. */}
            <div className="mt-10 grid gap-6 md:grid-cols-[1fr_1.15fr_1.15fr] md:items-center">
                {/* IN: the screenshot, as a window being scanned. */}
                <div aria-hidden className="relative mx-auto w-full max-w-[17rem] md:max-w-none">
                    <div className="overflow-hidden rounded-2xl border border-border-strong bg-card shadow-[var(--shadow-card)]">
                        {/* Window chrome. */}
                        <div className="flex items-center gap-1.5 border-b border-border-subtle px-3 py-2.5">
                            {[0, 1, 2].map((i) => (
                                <span key={i} className="h-2 w-2 rounded-full bg-fill-strong" />
                            ))}
                            <span className="ms-2 text-[10px] uppercase tracking-wider text-text-muted">
                                {demo.handle}
                            </span>
                        </div>
                        {/* The "engraving": abstract sketch lines standing in for
                            the annotated Pantheon section. */}
                        <div className="relative h-44 p-4">
                            <div className="absolute inset-x-8 top-5 h-16 rounded-t-full border-2 border-b-0 border-fill-strong" />
                            <div className="absolute inset-x-12 top-9 h-12 rounded-t-full border-2 border-b-0 border-fill-subtle" />
                            <div className="absolute inset-x-6 top-[5.25rem] space-y-2">
                                <div className="h-1.5 w-3/4 rounded-full bg-fill-subtle" />
                                <div className="h-1.5 w-1/2 rounded-full bg-fill-subtle" />
                                <div className="h-1.5 w-2/3 rounded-full bg-fill-subtle" />
                            </div>
                            {/* THE SCAN — the app's own sweep keyframe, running
                                only while the pipeline is. */}
                            {!done && (
                                <div className="pointer-events-none absolute inset-0 overflow-hidden">
                                    <div
                                        className="animate-scan-sweep absolute inset-x-0 top-0 h-10"
                                        style={{
                                            background:
                                                'linear-gradient(180deg, transparent, var(--accent-ring), transparent)',
                                        }}
                                    />
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* WORK: the real pipeline. `min-w-0` is load-bearing — a grid
                    item defaults to min-width:auto and the handle line would
                    otherwise force page scroll at 320px. */}
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
                                {demo.handle}
                            </span>
                        </span>
                    </div>

                    <ol className="mt-4 space-y-1">
                        {demo.steps.map((label, i) => {
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
                        {done ? 'Save complete.' : `Step ${Math.max(1, step + 1)} of ${demo.steps.length}: ${demo.steps[Math.min(step, demo.steps.length - 1)]}`}
                    </p>
                </div>

                {/* OUT: what comes back — the app's real card. */}
                <div className="min-w-0 min-h-[15rem]">
                    {done ? (
                        <div key={runId} className="mx-card-land">
                            <CardView card={demo.card} />
                        </div>
                    ) : (
                        <div className="rounded-[20px] border border-border-subtle bg-card p-5 shadow-[var(--shadow-card)]">
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
